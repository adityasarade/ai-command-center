'use client';
import { useState } from 'react';

// Seeded, static sample data — same shape and proportions the real `aicc demo`
// produces. This is a faithful, click-around preview; no backend involved.
const COLORS = ['#4c8dff', '#21c17a', '#e0a52a', '#3fb950', '#a78bfa'];
const RATES = { INR: 95.4, USD: 1, EUR: 0.88 };
const SYM = { INR: '₹', USD: '$', EUR: '€' };

const DATA = {
  '7D': {
    totalUsd: 29.48,
    requests: 4669,
    tokens: '22.6M',
    p50: '3.6s',
    projects: [
      ['claims-copilot', 20.71],
      ['invoice-extraction', 4.8],
      ['catalog-enrichment', 2.03],
      ['support-chatbot', 1.94],
    ],
    series: [1.9, 4.6, 3.3, 5.1, 1.7, 4.2, 4.4],
    labels: ['30', '1', '2', '3', '4', '5', '6'],
  },
  '30D': {
    totalUsd: 128.4,
    requests: 20140,
    tokens: '98.2M',
    p50: '3.6s',
    projects: [
      ['claims-copilot', 88.2],
      ['invoice-extraction', 21.3],
      ['catalog-enrichment', 9.6],
      ['support-chatbot', 9.3],
    ],
    series: [3.1, 4.4, 5.8, 4.2, 3.9, 5.1, 4.6, 3.2, 4.9, 5.4, 4.1, 3.8, 4.7, 5.2],
    labels: ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  },
};

export function DemoDashboard() {
  const [cur, setCur] = useState('INR');
  const [range, setRange] = useState('7D');
  const d = DATA[range];
  const rate = RATES[cur];
  const money = (usd) => {
    const v = usd * rate;
    const nf = new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: v >= 100000 ? 1 : 2,
      notation: v >= 100000 ? 'compact' : 'standard',
    });
    return nf.format(v);
  };
  const maxProj = Math.max(...d.projects.map((p) => p[1]));
  const maxSeries = Math.max(...d.series);

  return (
    <div className="demo" role="img" aria-label="Sample AI Command Center dashboard showing spend, requests, and per-project cost">
      <div className="demo-bar">
        <span className="dots"><i /><i /><i /></span>
        <span className="title">localhost:4321 — dashboard</span>
        <span className="demo-seg" role="group" aria-label="currency">
          {['INR', 'USD', 'EUR'].map((c) => (
            <button key={c} className={c === cur ? 'on' : ''} onClick={() => setCur(c)}>{SYM[c]}</button>
          ))}
        </span>
        <span className="demo-seg" style={{ marginLeft: 8 }} role="group" aria-label="range">
          {['7D', '30D'].map((r) => (
            <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </span>
      </div>
      <div className="demo-body">
        <div className="demo-tiles">
          <div className="demo-tile hero"><div className="l">Total spend</div><div className="v">{money(d.totalUsd)}</div></div>
          <div className="demo-tile"><div className="l">Requests</div><div className="v">{d.requests.toLocaleString()}</div></div>
          <div className="demo-tile"><div className="l">Tokens</div><div className="v">{d.tokens}</div></div>
          <div className="demo-tile"><div className="l">Latency p50</div><div className="v">{d.p50}</div></div>
        </div>
        <div className="demo-cols">
          <div className="demo-panel">
            <h5>Spend over time</h5>
            <div className="spark">
              {d.series.map((v, i) => (
                <div className="col" key={i} title={money(v)}>
                  <s style={{ height: `${(v / maxSeries) * 108}px`, background: COLORS[0], opacity: 0.85 }} />
                </div>
              ))}
            </div>
            <div className="spark-x">
              <span>{range === '7D' ? '30 Jun' : '4 weeks ago'}</span>
              <span>today</span>
            </div>
          </div>
          <div className="demo-panel">
            <h5>Spend by project</h5>
            <div className="demo-bars">
              {d.projects.map(([name, usd], i) => (
                <div className="demo-brow" key={name}>
                  <span className="n">{name}</span>
                  <span className="bar"><i style={{ width: `${Math.max(6, (usd / maxProj) * 100)}%`, background: COLORS[i] }} /></span>
                  <span className="amt">{money(usd)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
