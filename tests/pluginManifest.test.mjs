import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(ROOT, name), 'utf8'));

test('conductor.plugin.json: the pluginApi 1 contract this plugin relies on', async () => {
  const manifest = await readJson('conductor.plugin.json');
  const pkg = await readJson('package.json');
  assert.equal(manifest.id, 'code-playbook');
  assert.equal(manifest.pluginApi, 1);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.backend.start, 'npm start');
  assert.equal(manifest.backend.healthPath, '/api/health');
  assert.equal(manifest.frontend.path, '/');
  assert.equal(manifest.frontend.navLabel, 'Playbooks');
  assert.ok(!('mcp' in manifest), 'no MCP tools');
  assert.equal(pkg.scripts.start, 'node server.js');
});
