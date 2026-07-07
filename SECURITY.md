# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's **"Report a
vulnerability"** button under the repository's Security tab (private advisory),
rather than opening a public issue. Include steps to reproduce and the impact.
You'll get an acknowledgement, and a fix or mitigation plan.

## Security model (what to expect)

AI Command Center is designed to run **next to your own apps**, by default bound
to `127.0.0.1`. Its security posture:

- **Your provider API keys pass through** to the upstream provider unchanged;
  they are never written to the telemetry log.
- **No prompt or response bodies are stored** - only metadata (model, tokens,
  cost, latency, status, project).
- **Cross-origin protection**: the gateway only accepts browser requests from
  its own origin or origins you explicitly list in `allowedOrigins`. A random web
  page cannot spend your keys through the proxy or wipe your telemetry. Server-side
  callers (no `Origin` header) are unaffected.
- **Central/operator keys are never handed to untrusted cross-origin callers.**
- **Auth**: optional but on by default - open until the first admin account is
  created, then dashboard/API require a session and the proxy requires a
  per-project gateway key.

## Hardening for shared / production use

- Keep the default `127.0.0.1` bind, or put the gateway behind a VPN or a
  TLS-terminating reverse proxy if you expose it.
- Create the admin account immediately (don't leave it in open setup mode on a
  shared network).
- Rotate project gateway keys if one may have leaked (dashboard → Settings).
- Auth is username/password + signed session cookies today (no SSO yet) and
  telemetry is not encrypted at rest - appropriate for an internal tool; review
  before external multi-tenant exposure.

## Supported versions

The latest `0.x` release receives fixes. Pin a version and watch releases.
