import type { Form } from '@/model/types';

/** What the editor's rows get from it: the form, the one way to change it, cc's tool catalog, and focus moves. */
export interface EditorApi {
  form: Form;
  change: (fn: (f: Form) => Form | void) => void;
  toolNames: string[];
  pinArgsOf: (tool: string) => string[];
  /** cc's spawn_instance pin args, undefined when cc lists no such tool. */
  spawnPinArgs: string[] | undefined;
  /** Registers an element as a focus target under `key`. */
  register: (key: string) => (el: HTMLElement | null) => void;
  /** After the next render, focus the target registered under `key` (a removed row hands focus to its Add control). */
  focusNext: (key: string) => void;
}
