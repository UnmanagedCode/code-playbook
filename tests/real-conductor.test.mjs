// Against a live code-conductor: RUN_REAL_CC=1 CONDUCTOR_URL=http://127.0.0.1:<port> npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConductorClient, playbookPath } from '../src/conductorClient.js';
import { assertListShape, assertDetailShape } from './contractShape.mjs';
import { formFromDetail, definitionFromForm, newPlaybookForm } from '../public/formModel.js';

const enabled = process.env.RUN_REAL_CC === '1' && !!process.env.CONDUCTOR_URL;
const cc = createConductorClient({ baseUrl: process.env.CONDUCTOR_URL });

test('the live cc answers contract-shaped JSON, and every playbook round-trips through its validator', { skip: !enabled && 'set RUN_REAL_CC=1 and CONDUCTOR_URL' }, async (t) => {
  const list = await cc.list();
  assertListShape(list);
  for (const summary of list.playbooks) {
    await t.test(summary.id, async () => {
      const { status, body: detail } = await cc.forward('GET', playbookPath(summary.id));
      assert.equal(status, 200);
      assertDetailShape(detail);
      const id = `rt-${summary.id.replace('/', '-')}`;
      const { definition } = definitionFromForm({ ...formFromDetail(detail), id });
      assert.deepEqual(await cc.validate(definition), { ok: true });
    });
  }
});

test('the New playbook seed passes the live validator once named, and fails only on name/description before', { skip: !enabled && 'set RUN_REAL_CC=1 and CONDUCTOR_URL' }, async () => {
  const { definition } = definitionFromForm(newPlaybookForm('rt-seed'));
  const empty = await cc.validate(definition);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.errors.map((e) => e.message), ['name is required and must be a non-empty string', 'description is required and must be a non-empty string']);
  assert.deepEqual(await cc.validate({ ...definition, name: 'Seed', description: 'A seed.' }), { ok: true });
});
