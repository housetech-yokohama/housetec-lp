// Run: node --test tests/contact-form.test.cjs
// Unit tests only: fetch is mocked; no data is sent to Formspree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'Contact.dc.html'), 'utf8');
const script = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
const validForm = () => ({ name: '社内テスト', phone: '', email: 'qa@example.com', message: '【社内動作テスト】', honeypot: '' });
const event = () => ({ preventDefault() {} });
function setup(fetchImpl, options = {}) {
  const calls = [], timers = new Map(), pending = [];
  let timerId = 0;
  class DCLogic {
    setState(update) {
      const apply = () => { this.state = { ...this.state, ...(typeof update === 'function' ? update(this.state) : update) }; };
      if (options.batched) pending.push(apply); else apply();
    }
  }
  const ctx = vm.createContext({ DCLogic, AbortController,
    fetch: (...args) => { calls.push(args); return fetchImpl(...args); },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(script + '\nglobalThis.TestComponent = Component;', ctx);
  const component = new ctx.TestComponent();
  component.state.form = validForm();
  return { component, calls, timers, flush() { while (pending.length) pending.shift()(); } };
}
const success = async () => ({ ok: true, json: async () => ({ ok: true, next: '/thanks' }) });

test('sends the complete enquiry to the dedicated endpoint; phone stays optional', async () => {
  const { component: c, calls, timers } = setup(success);
  c.state.form.name = '  社内テスト  ';
  await c.handleSubmit(event());
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://formspree.io/f/mjyygqkk');
  const request = calls[0][1], payload = JSON.parse(request.body);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.Accept, 'application/json');
  assert.equal(payload.inquiry_type, '無料相談');
  assert.equal(payload._subject, '【ホームページ】無料相談のお問い合わせ');
  assert.equal(payload.name, '社内テスト');
  assert.equal(payload.phone, '');
  assert.equal(payload.email, 'qa@example.com');
  assert.equal(payload.message, '【社内動作テスト】');
  assert.equal(payload._gotcha, '');
  assert.ok(!Number.isNaN(Date.parse(payload.submitted_at)));
  assert.equal(c.state.submitted, true);
  assert.equal(c.state.submitFailed, false);
  assert.equal(c.state.form.email, '');
  assert.equal(c.state.submitting, false);
  assert.equal(timers.size, 0);
});

test('waits for the actual response and prevents concurrent duplicate submissions', async () => {
  let resolve;
  const { component: c, calls } = setup(() => new Promise(r => { resolve = r; }));
  const first = c.handleSubmit(event());
  assert.equal(c.state.submitted, false);
  assert.equal(c.state.submitting, true);
  await c.handleSubmit(event());
  assert.equal(calls.length, 1);
  resolve(await success());
  await first;
  assert.equal(c.state.submitted, true);
  await c.handleSubmit(event());
  assert.equal(calls.length, 1);
});

test('synchronous guard works even before React flushes batched state', async () => {
  let resolve;
  const { component: c, calls, flush } = setup(() => new Promise(r => { resolve = r; }), { batched: true });
  const first = c.handleSubmit(event());
  assert.equal(c.state.submitting, false);
  await c.handleSubmit(event());
  assert.equal(calls.length, 1);
  resolve(await success());
  await first;
  flush();
  assert.equal(c.state.submitted, true);
});

for (const [field, value] of [['name', '  '], ['email', 'invalid'], ['message', '  ']]) {
  test(`invalid ${field} does not make a request`, async () => {
    const { component: c, calls } = setup(success);
    c.state.form[field] = value;
    await c.handleSubmit(event());
    assert.equal(calls.length, 0);
    assert.equal(c.state.submitted, false);
    assert.equal(c.state.submitFailed, true);
  });
}

for (const status of [400, 403, 404, 422, 429, 500]) {
  test(`HTTP ${status} preserves the form and does not show success`, async () => {
    const { component: c, calls, timers } = setup(async () => ({ ok: false, status }));
    const before = JSON.stringify(c.state.form);
    await c.handleSubmit(event());
    assert.equal(calls.length, 1);
    assert.equal(c.state.submitted, false);
    assert.equal(c.state.submitFailed, true);
    assert.equal(c.state.submitting, false);
    assert.equal(JSON.stringify(c.state.form), before);
    assert.equal(timers.size, 0);
  });
}

for (const result of [{ ok: false }, { next: '/captcha' }, { ok: true, errors: [{ message: 'bad request' }] }, null]) {
  test(`non-success JSON is not accepted: ${JSON.stringify(result)}`, async () => {
    const { component: c } = setup(async () => ({ ok: true, json: async () => result }));
    await c.handleSubmit(event());
    assert.equal(c.state.submitted, false);
    assert.equal(c.state.submitFailed, true);
    assert.equal(c.state.form.message, '【社内動作テスト】');
  });
}

test('unexpected HTML/malformed JSON does not become success', async () => {
  const { component: c } = setup(async () => ({ ok: true, json: async () => { throw new SyntaxError('Not JSON'); } }));
  await c.handleSubmit(event());
  assert.equal(c.state.submitted, false);
  assert.equal(c.state.submitFailed, true);
});

test('network failure allows an explicit retry and does not lose input', async () => {
  let attempt = 0;
  const { component: c, calls } = setup(async () => {
    if (++attempt === 1) throw new TypeError('Network error');
    return success();
  });
  await c.handleSubmit(event());
  assert.equal(c.state.submitFailed, true);
  assert.equal(c.state.form.email, 'qa@example.com');
  assert.equal(c.submitInFlight, false);
  await c.handleSubmit(event());
  assert.equal(calls.length, 2);
  assert.equal(c.state.submitted, true);
  assert.equal(c.state.submitFailed, false);
});

test('timeout releases the form without automatically resending', async () => {
  const { component: c, calls, timers } = setup((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  }));
  const sending = c.handleSubmit(event());
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 20000);
  timer.callback();
  await sending;
  assert.equal(calls.length, 1);
  assert.equal(c.state.submitted, false);
  assert.equal(c.state.submitting, false);
  assert.match(c.state.errorMessage, /送信完了を確認できませんでした/);
  assert.equal(c.state.form.email, 'qa@example.com');
  assert.equal(timers.size, 0);
});

test('honeypot is rejected without sending or fake success', async () => {
  const { component: c, calls } = setup(success);
  c.state.form.honeypot = 'spam';
  await c.handleSubmit(event());
  assert.equal(calls.length, 0);
  assert.equal(c.state.submitted, false);
  assert.equal(c.state.submitFailed, true);
});

test('markup exposes an error and phone fallback; stale home links and PII logging are removed', () => {
  assert.match(html, /role="alert"/);
  assert.match(html, /href="tel:0454303383"/);
  assert.match(html, /href="\/"[^>]*>トップページへ戻る/);
  assert.doesNotMatch(html, /Housetec LP\.dc\.html/);
  assert.doesNotMatch(script, /console\.(log|error|debug)/);
  const phoneInput = html.match(/<input[^>]+id="contact-phone"[^>]*>/)[0];
  assert.doesNotMatch(phoneInput, /required/);
  assert.match(phoneInput, /disabled="\{\{ submitting \}\}"/);
  for (const field of ['name', 'phone', 'email', 'message']) {
    assert.match(html, new RegExp('htmlFor="contact-' + field + '"'));
  }
});
