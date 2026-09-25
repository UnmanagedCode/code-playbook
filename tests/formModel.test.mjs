import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, cannedValidate } from './fixtures/fakeConductor.mjs';
import {
  formFromDetail, definitionFromForm, renameStage, removeStage, duplicateForm, newPlaybookForm,
  toggleEntry, idNotices, placeErrors,
} from '../public/formModel.js';

const { list, details } = await loadFixtures();

// The contract's detail → definition mapping, written independently of
// formModel: drop spawnable and the response-only fields, turn via into on
// (dropped for send_prompt).
function expectedDefinition(d) {
  const { source, editable, liveWorkers, stages, transitions, ...rest } = d;
  return {
    ...rest,
    stages: Object.fromEntries(Object.entries(stages).map(([n, { spawnable, ...s }]) => [n, s])),
    transitions: transitions.map(({ via, ...t }) => (via === 'send_prompt' ? t : { ...t, on: via })),
  };
}

// What cc would answer for a definition it accepted: defaults are already
// explicit in everything the form emits, so only the response fields are added.
function detailOf(def, extra = {}) {
  return {
    ...def, source: 'user', editable: true, liveWorkers: 0, ...extra,
    stages: Object.fromEntries(Object.entries(def.stages).map(([n, s]) => [n, { ...s, spawnable: s.tools.spawn_instance !== undefined && s.tools.spawn_instance !== 'deny' }])),
    transitions: def.transitions.map(({ on, ...t }) => ({ ...t, via: on ?? 'send_prompt' })),
  };
}

const stageByName = (form, name) => form.stages.find((s) => s.name === name);
const def = (form) => {
  const r = definitionFromForm(form);
  assert.ok(r.definition, `expected a definition, got ${JSON.stringify(r.localErrors)}`);
  return r.definition;
};

test('the form round-trip is lossless over every fixture detail', async (t) => {
  for (const d of Object.values(details)) {
    await t.test(d.id, () => assert.deepEqual(def(formFromDetail(d)), expectedDefinition(d)));
  }
});

test('via send_prompt emits no `on`; any other via emits it', () => {
  const form = formFromDetail(details.solo);
  const byEdge = Object.fromEntries(def(form).transitions.map((t) => [`${t.from}->${t.to}`, t]));
  assert.equal(byEdge['plan->implement'].on, 'approve_plan');
  assert.ok(!('on' in byEdge['implement->refine']));
});

test('descriptions: absent → "" in the form; "" → key absent; present → verbatim', () => {
  const form = formFromDetail(details.mine);
  assert.equal(stageByName(form, 'review').description, '');
  assert.equal(form.transitions.find((t) => t.from === 'build').description, '');
  const out = def(form);
  assert.ok(!('description' in out.stages.review));
  assert.ok(!('description' in out.transitions.find((t) => t.from === 'build')));
  assert.equal(out.stages.draft.description, details.mine.stages.draft.description);
  stageByName(form, 'draft').description = '';
  assert.ok(!('description' in def(form).stages.draft));
});

test('spawn_instance "deny" and an undeclared spawn_instance stay distinct', () => {
  const out = def(formFromDetail(details.mine));
  assert.equal(out.stages.hold.tools.spawn_instance, 'deny');
  const solo = def(formFromDetail(details.solo));
  assert.ok(!('spawn_instance' in solo.stages.implement.tools));
});

test('entryStages keep their order; toggling an entry off then on appends it', () => {
  const form = formFromDetail(details.mine);
  assert.deepEqual(form.entryStages, ['review', 'draft']);
  assert.deepEqual(def(form).entryStages, ['review', 'draft']);
  const off = toggleEntry(form, 'review', false);
  assert.deepEqual(off.entryStages, ['draft']);
  assert.deepEqual(toggleEntry(off, 'review', true).entryStages, ['draft', 'review']);
  assert.deepEqual(form.entryStages, ['review', 'draft'], 'pure: the input form is unchanged');
});

test('pin values round-trip by type; invalid pin JSON is a local error located to stage and tool', () => {
  const form = formFromDetail(details.mine);
  const build = stageByName(form, 'build');
  const spawn = build.tools.find((r) => r.tool === 'spawn_instance');
  spawn.pin = [{ arg: 'name', json: '"planner"' }, { arg: 'debug', json: 'true' }, { arg: 'effort', json: '3' }, { arg: 'baseWorktree', json: 'null' }];
  assert.deepEqual(def(form).stages.build.tools.spawn_instance, { pin: { name: 'planner', debug: true, effort: 3, baseWorktree: null } });

  spawn.pin = [{ arg: 'name', json: 'planner' }];
  const r = definitionFromForm(form);
  assert.equal(r.definition, undefined);
  assert.equal(r.localErrors.length, 1);
  assert.equal(r.localErrors[0].stage, 'build');
  assert.equal(r.localErrors[0].tool, 'spawn_instance');
  assert.equal(r.localErrors[0].transition, null);
});

