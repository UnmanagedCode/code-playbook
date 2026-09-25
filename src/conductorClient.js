import { httpError } from './httpError.js';

// The only module that talks to code-conductor. Every call answers
// `{ status, body }`, where `body` is cc's parsed JSON (or its raw text when cc
// answered something that is not JSON). An absent base URL or an unreachable cc
// throws, so no caller can mistake either for an answer.
export function createConductorClient({ baseUrl, timeoutMs = 5000 }) {
  async function request(method, path, body) {
    if (!baseUrl) throw httpError(503, 'CONDUCTOR_URL_UNSET', 'CONDUCTOR_URL is not set: this backend has no code-conductor to read playbooks from');
    let res;
    try {
      res = await fetch(new URL(path, baseUrl), {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw httpError(502, 'CONDUCTOR_UNREACHABLE', `code-conductor at ${baseUrl} is unreachable: ${e.cause?.message || e.message}`);
    }
    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* forwarded as text */ }
    return { status: res.status, body: parsed };
  }

  // A read the backend itself depends on (save/delete): anything but a 200 is
  // a refusal, never a value to act on.
  async function expectOk(method, path, body) {
    const r = await request(method, path, body);
    if (r.status !== 200 || typeof r.body !== 'object' || r.body === null) {
      throw httpError(502, 'CONDUCTOR_BAD_RESPONSE', `code-conductor answered ${r.status} to ${method} ${path}`);
    }
    return r.body;
  }

  return {
    forward: request,
    list: () => expectOk('GET', '/api/playbooks'),
    validate: (definition) => expectOk('POST', '/api/playbooks/validate', definition),
  };
}

// Encodes each segment of a (possibly plugin-namespaced `a/b`) playbook id.
export function playbookPath(id) {
  return `/api/playbooks/${id.split('/').map(encodeURIComponent).join('/')}`;
}
