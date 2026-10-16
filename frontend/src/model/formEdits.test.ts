// Pins each editor gesture's exact effect on the form (and so, through definitionFromForm, on the saved
// bytes), and that every edit leaves its input untouched.
import { describe, expect, test } from 'vitest';
import { loadFixtures } from '../../../tests/fixtures/fakeConductor.mjs';
import { formFromDetail } from './formModel';
import * as E from './formEdits';
import type { Form } from './types';

const { list, details } = await loadFixtures();
const pinArgsOf = (tool: string) => list.governableTools.find((t) => t.name === tool)!.pinArgs;
const mine = () => formFromDetail(details.mine);
const key = (f: Form, name: string) => f.stages.find((s) => s.name === name)!.key;
const stage = (f: Form, name: string) => f.stages.find((s) => s.name === name)!;
const tool = (f: Form, st: string, t: string) => stage(f, st).tools.find((x) => x.tool === t);

describe('every edit is pure: the input form is unchanged', () => {
  const cases: [string, (f: Form) => Form][] = [
    ['setField', (f) => E.setField(f, 'name', 'x')],
    ['setWorkers', (f) => E.setWorkers(f, key(f, 'review'), 'one')],
    ['setStageDescription', (f) => E.setStageDescription(f, key(f, 'hold'), '')],
    ['addStage', (f) => E.addStage(f)],
    ['addNeed', (f) => E.addNeed(f, key(f, 'hold'))],
    ['setNeedAnchor', (f) => E.setNeedAnchor(f, key(f, 'build'), 0, 'review')],
    ['toggleNeedPosition', (f) => E.toggleNeedPosition(f, key(f, 'review'), 0, 'build', false)],
    ['setNeedLiveness', (f) => E.setNeedLiveness(f, key(f, 'review'), 0, 'live')],
    ['removeNeed', (f) => E.removeNeed(f, key(f, 'review'), 0)],
    ['setToolPolicy', (f) => E.setToolPolicy(f, key(f, 'build'), 'send_prompt', 'allow', pinArgsOf('send_prompt'))],
    ['declareSpawn', (f) => E.declareSpawn(E.setToolPolicy(f, key(f, 'review'), 'spawn_instance', 'none', []), key(f, 'review'), 'pin', pinArgsOf('spawn_instance'))],
    ['addTool', (f) => E.addTool(f, key(f, 'hold'), 'kill_instance')],
    ['setPinArg', (f) => E.setPinArg(f, key(f, 'build'), 'spawn_instance', 0, 'effort')],
    ['setPinJson', (f) => E.setPinJson(f, key(f, 'build'), 'spawn_instance', 0, '"x"')],
    ['removePin', (f) => E.removePin(f, key(f, 'build'), 'spawn_instance', 0)],
    ['addPin', (f) => E.addPin(f, key(f, 'build'), 'spawn_instance', pinArgsOf('spawn_instance'))],
    ['addTransition', (f) => E.addTransition(f)],
    ['setTransitionField', (f) => E.setTransitionField(f, 0, 'via', 'send_prompt')],
    ['removeTransition', (f) => E.removeTransition(f, 0)],
  ];
  for (const [name, edit] of cases) {
    test(name, () => {
      const f = mine();
      const before = structuredClone(f);
      const after = edit(f);
      expect(f).toEqual(before);
      expect(after).not.toEqual(before);
    });
  }
});

test('setField, setWorkers, setStageDescription set exactly their field', () => {
  const f = mine();
  expect(E.setField(f, 'description', 'd')).toEqual({ ...f, description: 'd' });
  expect(stage(E.setWorkers(f, key(f, 'review'), 'one'), 'review').workers).toBe('one');
  expect(stage(E.setStageDescription(f, key(f, 'draft'), ''), 'draft').description).toBe('');
});

test('addStage appends stage-N (N = count + 1), skipping taken names', () => {
  const f = mine();
  const once = E.addStage(f);
  expect(once.stages.map((s) => s.name)).toEqual(['draft', 'review', 'build', 'hold', 'stage-5']);
  expect(stage(once, 'stage-5')).toMatchObject({ workers: 'one', description: '', needs: [], tools: [] });
  const taken = { ...f, stages: [...f.stages, { ...f.stages[0], key: 'x', name: 'stage-6' }] };
  expect(E.addStage(taken).stages.at(-1)!.name).toBe('stage-7');
});

test('addNeed anchors on the first other stage, else on the stage itself', () => {
  const f = mine();
  expect(stage(E.addNeed(f, key(f, 'hold')), 'hold').needs).toEqual([{ stage: 'draft', position: ['draft'], liveness: 'live' }]);
  expect(stage(E.addNeed(f, key(f, 'draft')), 'draft').needs).toEqual([{ stage: 'review', position: ['review'], liveness: 'live' }]);
  const alone = { ...f, stages: [f.stages[0]] };
  expect(E.addNeed(alone, alone.stages[0].key).stages[0].needs).toEqual([{ stage: 'draft', position: ['draft'], liveness: 'live' }]);
});

