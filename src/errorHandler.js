// The last express error handler, at router and app level: every error leaves
// as JSON `{error, code}`, never express's HTML page (which carries a stack).
// A thrown httpError keeps its status and code; anything unexpected is logged
// here and answered with a generic 500.
export function jsonErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof URIError) return res.status(400).json({ error: 'the request path is not valid percent-encoding', code: 'PATH_INVALID' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body', code: 'BODY_INVALID' });
  if (err.statusCode && err.code) return res.status(err.statusCode).json({ error: err.message, code: err.code, ...err.extra });
  console.error(err);
  res.status(500).json({ error: 'internal error', code: 'INTERNAL' });
}
