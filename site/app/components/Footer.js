import Link from 'next/link';
import { Logo } from './Logo';

const REPO = 'https://github.com/adityasarade/ai-command-center';

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <div style={{ maxWidth: 300 }}>
          <div className="brand" style={{ marginBottom: 10 }}>
            <Logo size={20} />
            <b style={{ fontFamily: 'var(--font-mono), monospace' }}>ai-command-center</b>
          </div>
          <p className="legal">
            One gateway, every AI project, one dashboard. Self-hosted, dependency-free,
            MIT-licensed.
          </p>
        </div>
        <div>
          <h4>Docs</h4>
          <Link href="/docs">Getting started</Link>
          <Link href="/docs/integrate">Integrate</Link>
          <Link href="/docs/config">Configuration</Link>
          <Link href="/docs/api">API reference</Link>
        </div>
        <div>
          <h4>More</h4>
          <Link href="/docs/comparison">Comparison</Link>
          <Link href="/docs/security">Security</Link>
          <Link href="/docs/self-hosting">Self-hosting</Link>
          <Link href="/docs/faq">FAQ</Link>
        </div>
        <div>
          <h4>Project</h4>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
            Contributing
          </a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
            Issues
          </a>
          <a href="/llms.txt">llms.txt</a>
        </div>
      </div>
      <div className="wrap" style={{ marginTop: 24 }}>
        <span className="legal">
          © 2026 Aditya Sarade · MIT License · Not affiliated with OpenAI, Anthropic, or Google.
        </span>
      </div>
    </footer>
  );
}
