// A fetch stub serving this plugin's API from the shared cc fixtures, for component tests.
import { vi } from 'vitest';
import { cannedValidate, loadFixtures } from '../../../tests/fixtures/fakeConductor.mjs';
import type { PlaybookDetail, PlaybookList } from '@/model/types';

export const fixtures = await loadFixtures();

export interface FakeCall { method: string; url: string; headers: Record<string, string>; body: string | undefined }
type Reply = Response | undefined | Promise<Response | undefined>;

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Stubs fetch: `list`, `details` (by id) and cc's canned validator answer the plugin's API; a PUT or DELETE
 * answers `{ok, id}`. `handle` preempts any request. Every request is recorded in `calls`.
 */
export function fakeApi({ list = fixtures.list, details = fixtures.details, handle }: {
  list?: PlaybookList; details?: Record<string, PlaybookDetail>;
  handle?: (method: string, url: string, body: string | undefined) => Reply;
} = {}) {
  const calls: FakeCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body as string | undefined;
    calls.push({ method, url, headers: { ...(init?.headers as Record<string, string>) }, body });
    const pre = await handle?.(method, url, body);
    if (pre) return pre;
    if (method === 'GET' && url === 'api/playbooks') return json(list);
    if (method === 'POST' && url === 'api/playbooks/validate') return json(cannedValidate(JSON.parse(body!)));
    const m = /^api\/playbooks\/([^?]+)/.exec(url);
    if (m && method === 'GET') {
      const id = m[1].split('/').map(decodeURIComponent).join('/');
      return details[id] ? json(details[id]) : json({ error: `no playbook '${id}'`, code: 'PLAYBOOK_UNKNOWN' }, 404);
    }
    if (m && (method === 'PUT' || method === 'DELETE')) return json({ ok: true, id: decodeURIComponent(m[1]) });
    return json({ error: 'not found', code: 'NOT_FOUND' }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

/** Puts the page at `search` (e.g. '?playbook=mine') before the app mounts. */
export function at(search: string) {
  history.replaceState(null, '', search || location.pathname);
}
