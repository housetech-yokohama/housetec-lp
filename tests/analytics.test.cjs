const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8');
function setup({host='housetec-lp.vercel.app',pathname='/Assessment.dc.html',off=false,blocked=false}={}) {
  const scripts=[], handlers={}, status={textContent:''}, saved=new Map(off?[['housetec.analytics.disabled','1']]:[]);
  const origin='https://'+host;
  const window={location:{hostname:host,origin,pathname,href:origin+pathname+'?email=secret@example.com#private'},localStorage:{getItem:k=>{if(blocked)throw Error();return saved.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error();saved.set(k,v);}}};
  const document={referrer:'https://www.google.com/search?q=private@example.com',head:{appendChild:s=>scripts.push(s)},createElement:()=>({}),getElementById:()=>status,addEventListener:(name,fn)=>handlers[name]=fn};
  const ctx=vm.createContext({window,document,URL,Set});vm.runInContext(code,ctx);
  return {window,document,scripts,handlers,status,saved,ctx,commands:()=>Array.from(window.dataLayer||[],v=>Array.from(v))};
}
const anchor=href=>({tagName:'A',getAttribute:k=>k==='href'?href:null});
test('one pageview configuration uses exact ID; queries, fragments and referrer paths are excluded',()=>{
  const s=setup();assert.equal(s.scripts.length,1);assert.match(s.scripts[0].src,/G-3BNE4X3FEK$/);
  const commands=s.commands(), config=commands.find(v=>v[0]==='config');
  assert.equal(config[1],'G-3BNE4X3FEK');assert.equal(config[2].page_location,'https://housetec-lp.vercel.app/Assessment.dc.html');assert.equal(config[2].page_referrer,'https://www.google.com/');
  assert.equal(config[2].allow_google_signals,false);assert.equal(config[2].allow_ad_personalization_signals,false);
  assert.ok(!JSON.stringify(commands).includes('secret@'));assert.ok(!JSON.stringify(commands).includes('private@'));
  vm.runInContext(code,s.ctx);assert.equal(s.commands().filter(v=>v[0]==='config').length,1);
});
for(const host of ['localhost','housetec-lp-preview.vercel.app','example.com'])test('no Google tags or events on '+host,()=>{const s=setup({host});s.window.housetecAnalytics.trackLead('contact');assert.equal(s.scripts.length,0);assert.equal(s.commands().length,0);});
test('unknown paths are not measured',()=>{const s=setup({pathname:'/private@example.com'});assert.equal(s.scripts.length,0);});
test('stored opt-out prevents all Google loading and survives a later visit',()=>{const s=setup({off:true});assert.equal(s.scripts.length,0);s.window.housetecAnalytics.trackLead('assessment');assert.equal(s.commands().length,0);assert.equal(s.window['ga-disable-G-3BNE4X3FEK'],true);});
test('opt-out stops events and re-enable does not duplicate initial pageview',()=>{const s=setup();s.window.housetecAnalytics.disable();const count=s.commands().length;s.window.housetecAnalytics.trackLead('assessment');assert.equal(s.commands().length,count);assert.equal(s.saved.get('housetec.analytics.disabled'),'1');s.window.housetecAnalytics.enable();assert.equal(s.saved.get('housetec.analytics.disabled'),'0');assert.equal(s.scripts.length,1);});
test('enabling from a stored opt-out starts exactly once',()=>{const s=setup({off:true});s.window.housetecAnalytics.enable();s.window.housetecAnalytics.enable();assert.equal(s.scripts.length,1);});
test('blocked browser storage does not crash the site',()=>{const s=setup({blocked:true});assert.doesNotThrow(()=>s.window.housetecAnalytics.disable());});
test('only fixed form types are accepted and repeated confirmation is deduplicated',()=>{const s=setup();for(const type of ['assessment','contact','reservation']){s.window.housetecAnalytics.trackLead(type);s.window.housetecAnalytics.trackLead(type);}s.window.housetecAnalytics.trackLead('person@example.com');const events=s.commands().filter(v=>v[0]==='event');assert.equal(events.length,3);assert.equal(events[0][1],'generate_lead');assert.deepEqual(Object.keys(events[0][2]),['form_type']);});
test('phone and official LINE clicks send only the contact method',()=>{const s=setup();for(const href of ['tel:0454303383','https://lin.ee/XPO76ZV','https://lin.ee/other','https://example.com/?email=private@example.com'])s.handlers.click({composedPath:()=>[anchor(href)]});const events=s.commands().filter(v=>v[0]==='event');assert.equal(events.length,2);assert.equal(events[0][2].contact_method,'phone');assert.equal(events[1][2].contact_method,'line');assert.ok(!JSON.stringify(events).includes('0454303383'));assert.ok(!JSON.stringify(events).includes('example.com'));});
test('all public pages include one shared integration and a disclosure link',()=>{
  for(const file of ['index.html','ValueUp.dc.html','Assessment.dc.html','Contact.dc.html','Reservation.dc.html','kanagawa-baikyaku.html','hakuraku-baikyaku.html','rokkakubashi-baikyaku.html','privacy.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.equal((html.match(/src="\/analytics.js"/g)||[]).length,1,file);assert.match(html,/href="\/privacy.html"|アクセス解析を停止する/,file);
  }
});
for(const [file,type] of [['Assessment.dc.html','assessment'],['Contact.dc.html','contact'],['Reservation.dc.html','reservation']]){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');const script=html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
  async function submit(ok,throwTracking=false){const leads=[];class DCLogic{setState(v){this.state={...this.state,...v};}}const ctx=vm.createContext({DCLogic,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({ok})}),window:{housetecAnalytics:{trackLead:t=>{leads.push(t);if(throwTracking)throw Error();}}}});vm.runInContext(script+'\nglobalThis.C=Component;',ctx);const c=new ctx.C();Object.assign(c.state.form,{name:'社内',email:'qa@example.com',phone:'0454303383',address:'神奈川区',message:'test',consent:true,date:'2026-11-10',time:'14:00'});await c.handleSubmit({preventDefault(){}});return{c,leads};}
  test(file+': lead is emitted only after confirmed receipt',async()=>{const good=await submit(true);assert.equal(good.c.state.submitted,true);assert.deepEqual(good.leads,[type]);const bad=await submit(false);assert.equal(bad.c.state.submitted,false);assert.equal(bad.leads.length,0);});
  test(file+': analytics failure cannot turn a successful enquiry into an error',async()=>{const s=await submit(true,true);assert.equal(s.c.state.submitted,true);assert.equal(s.c.state.submitFailed,false);});
}
