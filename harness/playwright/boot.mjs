// Boots this plugin's server.js on a free port with a sandboxed PROJECTS_ROOT,
// pointed at `conductorUrl` (the fake cc, or a live one).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHarness } from './codePlaywright.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function bootPlaybook({ conductorUrl }) {
  const { bootServer } = await loadHarness();
  return bootServer({
    cwd: REPO_ROOT,
    entry: 'server.js',
    env: { CONDUCTOR_URL: conductorUrl },
    sandbox: { dirs: { PROJECTS_ROOT: 'projects' } },
    silent: true,
  });
}
