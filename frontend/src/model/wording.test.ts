// @ts-nocheck — the assertion bodies are untyped JS on purpose: fixtures and helpers stay loosely shaped.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { driftWarning, renameWarning, deleteConfirm } from './wording';

// liveWorkers is a count, or null when cc could not read it.

test('drift warning: a grammatical subject and verb for a count of 1, many, and unknown', () => {
  assert.match(driftWarning('mine', 1), /^1 live worker is bound to 'mine'\. /);
  assert.match(driftWarning('mine', 2), /^2 live workers are bound to 'mine'\. /);
  assert.match(driftWarning('mine', null), /^An unknown number of live workers may be bound to 'mine'\. /);
  for (const n of [1, 2, null]) assert.match(driftWarning('mine', n), /STAGE_UNKNOWN\.$/);
});

test('rename warning: names the removed file, and the workers only when there may be some', () => {
  assert.equal(renameWarning('mine', 'mine-2', 0), "Saving under 'mine-2' removes mine.json.");
  assert.equal(renameWarning('mine', 'mine-2', 1), "Saving under 'mine-2' removes mine.json. 1 live worker bound to 'mine' will lose its playbook (PLAYBOOK_UNKNOWN).");
  assert.equal(renameWarning('mine', 'mine-2', 2), "Saving under 'mine-2' removes mine.json. 2 live workers bound to 'mine' will lose their playbook (PLAYBOOK_UNKNOWN).");
  assert.equal(renameWarning('mine', 'mine-2', null), "Saving under 'mine-2' removes mine.json. Any live workers bound to 'mine' (cc could not count them) will lose their playbook (PLAYBOOK_UNKNOWN).");
});

test('delete confirm: restore line for a built-in override, worker line by count and by what follows', () => {
  assert.equal(deleteConfirm('mine', { builtin: false, live: 0 }), 'Delete mine.json?');
  assert.equal(deleteConfirm('mine', { builtin: false, live: 2 }), "Delete mine.json?\n\n2 live workers bound to 'mine' will lose their playbook (PLAYBOOK_UNKNOWN).");
  assert.equal(deleteConfirm('relay', { builtin: true, live: 1 }), "Delete relay.json?\n\nThis restores the shipped 'relay' definition.\n\n1 live worker bound to 'relay' will continue under the shipped definition.");
  assert.equal(deleteConfirm('mine', { builtin: false, live: null }), "Delete mine.json?\n\nAny live workers bound to 'mine' (cc could not count them) will lose their playbook (PLAYBOOK_UNKNOWN).");
});
