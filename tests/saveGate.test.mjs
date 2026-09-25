import test from 'node:test';
import assert from 'node:assert/strict';
import { canSave } from '../public/saveGate.js';

const form = { id: 'x', stages: [{ key: 's1', name: 'a' }, { key: 's2', name: 'b' }] };
const ready = { form, rev: 3, validation: { rev: 3, ok: true, errors: [] }, localErrors: [], renameErrors: {}, saving: false };

test('Save is enabled only for the accepted current revision with nothing pending', () => {
  assert.equal(canSave(ready, {}), true);
  assert.equal(canSave({ ...ready, saving: true }, {}), false, 'while saving');
  assert.equal(canSave({ ...ready, form: { ...form, id: '' } }, {}), false, 'empty id');
  assert.equal(canSave(ready, { block: 'reserved' }), false, 'blocked id');
  assert.equal(canSave({ ...ready, localErrors: [{}] }, {}), false, 'local errors');
  assert.equal(canSave({ ...ready, validation: { rev: 2, ok: true } }, {}), false, 'verdict for an older revision');
  assert.equal(canSave({ ...ready, validation: { rev: 3, ok: false, errors: [] } }, {}), false, 'refused');
  assert.equal(canSave({ ...ready, validation: null }, {}), false, 'not yet validated');
});

test('a refused stage rename blocks Save while that stage exists', () => {
  assert.equal(canSave({ ...ready, renameErrors: { s2: 'a stage name cannot be empty' } }, {}), false);
  assert.equal(canSave({ ...ready, renameErrors: { gone: 'a stage named \'a\' already exists' } }, {}), true, 'an error on a removed stage no longer blocks');
});
