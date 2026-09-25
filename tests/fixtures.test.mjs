import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures } from './fixtures/fakeConductor.mjs';
import { assertListShape, assertDetailShape } from './contractShape.mjs';

test('the hand-recorded cc fixtures are contract-shaped', async (t) => {
  const { list, details } = await loadFixtures();
  assertListShape(list);
  for (const d of Object.values(details)) await t.test(d.id, () => assertDetailShape(d));
  assert.deepEqual(Object.keys(details).sort(), list.playbooks.map((p) => p.id).sort(), 'one detail per listed playbook');
});
