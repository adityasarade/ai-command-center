'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_ORDER } from './nav';

export function DocFoot() {
  const path = usePathname();
  const i = DOCS_ORDER.findIndex(([h]) => h === path);
  const prev = i > 0 ? DOCS_ORDER[i - 1] : null;
  const next = i >= 0 && i < DOCS_ORDER.length - 1 ? DOCS_ORDER[i + 1] : null;
  return (
    <div className="docs-foot">
      <span>{prev ? <Link href={prev[0]}>← {prev[1]}</Link> : <span />}</span>
      <span>{next ? <Link href={next[0]}>{next[1]} →</Link> : <span />}</span>
    </div>
  );
}
