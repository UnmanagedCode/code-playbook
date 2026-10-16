import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The built UI: `npm install` runs `prepare`, which builds frontend/ into here.
export const DEFAULT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'dist');

// A flat name at the dist root or under assets/ (Vite's index-<hash>.js, hashes
// in base64url). No dots beyond the extension, so no traversal and no .map.
export const ASSET_RE = /^\/((?:assets\/)?[A-Za-z0-9][A-Za-z0-9_-]*\.(html|js|css))$/;
const NOT_BUILT = 'UI not built — run npm install';

// Serves `/` (index.html) and ASSET_RE paths from `distDir`, GET and HEAD only.
// Anything else falls through to the 404: no SPA fallback, so the host's
// /pluginBridge.js and /pluginTheme.css 404 standalone. While index.html is
// missing, `/` and `/index.html` answer a plain-text 503.
export function serveUi(distDir) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = req.path === '/' ? 'index.html' : ASSET_RE.exec(req.path)?.[1];
    if (!name) return next();
    // `root`, not an absolute path: send's dotfile check then sees only `name`,
    // not a dot-directory the checkout itself sits under.
    res.sendFile(name, { root: distDir, headers: { 'Cache-Control': 'no-store' }, dotfiles: 'deny' }, (err) => {
      if (!err || res.headersSent) return;
      if (err.code !== 'ENOENT' && err.code !== 'EISDIR' && err.status !== 404) return next(err);
      if (name === 'index.html') return res.status(503).type('text/plain; charset=utf-8').send(NOT_BUILT);
      next();
    });
  };
}

// Logs the missing entry file once at startup; the backend starts regardless.
export function checkBuilt(distDir, log = console.error) {
  const index = path.join(path.resolve(distDir), 'index.html');
  if (existsSync(index)) return true;
  log(`UI not built: ${index} is missing — run npm install`);
  return false;
}
