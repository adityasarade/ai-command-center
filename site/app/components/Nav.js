import Link from 'next/link';
import { Logo } from './Logo';

const REPO = 'https://github.com/adityasarade/ai-command-center';

export function Nav() {
  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <Logo />
          <b>ai-command-center</b>
        </Link>
        <div className="nav-links">
          <Link href="/docs" className="hide-sm">
            Docs
          </Link>
          <Link href="/docs/comparison" className="hide-sm">
            Comparison
          </Link>
          <Link href="/docs/api" className="hide-sm">
            API
          </Link>
          <a href={REPO} target="_blank" rel="noreferrer" className="nav-cta">
            GitHub ↗
          </a>
        </div>
      </div>
    </nav>
  );
}
