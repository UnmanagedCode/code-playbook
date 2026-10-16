// The editor's derived text and option lists. Pure: the editor component and
// its tests read them from here.
import { idNotices, SEND_PROMPT, SPAWN, WILDCARD } from './formModel';
import { driftWarning, renameWarning } from './wording';
import type { Form, FormStage, IdNotices, TakenIds, ToolRow } from './types';

export const VALIDATE_DEBOUNCE_MS = 300;
export const STAGE_DESC_HINT = 'Stage descriptions reach the conductor verbatim (its role prompt when this is the preferred playbook, and describe_playbook), so editing one changes what the conductor does.';
export const SPAWN_HINT = 'A stage is spawnable only when spawn_instance is declared allow or pin; "*" never confers it.';

export const idHint = (id: string) => `saved as <projects root>/.code-conductor/playbooks/${id || '<id>'}.json`;

export type EditorMode = 'edit' | 'draft';

/** `target`: the liveWorkers of the loaded playbook the id currently names, once looked up. */
export function editorNotices({ form, takenIds, mode, originalId, originalLive, target }: {
  form: Form; takenIds: TakenIds; mode: EditorMode; originalId: string | null; originalLive: number | null;
  target: { id: string; live: number | null } | null;
}): IdNotices {
  const n = idNotices(form.id, takenIds, mode === 'edit' ? originalId : null);
  const warn = [...n.warn];
  if (target && target.live !== 0) {
    warn.push(driftWarning(target.id, target.live));
  }
  if (mode === 'edit' && form.id !== originalId) {
    warn.push(renameWarning(originalId!, form.id, originalLive));
  }
  return { block: n.block, warn };
}

export type StatusTone = 'muted' | 'good' | 'bad';

/** The status line beside Save, in precedence order. */
export function editorStatus({ saving, renameCount, localErrorCount, validation, rev, block }: {
  saving: boolean; renameCount: number; localErrorCount: number;
  validation: { rev: number; ok: boolean; errors: unknown[] } | null; rev: number; block?: string;
}): { text: string; tone: StatusTone } {
  if (saving) return { text: 'Saving…', tone: 'muted' };
  if (renameCount) return { text: `${renameCount} stage rename${renameCount === 1 ? '' : 's'} refused`, tone: 'bad' };
  if (localErrorCount) return { text: `${localErrorCount} local error${localErrorCount === 1 ? '' : 's'}`, tone: 'bad' };
  if (!validation || validation.rev !== rev) return { text: 'Validating…', tone: 'muted' };
  if (validation.ok) return block ? { text: 'Valid, but the id is blocked', tone: 'bad' } : { text: 'Valid — ready to save', tone: 'good' };
  return { text: `${validation.errors.length} error${validation.errors.length === 1 ? '' : 's'} from cc`, tone: 'bad' };
}

export const removeStageConfirm = (name: string) => `Remove stage '${name}'?`;

export interface Option { value: string; label: string }
const opt = (value: string, label = value): Option => ({ value, label });

export const toolLabel = (tool: string) => (tool === WILDCARD ? '* (fallback)' : tool);

/** spawn_instance's choices, `none` meaning not declared. */
export const SPAWN_OPTIONS: Option[] = [opt('none', 'not declared'), opt('deny'), opt('allow'), opt('pin')];

/** A tool row's policies: `pin` only for a tool with pin args (or already pinned), never for `*`. */
export function policyOptions(row: ToolRow, pinArgs: string[]): Option[] {
  if (row.tool === SPAWN) return SPAWN_OPTIONS;
  const canPin = row.tool !== WILDCARD && (pinArgs.length > 0 || row.policy === 'pin');
  return [opt('allow'), opt('deny'), ...(canPin ? [opt('pin')] : [])];
}

/** A pin row's argument choices: the tool's pin args plus the row's own. */
export const pinArgOptions = (pinArgs: string[], current: string): string[] => [...new Set([...pinArgs, current])];

export function canAddPin(row: ToolRow, pinArgs: string[]): boolean {
  const used = new Set(row.pin.map((p) => p.arg));
  return pinArgs.some((a) => !used.has(a));
}

/** The "add tool" choices: every governable tool but spawn_instance, then `*`, minus those the stage declares. */
export function addableTools(toolNames: string[], stage: FormStage): string[] {
  const declared = new Set(stage.tools.map((t) => t.tool));
  return [...toolNames.filter((t) => t !== SPAWN), WILDCARD].filter((t) => !declared.has(t));
}

export const viaOptions = (toolNames: string[]): Option[] => [
  opt(SEND_PROMPT, `${SEND_PROMPT} (default — no on)`),
  ...toolNames.filter((t) => t !== SEND_PROMPT).map((t) => opt(t)),
];

/** A need's position checkboxes: every stage, then `*`. */
export const positionMembers = (names: string[]): Option[] => [...names, WILDCARD].map((m) => opt(m, m === WILDCARD ? 'any stage (*)' : m));
