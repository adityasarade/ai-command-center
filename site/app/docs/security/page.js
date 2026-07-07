import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Security' };

export default function Page() {
  return (
    <>
      <h1>Security</h1>
      <p className="lead">
        The gateway sits in your request path and near your keys, so its defaults are conservative.
        Here&apos;s exactly what it does and doesn&apos;t do.
      </p>

      <h2>What it protects by default</h2>
      <ul>
        <li>
          <strong>Your API keys pass through</strong> to the provider unchanged and are never
          written to the telemetry log.
        </li>
        <li>
          <strong>No prompt or response bodies are stored</strong> - only metadata (model, tokens,
          cost, latency, status, project). On a failed request a short upstream error message
          (truncated to 300 chars) is recorded to aid debugging, but never request or response
          content.
        </li>
        <li>
          <strong>Cross-origin protection.</strong> The gateway accepts browser requests only from
          its own origin or origins you list in <code>allowedOrigins</code>. A random web page you
          happen to visit cannot spend your keys through the proxy or wipe your telemetry.
          Server-side callers (no <code>Origin</code> header) are unaffected.
        </li>
        <li>
          <strong>Central keys are never handed to untrusted cross-origin callers</strong> - closing
          the “confused deputy” hole where a page could bill your account.
        </li>
        <li>
          <strong>Auth</strong> is on by default: open until the first admin exists, then
          dashboard/API require a session and the proxy requires a per-project gateway key.
        </li>
      </ul>

      <h2>Allowing a browser app</h2>
      <p>
        If a web frontend must call the gateway directly from the browser, allowlist its origin:
      </p>
      <CodeBlock lang="jsonc" code={`"allowedOrigins": ["https://app.example.com"]`} />

      <h2>Hardening for shared / production use</h2>
      <ul>
        <li>
          Keep the default <code>127.0.0.1</code> bind, or put the gateway behind a VPN or TLS
          reverse proxy if exposed.
        </li>
        <li>
          Create the admin account immediately - don&apos;t leave open setup mode on a shared
          network.
        </li>
        <li>Rotate a project&apos;s gateway key if it may have leaked (Settings → Projects).</li>
        <li>
          Auth is username/password + signed cookies today (no SSO), and telemetry is not encrypted
          at rest - appropriate for an internal tool; review before external multi-tenant exposure.
        </li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        Please report privately via GitHub&apos;s “Report a vulnerability” button on the repo&apos;s
        Security tab rather than a public issue. Details are in{' '}
        <a href="https://github.com/adityasarade/ai-command-center/blob/main/SECURITY.md">
          SECURITY.md
        </a>
        .
      </p>

      <div className="callout warn">
        This is honest about its limits: it is a lightweight internal tool, not a hardened
        multi-tenant SaaS. It ships secure defaults for the localhost/self-host case and documents
        the gaps rather than hiding them.
      </div>

      <DocFoot />
    </>
  );
}
