// An Error carrying the HTTP status and refusal code routes.js answers with.
// `extra` fields (e.g. cc's located `errors`) are spread into the JSON body.
export function httpError(statusCode, code, message, extra = {}) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  e.extra = extra;
  return e;
}
