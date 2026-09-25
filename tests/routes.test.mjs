import test from 'node:test';
import assert from 'node:assert/strict';
import { bootWithFake, rawRequest, listDir } from './helpers.mjs';
import { loadFixtures } from './fixtures/fakeConductor.mjs';
import { createConductorClient, playbookPath } from '../src/conductorClient.js';

test('the list, a detail and validate are cc\'s status and body verbatim', async (t) => {
  const { port, fake } = await bootWithFake(t, { fake: { validate: () => ({ ok: false, errors: [{ message: 'm', stage: null, transition: null }] }) } });
  const { list, details } = await loadFixtures();

  const l = await rawRequest(port, 'GET', '/api/playbooks');
  assert.equal(l.status, 200);
  assert.deepEqual(l.json, list);

  for (const wire of ['/api/playbooks/acme/release', '/api/playbooks/acme%2Frelease']) {
    const d = await rawRequest(port, 'GET', wire);
    assert.equal(d.status, 200, wire);
    assert.deepEqual(d.json, details['acme/release'], wire);
  }
  assert.deepEqual(fake.calls.filter((c) => c.path.startsWith('/api/playbooks/acme')).map((c) => c.path),
    ['/api/playbooks/acme/release', '/api/playbooks/acme/release'], 'forwarded segment-encoded');

  const missing = await rawRequest(port, 'GET', '/api/playbooks/nope');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { error: "no playbook 'nope'", code: 'PLAYBOOK_UNKNOWN' });

  const draft = { id: 'x', stages: {} };
  const v = await rawRequest(port, 'POST', '/api/playbooks/validate', draft);
  assert.equal(v.status, 200);
  assert.deepEqual(v.json, { ok: false, errors: [{ message: 'm', stage: null, transition: null }] });
  assert.deepEqual(fake.calls.at(-1), { method: 'POST', path: '/api/playbooks/validate', body: draft, contentType: 'application/json' });
});

// A raw body with an explicit Content-Type (rawRequest always sends JSON).
function sendAs(port, method, p, type, text) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ default: http }) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { 'content-type': type } }, (res) => {
        let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t) }));
      });
      req.on('error', reject);
      req.end(text);
    });
  });
}

test('validate and save refuse a non-JSON Content-Type with 400 BODY_NOT_JSON, and never reach cc', async (t) => {
  const { port, fake, overlay } = await bootWithFake(t);
  for (const [method, p] of [['POST', '/api/playbooks/validate'], ['PUT', '/api/playbooks/x']]) {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
      const r = await sendAs(port, method, p, type, JSON.stringify({ id: 'x' }));
      assert.equal(r.status, 400, `${method} ${type}`);
      assert.equal(r.json.code, 'BODY_NOT_JSON', `${method} ${type}`);
    }
  }
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(await listDir(overlay), []);
});

test('a malformed percent-encoding → 400 PATH_INVALID as JSON, with no stack or install path', async (t) => {
  const { port } = await bootWithFake(t);
  for (const [method, p] of [['GET', '/api/playbooks/%c0%ae'], ['PUT', '/api/playbooks/%c0'], ['DELETE', '/api/playbooks/%E0%A4%A']]) {
    const r = await rawRequest(port, method, p, method === 'PUT' ? { id: 'x' } : undefined);
    assert.equal(r.status, 400, `${method} ${p}: ${r.text}`);
    assert.match(r.headers['content-type'], /application\/json/, `${method} ${p}`);
    assert.equal(r.json.code, 'PATH_INVALID', `${method} ${p}`);
    assert.doesNotMatch(r.text, /node_modules|\bat \w|\.js:\d/, `${method} ${p} leaks nothing`);
  }
});

test('an unexpected error → 500 {error, code: INTERNAL} with no stack', async (t) => {
  const { jsonErrorHandler } = await import('../src/errorHandler.js');
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const warn = t.mock.method(console, 'error', () => {});
  jsonErrorHandler(new Error('boom at /secret/path/x.js:1'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'internal error', code: 'INTERNAL' });
  assert.equal(warn.mock.callCount(), 1, 'the real error is logged server-side');
});

