// The list pane's grouping and the viewer's derived text. Pure.
import type { PlaybookList, PlaybookSummary, Policy } from './types';

const GROUP_ORDER = (source: string) => (source === 'builtin' ? '0' : source === 'user' ? '1' : `2${source}`);
const groupLabel = (source: string) => (source === 'builtin' ? 'Built-in' : source === 'user' ? 'User' : `Plugin · ${source.slice('plugin:'.length)}`);

export interface PlaybookGroup { source: string; label: string; entries: PlaybookSummary[] }

/** Built-in, then User (always, even empty), then each `plugin:<id>` by source; entries by id. */
export function groupPlaybooks(list: PlaybookList): PlaybookGroup[] {
  const groups = new Map<string, PlaybookSummary[]>([['builtin', []], ['user', []]]);
  for (const p of list.playbooks) groups.set(p.source, [...(groups.get(p.source) || []), p]);
  return [...groups.keys()]
    .sort((a, b) => GROUP_ORDER(a).localeCompare(GROUP_ORDER(b)))
    .map((source) => ({ source, label: groupLabel(source), entries: [...groups.get(source)!].sort((a, b) => a.id.localeCompare(b.id)) }));
}

export interface LoadErrorGroup { id: string; messages: string[]; deletable: boolean }

/** cc's load errors grouped by id, sorted; a user file's group can be deleted. */
export function loadErrorGroups(list: PlaybookList): LoadErrorGroup[] {
  const byId = new Map<string, string[]>();
  for (const e of list.errors) byId.set(e.id, [...(byId.get(e.id) || []), e.message]);
  return [...byId].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, messages]) => ({ id, messages, deletable: list.takenIds.user.includes(id) }));
}

export function listErrorText(err: { status: number; message: string }): string {
  if (err.status === 404) return 'cc does not serve /api/playbooks yet — restart code-conductor.';
  return err.message;
}

export const readOnlyNote = (source: string) => (source === 'builtin'
  ? 'Built-in playbooks are read-only: duplicate one to author your own, or save a user playbook under this id to override it.'
  : 'Plugin playbooks are read-only here: they are edited in the contributing plugin\'s own files.');

export const readOnlyMessage = (id: string, source: string) => ({
  title: `${id} is read-only`,
  text: `Only user playbooks are editable; this one is ${source}.`,
});

export const liveText = (live: number | null) => (live === null ? 'unknown' : String(live));

export const policyText = (p: Policy) => (typeof p === 'string' ? p : 'pin');
export const pinText = (p: Policy) => (typeof p === 'object' ? Object.entries(p.pin).map(([a, v]) => `${a} = ${JSON.stringify(v)}`).join(', ') : '');

export const deleteFileConfirm = (id: string) => `Delete ${id}.json?\n\ncc could not load it, so there is nothing to open in the editor.`;

/** A confirm text's first paragraph as the dialog title, the rest as its body. */
export function confirmParts(text: string): { title: string; paragraphs: string[] } {
  const [title, ...paragraphs] = text.split('\n\n');
  return { title, paragraphs };
}

export const WELCOME = {
  title: 'Select a playbook',
  text: 'Built-in and plugin playbooks are read-only; duplicate one, or start a new playbook in the User group.',
};
