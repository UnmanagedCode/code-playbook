import express from 'express';
import { playbookPath } from './conductorClient.js';
import { httpError } from './httpError.js';
import { jsonErrorHandler } from './errorHandler.js';

// Thin HTTP layer. Error convention matches code-conductor: a thrown error's
// `statusCode` and `code` become the response, with `{ error, code }` as body
// (see errorHandler.js).
export function buildRoutes({ conductor, authoring }) {
  const r = express.Router();
  r.use(express.json({ limit: '1mb' }));
  // express.json leaves any other Content-Type as `{}`, which would reach cc
  // (or the id check) as an empty draft. Refused the way cc refuses it.
  const requireJson = (req, res, next) => {
    if (req.is('application/json')) return next();
    next(httpError(400, 'BODY_NOT_JSON', 'the draft must be sent as Content-Type: application/json'));
  };

  const fail = (res, e) => jsonErrorHandler(e, null, res);
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
  r.post('/playbooks/validate', requireJson, forward('POST', () => '/api/playbooks/validate'));
  // Regex routes: a plugin id carries a `/`, and PUT/DELETE must reach the id
  // guard with whatever the path held (`..`, `a/b`, empty) rather than 404.
  r.get(/^\/playbooks\/(.+)$/, forward('GET', (req) => playbookPath(req.params[0])));
  r.put(/^\/playbooks\/(.*)$/, requireJson, wrap((req) => authoring.save(req.params[0], req.body, req.query.from)));
  r.delete(/^\/playbooks\/(.*)$/, wrap((req) => authoring.remove(req.params[0])));

  r.use(jsonErrorHandler);
  return r;
}
