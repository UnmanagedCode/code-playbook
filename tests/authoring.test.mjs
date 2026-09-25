import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bootWithFake, rawRequest, listDir, sampleDefinition } from './helpers.mjs';

const put = (port, id, body, query = '') => rawRequest(port, 'PUT', `/api/playbooks/${id}${query}`, body);
const del = (port, id) => rawRequest(port, 'DELETE', `/api/playbooks/${id}`);
const validateCalls = (fake) => fake.calls.filter((c) => c.path === '/api/playbooks/validate');

test('a valid save writes <root>/.code-conductor/playbooks/<id>.json, creating the dir', async (t) => {
  const { port, overlay } = await bootWithFake(t);
  const def = sampleDefinition('my-relay');
  const r = await put(port, 'my-relay', def);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, id: 'my-relay' });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(overlay, 'my-relay.json'), 'utf8')), def);
});

test('the save path sends its draft to cc as Content-Type: application/json', async (t) => {
  const { port, fake } = await bootWithFake(t);
  const r = await put(port, 'x', sampleDefinition('x'));
  assert.equal(r.status, 200);
  assert.deepEqual(validateCalls(fake).map((c) => c.contentType), ['application/json']);
});

test('cc refusing the draft → 422 with its errors verbatim, nothing written, cc saw the exact body', async (t) => {
  const errors = [{ message: "stage 'start': nope", stage: 'start', transition: null }, { message: 'name is required', stage: null, transition: null }];
  const { port, overlay, fake } = await bootWithFake(t, { fake: { validate: () => ({ ok: false, errors }) } });
  const def = sampleDefinition('draft');
  const r = await put(port, 'draft', def);
  assert.equal(r.status, 422);
  assert.equal(r.json.code, 'PLAYBOOK_INVALID');
  assert.deepEqual(r.json.errors, errors);
  assert.deepEqual(validateCalls(fake).map((c) => c.body), [def]);
  assert.deepEqual(await listDir(overlay), []);
});

test('cc unreachable → 502 CONDUCTOR_UNREACHABLE and no file', async (t) => {
  const { port, overlay, fake } = await bootWithFake(t);
  await fake.down();
  const r = await put(port, 'x', sampleDefinition('x'));
  assert.equal(r.status, 502);
  assert.equal(r.json.code, 'CONDUCTOR_UNREACHABLE');
  assert.deepEqual(await listDir(overlay), []);
});

test('cc answering a non-200 to its list → 502, no validate call, no file', async (t) => {
  const { port, overlay, fake } = await bootWithFake(t, { fake: { handle: (m, p) => (p === '/api/playbooks' ? { status: 404, body: { error: 'Cannot GET' } } : undefined) } });
  const r = await put(port, 'x', sampleDefinition('x'));
  assert.equal(r.status, 502);
  assert.equal(r.json.code, 'CONDUCTOR_BAD_RESPONSE');
  assert.equal(validateCalls(fake).length, 0);
  assert.deepEqual(await listDir(overlay), []);
});

test('body id different from the path id → 400, no validate call, no file', async (t) => {
  const { port, overlay, fake } = await bootWithFake(t);
  const r = await put(port, 'one', sampleDefinition('two'));
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'PLAYBOOK_ID_MISMATCH');
  assert.equal(validateCalls(fake).length, 0);
  assert.deepEqual(await listDir(overlay), []);
});

test('path guard: unsafe ids → 400 on PUT and DELETE, and nothing outside the overlay changes', async (t) => {
  const { port, root, overlay, fake } = await bootWithFake(t);
  await fs.mkdir(overlay, { recursive: true });
  const sentinel = path.join(root, '.code-conductor', 'x.json');
  await fs.writeFile(sentinel, 'sentinel');
  const cases = {
    '../x': '../x',
    'a/b': 'a/b',
    '..%2Fx': '../x',
    '.x': '.x',
    '..': '..',
    'a%5Cb': 'a\\b',
    'a%00b': 'a\0b',
    '': '',
  };
  for (const [wire, id] of Object.entries(cases)) {
    await t.test(`PUT/DELETE ${JSON.stringify(wire)}`, async () => {
      const p = await put(port, wire, sampleDefinition(id));
      assert.equal(p.status, 400, `PUT ${wire}: ${p.text}`);
      assert.equal(p.json.code, 'PLAYBOOK_ID_INVALID');
      const d = await del(port, wire);
      assert.equal(d.status, 400, `DELETE ${wire}: ${d.text}`);
      assert.equal(d.json.code, 'PLAYBOOK_ID_INVALID');
    });
  }
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'sentinel');
  assert.deepEqual(await listDir(overlay), []);
  assert.equal(validateCalls(fake).length, 0);
});