test('setNeedAnchor: a position of exactly [anchor] follows; any other position stays', () => {
  const m = mine();
  const f = E.addNeed(m, key(m, 'hold'));
  const k = key(f, 'hold');
  expect(stage(E.setNeedAnchor(f, k, 0, 'build'), 'hold').needs[0]).toEqual({ stage: 'build', position: ['build'], liveness: 'live' });
  const other = mine();
  // review needs draft at [draft, build]: not [anchor], so it stays.
  expect(stage(E.setNeedAnchor(other, key(other, 'review'), 0, 'hold'), 'review').needs[0].position).toEqual(['draft', 'build']);
});

test('toggleNeedPosition appends on, filters off; setNeedLiveness; removeNeed', () => {
  const f = mine();
  const k = key(f, 'review');
  expect(stage(E.toggleNeedPosition(f, k, 0, '*', true), 'review').needs[0].position).toEqual(['draft', 'build', '*']);
  expect(stage(E.toggleNeedPosition(f, k, 0, 'draft', false), 'review').needs[0].position).toEqual(['build']);
  expect(stage(E.setNeedLiveness(f, k, 0, 'retired'), 'review').needs[0].liveness).toBe('retired');
  expect(stage(E.removeNeed(f, k, 0), 'review').needs).toEqual([]);
});

test('setToolPolicy: none removes; pin seeds the first pin arg when empty; a non-pin policy clears pins', () => {
  const f = mine();
  const hold = key(f, 'hold');
  expect(tool(E.setToolPolicy(f, hold, 'spawn_instance', 'none', []), 'hold', 'spawn_instance')).toBeUndefined();
  expect(tool(E.setToolPolicy(f, hold, 'spawn_instance', 'pin', pinArgsOf('spawn_instance')), 'hold', 'spawn_instance'))
    .toEqual({ tool: 'spawn_instance', policy: 'pin', pin: [{ arg: 'baseWorktree', json: '""' }] });
  const build = key(f, 'build');
  expect(tool(E.setToolPolicy(f, build, 'send_prompt', 'pin', pinArgsOf('send_prompt')), 'build', 'send_prompt')!.pin)
    .toEqual([{ arg: 'idleTimeoutSeconds', json: '300' }]);
  expect(tool(E.setToolPolicy(f, build, 'send_prompt', 'deny', pinArgsOf('send_prompt')), 'build', 'send_prompt'))
    .toEqual({ tool: 'send_prompt', policy: 'deny', pin: [] });
});

test('declareSpawn puts spawn_instance first; a pin seeds spawn\'s first pin arg, else `mode`', () => {
  const m = mine();
  const f = E.setToolPolicy(m, key(m, 'review'), 'spawn_instance', 'none', []);
  const k = key(f, 'review');
  const added = E.addTool(f, k, 'kill_instance');
  expect(stage(E.declareSpawn(added, k, 'allow', pinArgsOf('spawn_instance')), 'review').tools.map((t) => t.tool)).toEqual(['spawn_instance', 'kill_instance']);
  expect(tool(E.declareSpawn(f, k, 'pin', pinArgsOf('spawn_instance')), 'review', 'spawn_instance')!.pin).toEqual([{ arg: 'baseWorktree', json: '""' }]);
  expect(tool(E.declareSpawn(f, k, 'pin', undefined), 'review', 'spawn_instance')!.pin).toEqual([{ arg: 'mode', json: '""' }]);
  expect(tool(E.declareSpawn(f, k, 'deny', pinArgsOf('spawn_instance')), 'review', 'spawn_instance')!.pin).toEqual([]);
});

test('addTool appends an allow row; pins: set arg, set json, remove, add the first unused arg', () => {
  const f = mine();
  const k = key(f, 'build');
  expect(stage(E.addTool(f, k, '*'), 'build').tools.at(-1)).toEqual({ tool: '*', policy: 'allow', pin: [] });
  expect(tool(E.setPinArg(f, k, 'spawn_instance', 1, 'effort'), 'build', 'spawn_instance')!.pin[1].arg).toBe('effort');
  expect(tool(E.setPinJson(f, k, 'spawn_instance', 0, '"plan"'), 'build', 'spawn_instance')!.pin[0].json).toBe('"plan"');
  expect(tool(E.removePin(f, k, 'spawn_instance', 0), 'build', 'spawn_instance')!.pin.map((p) => p.arg)).toEqual(['baseWorktree']);
  // build pins mode and baseWorktree; the first unused spawn pin arg is createWorktree.
  expect(tool(E.addPin(f, k, 'spawn_instance', pinArgsOf('spawn_instance')), 'build', 'spawn_instance')!.pin.at(-1)).toEqual({ arg: 'createWorktree', json: '""' });
});

test('transitions: add first → first via send_prompt; set a field; remove by index', () => {
  const f = mine();
  expect(E.addTransition(f).transitions.at(-1)).toEqual({ from: 'draft', to: 'draft', via: 'send_prompt', description: '' });
  expect(E.setTransitionField(f, 1, 'to', 'review').transitions[1]).toEqual({ from: 'build', to: 'review', via: 'send_prompt', description: '' });
  expect(E.removeTransition(f, 0).transitions.map((t) => `${t.from}->${t.to}`)).toEqual(['build->hold', 'hold->hold']);
});
