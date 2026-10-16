import { useEffect, useRef, useState } from 'react';
import { ApiError, playbooksApi } from '@/lib/api';
import { definitionFromForm, renameStage } from '@/model/formModel';
import { VALIDATE_DEBOUNCE_MS, type EditorMode } from '@/model/editorModel';
import type { Form, LocatedError, PlaybookList } from '@/model/types';

export interface EditorOpts {
  mode: EditorMode;
  form: Form;
  originalId: string | null;
  originalLive: number | null;
  list: PlaybookList;
  onSaved: (id: string) => void;
}

export interface EditorState {
  form: Form;
  rev: number;
  validation: { rev: number; ok: boolean; errors: LocatedError[] } | null;
  localErrors: LocatedError[];
  renameDrafts: Record<string, string>;
  renameErrors: Record<string, string>;
  /** liveWorkers of the loaded playbook the id names, for the drift warning. */
  target: { id: string; live: number | null } | null;
  saving: boolean;
  saveError: string | null;
}

// The editor's state machine. cc judges every definition: each change is
// validated (debounced) and Save is enabled only for the revision cc accepted.
// State lives in a ref the async steps read and write; `bump` re-renders.
export function useEditor(opts: EditorOpts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const ref = useRef<EditorState | null>(null);
  if (!ref.current) {
    ref.current = {
      form: opts.form, rev: 0, validation: null, localErrors: [], renameDrafts: {}, renameErrors: {}, target: null, saving: false, saveError: null,
    };
  }
  const s = ref.current;
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const timers = useRef({ validate: 0, target: 0 });
  const disposed = useRef(false);

  function change(fn: (f: Form) => Form | void) {
    const prevId = s.form.id;
    const f = structuredClone(s.form);
    s.form = fn(f) || f;
    s.rev++;
    s.saveError = null;
    if (s.form.id !== prevId) scheduleTarget();
    scheduleValidate();
    bump();
  }

  function scheduleValidate() {
    window.clearTimeout(timers.current.validate);
    timers.current.validate = window.setTimeout(runValidate, VALIDATE_DEBOUNCE_MS);
  }

  async function runValidate() {
    const rev = s.rev;
    const r = definitionFromForm(s.form);
    if (r.localErrors) {
      s.localErrors = r.localErrors;
      s.validation = { rev, ok: false, errors: [] };
      bump();
      return;
    }
    s.localErrors = [];
    let validation: EditorState['validation'];
    try {
      const data = await playbooksApi.validate(r.definition);
      validation = { rev, ok: data.ok, errors: data.errors || [] };
    } catch (e) {
      validation = { rev, ok: false, errors: [{ message: `could not validate: ${(e as Error).message}`, stage: null, transition: null }] };
    }
    if (disposed.current || rev !== s.rev) return; // a newer revision owns the verdict
    s.validation = validation;
    bump();
  }

  // The drift warning needs liveWorkers of whatever loaded playbook the id names.
  function scheduleTarget() {
    const o = optsRef.current;
    window.clearTimeout(timers.current.target);
    const id = s.form.id;
    if (o.mode === 'edit' && id === o.originalId) { s.target = { id, live: o.originalLive }; return; }
    if (!o.list.playbooks.some((p) => p.id === id)) { s.target = null; return; }
    timers.current.target = window.setTimeout(async () => {
      let target: EditorState['target'] = null;
      try {
        target = { id, live: (await playbooksApi.detail(id)).liveWorkers };
      } catch {
        target = null;
      }
      if (disposed.current || s.form.id !== id) return;
      s.target = target;
      bump();
    }, VALIDATE_DEBOUNCE_MS);
  }

  async function save() {
    const o = optsRef.current;
    const r = definitionFromForm(s.form);
    if (!r.definition) return;
    s.saving = true;
    bump();
    try {
      await playbooksApi.save(s.form.id, r.definition, o.mode === 'edit' ? o.originalId ?? undefined : undefined);
    } catch (e) {
      if (disposed.current) return;
      s.saving = false;
      const err = e as ApiError;
      const body = err.body as { errors?: unknown; error?: string } | undefined;
      if (err.status === 422 && Array.isArray(body?.errors)) s.validation = { rev: s.rev, ok: false, errors: body.errors as LocatedError[] };
      else s.saveError = body && typeof body === 'object' ? body.error || `save failed (HTTP ${err.status})` : err.message;
      bump();
      return;
    }
    if (disposed.current) return;
    s.saving = false;
    o.onSaved(s.form.id);
  }

  /** The stage-name field's text while it is being typed, before a commit. */
  function setRenameDraft(key: string, value: string) {
    s.renameDrafts[key] = value;
    bump();
  }

  /** Commits a typed stage name (blur or Enter); a refused rename keeps the typed text and shows why. */
  function commitRename(key: string) {
    const value = s.renameDrafts[key];
    if (value === undefined) return;
    try {
      const next = renameStage(s.form, key, value);
      delete s.renameDrafts[key];
      delete s.renameErrors[key];
      change(() => next);
    } catch (err) {
      s.renameErrors[key] = (err as Error).message;
      bump();
    }
  }

  useEffect(() => {
    disposed.current = false;
    scheduleTarget();
    scheduleValidate();
    bump();
    const t = timers.current;
    return () => {
      disposed.current = true;
      window.clearTimeout(t.validate);
      window.clearTimeout(t.target);
    };
    // Once per mount: the editor is keyed per opening.
  }, []);

  return { state: s, change, save, setRenameDraft, commitRename };
}