test('a path-safe id is judged by cc, not the guard: uppercase and over-long ids reach validate', async (t) => {
  const refuse = (d) => ({ ok: false, errors: [{ message: `invalid id '${d.id}'`, stage: null, transition: null }] });
  const { port, overlay, fake } = await bootWithFake(t, { fake: { validate: refuse } });
  for (const id of ['X', 'a'.repeat(41)]) {
    const r = await put(port, id, sampleDefinition(id));
    assert.equal(r.status, 422, id);
    assert.deepEqual(r.json.errors, [{ message: `invalid id '${id}'`, stage: null, transition: null }]);
  }
  assert.deepEqual(validateCalls(fake).map((c) => c.body.id), ['X', 'a'.repeat(41)]);
  assert.deepEqual(await listDir(overlay), []);
});

test('reserved id (from takenIds.reserved) → 409 on PUT and DELETE; the pre-seeded custom.json is untouched', async (t) => {
  const { port, overlay, fake } = await bootWithFake(t);
  await fs.mkdir(overlay, { recursive: true });
  await fs.writeFile(path.join(overlay, 'custom.json'), 'catalog store');
  const p = await put(port, 'custom', sampleDefinition('custom'));
  assert.equal(p.status, 409);
  assert.equal(p.json.code, 'PLAYBOOK_ID_RESERVED');
  const d = await del(port, 'custom');
  assert.equal(d.status, 409);
  const r = await put(port, 'mine', sampleDefinition('mine'), '?from=custom');
  assert.equal(r.status, 409, 'a rename away from a reserved id is refused too');
  assert.equal(await fs.readFile(path.join(overlay, 'custom.json'), 'utf8'), 'catalog store');
  assert.deepEqual(await listDir(overlay), ['custom.json']);
  assert.equal(validateCalls(fake).length, 0);
});

test('overwrite replaces the content atomically, leaving no temp file', async (t) => {
  const { port, overlay } = await bootWithFake(t);
  await put(port, 'mine', sampleDefinition('mine'));
  const next = { ...sampleDefinition('mine'), name: 'Second' };
  const r = await put(port, 'mine', next);
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(overlay, 'mine.json'), 'utf8')), next);
  assert.deepEqual(await listDir(overlay), ['mine.json']);
});

test('a failed rename onto the target → 500, the temp file removed, no partial .json', async (t) => {
  const { port, overlay } = await bootWithFake(t);
  await fs.mkdir(path.join(overlay, 'mine.json'), { recursive: true }); // rename onto a directory fails
  const r = await put(port, 'mine', sampleDefinition('mine'));
  assert.equal(r.status, 500);
  assert.equal(r.json.code, 'PLAYBOOK_WRITE_FAILED');
  assert.deepEqual(await listDir(overlay), ['mine.json']);
  assert.ok((await fs.stat(path.join(overlay, 'mine.json'))).isDirectory());
});

test('?from=old writes the new file then removes the old one', async (t) => {
  const { port, overlay } = await bootWithFake(t);
  await put(port, 'old', sampleDefinition('old'));
  const r = await put(port, 'new', sampleDefinition('new'), '?from=old');
  assert.equal(r.status, 200);
  assert.deepEqual(await listDir(overlay), ['new.json']);
});

test('?from=old with a refused draft keeps the old file and writes nothing', async (t) => {
  let refuse = false;
  const { port, overlay } = await bootWithFake(t, { fake: { validate: () => (refuse ? { ok: false, errors: [] } : { ok: true }) } });
  await put(port, 'old', sampleDefinition('old'));
  refuse = true;
  const r = await put(port, 'new', sampleDefinition('new'), '?from=old');
  assert.equal(r.status, 422);
  assert.deepEqual(await listDir(overlay), ['old.json']);
});

test('?from with an unsafe id → 400 before anything is written', async (t) => {
  const { port, overlay } = await bootWithFake(t);
  const r = await put(port, 'new', sampleDefinition('new'), '?from=..%2Fx');
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'PLAYBOOK_ID_INVALID');
  assert.deepEqual(await listDir(overlay), []);
});

test('DELETE removes only <id>.json; a missing file → 404; a built-in without an override → 404', async (t) => {
  const { port, overlay } = await bootWithFake(t);
  await put(port, 'a', sampleDefinition('a'));
  await put(port, 'b', sampleDefinition('b'));
  const r = await del(port, 'a');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, id: 'a' });
  assert.deepEqual(await listDir(overlay), ['b.json']);
  const again = await del(port, 'a');
  assert.equal(again.status, 404);
  assert.equal(again.json.code, 'PLAYBOOK_NOT_FOUND');
  assert.equal((await del(port, 'relay')).status, 404);
  assert.equal((await del(port, 'acme%2Frelease')).status, 400, 'a plugin id has no overlay file to name');
});

test('PROJECTS_ROOT unset → writes answer 503 PROJECTS_ROOT_UNSET', async (t) => {
  const { port } = await bootWithFake(t, { projectsRoot: null });
  const r = await put(port, 'x', sampleDefinition('x'));
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'PROJECTS_ROOT_UNSET');
});
