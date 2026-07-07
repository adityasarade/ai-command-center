import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Auth & teams' };

export default function Page() {
  return (
    <>
      <h1>Auth &amp; teams</h1>
      <p className="lead">
        Auth is on by default but stays out of your way until you want it: the gateway is open until
        you create the first admin account, then it locks.
      </p>

      <h2>The three states</h2>
      <table>
        <thead><tr><th>State</th><th>Dashboard / API</th><th>Proxy</th></tr></thead>
        <tbody>
          <tr><td><strong>Open</strong> (no users yet)</td><td>Reachable; shows a “create admin” prompt</td><td>Works with <code>/p/&lt;project&gt;</code></td></tr>
          <tr><td><strong>Locked</strong> (≥1 user)</td><td>Requires login (session cookie)</td><td>Requires a project gateway key</td></tr>
          <tr><td><strong>Disabled</strong> (<code>--no-auth</code>)</td><td>Fully open</td><td>Fully open</td></tr>
        </tbody>
      </table>

      <h2>Create the admin</h2>
      <p>Open the dashboard and use the “Create admin account” prompt, or from the CLI:</p>
      <CodeBlock lang="bash" code={`npx ai-command-center user add --username aditya --password '…'   # first = admin
npx ai-command-center user list`} />

      <h2>Teams &amp; who sees what</h2>
      <ul>
        <li><strong>Admins</strong> see every project and manage users, teams, and project keys under <em>Settings</em>.</li>
        <li><strong>Members</strong> see only the projects assigned to <em>their team</em>. Unassigned projects stay admin-only.</li>
      </ul>
      <p>Assign a project to a team in Settings → Projects, and put users on teams in Settings → Users.</p>

      <h2>Project gateway keys (the proxy under auth)</h2>
      <p>
        Once locked, each project gets its own key. The key both authenticates the request and
        assigns it to that project — so the URL carries the key instead of the project name:
      </p>
      <CodeBlock lang="bash" code={`# base URL becomes /k/<gateway-key>/… instead of /p/<project>/…
export OPENAI_BASE_URL="http://localhost:4321/k/aicc_9f3.../openai/v1"
# or send it as a header:  x-aicc-key: aicc_9f3...`} />
      <p>
        The SDKs read <code>AICC_KEY</code> automatically, or take a <code>key</code> option:
      </p>
      <CodeBlock lang="python" code={`aicc.init(project="invoice-bot", key="aicc_9f3...")   # or set AICC_KEY`} />
      <p>Rotate or revoke a key any time in Settings → Projects (apps using the old key stop working).</p>

      <div className="callout">
        Auth today is username/password with signed <code>HttpOnly</code> session cookies (scrypt-hashed
        passwords, all dependency-free). There is no SSO/OAuth yet — see{' '}
        <a href="/docs/security">Security</a> for the hardening path before external multi-tenant use.
      </div>

      <DocFoot />
    </>
  );
}
