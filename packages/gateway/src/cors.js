/**
 * Origin policy. The dashboard is same-origin and needs no CORS; server-side
 * apps (Python/Java/curl) send no Origin header. So the safe default is:
 *   - no Origin header            → trusted (non-browser or same-origin nav)
 *   - Origin === our own origin   → trusted
 *   - Origin in config.allowedOrigins (or '*') → trusted
 *   - anything else               → untrusted (blocked on writes/proxy, no CORS)
 *
 * This prevents a malicious web page the operator happens to visit from
 * spending the operator's API keys through the proxy (confused deputy) or
 * wiping telemetry cross-origin (CSRF), while keeping same-origin dashboard
 * use and non-browser integrations working with zero configuration.
 */

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return origin === `http://${host}` || origin === `https://${host}`;
}

export function originAllowed(req, config) {
  if (sameOrigin(req)) return true;
  const list = config.allowedOrigins || [];
  return list.includes('*') || list.includes(req.headers.origin);
}

/** True for a browser request from an origin we do not trust. */
export function untrustedCrossOrigin(req, config) {
  return !!req.headers.origin && !originAllowed(req, config);
}

/** CORS headers to echo on a response (empty for same-origin / non-browser). */
export function corsHeaders(req, config) {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(req, config)) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}
