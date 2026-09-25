import { el, fill } from './dom.js';
import { renderGraph } from './graph.js';
import { WILDCARD } from './formModel.js';

const GROUP_ORDER = (source) => (source === 'builtin' ? '0' : source === 'user' ? '1' : `2${source}`);
const groupLabel = (source) => (source === 'builtin' ? 'Built-in' : source === 'user' ? 'User' : `Plugin · ${source.slice('plugin:'.length)}`);

// The grouped list, with the New playbook action in the user group and cc's
// load errors grouped by id beneath it.
export function renderList(container, { list, listError, selectedId, onSelect, onNew, onDeleteFile }) {
  if (listError) {
    fill(container, el('div', { class: 'panel error-panel' }, el('strong', { text: 'Cannot load playbooks' }), el('p', { text: listError })));
    return;
  }
  if (!list) { fill(container, el('p', { class: 'muted', text: 'Loading…' })); return; }

  const groups = new Map([['builtin', []], ['user', []]]);
  for (const p of list.playbooks) groups.set(p.source, [...(groups.get(p.source) || []), p]);
  const sources = [...groups.keys()].sort((a, b) => GROUP_ORDER(a).localeCompare(GROUP_ORDER(b)));

  const errorsById = new Map();
  for (const e of list.errors) errorsById.set(e.id, [...(errorsById.get(e.id) || []), e.message]);

  fill(container, 
    ...sources.map((source) => el('section', { class: 'group', dataset: { source } },
      el('div', { class: 'group-head' },
        el('h3', { text: groupLabel(source) }),
        source === 'user' && el('button', { class: 'small', text: '+ New playbook', on: { click: onNew } })),
      groups.get(source).length === 0 && el('p', { class: 'muted small-text', text: 'No user playbooks yet.' }),
      ...groups.get(source).sort((a, b) => a.id.localeCompare(b.id)).map((p) => el('button', {
        class: `list-entry${p.id === selectedId ? ' selected' : ''}`, dataset: { id: p.id }, on: { click: () => onSelect(p.id) },
      }, el('span', { class: 'entry-id', text: p.id }), el('span', { class: 'entry-name', text: p.name }))))),
    errorsById.size > 0 && el('section', { class: 'group errors-group' },
      el('div', { class: 'group-head' }, el('h3', { text: 'Load errors' })),
      ...[...errorsById].sort(([a], [b]) => a.localeCompare(b)).map(([id, messages]) => el('div', { class: 'load-error', dataset: { id } },
        el('div', { class: 'load-error-head' },
          el('code', { text: id }),
          list.takenIds.user.includes(id) && el('button', { class: 'small danger', text: 'Delete file', on: { click: () => onDeleteFile(id) } })),
        ...messages.map((m) => el('p', { class: 'small-text', text: m }))))),
  );
}

const policyText = (p) => (typeof p === 'string' ? p : 'pin');
const pinText = (p) => (typeof p === 'object' ? Object.entries(p.pin).map(([a, v]) => `${a} = ${JSON.stringify(v)}`).join(', ') : '');

