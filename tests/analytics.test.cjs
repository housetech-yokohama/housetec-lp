const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8');
function setup({host='housetec-lp.vercel.app',pathname='/Assessment.dc.html',off=false,blocked=false,search='?email=secret@example.com',hash='#private'}={}) {
  const scripts=[], handlers={}, status={textContent:''}, saved=new Map(off?[['housetec.analytics.disabled','1']]:[]);
  const origin='https://'+host;
  const window={location:{hostname:host,origin,pathname,href:origin+pathname+search+hash},localStorage:{getItem:k=>{if(blocked)throw Error();return saved.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error();saved.set(k,v);}}};
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
  for(const file of ['index.html','ValueUp.dc.html','Assessment.dc.html','Contact.dc.html','Reservation.dc.html','kanagawa-baikyaku.html','hakuraku-baikyaku.html','rokkakubashi-baikyaku.html','souzoku-baikyaku.html','privacy.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.equal((html.match(/src="\/analytics.js"/g)||[]).length,1,file);assert.match(html,/href="\/privacy.html"|アクセス解析を停止する/,file);
  }
});
for(const [file,type] of [['Assessment.dc.html','assessment'],['Contact.dc.html','contact'],['Reservation.dc.html','reservation']]){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');const script=html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
  async function submit(ok,throwTracking=false){const leads=[];class DCLogic{setState(v){this.state={...this.state,...v};}}const ctx=vm.createContext({DCLogic,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({ok})}),window:{housetecAnalytics:{trackLead:t=>{leads.push(t);if(throwTracking)throw Error();}}}});vm.runInContext(script+'\nglobalThis.C=Component;',ctx);const c=new ctx.C();Object.assign(c.state.form,{name:'社内',email:'qa@example.com',phone:'0454303383',address:'神奈川区',message:'test',consent:true,date:'2026-11-10',time:'14:00'});await c.handleSubmit({preventDefault(){}});return{c,leads};}
  test(file+': lead is emitted only after confirmed receipt',async()=>{const good=await submit(true);assert.equal(good.c.state.submitted,true);assert.deepEqual(good.leads,[type]);const bad=await submit(false);assert.equal(bad.c.state.submitted,false);assert.equal(bad.leads.length,0);});
  test(file+': analytics failure cannot turn a successful enquiry into an error',async()=>{const s=await submit(true,true);assert.equal(s.c.state.submitted,true);assert.equal(s.c.state.submitFailed,false);});
}

const consultationAnchor = (href, location='home_topic_sale_review') => ({ tagName:'A', getAttribute: key => key === 'href' ? href : key === 'data-consultation-location' ? location : null });
test('approved topic links retain consultation click measurement without sending their query or text', () => {
  const s = setup();
  for (const topic of ['inheritance','relocation','sale_review','comparison']) {
    s.handlers.click({composedPath:()=>[consultationAnchor('/Contact.dc.html?topic=' + topic)]});
  }
  const events=s.commands().filter(v=>v[0]==='event' && v[1]==='consultation_click');
  assert.equal(events.length,4);
  for(const event of events) assert.deepEqual(Object.keys(event[2]),['cta_location','form_type','transport_type']);
  assert.ok(!JSON.stringify(events).includes('topic='));
});
test('consultation measurement rejects arbitrary, duplicate, cross-origin and private URL input', () => {
  const s=setup();
  for(const href of [
    '/Contact.dc.html?topic=private@example.com',
    '/Contact.dc.html?topic=inheritance&email=private@example.com',
    '/Contact.dc.html?topic=inheritance&topic=relocation',
    '/Contact.dc.html?message=private@example.com',
    '/Assessment.dc.html?topic=inheritance',
    '/Contact.dc.html?topic=inheritance#private',
    'https://example.com/Contact.dc.html?topic=inheritance'
  ]) s.handlers.click({composedPath:()=>[consultationAnchor(href)]});
  assert.equal(s.commands().filter(v=>v[0]==='event' && v[1]==='consultation_click').length,0);
  assert.ok(!JSON.stringify(s.commands()).includes('private@example.com'));
});
test('existing consultation links still work and previews do not emit topic click events', () => {
  const live=setup();
  live.handlers.click({composedPath:()=>[consultationAnchor('/Contact.dc.html','home_sale_hero')]});
  assert.equal(live.commands().filter(v=>v[0]==='event' && v[1]==='consultation_click').length,1);
  const preview=setup({host:'housetec-lp-git-preview.vercel.app'});
  preview.handlers.click({composedPath:()=>[consultationAnchor('/Contact.dc.html?topic=sale_review')]});
  assert.equal(preview.commands().length,0);
});

