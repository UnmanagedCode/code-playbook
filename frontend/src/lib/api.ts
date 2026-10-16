import type { Definition, PlaybookDetail, PlaybookList, ValidateResult } from '@/model/types';
import { playbookIdPath } from '../../../src/playbookId.js';

/** A failed request: the HTTP status (0: the backend was unreachable), its message, and the parsed JSON body when there was one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * A request to this plugin's own backend. `path` is relative: a `/`-led path would reach cc's API, not this
 * plugin's. A JSON body is sent with `content-type: application/json`; a request without one sends no header.
 */
export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (path.startsWith('/')) throw new Error(`api('${path}'): root-relative, so it would reach cc, not this plugin`);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, `the code-playbook backend is unreachable: ${(e as Error).message}`);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const b = data as { error?: unknown; code?: unknown } | null;
    throw new ApiError(res.status, typeof b?.error === 'string' && b.error ? b.error : `HTTP ${res.status}`, typeof b?.code === 'string' ? b.code : undefined, data);
  }
  return data as T;
}

/**
 * An id's path below `api/playbooks/`, or an ApiError before any request: an id with an empty, `.` or `..`
 * segment would resolve outside it (embedded, into cc's own `/api`). `whole` encodes the id as one segment.
 */
function idPath(id: string, whole = false): string {
  const p = playbookIdPath(id);
  if (p === null) throw new ApiError(400, `'${id}' is not a playbook id: it has an empty, '.' or '..' segment`, 'PLAYBOOK_ID_INVALID');
  return whole ? encodeURIComponent(id) : p;
}

export const playbooksApi = {
  list: () => call<PlaybookList>('GET', 'api/playbooks'),
  detail: async (id: string) => call<PlaybookDetail>('GET', `api/playbooks/${idPath(id)}`),
  validate: (definition: Definition) => call<ValidateResult>('POST', 'api/playbooks/validate', definition),
  save: async (id: string, definition: Definition, from?: string) =>
    call<{ ok: true; id: string }>('PUT', `api/playbooks/${idPath(id, true)}${from && from !== id ? `?from=${encodeURIComponent(from)}` : ''}`, definition),
  remove: async (id: string) => call<{ ok: true; id: string }>('DELETE', `api/playbooks/${idPath(id, true)}`),
};
