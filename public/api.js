// Every call goes to this plugin's own backend, by a relative path, so it works
// standalone and under cc's /plugins/code-playbook/ mount alike.
// Each resolves to { ok, status, data }; a network failure is status 0.
async function call(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: `the code-playbook backend is unreachable: ${e.message}` } };
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text || `HTTP ${res.status}` }; }
  return { ok: res.ok, status: res.status, data };
}

const idPath = (id) => id.split('/').map(encodeURIComponent).join('/');

export const api = {
  list: () => call('GET', 'api/playbooks'),
  detail: (id) => call('GET', `api/playbooks/${idPath(id)}`),
  validate: (definition) => call('POST', 'api/playbooks/validate', definition),
  save: (id, definition, from) => call('PUT', `api/playbooks/${encodeURIComponent(id)}${from && from !== id ? `?from=${encodeURIComponent(from)}` : ''}`, definition),
  remove: (id) => call('DELETE', `api/playbooks/${encodeURIComponent(id)}`),
};