test('inheritance guide is a fixed public page and consultation clicks stay distinct from leads',()=>{
  const s=setup({pathname:'/souzoku-baikyaku.html'});
  const config=s.commands().find(v=>v[0]==='config');
  assert.equal(config[2].page_location,'https://housetec-lp.vercel.app/souzoku-baikyaku.html');
  s.handlers.click({composedPath:()=>[consultationAnchor('/Contact.dc.html?topic=inheritance','souzoku_guide')]});
  const events=s.commands().filter(v=>v[0]==='event');
  assert.equal(events.length,1);
  assert.equal(events[0][1],'consultation_click');
  assert.deepEqual(Object.keys(events[0][2]).sort(),['cta_location','form_type','transport_type']);
  assert.equal(events[0][2].cta_location,'souzoku_guide');
  assert.ok(!JSON.stringify(events).includes('inheritance'));
  assert.ok(!events.some(v=>v[1]==='generate_lead'));
  for(const options of [{host:'housetec-lp-preview.vercel.app'}, {off:true}]){
    const blocked=setup({...options,pathname:'/souzoku-baikyaku.html'});
    blocked.handlers.click({composedPath:()=>[consultationAnchor('/Contact.dc.html?topic=inheritance','souzoku_guide')]});
    assert.equal(blocked.commands().length,0);
  }
});

const distributionCampaigns = [
  ['google','organic','souzoku_guide_post','/souzoku-baikyaku.html'],
  ['instagram','social','souzoku_guide_story','/souzoku-baikyaku.html'],
  ['google','organic','kanagawa_market_post','/kanagawa-baikyaku.html']
];
for (const [source,medium,name,pathname] of distributionCampaigns) {
  test(name+': only the approved constants are passed while raw queries and referrers stay private',()=>{
    const s=setup({pathname,search:'?utm_source='+source+'&utm_medium='+medium+'&utm_campaign='+name+'&fbclid=private-token&email=hidden@example.com',hash:'#hidden@example.com'});
    const config=s.commands().find(v=>v[0]==='config')[2];
    assert.equal(config.campaign_source,source);assert.equal(config.campaign_medium,medium);assert.equal(config.campaign_name,name);
    assert.equal(config.page_location,'https://housetec-lp.vercel.app'+pathname);
    assert.equal(config.page_referrer,'https://www.google.com/');
    const serialized=JSON.stringify(s.commands());
    for(const value of ['hidden@example.com','private-token','utm_source=','fbclid=','private@'])assert.ok(!serialized.includes(value),value);
    s.handlers.click({composedPath:()=>[consultationAnchor('/Contact.dc.html?topic=inheritance','souzoku_guide')]});
    assert.ok(s.commands().some(v=>v[0]==='event'&&v[1]==='consultation_click'));
    assert.ok(!s.commands().some(v=>v[0]==='event'&&v[1]==='generate_lead'));
  });
  test(name+': restricted to the guide and suppressed on previews or opt-out',()=>{
    const query='?utm_source='+source+'&utm_medium='+medium+'&utm_campaign='+name;
    const wrong=setup({pathname:'/Contact.dc.html',search:query});
    assert.equal(wrong.commands().find(v=>v[0]==='config')[2].campaign_name,undefined);
    for(const options of [{host:'housetec-lp-preview.vercel.app'},{off:true}]){
      const s=setup({...options,pathname,search:query});assert.equal(s.commands().length,0);assert.equal(s.scripts.length,0);
    }
  });
}
test('distribution matching rejects unknown, incomplete, mixed and duplicate campaign input',()=>{
  const invalid=[
    'utm_source=google&utm_medium=social&utm_campaign=souzoku_guide_post',
    'utm_source=instagram&utm_medium=organic&utm_campaign=souzoku_guide_story',
    'utm_source=google&utm_medium=organic&utm_campaign=unknown',
    'utm_source=google&utm_medium=organic',
    'utm_medium=organic&utm_campaign=souzoku_guide_post',
    'utm_source=google&utm_campaign=souzoku_guide_post',
    'utm_source=hidden@example.com&utm_medium=organic&utm_campaign=souzoku_guide_post',
    'utm_source=google&utm_source=google&utm_medium=organic&utm_campaign=souzoku_guide_post',
    'utm_source=google&utm_medium=organic&utm_medium=organic&utm_campaign=souzoku_guide_post',
    'utm_source=google&utm_medium=organic&utm_campaign=souzoku_guide_post&utm_campaign=souzoku_guide_post'
  ];
  for(const query of invalid){
    const s=setup({pathname:'/souzoku-baikyaku.html',search:'?'+query});
    assert.equal(s.commands().find(v=>v[0]==='config')[2].campaign_name,undefined,query);
    assert.ok(!JSON.stringify(s.commands()).includes('hidden@example.com'));
  }
});
test('existing Business Profile attribution stays available on public pages',()=>{
  for(const pathname of ['/','/kanagawa-baikyaku.html']){
    const s=setup({pathname,search:'?utm_source=google&utm_medium=organic&utm_campaign=gbp_profile'});
    const config=s.commands().find(v=>v[0]==='config')[2];assert.equal(config.campaign_name,'gbp_profile');assert.equal(config.campaign_source,'google');assert.equal(config.campaign_medium,'organic');
  }
});
