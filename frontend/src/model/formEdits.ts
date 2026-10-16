// Every editor gesture as a pure edit: (form, …) → a new form, the input left
// untouched. The mutations are the editor's; serialising the result is
// formModel's definitionFromForm.
import { newStage, SEND_PROMPT, SPAWN } from './formModel';
import type { Form, FormStage, FormTransition } from './types';

const clone = (form: Form): Form => structuredClone(form);
const stageOf = (f: Form, key: string): FormStage => f.stages.find((x) => x.key === key)!;
const onStage = (form: Form, key: string, fn: (st: FormStage, f: Form) => void): Form => {
  const f = clone(form);
  fn(stageOf(f, key), f);
  return f;
};
const toolOf = (st: FormStage, tool: string) => st.tools.find((t) => t.tool === tool)!;

export function setField(form: Form, field: 'id' | 'name' | 'description', value: string): Form {
  const f = clone(form);
  f[field] = value;
  return f;
}

export const setWorkers = (form: Form, key: string, value: string) => onStage(form, key, (st) => { st.workers = value; });
export const setStageDescription = (form: Form, key: string, value: string) => onStage(form, key, (st) => { st.description = value; });

/** Appends `stage-N`, N the stage count plus one, skipping names already taken. */
export function addStage(form: Form): Form {
  const x = clone(form);
  let i = x.stages.length + 1;
  while (x.stages.some((st) => st.name === `stage-${i}`)) i++;
  x.stages.push(newStage(`stage-${i}`));
  return x;
}

/** A live need anchored on the first other stage (the stage itself when it is alone), positioned at its anchor. */
export const addNeed = (form: Form, key: string) => onStage(form, key, (st, f) => {
  const anchor = f.stages.find((x) => x.key !== key)?.name ?? st.name;
  st.needs.push({ stage: anchor, position: [anchor], liveness: 'live' });
});

/** A position that was exactly `[anchor]` follows the anchor. */
export const setNeedAnchor = (form: Form, key: string, i: number, value: string) => onStage(form, key, (st) => {
  const need = st.needs[i];
  if (need.position.length === 1 && need.position[0] === need.stage) need.position = [value];
  need.stage = value;
});

export const toggleNeedPosition = (form: Form, key: string, i: number, member: string, on: boolean) => onStage(form, key, (st) => {
  const need = st.needs[i];
  need.position = on ? [...need.position, member] : need.position.filter((m) => m !== member);
});

export const setNeedLiveness = (form: Form, key: string, i: number, value: string) => onStage(form, key, (st) => { st.needs[i].liveness = value; });
export const removeNeed = (form: Form, key: string, i: number) => onStage(form, key, (st) => { st.needs.splice(i, 1); });

/** `'none'` removes the tool. Choosing `pin` seeds one pin on the tool's first pin arg; any other policy clears the pins. */
export const setToolPolicy = (form: Form, key: string, tool: string, value: string, pinArgs: string[]) => onStage(form, key, (st) => {
  if (value === 'none') { st.tools = st.tools.filter((t) => t.tool !== tool); return; }
  const t = toolOf(st, tool);
  t.policy = value;
  if (value === 'pin' && t.pin.length === 0) t.pin = [{ arg: pinArgs[0], json: '""' }];
  if (value !== 'pin') t.pin = [];
});

/** Declares spawn_instance first in the stage's tools; a pin is seeded on spawn's first pin arg (`mode` when cc lists none). */
export const declareSpawn = (form: Form, key: string, policy: string, spawnPinArgs: string[] | undefined) => onStage(form, key, (st) => {
  st.tools.unshift({ tool: SPAWN, policy, pin: policy === 'pin' ? [{ arg: spawnPinArgs?.[0] ?? 'mode', json: '""' }] : [] });
});

export const addTool = (form: Form, key: string, tool: string) => onStage(form, key, (st) => { st.tools.push({ tool, policy: 'allow', pin: [] }); });

export const setPinArg = (form: Form, key: string, tool: string, i: number, value: string) => onStage(form, key, (st) => { toolOf(st, tool).pin[i].arg = value; });
export const setPinJson = (form: Form, key: string, tool: string, i: number, value: string) => onStage(form, key, (st) => { toolOf(st, tool).pin[i].json = value; });
export const removePin = (form: Form, key: string, tool: string, i: number) => onStage(form, key, (st) => { toolOf(st, tool).pin.splice(i, 1); });

/** A pin on the first of `pinArgs` the row does not pin yet. */
export const addPin = (form: Form, key: string, tool: string, pinArgs: string[]) => onStage(form, key, (st) => {
  const row = toolOf(st, tool);
  const usedArgs = new Set(row.pin.map((p) => p.arg));
  row.pin.push({ arg: pinArgs.find((a) => !usedArgs.has(a))!, json: '""' });
});

/** first stage → first stage, via send_prompt. */
export function addTransition(form: Form): Form {
  const f = clone(form);
  const names = f.stages.map((st) => st.name);
  f.transitions.push({ from: names[0], to: names[0], via: SEND_PROMPT, description: '' });
  return f;
}

export function setTransitionField(form: Form, i: number, field: keyof FormTransition, value: string): Form {
  const f = clone(form);
  f.transitions[i][field] = value;
  return f;
}

export function removeTransition(form: Form, i: number): Form {
  const f = clone(form);
  f.transitions.splice(i, 1);
  return f;
}
