import express from 'express';
import { playbookPath } from './conductorClient.js';

// Thin HTTP layer. Error convention matches code-conductor: a thrown error's
// `statusCode` and `code` become the response, with `{ error, code }` as body.
export function buildRoutes({ conductor, authoring }) {
  const r = express.Router();
  r.use(express.json({ limit: '1mb' }));

  const fail = (res, e) => {
    res.status(e.statusCode || 500).json({ error: e.message, ...(e.code && { code: e.code }), ...e.extra });
  };
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (e) { fail(res, e); }
  };
  // cc's reads are answered verbatim: its status, its body.
  const forward = (method, pathOf) => async (req, res) => {
    try {
      const { status, body } = await conductor.forward(method, pathOf(req), method === 'POST' ? req.body : undefined);
      if (typeof body === 'string') res.status(status).type('text').send(body);
      else res.status(status).json(body);
    } catch (e) { fail(res, e); }
  };

  r.get('/health', wrap(() => ({ ok: true })));
  r.get('/playbooks', forward('GET', () => '/api/playbooks'));
  r.post('/playbooks/validate', forward('POST', () => '/api/playbooks/validate'));
  // Regex routes: a plugin id carries a `/`, and PUT/DELETE must reach the id
  // guard with whatever the path held (`..`, `a/b`, empty) rather than 404.
  r.get(/^\/playbooks\/(.+)$/, forward('GET', (req) => playbookPath(req.params[0])));
  r.put(/^\/playbooks\/(.*)$/, wrap((req) => authoring.save(req.params[0], req.body, req.query.from)));
  r.delete(/^\/playbooks\/(.*)$/, wrap((req) => authoring.remove(req.params[0])));

  r.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'invalid JSON body', code: 'BODY_INVALID' });
    }
    next(err);
  });
  return r;
}
