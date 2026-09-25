import { api } from './api.js';
import { renderList, renderDetail, renderMessage } from './viewer.js';
import { openEditor } from './editor.js';
import { askId } from './idDialog.js';
import { deleteConfirm } from './wording.js';
import { formFromDetail, duplicateForm, newPlaybookForm } from './formModel.js';

// Routes: `?playbook=<id>` (detail), `?edit=<id>` (edit a user playbook),
// `?draft=1` (the in-memory draft a Duplicate or New playbook opened).
const listEl = document.getElementById('list');
const viewEl = document.getElementById('view');
const state = { list: null, listError: null, draft: null, flash: null };
let editor = null;
let routeSeq = 0;

function describeListError(r) {
  if (r.status === 404) return 'cc does not serve /api/playbooks yet — restart code-conductor.';
  return r.data?.error || `HTTP ${r.status}`;
}

async function loadList() {
  const r = await api.list();
  state.list = r.ok ? r.data : null;
  state.listError = r.ok ? null : describeListError(r);
}

function navigate(query) {
  const qs = new URLSearchParams(query).toString();
  history.pushState(null, '', qs ? `?${qs}` : location.pathname);
  route();
}
const home = () => navigate({});

async function duplicate(detail) {
  const slug = detail.id.split('/').pop();
  const id = await askId({ title: `Duplicate ${detail.id}`, initial: `${slug}-copy`, takenIds: state.list.takenIds });
  if (!id) return;
  state.draft = { form: duplicateForm(detail, id), title: `New playbook (from ${detail.id})`, back: { playbook: detail.id } };
  navigate({ draft: '1' });
}

async function createNew() {
  const id = await askId({ title: 'New playbook', takenIds: state.list.takenIds });
  if (!id) return;
  state.draft = { form: newPlaybookForm(id), title: 'New playbook', back: {} };
  navigate({ draft: '1' });
}

async function remove(id, confirmText) {
  if (!window.confirm(confirmText)) return;
  const r = await api.remove(id);
  if (!r.ok) { window.alert(`Delete failed: ${r.data.error}`); return; }
  state.flash = `Deleted ${id}.json.`;
  await loadList();
  home();
}

function drawList(selectedId) {
  renderList(listEl, {
    list: state.list,
    listError: state.listError,
    selectedId,
    onSelect: (id) => navigate({ playbook: id }),
    onNew: createNew,
    onDeleteFile: (id) => remove(id, `Delete ${id}.json? cc could not load it, so there is nothing to open in the editor.`),
  });
}

function editorOpts(extra) {
  return {
    list: state.list,
    onSaved: async (id) => {
      state.draft = null;
      state.flash = `Saved ${id}.json.`;
      await loadList();
      navigate(state.list?.playbooks.some((p) => p.id === id) ? { playbook: id } : {});
    },
    ...extra,
  };
}

async function route() {
  const seq = ++routeSeq;
  editor?.dispose();
  editor = null;
  const p = new URLSearchParams(location.search);
  const selectedId = p.get('playbook') || p.get('edit');
  document.body.classList.toggle('has-selection', !!(selectedId || p.has('draft')));
  drawList(selectedId);

  const flash = state.flash;
  state.flash = null;
  if (!state.list) { renderMessage(viewEl, { title: 'Playbooks unavailable', text: state.listError }); return; }

  if (p.has('draft')) {
    if (!state.draft) return home();
    editor = openEditor(viewEl, editorOpts({ mode: 'draft', form: state.draft.form, title: state.draft.title, originalId: null, originalLive: 0,
      onCancel: () => { const { back } = state.draft; state.draft = null; navigate(back); } }));
    return;
  }
  if (!selectedId) {
    renderMessage(viewEl, { title: flash || 'Select a playbook', text: flash ? null : 'Built-in and plugin playbooks are read-only; duplicate one, or start a new playbook in the User group.' });
    return;
  }
  const r = await api.detail(selectedId);
  if (seq !== routeSeq) return;
  if (!r.ok) { renderMessage(viewEl, { title: `Cannot open ${selectedId}`, text: r.data.error, onBack: home }); return; }
  const detail = r.data;
  if (p.has('edit')) {
    if (!detail.editable) { renderMessage(viewEl, { title: `${selectedId} is read-only`, text: `Only user playbooks are editable; this one is ${detail.source}.`, onBack: home }); return; }
    editor = openEditor(viewEl, editorOpts({ mode: 'edit', form: formFromDetail(detail), title: `Edit ${detail.id}`, originalId: detail.id, originalLive: detail.liveWorkers,
      onCancel: () => navigate({ playbook: detail.id }) }));
    return;
  }
  renderDetail(viewEl, {
    detail,
    list: state.list,
    onBack: home,
    onEdit: () => navigate({ edit: detail.id }),
    onDuplicate: () => duplicate(detail),
    onDelete: () => remove(detail.id, deleteConfirm(detail.id, { builtin: state.list.takenIds.builtin.includes(detail.id), live: detail.liveWorkers })),
  });
  if (flash) viewEl.prepend(Object.assign(document.createElement('div'), { className: 'notice good', textContent: flash }));
}

window.addEventListener('popstate', route);
await loadList();
route();
