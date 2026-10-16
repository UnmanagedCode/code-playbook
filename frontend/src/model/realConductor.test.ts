// @vitest-environment node
// Against a live code-conductor: RUN_REAL_CC=1 CONDUCTOR_URL=http://127.0.0.1:<port> npm run test:web
// Invariant: the live cc answers the contract shape the fixtures pin, every playbook it serves round-trips
// through formModel and its validator, and the New playbook seed fails only on name/description.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { assertListShape, assertDetailShape } from '../../../tests/contractShape.mjs';
import { formFromDetail, definitionFromForm, newPlaybookForm } from './formModel';
import type { Definition, PlaybookList } from './types';

const enabled = process.env.RUN_REAL_CC === '1' && !!process.env.CONDUCTOR_URL;
const base = process.env.CONDUCTOR_URL;
// Each segment encoded, as the backend's playbookPath does for a plugin id's `/`.
const playbookPath = (id: string) => `/api/playbooks/${id.split('/').map(encodeURIComponent).join('/')}`;
async function get(p: string) {
  const r = await fetch(new URL(p, base));
  return { status: r.status, body: await r.json() };
}
async function validate(definition: Definition) {
  const r = await fetch(new URL('/api/playbooks/validate', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(definition) });
  assert.equal(r.status, 200);
  return r.json();
}
const list: PlaybookList | null = enabled ? (await get('/api/playbooks')).body : null;

describe.skipIf(!enabled)('the live cc answers contract-shaped JSON, and every playbook round-trips through its validator', () => {
  test('list shape', () => assertListShape(list));
  for (const summary of list?.playbooks ?? []) {
    test(summary.id, async () => {
      const { status, body: detail } = await get(playbookPath(summary.id));
      assert.equal(status, 200);
      assertDetailShape(detail);
      const id = `rt-${summary.id.replace('/', '-')}`;
      const { definition } = definitionFromForm({ ...formFromDetail(detail), id });
      assert.deepEqual(await validate(definition!), { ok: true });
    });
  }
});

test.skipIf(!enabled)('the New playbook seed passes the live validator once named, and fails only on name/description before', async () => {
  const { definition } = definitionFromForm(newPlaybookForm('rt-seed'));
  const empty = await validate(definition!);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.errors.map((e: { message: string }) => e.message), ['name is required and must be a non-empty string', 'description is required and must be a non-empty string']);
  assert.deepEqual(await validate({ ...definition!, name: 'Seed', description: 'A seed.' }), { ok: true });
});
