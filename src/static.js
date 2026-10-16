import { existsSync, promises as fs } from 'node:fs';
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
// missing, `/` and `/index.html` answer a plain-text 503. A file is served only
// when its real path (symlinks resolved) lies inside the real dist dir.
export function serveUi(distDir) {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = req.path === '/' ? 'index.html' : ASSET_RE.exec(req.path)?.[1];
    if (!name) return next();
    let root;
    let rel;
    try {
      root = await fs.realpath(distDir);
      rel = path.relative(root, await fs.realpath(path.join(root, name)));
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return next(e);
      return name === 'index.html' ? notBuilt(res) : next();
    }
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return next();
    // `root`, not an absolute path: send's dotfile check then sees only `rel`,
    // not a dot-directory the checkout itself sits under.
    res.sendFile(rel, { root, headers: { 'Cache-Control': 'no-store' }, dotfiles: 'deny' }, (err) => {
      if (!err || res.headersSent) return;
      // A refusal (a dotfile target: 403) or a missing file is a 404 here; only a real I/O failure is an error.
      if (err.code !== 'ENOENT' && err.code !== 'EISDIR' && !(err.status < 500)) return next(err);
      if (name === 'index.html') return notBuilt(res);
      next();
    });
  };
}

const notBuilt = (res) => res.status(503).type('text/plain; charset=utf-8').send(NOT_BUILT);

// Logs the missing entry file once at startup; the backend starts regardless.
export function checkBuilt(distDir, log = console.error) {
  const index = path.join(path.resolve(distDir), 'index.html');
  if (existsSync(index)) return true;
  log(`UI not built: ${index} is missing — run npm install`);
  return false;
}
