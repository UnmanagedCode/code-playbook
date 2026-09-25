import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoutes } from './src/routes.js';
import { createConductorClient } from './src/conductorClient.js';
import { createPlaybookStore } from './src/playbookStore.js';
import { createAuthoring } from './src/authoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
export const DEFAULT_PORT = 7310;

// Appends `?v=<mtime-ms>` to every local asset ref, so a changed public/ file
// always yields a new URL.
function renderIndex() {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  return html.replace(/\b(href|src)="([^"?]+)"/g, (m, attr, ref) => {
    try {
      const v = Math.floor(fs.statSync(path.join(PUBLIC_DIR, ref)).mtimeMs);
      return `${attr}="${ref}?v=${v}"`;
    } catch {
      return m; // not a local file (e.g. cc's /pluginBridge.js)
    }
  });
}

export function createServer({ conductorUrl, projectsRoot }) {
  const conductor = createConductorClient({ baseUrl: conductorUrl });
  const authoring = createAuthoring({ conductor, store: createPlaybookStore({ projectsRoot }) });

  const app = express();
  app.use('/api', buildRoutes({ conductor, authoring }));
  const sendIndex = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderIndex());
  };
  app.get('/', sendIndex);
  app.get('/index.html', sendIndex);
  app.use(express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  }));
  return http.createServer(app);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer({ conductorUrl: process.env.CONDUCTOR_URL, projectsRoot: process.env.PROJECTS_ROOT });
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`code-playbook listening on http://${host}:${port}`));
}
