import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoutes } from './src/routes.js';
import { createConductorClient } from './src/conductorClient.js';
import { createPlaybookStore } from './src/playbookStore.js';
import { createAuthoring } from './src/authoring.js';
import { jsonErrorHandler } from './src/errorHandler.js';
import { securityHeaders } from './src/securityHeaders.js';
import { serveUi, checkBuilt, DEFAULT_DIST } from './src/static.js';

export const DEFAULT_PORT = 7310;

export function createServer({ conductorUrl, projectsRoot, distDir = DEFAULT_DIST }) {
  const conductor = createConductorClient({ baseUrl: conductorUrl });
  const authoring = createAuthoring({ conductor, store: createPlaybookStore({ projectsRoot }) });

  const app = express();
  app.use(securityHeaders);
  app.use('/api', buildRoutes({ conductor, authoring }));
  app.use(serveUi(distDir));
  app.use((req, res) => res.status(404).json({ error: 'not found', code: 'NOT_FOUND' }));
  app.use(jsonErrorHandler);
  return http.createServer(app);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkBuilt(DEFAULT_DIST);
  const server = createServer({ conductorUrl: process.env.CONDUCTOR_URL, projectsRoot: process.env.PROJECTS_ROOT });
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`code-playbook listening on http://${host}:${port}`));
}
