'use client';
import { useState } from 'react';

// Minimal, dependency-free syntax tinting for shell/python/js/jsonc.
function tint(code, lang) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(code)
    .split('\n')
    .map((line) => {
      if (/^\s*(#|\/\/)/.test(line)) return `<span class="c-com">${line}</span>`;
      let l = line;
      l = l.replace(/(&quot;|&#39;|')(?:[^&']|&(?!quot;))*?\1/g, (m) => `<span class="c-str">${m}</span>`);
      l = l.replace(/\b(import|from|export|const|await|async|def|return|new|export)\b/g, '<span class="c-kw">$1</span>');
      return l;
    })
    .join('\n');
}

export function CodeBlock({ code, lang = 'bash', label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div className="code">
      <div className="code-head">
        <span className="lang">{label || lang}</span>
        <button className="copy-btn" onClick={copy}>{copied ? 'copied ✓' : 'copy'}</button>
      </div>
      <pre dangerouslySetInnerHTML={{ __html: tint(code, lang) }} />
    </div>
  );
}
