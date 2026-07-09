import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Self-hosting' };

export default function Page() {
  return (
    <>
      <h1>Self-hosting</h1>
      <p className="lead">
        The gateway must run where your apps can reach it. It&apos;s a single Node process with no
        database and no external services, so hosting it is deliberately boring.
      </p>

      <h2>Know the failure mode: the gateway sits in the request path</h2>
      <p>
        This is a proxy, not a tap - it is <strong>not fail-open</strong>. If the gateway process is
        down, your apps&apos; LLM calls fail at the connection: the SDK sees{' '}
        <code>connection refused</code>, runs its own retries (most SDKs retry a handful of times
        over a few seconds), and then surfaces an error to your app. Nothing queues, nothing
        silently falls through to the provider.
      </p>
      <p>Two consequences for anything beyond local development:</p>
      <ul>
        <li>
          <strong>Run it supervised</strong> - under systemd, Docker with a restart policy, or any
          process manager, so a crash or reboot brings it straight back (examples below).
        </li>
        <li>
          <strong>Keep a kill switch.</strong> Integration is just a base URL, so the fallback is
          equally small: unset <code>OPENAI_BASE_URL</code> / <code>ANTHROPIC_BASE_URL</code> (or
          whatever base URL you set) in the consuming app and restart it - calls go directly to the
          provider again. You lose telemetry while it&apos;s off, not availability. Caveat: this
          assumes apps carry their own provider keys (the default pass-through setup). If you rely
          on centrally injected keys (config <code>keys</code> / <code>keyEnv</code>), the apps have
          nothing to authenticate with when they bypass the gateway - keep provider keys available
          to the apps if you want the kill switch to work.
        </li>
      </ul>

      <h2>Run it as a long-lived service</h2>
      <CodeBlock
        lang="bash"
        code={`# on the box your apps call
npm install -g ai-command-center
aicc start --host 0.0.0.0 --port 4321 --data-dir /var/lib/aicc`}
      />
      <p>
        Then point apps at <code>http://that-host:4321/…</code>. Create the admin account
        immediately so it isn&apos;t left open on the network.
      </p>

      <h2>systemd unit</h2>
      <CodeBlock
        lang="ini"
        label="/etc/systemd/system/aicc.service"
        code={`[Unit]
Description=AI Command Center
After=network.target

[Service]
ExecStart=/usr/bin/aicc start --host 0.0.0.0 --port 4321 --data-dir /var/lib/aicc
Restart=on-failure
Environment=NODE_ENV=production
User=aicc

[Install]
WantedBy=multi-user.target`}
      />

      <h2>Docker / docker-compose (recommended)</h2>
      <p>
        Pin the npm version in the image so a container rebuild can&apos;t silently change gateway
        behavior under your apps:
      </p>
      <CodeBlock
        lang="dockerfile"
        label="Dockerfile"
        code={`FROM node:22-alpine
RUN npm install -g ai-command-center@0.2.1   # pin - upgrade deliberately
VOLUME /data
EXPOSE 4321
ENV AICC_DATA_DIR=/data
CMD ["aicc","start","--host","0.0.0.0","--no-open"]`}
      />
      <p>
        The container binds <code>0.0.0.0</code> <em>inside</em> its own network namespace (so the
        port mapping works), while the host port stays on <code>127.0.0.1</code> - the gateway is
        reachable from the box, not the network. Drop the <code>127.0.0.1:</code> prefix only when
        you intend to share it (and create the admin account first):
      </p>
      <CodeBlock
        lang="yaml"
        label="docker-compose.yml"
        code={`services:
  aicc:
    build: .
    restart: unless-stopped        # survives crashes and reboots
    ports:
      - "127.0.0.1:4321:4321"      # host-local only; remove the prefix to share
    volumes:
      - aicc-data:/data            # telemetry + auth survive image rebuilds

volumes:
  aicc-data:`}
      />
      <CodeBlock lang="bash" code={`docker compose up -d --build`} />

      <h2>Behind a reverse proxy (recommended for anything shared)</h2>
      <p>
        Terminate TLS and forward to the gateway. Keep streaming working by disabling response
        buffering:
      </p>
      <CodeBlock
        lang="nginx"
        code={`location / {
  proxy_pass http://127.0.0.1:4321;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_buffering off;          # important for SSE / streaming
  proxy_read_timeout 3600s;
}`}
      />

      <h2>Data &amp; backups</h2>
      <ul>
        <li>
          All telemetry is append-only JSONL in the data dir (<code>events.jsonl</code>); auth lives
          in <code>auth.json</code> (0600).
        </li>
        <li>Back up the data dir; that&apos;s the whole state. No migrations, no schema.</li>
        <li>
          JSONL + in-memory aggregation is comfortable into the hundreds of thousands of records.
          Past that, the storage layer is intentionally small and swappable (SQLite/Postgres).
        </li>
      </ul>

      <h2>Company build</h2>
      <p>
        Run the same binary with a preset for branding + defaults, and keep secrets in your own
        config file:
      </p>
      <CodeBlock lang="bash" code={`aicc start --preset example --config /etc/aicc/prod.json`} />

      <DocFoot />
    </>
  );
}
