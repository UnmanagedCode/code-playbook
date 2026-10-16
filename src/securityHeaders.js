// Sent on every response express produces: pages, assets, API answers, the 404, the 503 and
// errors. The page runs in an unsandboxed iframe on cc's origin, so the CSP
// backs up text-only rendering: no inline script, nothing from elsewhere.
// 'unsafe-inline' styles: Radix Dialog's scroll lock injects a <style>; the
// UI never emits a style attribute or element from content. font-src admits
// the host's Geist fonts (/pluginTheme/fonts/…, same origin). form-action
// 'none': no form submits natively (the id dialog's form is onSubmit-only).
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}
