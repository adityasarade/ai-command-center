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

      <h2>Run it as a long-lived service</h2>
      <CodeBlock lang="bash" code={`# on the box your apps call
npm install -g ai-command-center
aicc start --host 0.0.0.0 --port 4321 --data-dir /var/lib/aicc`} />
      <p>Then point apps at <code>http://that-host:4321/…</code>. Create the admin account immediately so it isn&apos;t left open on the network.</p>

      <h2>systemd unit</h2>
      <CodeBlock lang="ini" label="/etc/systemd/system/aicc.service" code={`[Unit]
Description=AI Command Center
After=network.target

[Service]
ExecStart=/usr/bin/aicc start --host 0.0.0.0 --port 4321 --data-dir /var/lib/aicc
Restart=on-failure
Environment=NODE_ENV=production
User=aicc

[Install]
WantedBy=multi-user.target`} />

      <h2>Docker</h2>
      <CodeBlock lang="dockerfile" code={`FROM node:22-alpine
RUN npm install -g ai-command-center
VOLUME /data
EXPOSE 4321
ENV AICC_DATA_DIR=/data
CMD ["aicc","start","--host","0.0.0.0"]`} />
      <CodeBlock lang="bash" code={`docker build -t aicc .
docker run -p 4321:4321 -v aicc-data:/data aicc`} />

      <h2>Behind a reverse proxy (recommended for anything shared)</h2>
      <p>Terminate TLS and forward to the gateway. Keep streaming working by disabling response buffering:</p>
      <CodeBlock lang="nginx" code={`location / {
  proxy_pass http://127.0.0.1:4321;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_buffering off;          # important for SSE / streaming
  proxy_read_timeout 3600s;
}`} />

      <h2>Data &amp; backups</h2>
      <ul>
        <li>All telemetry is append-only JSONL in the data dir (<code>events.jsonl</code>); auth lives in <code>auth.json</code> (0600).</li>
        <li>Back up the data dir; that&apos;s the whole state. No migrations, no schema.</li>
        <li>JSONL + in-memory aggregation is comfortable into the hundreds of thousands of records. Past that, the storage layer is intentionally small and swappable (SQLite/Postgres).</li>
      </ul>

      <h2>Company build</h2>
      <p>Run the same binary with a preset for branding + defaults, and keep secrets in your own config file:</p>
      <CodeBlock lang="bash" code={`aicc start --preset medikabazaar --config /etc/aicc/prod.json`} />

      <DocFoot />
    </>
  );
}
