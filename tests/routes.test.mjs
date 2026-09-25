import test from 'node:test';
import assert from 'node:assert/strict';
import { bootWithFake, rawRequest } from './helpers.mjs';
import { loadFixtures } from './fixtures/fakeConductor.mjs';

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
  assert.deepEqual(fake.calls.at(-1), { method: 'POST', path: '/api/playbooks/validate', body: draft });
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
