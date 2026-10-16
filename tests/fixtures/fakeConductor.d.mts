// Types for the frontend's vitest suites, which import fakeConductor.mjs.
import type { LocatedError, PlaybookDetail, PlaybookList } from '../../frontend/src/model/types';

export function loadFixtures(): Promise<{ list: PlaybookList; details: Record<string, PlaybookDetail> }>;
export function cannedValidate(draft: unknown): { ok: boolean; errors?: LocatedError[] };

export interface FakeCall { method: string; path: string; body: unknown; contentType: string | undefined }
export function startFakeConductor(opts?: {
  validate?: (draft: unknown) => unknown;
  handle?: (method: string, path: string, body: unknown) => { status: number; body: unknown } | undefined;
}): Promise<{ url: string; calls: FakeCall[]; down(): Promise<void>; close(): Promise<void> }>;
