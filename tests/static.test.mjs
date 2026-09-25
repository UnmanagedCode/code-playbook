import test from 'node:test';
import assert from 'node:assert/strict';
import { bootWithFake } from './helpers.mjs';

test('serves the frontend with relative asset refs and the absolute bridge tag', async (t) => {
  const { base } = await bootWithFake(t);
  for (const [p, type] of [['/', 'text/html'], ['/app.js', 'javascript'], ['/styles.css', 'text/css']]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type') || '', new RegExp(type), p);
    assert.match(r.headers.get('cache-control') || '', /no-store/, p);
  }
  const html = await (await fetch(base + '/')).text();
  // Relative refs work both standalone and under cc's /plugins/code-playbook/ mount.
  assert.match(html, /href="styles\.css\?v=\d+"/);
  assert.match(html, /src="app\.js\?v=\d+"/);
  assert.doesNotMatch(html, /(href|src)="\/(?!pluginBridge\.js)/, 'no other absolute local ref');
  assert.match(html, /<script src="\/pluginBridge\.js" defer><\/script>/);
});
