import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Install & run' };

export default function Page() {
  return (
    <>
      <h1>Install &amp; run</h1>
      <p className="lead">
        The gateway is an npm package. There is nothing to install ahead of time - <code>npx</code>{' '}
        runs it directly.
      </p>

      <h2>Requirements</h2>
      <ul>
        <li>Node.js ≥ 18.17 (that&apos;s the only dependency - the gateway itself has none).</li>
      </ul>

      <h2>Start it</h2>
      <CodeBlock
        lang="bash"
        code={`npx ai-command-center
# ◆ AI Command Center  v0.1.0
# Dashboard   http://localhost:4321`}
      />
      <p>
        The first run downloads the package and opens the dashboard. That&apos;s the whole install.
      </p>

      <h2>See it populated immediately</h2>
      <p>
        No traffic yet? Seed a realistic 14-day sample across four projects (safe - it&apos;s tagged
        and removable):
      </p>
      <CodeBlock
        lang="bash"
        code={`npx ai-command-center demo
# then open http://localhost:4321
npx ai-command-center clear   # removes the demo data whenever you want`}
      />

      <h2>Install it globally (optional)</h2>
      <CodeBlock
        lang="bash"
        code={`npm install -g ai-command-center
ai-command-center            # or the short alias: aicc
aicc --help`}
      />

      <h2>All commands</h2>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>start</code>
            </td>
            <td>Start the gateway + dashboard (default)</td>
          </tr>
          <tr>
            <td>
              <code>demo</code>
            </td>
            <td>Seed 14 days of sample data (tagged, removable)</td>
          </tr>
          <tr>
            <td>
              <code>clear</code>
            </td>
            <td>
              Remove demo data (<code>--all</code> wipes everything)
            </td>
          </tr>
          <tr>
            <td>
              <code>stats</code>
            </td>
            <td>Print a usage/cost summary in the terminal</td>
          </tr>
          <tr>
            <td>
              <code>snippets</code>
            </td>
            <td>Copy-paste integration code for every language</td>
          </tr>
          <tr>
            <td>
              <code>user</code>
            </td>
            <td>
              <code>add</code> / <code>list</code> - manage accounts from the CLI
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Common flags</h2>
      <CodeBlock
        lang="bash"
        code={`npx ai-command-center --port 5000        # bind a different port
npx ai-command-center --host 0.0.0.0     # share on your LAN
npx ai-command-center --data-dir ./tel   # where telemetry is stored
npx ai-command-center --preset example   # load a config preset
npx ai-command-center --no-auth          # disable login + gateway keys
npx ai-command-center stats --gateway http://gw-host:4321
                          # demo/clear/stats: target a running gateway's
                          # API instead of local files`}
      />

      <p>
        <code>stats</code> and <code>clear</code> always print which store they read (the data dir
        and its record count, or the live gateway URL). Run them from a different machine or{' '}
        <code>--data-dir</code> than the gateway and they show an empty store and point you at{' '}
        <code>--gateway</code>.
      </p>

      <p>
        Telemetry defaults to <code>~/.ai-command-center/</code> as append-only JSONL. Delete that
        file (or run <code>aicc clear --all</code>) to reset.
      </p>

      <DocFoot />
    </>
  );
}
