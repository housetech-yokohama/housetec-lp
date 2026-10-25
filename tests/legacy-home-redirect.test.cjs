// Run: node --test tests/legacy-home-redirect.test.cjs
// Static configuration checks only; Vercel Preview still needs a browser test.
// These tests do not submit forms or contact external services.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const legacyPaths = ['/Housetec LP.dc.html', '/Housetec%20LP.dc.html'];

test('only the two representations of the retired homepage URL are redirected', () => {
  assert.deepEqual(config.redirects.map(rule => rule.source).sort(), [...legacyPaths].sort());
});

test('redirects point to the homepage on the current host, in preview and production', () => {
  for (const rule of config.redirects) {
    assert.equal(rule.destination, '/');
    assert.equal(rule.permanent, true);
    assert.notEqual(rule.source, rule.destination);
  }
});

test('no catch-all rewrites, build overrides or form redirects are introduced', () => {
  assert.deepEqual(Object.keys(config).sort(), ['$schema', 'redirects'].sort());
  for (const pathname of ['/', '/index.html', '/Contact.dc.html', '/Assessment.dc.html', '/Reservation.dc.html', '/ValueUp.dc.html', '/assets/logo.png', '/unrelated-missing-page']) {
    assert.equal(config.redirects.some(rule => rule.source === pathname), false);
  }
});

test('no fragment override or external destination is introduced', () => {
  for (const rule of config.redirects) {
    assert.ok(!rule.destination.includes('#'));
    assert.ok(!rule.destination.startsWith('//'));
    assert.ok(!rule.source.includes('?'));
  }
});
