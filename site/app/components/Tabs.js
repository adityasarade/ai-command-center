'use client';
import { useState } from 'react';
import { CodeBlock } from './CodeBlock';

// items: [{ label, lang, code }]
export function CodeTabs({ items }) {
  const [i, setI] = useState(0);
  const cur = items[i];
  return (
    <div>
      <div className="tabs">
        {items.map((it, idx) => (
          <button key={it.label} className={`tab ${idx === i ? 'on' : ''}`} onClick={() => setI(idx)}>
            {it.label}
          </button>
        ))}
      </div>
      <CodeBlock code={cur.code} lang={cur.lang} label={cur.label} />
    </div>
  );
}
