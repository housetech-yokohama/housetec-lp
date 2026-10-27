const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Offline only: all external requests and timers are replaced by test doubles.
for (const [file, endpoint, type] of [['Assessment.dc.html','xpqvnbbz','無料査定'], ['Reservation.dc.html','xwvgzyyl','来店予約']]) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const script = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
  function setup(fetchImpl, batched = false) {
    const calls = [], timers = new Map(), updates = [];
    let timerId = 0;
    class DCLogic { setState(update) {
      const apply = () => { this.state = {...this.state, ...(typeof update === 'function' ? update(this.state) : update)}; };
      if (batched) updates.push(apply); else apply();
    }}
    const ctx = vm.createContext({ DCLogic, AbortController,
      fetch: (...args) => { calls.push(args); return fetchImpl(...args); },
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id,{callback,delay}); return id; },
      clearTimeout: id => timers.delete(id),
    });
    vm.runInContext(script + '\nglobalThis.TestComponent = Component;', ctx);
    const c = new ctx.TestComponent();
    Object.assign(c.state.form, {name:' テスト ',phone:'045-430-3383',email:'qa@example.com',address:'横浜市神奈川区',date:'2026-11-10',time:'14:00',consent:true,message:'確認'});
    return {c,calls,timers,flush: () => {while(updates.length) updates.shift()();}};
  }
  const event = () => ({preventDefault(){}});
  const success = async () => ({ok:true,json:async()=>({ok:true})});
  test(file + ': confirmed success preserves destination and all form-specific fields', async () => {
    const {c,calls,timers} = setup(success);
    await c.handleSubmit(event());
    assert.equal(calls.length,1);
    assert.equal(calls[0][0],'https://formspree.io/f/'+endpoint);
    const payload = JSON.parse(calls[0][1].body);
    assert.equal(payload.inquiry_type,type);
    assert.equal(payload.name,'テスト');
    assert.equal(payload._gotcha,'');
    if(type==='無料査定') {assert.equal(payload.address,'横浜市神奈川区');assert.equal(payload.assessment_method,'机上査定');assert.equal(payload.property_type,'マンション');}
    else {assert.equal(payload.preferred_date,'2026-11-10');assert.equal(payload.preferred_time,'14:00');assert.equal(payload.topic,'購入相談');}
    assert.equal(c.state.submitted,true);
    assert.equal(c.state.form.email,'');
    assert.equal(timers.size,0);
    await c.handleSubmit(event());
    assert.equal(calls.length,1);
  });
  test(file + ': simultaneous submits are blocked before batched state updates',async()=>{
    let resolve;
    const {c,calls,flush}=setup(()=>new Promise(r=>resolve=r),true);
    const first=c.handleSubmit(event());
    await c.handleSubmit(event());
    assert.equal(calls.length,1);
    resolve(await success());await first;flush();
    assert.equal(c.state.submitted,true);
  });
  for(const result of [{ok:false,status:429},{ok:false,status:500},{ok:true,json:async()=>({ok:false})},{ok:true,json:async()=>({next:'/captcha'})},{ok:true,json:async()=>({ok:true,errors:[{}]})},{ok:true,json:async()=>{throw new SyntaxError('HTML');}}]) {
    test(file + ': failure does not clear input or show success ('+Object.keys(result).join(',')+')',async()=>{
      const {c,timers}=setup(async()=>result);const before=JSON.stringify(c.state.form);
      await c.handleSubmit(event());assert.equal(c.state.submitted,false);assert.equal(c.state.submitFailed,true);assert.equal(JSON.stringify(c.state.form),before);assert.equal(c.state.submitting,false);assert.equal(timers.size,0);
    });
  }
  test(file + ': timeout permits manual retry and never automatically resends',async()=>{
    const {c,calls,timers}=setup((_url,options)=>new Promise((_r,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('abort')))));
    const before=JSON.stringify(c.state.form), pending=c.handleSubmit(event());
    const timer=[...timers.values()][0];assert.equal(timer.delay,20000);timer.callback();await pending;
    assert.equal(calls.length,1);assert.equal(c.state.submitted,false);assert.equal(c.submitInFlight,false);assert.equal(c.state.submitting,false);assert.equal(JSON.stringify(c.state.form),before);assert.equal(timers.size,0);
  });
  test(file + ': network failure can be retried without losing fields',async()=>{
    let attempt=0;const {c,calls}=setup(async()=>{if(++attempt===1)throw new TypeError('network');return success();});
    await c.handleSubmit(event());assert.equal(c.state.form.email,'qa@example.com');
    await c.handleSubmit(event());assert.equal(calls.length,2);assert.equal(c.state.submitted,true);
  });
  test(file + ': validation and spam trap do not call the service',async()=>{
    const {c,calls}=setup(success);c.state.form.consent=false;await c.handleSubmit(event());assert.equal(calls.length,0);assert.ok(c.state.errors.consent);
    c.state.form.consent=true;c.state.form.honeypot='bot';await c.handleSubmit(event());assert.equal(calls.length,0);assert.equal(c.state.submitted,false);assert.equal(c.state.submitFailed,true);
  });
  test(file + ': visible error has phone fallback and form controls lock during requests',()=>{
    assert.match(html,/role="alert"/);assert.match(html,/href="tel:0454303383"/);assert.doesNotMatch(html,/Housetec LP\.dc\.html/);
    for(const control of html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) assert.match(control[0],/disabled="\{\{ submitting \}\}"/);
  });
}
