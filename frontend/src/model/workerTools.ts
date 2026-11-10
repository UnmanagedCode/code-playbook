// Client-side mirror of cc's worker-tools rules. The authority is cc's
// `validateWorkerTools` (src/playbooks.ts); the gated live test in
// realConductor.test.ts is the drift guard. Pure: no DOM.
import { WILDCARD } from './formModel';
import type { WorkerToolRow } from './types';

export const WORKER_TOOL_PATTERN_RE = /^[A-Za-z0-9_*-]+$/;
/** Tools cc never lets a stage deny, by exact key. */
export const WORKER_TOOLS_EXEMPT = ['AskUserQuestion', 'ExitPlanMode'];

export type PatternKind = 'exact' | 'wildcard' | 'fallback';
export interface WorkerToolNote { code: 'pattern-invalid' | 'exempt-deny' | 'duplicate'; message: string }

export function patternKind(p: string): PatternKind {
  if (p === WILDCARD) return 'fallback';
  return p.includes(WILDCARD) ? 'wildcard' : 'exact';
}

/** Each duplicated pattern once, in the order its first copy appears. Case-sensitive. */
export function duplicatePatterns(rows: WorkerToolRow[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.pattern, (counts.get(r.pattern) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([p]) => p);
}

/** `duplicates` is the stage's duplicatePatterns as a Set; a caller notes every row of a stage computes it once. */
export function workerToolNotes(rows: WorkerToolRow[], i: number, duplicates: ReadonlySet<string> = new Set(duplicatePatterns(rows))): WorkerToolNote[] {
  const r = rows[i];
  const notes: WorkerToolNote[] = [];
  if (!WORKER_TOOL_PATTERN_RE.test(r.pattern)) {
    notes.push({ code: 'pattern-invalid', message: "use letters, digits, '_', '-' and '*'; '*' is the only wildcard" });
  }
  if (r.policy === 'deny' && WORKER_TOOLS_EXEMPT.includes(r.pattern)) {
    notes.push({ code: 'exempt-deny', message: `${WORKER_TOOLS_EXEMPT.join(' and ')} are always allowed` });
  }
  if (duplicates.has(r.pattern)) {
    notes.push({ code: 'duplicate', message: 'this pattern is listed more than once in this stage' });
  }
  return notes;
}
