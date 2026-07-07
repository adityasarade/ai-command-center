'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_NAV } from './nav';

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="docs-side" aria-label="Docs navigation">
      {DOCS_NAV.map((g) => (
        <div className="group" key={g.group}>
          <div>{g.group}</div>
          {g.items.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'on' : ''}>
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
