// The editor's form state and every transformation over it. Pure: no DOM, so
// the tests import it directly. Functions taking a form never mutate it.
//
// Form: { id, name, description, entryStages: string[],
//         stages: [{ key, name, workers, description,
//                    needs: [{ stage, position: string[], liveness }],
//                    tools: [{ tool, policy: 'allow'|'deny'|'pin', pin: [{ arg, json }] }] }],
//         transitions: [{ from, to, via, description }] }
// `key` is a stable per-card uid, so a renamed stage keeps its card.

export const SEND_PROMPT = 'send_prompt';
export const SPAWN = 'spawn_instance';
export const WILDCARD = '*';

let seq = 0;
export const newKey = () => `s${++seq}`;

const clone = (form) => structuredClone(form);

function toolRow(tool, policy) {
  if (policy === 'allow' || policy === 'deny') return { tool, policy, pin: [] };
  return { tool, policy: 'pin', pin: Object.entries(policy.pin).map(([arg, v]) => ({ arg, json: JSON.stringify(v) })) };
}

export function newStage(name) {
  return { key: newKey(), name, workers: 'one', description: '', needs: [], tools: [] };
}

export function formFromDetail(d) {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? '',
    entryStages: [...d.entryStages],
    stages: Object.entries(d.stages).map(([name, s]) => ({
      key: newKey(),
      name,
      workers: s.workers,
      description: s.description ?? '',
      needs: s.needs.map((n) => ({ stage: n.stage, position: [...n.position], liveness: n.liveness })),
      tools: Object.entries(s.tools).map(([tool, p]) => toolRow(tool, p)),
    })),
    transitions: d.transitions.map((t) => ({ from: t.from, to: t.to, via: t.via, description: t.description ?? '' })),
  };
}

// → { definition } or { localErrors }. Unparseable pin JSON is the only local
// error: without a parse there is no definition to hand to cc's validator.
export function definitionFromForm(form) {
  const localErrors = [];
  const stages = {};
  for (const s of form.stages) {
    const tools = {};
    for (const row of s.tools) {
      if (row.policy !== 'pin') { tools[row.tool] = row.policy; continue; }
      const pin = {};
      for (const p of row.pin) {
        try {
          pin[p.arg] = JSON.parse(p.json);
        } catch {
          localErrors.push({ message: `stage '${s.name}': tools.${row.tool}.pin.${p.arg} is not valid JSON (${JSON.stringify(p.json)})`, stage: s.name, tool: row.tool, transition: null });
        }
      }
      tools[row.tool] = { pin };
    }
    stages[s.name] = {
      needs: s.needs.map((n) => ({ stage: n.stage, position: [...n.position], liveness: n.liveness })),
      workers: s.workers,
      tools,
      ...(s.description !== '' && { description: s.description }),
    };
  }
  if (localErrors.length) return { localErrors };
  return {
    definition: {
      id: form.id,
      name: form.name,
      description: form.description,
      entryStages: [...form.entryStages],
      stages,
      transitions: form.transitions.map((t) => ({
        from: t.from,
        to: t.to,
        ...(t.via !== SEND_PROMPT && { on: t.via }),
        ...(t.description !== '' && { description: t.description }),
      })),
    },
  };
}

export function duplicateForm(detail, newId) {
  return { ...formFromDetail(detail), id: newId };
}

// The New playbook seed: the smallest graph a run can start in.
export function newPlaybookForm(id) {
  const start = newStage('start');
  start.tools = [{ tool: SPAWN, policy: 'allow', pin: [] }];
  return { id, name: '', description: '', entryStages: ['start'], stages: [start], transitions: [] };
}

export function toggleEntry(form, name, on) {
  const f = clone(form);
  f.entryStages = f.entryStages.filter((s) => s !== name);
  if (on) f.entryStages.push(name);
  return f;
}

// Throws on a blank name, and on a name another stage holds: a definition's
// stages are object keys, so two cards with one name would silently collapse
// into one stage.
export function renameStage(form, key, next) {
  const f = clone(form);
  const stage = f.stages.find((s) => s.key === key);
  const prev = stage.name;
  if (next.trim() === '') throw new Error('a stage name cannot be empty');
  if (prev === next) return f;
  if (f.stages.some((s) => s.key !== key && s.name === next)) throw new Error(`a stage named '${next}' already exists`);
  const sub = (n) => (n === prev ? next : n);
  stage.name = next;
  f.entryStages = f.entryStages.map(sub);
  for (const s of f.stages) {
    for (const n of s.needs) { n.stage = sub(n.stage); n.position = n.position.map(sub); }
  }
  for (const t of f.transitions) { t.from = sub(t.from); t.to = sub(t.to); }
  return f;
}

// → { form, impact }: `impact` lists, for the confirm dialog, everything that
// goes with the stage.
export function removeStage(form, key) {
  const f = clone(form);
  const name = f.stages.find((s) => s.key === key).name;
  const impact = [];
  f.stages = f.stages.filter((s) => s.key !== key);
  if (f.entryStages.includes(name)) impact.push(`its entry-stage flag`);
  f.entryStages = f.entryStages.filter((s) => s !== name);
  for (const s of f.stages) {
    for (const n of s.needs.filter((n) => n.stage === name)) impact.push(`stage '${s.name}' needs '${name}'`);
    s.needs = s.needs.filter((n) => n.stage !== name);
    for (const n of s.needs) {
      if (!n.position.includes(name)) continue;
      impact.push(`'${name}' from the position of stage '${s.name}' needs '${n.stage}'`);
      n.position = n.position.filter((p) => p !== name);
      if (n.position.length === 0) n.position = [n.stage];
    }
  }
  for (const t of f.transitions.filter((t) => t.from === name || t.to === name)) impact.push(`transition ${t.from} → ${t.to}`);
  f.transitions = f.transitions.filter((t) => t.from !== name && t.to !== name);
  return { form: f, impact };
}

// The only id checks the editor makes itself, all read from cc's takenIds.
// `originalId` is the id being edited (null for a draft).
export function idNotices(id, takenIds, originalId) {
  const out = { warn: [] };
  if (takenIds.reserved.includes(id)) out.block = `'${id}' is reserved: cc ignores an overlay file with this id.`;
  if (takenIds.builtin.includes(id)) out.warn.push(`'${id}' overrides the shipped '${id}' playbook until this file is deleted.`);
  if (takenIds.user.includes(id) && id !== originalId) out.warn.push(`'${id}' overwrites the existing user playbook '${id}'.`);
  return out;
}

// Buckets located errors (cc's, or local ones) onto the form. A location that no
// longer matches the form (a stale response) falls to the playbook panel: an
// error is never dropped.
export function placeErrors(errors, form) {
  const out = { playbook: [], byStage: {}, byTransition: {} };
  for (const e of errors) {
    const stage = e.stage != null && form.stages.find((s) => s.name === e.stage);
    if (stage) { (out.byStage[stage.key] ||= []).push(e); continue; }
    const rows = e.transition
      ? form.transitions.flatMap((t, i) => (t.from === e.transition.from && t.to === e.transition.to ? [i] : []))
      : [];
    if (rows.length) { for (const i of rows) (out.byTransition[i] ||= []).push(e); continue; }
    out.playbook.push(e);
  }
  return out;
}
