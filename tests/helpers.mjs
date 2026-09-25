import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createServer } from '../server.js';
import { startFakeConductor } from './fixtures/fakeConductor.mjs';

// Boots the plugin server over a fresh tmp PROJECTS_ROOT and a fake cc. Every
// fixture is torn down via t.after.
export async function bootWithFake(t, { fake: fakeOpts, conductorUrl, projectsRoot } = {}) {
  const fake = await startFakeConductor(fakeOpts);
  const root = projectsRoot === null ? undefined : await fs.mkdtemp(path.join(os.tmpdir(), 'code-playbook-'));
  // conductorUrl: omitted → the fake; null → unset; a string → used as given.
  const server = createServer({ conductorUrl: conductorUrl === undefined ? fake.url : (conductorUrl ?? undefined), projectsRoot: root });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.close();
    await fake.close();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });
  const port = server.address().port;
  return { fake, root, port, base: `http://127.0.0.1:${port}`, overlay: root && path.join(root, '.code-conductor', 'playbooks') };
}

// A raw HTTP request: the path goes on the wire as written, so `..` and `%2F`
// reach the server unnormalised (fetch would resolve them client-side).
export function rawRequest(port, method, rawPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, method, path: rawPath,
      headers: payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

export async function listDir(dir) {
  try { return (await fs.readdir(dir)).sort(); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}

// A minimal definition shaped like one the editor produces.
export function sampleDefinition(id) {
  return {
    id, name: 'Sample', description: 'A sample playbook.', entryStages: ['start'],
    stages: { start: { needs: [], workers: 'one', tools: { spawn_instance: 'allow' } } },
    transitions: [],
  };
}