test('renameStage cascades by exact name and leaves a prefix-sharing stage alone', () => {
  const src = {
    id: 'r', name: 'R', description: 'd', entryStages: ['plan', 'plan-b'],
    stages: {
      plan: { needs: [], workers: 'one', tools: { spawn_instance: 'allow' }, spawnable: true },
      'plan-b': { needs: [], workers: 'one', tools: { spawn_instance: 'allow' }, spawnable: true },
      next: { needs: [{ stage: 'plan', position: ['plan', 'plan-b'], liveness: 'live' }, { stage: 'plan-b', position: ['plan-b'], liveness: 'live' }], workers: 'one', tools: { spawn_instance: 'allow' }, spawnable: true },
    },
    transitions: [{ from: 'plan', to: 'next', via: 'send_prompt' }, { from: 'plan-b', to: 'plan', via: 'send_prompt' }],
    source: 'user', editable: true, liveWorkers: 0,
  };
  const form = formFromDetail(src);
  const key = stageByName(form, 'plan').key;
  const out = def(renameStage(form, key, 'draft'));
  assert.deepEqual(Object.keys(out.stages), ['draft', 'plan-b', 'next']);
  assert.deepEqual(out.entryStages, ['draft', 'plan-b']);
  assert.deepEqual(out.stages.next.needs, [{ stage: 'draft', position: ['draft', 'plan-b'], liveness: 'live' }, { stage: 'plan-b', position: ['plan-b'], liveness: 'live' }]);
  assert.deepEqual(out.transitions, [{ from: 'draft', to: 'next' }, { from: 'plan-b', to: 'draft' }]);
  assert.equal(renameStage(form, key, 'draft').stages[0].key, key, 'the stage keeps its key');
});

test('renameStage refuses a name another stage already has', () => {
  const form = formFromDetail(details.relay);
  assert.throws(() => renameStage(form, stageByName(form, 'plan').key, 'review'), /already/);
});

test('removeStage drops entry membership, anchored needs, touching transitions; an emptied position falls back to [anchor]', () => {
  const form = formFromDetail(details.mine);
  const { form: out, impact } = removeStage(form, stageByName(form, 'build').key);
  const d = def(out);
  assert.deepEqual(Object.keys(d.stages), ['draft', 'review', 'hold']);
  assert.deepEqual(d.transitions, [{ from: 'hold', to: 'hold', description: 'Each round is ledgered.' }]);
  assert.deepEqual(d.stages.review.needs, [{ stage: 'draft', position: ['draft'], liveness: 'any' }]);
  assert.ok(impact.length >= 3, 'the confirm dialog names what goes');

  const f2 = formFromDetail(details.mine);
  stageByName(f2, 'review').needs[0].position = ['build'];
  const d2 = def(removeStage(f2, stageByName(f2, 'build').key).form);
  assert.deepEqual(d2.stages.review.needs[0].position, ['draft'], 'emptied → [anchor]');

  const f3 = formFromDetail(details.mine);
  const d3 = def(removeStage(f3, stageByName(f3, 'draft').key).form);
  assert.deepEqual(d3.entryStages, ['review']);
  assert.deepEqual(d3.stages.review.needs, []);
  assert.deepEqual(d3.stages.build.needs, []);
});

test('duplicateForm from a plugin playbook: new id, same graph', () => {
  const src = details['acme/release'];
  const out = def(duplicateForm(src, 'rel'));
  assert.equal(out.id, 'rel');
  assert.deepEqual({ ...out, id: src.id }, expectedDefinition(src));
});

test('the New playbook seed: one spawnable entry stage `start`; passes the fake validate and round-trips', () => {
  const form = newPlaybookForm('fresh');
  assert.deepEqual({ id: form.id, name: form.name, description: form.description }, { id: 'fresh', name: '', description: '' });
  const out = def(form);
  assert.deepEqual(out, {
    id: 'fresh', name: '', description: '', entryStages: ['start'],
    stages: { start: { needs: [], workers: 'one', tools: { spawn_instance: 'allow' } } },
    transitions: [],
  });
  assert.deepEqual(cannedValidate(out), { ok: true });
  assert.deepEqual(def(formFromDetail(detailOf(out))), out);
});

test('idNotices: reserved blocks, a built-in id warns override, another user id warns overwrite', () => {
  const taken = list.takenIds;
  assert.ok(idNotices('custom', taken, null).block);
  const solo = idNotices('solo', taken, null);
  assert.equal(solo.block, undefined);
  assert.equal(solo.warn.length, 1);
  assert.match(solo.warn[0], /overrides the shipped/);
  const over = idNotices('mine', taken, 'other');
  assert.equal(over.warn.length, 1);
  assert.match(over.warn[0], /overwrites/);
  assert.deepEqual(idNotices('mine', taken, 'mine'), { warn: [] });
  assert.deepEqual(idNotices('my-relay', taken, null), { warn: [] });
});

test('placeErrors: stage → its card, transition → matching rows, else the playbook panel; nothing dropped', () => {
  const form = formFromDetail(details.mine);
  const errors = [
    { message: 'a', stage: 'review', transition: null },
    { message: 'b', stage: null, transition: { from: 'build', to: 'hold' } },
    { message: 'c', stage: null, transition: null },
    { message: 'd', stage: 'gone', transition: null },
    { message: 'e', stage: null, transition: { from: 'x', to: 'y' } },
    { message: 'f', stage: 'draft', transition: null, tool: 'spawn_instance' },
  ];
  const placed = placeErrors(errors, form);
  assert.deepEqual(placed.byStage[stageByName(form, 'review').key].map((e) => e.message), ['a']);
  assert.deepEqual(placed.byStage[stageByName(form, 'draft').key].map((e) => e.message), ['f']);
  const tIdx = form.transitions.findIndex((t) => t.from === 'build' && t.to === 'hold');
  assert.deepEqual(placed.byTransition[tIdx].map((e) => e.message), ['b']);
  assert.deepEqual(placed.playbook.map((e) => e.message), ['c', 'd', 'e']);
  const count = placed.playbook.length + Object.values(placed.byStage).flat().length + Object.values(placed.byTransition).flat().length;
  assert.equal(count, errors.length);
});
