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

/** Each duplicated pattern once, in first-seen order. Case-sensitive. */
export function duplicatePatterns(rows: WorkerToolRow[]): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const r of rows) {
    if (seen.has(r.pattern) && !dup.includes(r.pattern)) dup.push(r.pattern);
    seen.add(r.pattern);
  }
  return dup;
}

export function workerToolNotes(rows: WorkerToolRow[], i: number): WorkerToolNote[] {
  const r = rows[i];
  const notes: WorkerToolNote[] = [];
  if (!WORKER_TOOL_PATTERN_RE.test(r.pattern)) {
    notes.push({ code: 'pattern-invalid', message: "use letters, digits, '_', '-' and '*'; '*' is the only wildcard" });
  }
  if (r.policy === 'deny' && WORKER_TOOLS_EXEMPT.includes(r.pattern)) {
    notes.push({ code: 'exempt-deny', message: `${WORKER_TOOLS_EXEMPT.join(' and ')} are always allowed` });
  }
  if (duplicatePatterns(rows).includes(r.pattern)) {
    notes.push({ code: 'duplicate', message: 'this pattern is listed more than once in this stage' });
  }
  return notes;
}
