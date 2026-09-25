import assert from 'node:assert/strict';

// The key sets of cc's /api/playbooks contract. Shared by the fixture test and
// the gated real-cc test, so the hand-recorded fixtures and the live cc are
// held to one definition of the shape.
const keys = (o) => Object.keys(o).sort();
const LIST_KEYS = ['errors', 'governableTools', 'playbooks', 'takenIds'];
const SUMMARY_KEYS = ['description', 'editable', 'entryStages', 'id', 'name', 'source', 'spawnableStages'];
const DETAIL_KEYS = ['description', 'editable', 'entryStages', 'id', 'liveWorkers', 'name', 'source', 'stages', 'transitions'];
const STAGE_REQUIRED = ['needs', 'spawnable', 'tools', 'workers'];
const NEEDS_KEYS = ['liveness', 'position', 'stage'];
const TRANSITION_REQUIRED = ['from', 'to', 'via'];

function withOptional(obj, required, optional, label) {
  const extra = keys(obj).filter((k) => !required.includes(k));
  assert.deepEqual(extra.filter((k) => k !== optional), [], `${label}: unexpected keys`);
  for (const k of required) assert.ok(k in obj, `${label}: missing ${k}`);
  if (optional in obj) assert.equal(typeof obj[optional], 'string', `${label}: ${optional} must be a string when present`);
}

export function assertListShape(list) {
  assert.deepEqual(keys(list), LIST_KEYS, 'list keys');
  for (const p of list.playbooks) assert.deepEqual(keys(p), SUMMARY_KEYS, `summary ${p.id}`);
  for (const e of list.errors) assert.deepEqual(keys(e), ['id', 'message'], `error ${e.id}`);
  for (const g of list.governableTools) {
    assert.deepEqual(keys(g), ['name', 'pinArgs'], `tool ${g.name}`);
    assert.ok(Array.isArray(g.pinArgs), `tool ${g.name} pinArgs`);
  }
  assert.deepEqual(keys(list.takenIds), ['builtin', 'reserved', 'user'], 'takenIds keys');
}

export function assertDetailShape(d) {
  assert.deepEqual(keys(d), DETAIL_KEYS, `detail ${d.id}`);
  assert.ok(d.liveWorkers === null || Number.isInteger(d.liveWorkers), `${d.id} liveWorkers`);
  for (const [name, s] of Object.entries(d.stages)) {
    withOptional(s, STAGE_REQUIRED, 'description', `${d.id} stage ${name}`);
    assert.ok(['one', 'many'].includes(s.workers), `${d.id} stage ${name} workers`);
    for (const n of s.needs) assert.deepEqual(keys(n), NEEDS_KEYS, `${d.id} stage ${name} needs`);
  }
  for (const t of d.transitions) withOptional(t, TRANSITION_REQUIRED, 'description', `${d.id} transition ${t.from}->${t.to}`);
}
