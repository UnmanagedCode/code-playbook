import type { Form, LocatedError } from './types';

export interface SaveGateState {
  form: Pick<Form, 'id'> & { stages: { key: string }[] };
  rev: number;
  validation: { rev: number; ok: boolean; errors?: LocatedError[] } | null;
  localErrors: unknown[];
  renameErrors: Record<string, string>;
  saving: boolean;
}

// Whether the editor's Save is enabled. Pure. `s` is the editor state; `n` the
// id notices. A rename refusal counts while its stage still exists: the card
// shows a name the form doesn't hold, so saving would drop the user's edit.
export function canSave(s: SaveGateState, n: { block?: string }): boolean {
  const pendingRename = s.form.stages.some((st) => s.renameErrors[st.key]);
  return !s.saving && s.form.id !== '' && !n.block && !pendingRename && s.localErrors.length === 0
    && s.validation?.rev === s.rev && s.validation.ok;
}
