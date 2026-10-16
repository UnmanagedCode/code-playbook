// Route state lives in the query string, never the hash: cc's bridge turns
// pushState into replaceState and mirrors the route into cc's URL, and its
// `navigate` arrives here as a popstate.
//   ?playbook=<id>  the detail     ?edit=<id>  the editor for a user playbook
//   ?draft=1        the in-memory draft a Duplicate or New playbook opened
import { useSyncExternalStore } from 'react';

export interface Route { draft: boolean; selectedId: string | null; edit: boolean }

export function parseRoute(search: string): Route {
  const p = new URLSearchParams(search);
  return { draft: p.has('draft'), selectedId: p.get('playbook') || p.get('edit'), edit: p.has('edit') };
}

// Counts every navigation (ours and popstate), so a screen opened by one can tell it from the next.
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  seq++;
  listeners.forEach((l) => l());
};
let listening = false;

function subscribe(onChange: () => void): () => void {
  if (!listening) {
    window.addEventListener('popstate', emit);
    listening = true;
  }
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function navigate(query: Record<string, string>): void {
  const qs = new URLSearchParams(query).toString();
  history.pushState(null, '', qs ? `?${qs}` : location.pathname);
  emit();
}

export const navigationSeq = () => seq;

/** `location.search` and the navigation count; re-renders on navigate and popstate. */
export function useNavigation(): { search: string; seq: number } {
  const n = useSyncExternalStore(subscribe, navigationSeq);
  return { search: location.search, seq: n };
}
