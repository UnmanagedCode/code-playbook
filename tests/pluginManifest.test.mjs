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
  assert.equal(manifest.frontend.navLabel, 'Code Playbook');
  assert.ok(!('mcp' in manifest), 'no MCP tools');
  assert.equal(pkg.scripts.start, 'node server.js');
});

// The UI is built on `npm install` (Library postClone/postPull): everything it needs is a devDependency,
// express is the only runtime dependency, and nothing the build or install writes is tracked.
const UI_DEV_DEPS = ['vite', '@vitejs/plugin-react', '@tailwindcss/vite', 'tailwindcss', 'tw-animate-css', 'typescript',
  'react', 'react-dom', '@types/react', '@types/react-dom', 'radix-ui', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react',
  'vitest', 'happy-dom', '@testing-library/react', '@testing-library/user-event', '@types/node'];

// Invariant: the runtime needs only express; the build has every tool it runs.
test('package.json: express at runtime, the UI toolchain as devDependencies', async () => {
  const pkg = await readJson('package.json');
  assert.deepEqual(Object.keys(pkg.dependencies), ['express']);
  for (const d of UI_DEV_DEPS) assert.ok(pkg.devDependencies?.[d], `devDependency ${d}`);
  assert.equal(pkg.engines.node, '>=22.12.0');
});

// Invariant: `npm install` builds the UI (prepare), and `npm test` runs every suite.
test('package.json scripts: prepare builds, test runs node + tsc + vitest', async () => {
  const { scripts } = await readJson('package.json');
  assert.equal(scripts.prepare, 'vite build --config frontend/vite.config.ts');
  assert.equal(scripts.typecheck, 'tsc -p frontend');
  assert.equal(scripts['test:web'], 'vitest run --config frontend/vitest.config.ts');
  assert.equal(scripts.test, 'NODE_OPTIONS=--max-old-space-size=512 node tests/run.mjs && npm run typecheck && npm run test:web');
});

// Invariant: the build output, dependencies and the lockfile npm rewrites are ignored, so Update's ff-only pull never collides.
test('.gitignore covers what npm install writes', async () => {
  const lines = (await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8')).split('\n').map((l) => l.trim());
  for (const l of ['node_modules/', 'frontend/dist/', 'package-lock.json']) assert.ok(lines.includes(l), l);
});
