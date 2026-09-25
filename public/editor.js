import { el, fill, select } from './dom.js';
import { api } from './api.js';
import {
  definitionFromForm, renameStage, removeStage, toggleEntry, idNotices, placeErrors, newStage,
  SEND_PROMPT, SPAWN, WILDCARD,
} from './formModel.js';
import { driftWarning, renameWarning } from './wording.js';
import { canSave } from './saveGate.js';

const VALIDATE_DEBOUNCE_MS = 300;
const STAGE_DESC_HINT = 'Stage descriptions reach the conductor verbatim (its role prompt when this is the preferred playbook, and describe_playbook), so editing one changes what the conductor does.';
const SPAWN_HINT = 'A stage is spawnable only when spawn_instance is declared allow or pin; "*" never confers it.';

// A structured form over formModel. cc judges every definition: each change is
// validated (debounced) and Save is enabled only for the revision cc accepted.
//
// opts: { mode: 'edit'|'draft', form, originalId, originalLive, list, title,
//         onSaved(id), onCancel() }
// Returns { dispose }.
export function openEditor(container, opts) {
  const { list } = opts;
  const pinArgsOf = new Map(list.governableTools.map((t) => [t.name, t.pinArgs]));
  const toolNames = list.governableTools.map((t) => t.name);
  const loadedIds = new Set(list.playbooks.map((p) => p.id));

  const s = {
    form: opts.form,
    rev: 0,
    validation: null, // { rev, ok, errors }
    localErrors: [],
    renameDrafts: {},
    renameErrors: {},
    target: null, // { id, live } for a loaded playbook the id names
    saving: false,
    saveError: null,
  };
  let validateTimer = null;
  let targetTimer = null;
  let disposed = false;

  function change(fn) {
    const prevId = s.form.id;
    const f = structuredClone(s.form);
    s.form = fn(f) || f;
    s.rev++;
    s.saveError = null;
    if (s.form.id !== prevId) scheduleTarget();
    scheduleValidate();
    render();
  }

  function scheduleValidate() {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(runValidate, VALIDATE_DEBOUNCE_MS);
  }

  async function runValidate() {
    const rev = s.rev;
    const r = definitionFromForm(s.form);
    if (r.localErrors) {
      s.localErrors = r.localErrors;
      s.validation = { rev, ok: false, errors: [] };
      render();
      return;
    }
    s.localErrors = [];
    const resp = await api.validate(r.definition);
    if (disposed || rev !== s.rev) return; // a newer revision owns the verdict
    s.validation = resp.ok
      ? { rev, ok: resp.data.ok, errors: resp.data.errors || [] }
      : { rev, ok: false, errors: [{ message: `could not validate: ${resp.data.error}`, stage: null, transition: null }] };
    render();
  }

  // The drift warning needs liveWorkers of whatever loaded playbook the id names.
  function scheduleTarget() {
    clearTimeout(targetTimer);
    const id = s.form.id;
    if (opts.mode === 'edit' && id === opts.originalId) { s.target = { id, live: opts.originalLive }; return; }
    if (!loadedIds.has(id)) { s.target = null; return; }
    targetTimer = setTimeout(async () => {
      const resp = await api.detail(id);
      if (disposed || s.form.id !== id) return;
      s.target = resp.ok ? { id, live: resp.data.liveWorkers } : null;
      render();
    }, VALIDATE_DEBOUNCE_MS);
  }

  function notices() {
    const n = idNotices(s.form.id, list.takenIds, opts.mode === 'edit' ? opts.originalId : null);
    const warn = [...n.warn];
    if (s.target && s.target.live !== 0) {
      warn.push(driftWarning(s.target.id, s.target.live));
    }
    if (opts.mode === 'edit' && s.form.id !== opts.originalId) {
      warn.push(renameWarning(opts.originalId, s.form.id, opts.originalLive));
    }
    return { block: n.block, warn };
  }

  async function save() {
    const r = definitionFromForm(s.form);
    if (!r.definition) return;
    s.saving = true;
    render();
    const resp = await api.save(s.form.id, r.definition, opts.mode === 'edit' ? opts.originalId : undefined);
    if (disposed) return;
    s.saving = false;
    if (resp.ok) { opts.onSaved(s.form.id); return; }
    if (resp.status === 422 && Array.isArray(resp.data.errors)) s.validation = { rev: s.rev, ok: false, errors: resp.data.errors };
    else s.saveError = resp.data.error || `save failed (HTTP ${resp.status})`;
    render();
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  const stageNames = () => s.form.stages.map((st) => st.name);
  const errList = (errors) => errors?.length ? el('ul', { class: 'errors' }, ...errors.map((e) => el('li', { text: e.message }))) : null;
  const field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'field-label', text: label }), control, hint && el('span', { class: 'hint', text: hint }));
  const onStage = (key, fn) => change((f) => { fn(f.stages.find((x) => x.key === key), f); });

  function statusLine(n) {
    let text; let cls = 'status';
    const renames = s.form.stages.filter((st) => s.renameErrors[st.key]).length;
    if (s.saving) text = 'Saving…';
    else if (renames) { text = `${renames} stage rename${renames === 1 ? '' : 's'} refused`; cls += ' bad'; }
    else if (s.localErrors.length) { text = `${s.localErrors.length} local error${s.localErrors.length === 1 ? '' : 's'}`; cls += ' bad'; }
    else if (!s.validation || s.validation.rev !== s.rev) text = 'Validating…';
    else if (s.validation.ok) { text = n.block ? 'Valid, but the id is blocked' : 'Valid — ready to save'; cls += n.block ? ' bad' : ' good'; }
    else { text = `${s.validation.errors.length} error${s.validation.errors.length === 1 ? '' : 's'} from cc`; cls += ' bad'; }
    return el('span', { class: cls, dataset: { status: '' }, text });
  }

  function toolRow(stage, row) {
    const pinArgs = pinArgsOf.get(row.tool) || [];
    const canPin = row.tool !== WILDCARD && (pinArgs.length > 0 || row.policy === 'pin');
    const isSpawn = row.tool === SPAWN;
    const policyOptions = isSpawn ? [['none', 'not declared'], ['deny'], ['allow'], ['pin']] : [['allow'], ['deny'], ...(canPin ? [['pin']] : [])];
    const setPolicy = (value) => onStage(stage.key, (st) => {
      if (value === 'none') { st.tools = st.tools.filter((t) => t.tool !== row.tool); return; }
      const t = st.tools.find((x) => x.tool === row.tool);
      t.policy = value;
      if (value === 'pin' && t.pin.length === 0) t.pin = [{ arg: pinArgs[0], json: '""' }];
      if (value !== 'pin') t.pin = [];
    });
    const usedArgs = new Set(row.pin.map((p) => p.arg));
    return el('div', { class: `tool-row${isSpawn ? ' spawn-row' : ''}`, dataset: { tool: row.tool } },
      el('div', { class: 'tool-line' },
        el('code', { class: 'tool-name', text: row.tool === WILDCARD ? '* (fallback)' : row.tool }),
        select(policyOptions, row.policy, { on: { change: (e) => setPolicy(e.target.value) }, dataset: { f: `policy:${stage.key}:${row.tool}` } }),
        !isSpawn && el('button', { class: 'small', text: '✕', title: `remove ${row.tool}`, on: { click: () => setPolicy('none') } })),
      row.policy === 'pin' && el('div', { class: 'pins' },
        ...row.pin.map((p, i) => el('div', { class: 'pin-row' },
          select([...new Set([...pinArgs, p.arg])].map((a) => [a]), p.arg, {
            on: { change: (e) => onStage(stage.key, (st) => { st.tools.find((t) => t.tool === row.tool).pin[i].arg = e.target.value; }) },
          }),
          el('span', { text: '=' }),
          el('input', {
            class: 'mono', value: p.json, placeholder: 'JSON value', dataset: { f: `pin:${stage.key}:${row.tool}:${i}` },
            on: { input: (e) => onStage(stage.key, (st) => { st.tools.find((t) => t.tool === row.tool).pin[i].json = e.target.value; }) },
          }),
          el('button', { class: 'small', text: '✕', on: { click: () => onStage(stage.key, (st) => { st.tools.find((t) => t.tool === row.tool).pin.splice(i, 1); }) } }))),
        pinArgs.some((a) => !usedArgs.has(a)) && el('button', {
          class: 'small', text: '+ pin',
          on: { click: () => onStage(stage.key, (st) => { st.tools.find((t) => t.tool === row.tool).pin.push({ arg: pinArgs.find((a) => !usedArgs.has(a)), json: '""' }); }) },
        })));
  }

  function spawnSection(stage) {
    const row = stage.tools.find((t) => t.tool === SPAWN);
    if (row) return toolRow(stage, row);
    return el('div', { class: 'tool-row spawn-row', dataset: { tool: SPAWN } },
      el('div', { class: 'tool-line' },
        el('code', { class: 'tool-name', text: SPAWN }),
        select([['none', 'not declared'], ['deny'], ['allow'], ['pin']], 'none', {
          dataset: { f: `policy:${stage.key}:${SPAWN}` },
          on: { change: (e) => onStage(stage.key, (st) => {
            const policy = e.target.value;
            st.tools.unshift({ tool: SPAWN, policy, pin: policy === 'pin' ? [{ arg: pinArgsOf.get(SPAWN)?.[0] ?? 'mode', json: '""' }] : [] });
          }) },
        })));
  }

  function needsRow(stage, n, i) {
    const names = stageNames();
    const togglePos = (member, on) => onStage(stage.key, (st) => {
      const need = st.needs[i];
      need.position = on ? [...need.position, member] : need.position.filter((m) => m !== member);
    });
    return el('div', { class: 'needs-row' },
      field('anchor', select(names.map((x) => [x]), n.stage, {
        on: { change: (e) => onStage(stage.key, (st) => {
          const need = st.needs[i];
          if (need.position.length === 1 && need.position[0] === need.stage) need.position = [e.target.value];
          need.stage = e.target.value;
        }) },
      })),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'position' }),
        el('div', { class: 'position' }, ...[...names, WILDCARD].map((m) => el('label', { class: 'check' },
          el('input', { type: 'checkbox', checked: n.position.includes(m), on: { change: (e) => togglePos(m, e.target.checked) } }),
          m === WILDCARD ? 'any stage (*)' : m)))),
      field('liveness', select([['live'], ['retired'], ['any']], n.liveness, { on: { change: (e) => onStage(stage.key, (st) => { st.needs[i].liveness = e.target.value; }) } })),
      el('button', { class: 'small', text: '✕', title: 'remove this need', on: { click: () => onStage(stage.key, (st) => { st.needs.splice(i, 1); }) } }));
  }

  function stageCard(stage, placed) {
    const errors = [...(placed.byStage[stage.key] || [])];
    const declared = new Set(stage.tools.map((t) => t.tool));
    const addable = [...toolNames.filter((t) => t !== SPAWN), WILDCARD].filter((t) => !declared.has(t));
    return el('section', { class: `panel stage-card${errors.length ? ' has-errors' : ''}`, dataset: { stage: stage.name, key: stage.key } },
      el('div', { class: 'stage-card-head' },
        el('input', {
          class: 'stage-name mono', value: s.renameDrafts[stage.key] ?? stage.name, 'aria-label': 'stage name', dataset: { f: `name:${stage.key}` },
          on: {
            input: (e) => { s.renameDrafts[stage.key] = e.target.value; },
            change: (e) => {
              try {
                const next = renameStage(s.form, stage.key, e.target.value);
                delete s.renameDrafts[stage.key];
                delete s.renameErrors[stage.key];
                change(() => next);
              } catch (err) {
                s.renameErrors[stage.key] = err.message;
                render();
              }
            },
          },
        }),
        el('label', { class: 'check' },
          el('input', { type: 'checkbox', checked: s.form.entryStages.includes(stage.name), dataset: { f: `entry:${stage.key}` }, on: { change: (e) => change((f) => toggleEntry(f, stage.name, e.target.checked)) } }),
          'entry stage'),
        field('workers', select([['one'], ['many']], stage.workers, { on: { change: (e) => onStage(stage.key, (st) => { st.workers = e.target.value; }) } })),
        el('button', {
          class: 'small danger', text: 'Remove stage',
          on: { click: () => {
            const { form, impact } = removeStage(s.form, stage.key);
            const msg = `Remove stage '${stage.name}'?${impact.length ? `\n\nThis also removes:\n• ${impact.join('\n• ')}` : ''}`;
            if (window.confirm(msg)) change(() => form);
          } },
        })),
      s.renameErrors[stage.key] && el('p', { class: 'errors', text: s.renameErrors[stage.key] }),
      errList(errors),
      field('description', el('textarea', {
        rows: Math.min(12, Math.ceil(stage.description.length / 120) + 1), value: stage.description, dataset: { f: `desc:${stage.key}` },
        on: { input: (e) => onStage(stage.key, (st) => { st.description = e.target.value; }) },
      }), STAGE_DESC_HINT),
      el('h5', { text: 'needs' }),
      ...stage.needs.map((n, i) => needsRow(stage, n, i)),
      el('button', {
        class: 'small', text: '+ need',
        on: { click: () => onStage(stage.key, (st, f) => {
          const anchor = f.stages.find((x) => x.key !== stage.key)?.name ?? stage.name;
          st.needs.push({ stage: anchor, position: [anchor], liveness: 'live' });
        }) },
      }),
      el('h5', { text: 'tools' }),
      spawnSection(stage),
      el('p', { class: 'hint', text: SPAWN_HINT }),
      ...stage.tools.filter((t) => t.tool !== SPAWN).map((row) => toolRow(stage, row)),
      addable.length > 0 && select([['', 'add tool…'], ...addable.map((t) => [t, t === WILDCARD ? '* (fallback)' : t])], '', {
        class: 'add-tool', dataset: { f: `addtool:${stage.key}` },
        on: { change: (e) => { const tool = e.target.value; if (tool) onStage(stage.key, (st) => { st.tools.push({ tool, policy: 'allow', pin: [] }); }); } },
      }));
  }

  function transitionsSection(placed) {
    const names = stageNames();
    const viaOptions = [[SEND_PROMPT, `${SEND_PROMPT} (default — no on)`], ...toolNames.filter((t) => t !== SEND_PROMPT).map((t) => [t])];
    const onT = (i, fn) => change((f) => { fn(f.transitions[i], f); });
    return el('section', { class: 'panel' },
      el('h4', { text: 'Transitions' }),
      ...s.form.transitions.map((t, i) => el('div', { class: `transition-row${placed.byTransition[i] ? ' has-errors' : ''}`, dataset: { index: String(i) } },
        el('div', { class: 'transition-line' },
          select(names.map((x) => [x]), t.from, { 'aria-label': 'from', on: { change: (e) => onT(i, (x) => { x.from = e.target.value; }) } }),
          el('span', { text: '→' }),
          select(names.map((x) => [x]), t.to, { 'aria-label': 'to', on: { change: (e) => onT(i, (x) => { x.to = e.target.value; }) } }),
          el('span', { class: 'muted', text: 'via' }),
          select(viaOptions, t.via, { 'aria-label': 'via', on: { change: (e) => onT(i, (x) => { x.via = e.target.value; }) } }),
          el('input', { class: 'grow', value: t.description, placeholder: 'description (optional)', dataset: { f: `tdesc:${i}` }, on: { input: (e) => onT(i, (x) => { x.description = e.target.value; }) } }),
          el('button', { class: 'small', text: '✕', on: { click: () => change((f) => { f.transitions.splice(i, 1); }) } })),
        errList(placed.byTransition[i]))),
      names.length > 0 && el('button', {
        class: 'small', text: '+ transition',
        on: { click: () => change((f) => { f.transitions.push({ from: names[0], to: names[0], via: SEND_PROMPT, description: '' }); }) },
      }));
  }

  function render() {
    if (disposed) return;
    const focus = document.activeElement?.dataset?.f;
    const sel = focus && 'selectionStart' in document.activeElement ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

    const n = notices();
    const placed = placeErrors([...(s.validation?.rev === s.rev ? s.validation.errors : []), ...s.localErrors], s.form);
    const f = s.form;
    const setTop = (key) => (e) => { const v = e.target.value; change((x) => { x[key] = v; }); };

    fill(container, el('div', { class: 'editor' },
      el('div', { class: 'editor-head' },
        el('h2', { text: opts.title }),
        el('div', { class: 'actions' },
          statusLine(n),
          el('button', { class: 'primary', text: 'Save', disabled: !canSave(s, n), dataset: { action: 'save' }, on: { click: save } }),
          el('button', { text: 'Cancel', on: { click: opts.onCancel } }))),
      n.block && el('div', { class: 'notice block', text: n.block }),
      ...n.warn.map((w) => el('div', { class: 'notice warn', text: w })),
      s.saveError && el('div', { class: 'notice block', text: s.saveError }),
      el('section', { class: 'panel' },
        field('id', el('input', { class: 'mono', value: f.id, dataset: { f: 'id' }, on: { input: setTop('id') } }), `saved as <projects root>/.code-conductor/playbooks/${f.id || '<id>'}.json`),
        field('name', el('input', { value: f.name, dataset: { f: 'name' }, on: { input: setTop('name') } })),
        field('description', el('textarea', { rows: 2, value: f.description, dataset: { f: 'description' }, on: { input: setTop('description') } })),
        placed.playbook.length > 0 && el('div', { class: 'playbook-errors' }, el('h5', { text: 'Playbook errors' }), errList(placed.playbook))),
      el('h3', { text: 'Stages' }),
      ...f.stages.map((st) => stageCard(st, placed)),
      el('button', {
        text: '+ Add stage', dataset: { action: 'add-stage' },
        on: { click: () => change((x) => {
          let i = x.stages.length + 1;
          while (x.stages.some((st) => st.name === `stage-${i}`)) i++;
          x.stages.push(newStage(`stage-${i}`));
        }) },
      }),
      transitionsSection(placed)));

    if (focus) {
      const target = container.querySelector(`[data-f="${CSS.escape(focus)}"]`);
      if (target) {
        target.focus({ preventScroll: true });
        if (sel && typeof target.setSelectionRange === 'function' && target.type !== 'checkbox') {
          try { target.setSelectionRange(sel[0], sel[1]); } catch { /* not a text control */ }
        }
      }
    }
  }

  scheduleTarget();
  scheduleValidate();
  render();
  return {
    dispose() {
      disposed = true;
      clearTimeout(validateTimer);
      clearTimeout(targetTimer);
    },
  };
}