function stagePanel(detail, name) {
  const s = detail.stages[name];
  return el('section', { class: 'panel stage-panel', id: `stage-${name}` },
    el('div', { class: 'stage-head' },
      el('h4', { text: name }),
      detail.entryStages.includes(name) && el('span', { class: 'badge entry', text: 'entry' }),
      s.spawnable && el('span', { class: 'badge spawnable', text: 'spawnable' }),
      el('span', { class: 'badge', text: `workers: ${s.workers}` })),
    s.description && el('p', { class: 'stage-desc', text: s.description }),
    el('div', { class: 'kv' },
      el('span', { class: 'k', text: 'needs' }),
      s.needs.length === 0 ? el('span', { class: 'muted', text: 'none' })
        : el('ul', { class: 'needs' }, ...s.needs.map((n) => el('li', {},
          el('code', { text: n.stage }), ' · position ', el('code', { text: n.position.join(', ') }), ' · ', n.liveness)))),
    el('table', { class: 'tools' },
      el('thead', {}, el('tr', {}, el('th', { text: 'tool' }), el('th', { text: 'policy' }), el('th', { text: 'pinned' }))),
      el('tbody', {}, Object.keys(s.tools).length === 0
        ? el('tr', {}, el('td', { colspan: 3, class: 'muted', text: 'no tools declared: every tool allowed, spawn_instance denied' }))
        : Object.entries(s.tools).map(([tool, p]) => el('tr', {},
          el('td', {}, tool === WILDCARD ? el('span', {}, el('code', { text: '*' }), ' fallback') : el('code', { text: tool })),
          el('td', { class: `policy policy-${policyText(p)}`, text: policyText(p) }),
          el('td', {}, el('code', { text: pinText(p) })))))));
}

export function renderDetail(container, { detail, list, onEdit, onDuplicate, onDelete, onBack }) {
  const builtinOverride = detail.source === 'user' && list?.takenIds.builtin.includes(detail.id);
  const live = detail.liveWorkers === null ? 'unknown' : String(detail.liveWorkers);
  fill(container, 
    el('button', { class: 'back link', text: '← All playbooks', on: { click: onBack } }),
    el('div', { class: 'detail-head' },
      el('div', {},
        el('h2', { text: detail.name }),
        el('div', { class: 'meta' },
          el('code', { text: detail.id }),
          el('span', { class: `badge source-${detail.source.split(':')[0]}`, text: detail.source }),
          builtinOverride && el('span', { class: 'badge warn', text: 'overrides built-in' }),
          el('span', { class: 'muted', text: `live workers: ${live}` }))),
      el('div', { class: 'actions' },
        detail.editable && el('button', { text: 'Edit', on: { click: onEdit } }),
        el('button', { text: 'Duplicate', on: { click: onDuplicate } }),
        detail.editable && el('button', { class: 'danger', text: 'Delete', on: { click: onDelete } }))),
    !detail.editable && el('p', { class: 'muted small-text', text: detail.source === 'builtin'
      ? 'Built-in playbooks are read-only: duplicate one to author your own, or save a user playbook under this id to override it.'
      : 'Plugin playbooks are read-only here: they are edited in the contributing plugin\'s own files.' }),
    el('p', { class: 'description', text: detail.description }),
    el('div', { class: 'chips' }, el('span', { class: 'k', text: 'entry stages' }), ...detail.entryStages.map((s) => el('span', { class: 'chip', text: s }))),
    el('div', { class: 'panel graph-panel' },
      renderGraph(detail, { onNode: (name) => document.getElementById(`stage-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }),
      el('p', { class: 'legend small-text muted' }, 'solid: transition, labelled with its driving tool · dashed: needs (anchor → stage) · bold border: entry stage')),
    ...Object.keys(detail.stages).map((name) => stagePanel(detail, name)),
    el('section', { class: 'panel' },
      el('h4', { text: 'Transitions' }),
      detail.transitions.length === 0 ? el('p', { class: 'muted', text: 'none' })
        : el('table', { class: 'transitions' },
          el('thead', {}, el('tr', {}, el('th', { text: 'from → to' }), el('th', { text: 'via' }), el('th', { text: 'description' }))),
          el('tbody', {}, ...detail.transitions.map((t) => el('tr', {},
            el('td', {}, el('code', { text: `${t.from} → ${t.to}` })),
            el('td', {}, el('code', { text: t.via })),
            el('td', { text: t.description ?? '' })))))),
  );
}

export function renderMessage(container, { title, text, onBack }) {
  fill(container, 
    onBack && el('button', { class: 'back link', text: '← All playbooks', on: { click: onBack } }),
    el('div', { class: 'panel' }, el('h3', { text: title }), text && el('p', { text })));
}