test('detail ids with an empty, `.` or `..` segment → 400 PLAYBOOK_ID_INVALID, and nothing reaches cc', async (t) => {
  const { port, fake } = await bootWithFake(t);
  for (const wire of ['..%2Fsessions', 'a%2F..%2F..%2Fx', '.', '..', 'a%2F%2Fb', 'a//b', 'acme/', 'acme%2F', 'a/./b']) {
    const r = await rawRequest(port, 'GET', `/api/playbooks/${wire}`);
    assert.equal(r.status, 400, `${wire}: ${r.text}`);
    assert.equal(r.json.code, 'PLAYBOOK_ID_INVALID', wire);
  }
  assert.deepEqual(fake.calls, [], 'no request reached cc');
  for (const wire of ['acme/release', 'acme%2Frelease']) {
    assert.equal((await rawRequest(port, 'GET', `/api/playbooks/${wire}`)).status, 200, wire);
  }
  assert.deepEqual(fake.calls.map((c) => c.path), ['/api/playbooks/acme/release', '/api/playbooks/acme/release']);
});

test('the cc client refuses any request whose resolved path leaves /api/playbooks, before sending it', async (t) => {
  const { fake } = await bootWithFake(t);
  const cc = createConductorClient({ baseUrl: fake.url });
  for (const p of ['/api/playbooks/../sessions', '/api/playbooks/a/../../x', '/api/playbooksx', '/api/sessions']) {
    await assert.rejects(cc.forward('GET', p), (e) => e.statusCode === 400 && e.code === 'PLAYBOOK_ID_INVALID', p);
  }
  assert.throws(() => playbookPath('../sessions'), (e) => e.code === 'PLAYBOOK_ID_INVALID');
  assert.deepEqual(fake.calls, []);
  assert.equal((await cc.forward('GET', playbookPath('acme/release'))).status, 200);
});

test('a cc that does not serve /api/playbooks yet: its 404 is forwarded as-is', async (t) => {
  const { port } = await bootWithFake(t, { fake: { handle: () => ({ status: 404, body: { error: 'not found' } }) } });
  const r = await rawRequest(port, 'GET', '/api/playbooks');
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { error: 'not found' });
});

test('CONDUCTOR_URL unset → cc-backed routes answer 503 CONDUCTOR_URL_UNSET; /api/health still 200', async (t) => {
  const { port } = await bootWithFake(t, { conductorUrl: null });
  assert.deepEqual((await rawRequest(port, 'GET', '/api/health')).json, { ok: true });
  for (const [method, p] of [['GET', '/api/playbooks'], ['GET', '/api/playbooks/relay'], ['POST', '/api/playbooks/validate'], ['PUT', '/api/playbooks/x'], ['DELETE', '/api/playbooks/x']]) {
    const r = await rawRequest(port, method, p, method === 'GET' || method === 'DELETE' ? undefined : { id: 'x' });
    assert.equal(r.status, 503, `${method} ${p}`);
    assert.equal(r.json.code, 'CONDUCTOR_URL_UNSET', `${method} ${p}`);
  }
});

test('a malformed CONDUCTOR_URL → 502 CONDUCTOR_UNREACHABLE naming the URL, on reads and writes', async (t) => {
  for (const bad of ['127.0.0.1:7310', 'not a url']) {
    await t.test(bad, async (tt) => {
      const { port } = await bootWithFake(tt, { conductorUrl: bad });
      for (const [method, p, body] of [['GET', '/api/playbooks'], ['GET', '/api/playbooks/relay'], ['POST', '/api/playbooks/validate', { id: 'x' }], ['PUT', '/api/playbooks/x', { id: 'x' }]]) {
        const r = await rawRequest(port, method, p, body);
        assert.equal(r.status, 502, `${method} ${p}: ${r.text}`);
        assert.equal(r.json.code, 'CONDUCTOR_UNREACHABLE');
        assert.ok(r.json.error.includes(bad), `the message names ${bad}`);
      }
    });
  }
});

test('cc unreachable on a read → 502 CONDUCTOR_UNREACHABLE', async (t) => {
  const { port, fake } = await bootWithFake(t);
  await fake.down();
  const r = await rawRequest(port, 'GET', '/api/playbooks');
  assert.equal(r.status, 502);
  assert.equal(r.json.code, 'CONDUCTOR_UNREACHABLE');
});

test('a malformed JSON body → 400 BODY_INVALID', async (t) => {
  const { port } = await bootWithFake(t);
  const r = await new Promise((resolve) => {
    import('node:http').then(({ default: http }) => {
      const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/playbooks/validate', headers: { 'content-type': 'application/json' } }, (res) => {
        let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
      });
      req.end('{nope');
    });
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'BODY_INVALID');
});
