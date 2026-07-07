/* AI Command Center dashboard */
/* global Chart */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ palette
  const SERIES = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
  const OTHER_COLOR = '#6b6a66';
  const CRITICAL = '#d03b3b';
  const INK2 = '#c3c2b7';
  const MUTED = '#898781';
  const GRID = '#2c2c2a';
  const SURFACE = '#1a1a19';
  const MONO = 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace';

  Chart.defaults.color = MUTED;
  Chart.defaults.borderColor = GRID;
  Chart.defaults.font.family = MONO;
  Chart.defaults.font.size = 11;
  Chart.defaults.animation.duration = 350;
  Chart.defaults.plugins.legend.labels.boxWidth = 9;
  Chart.defaults.plugins.legend.labels.boxHeight = 9;
  Chart.defaults.plugins.legend.labels.color = INK2;
  Chart.defaults.plugins.tooltip.backgroundColor = '#232322';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.14)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor = INK2;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;

  // Paints values at the end of horizontal bars (direct labels).
  const barValueLabels = {
    id: 'barValueLabels',
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.format) return;
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0]?.data || [];
      ctx.save();
      ctx.font = `10px ${MONO}`;
      ctx.fillStyle = INK2;
      ctx.textBaseline = 'middle';
      meta.data.forEach((bar, i) => {
        if (data[i] == null) return;
        ctx.fillText(opts.format(data[i]), bar.x + 6, bar.y);
      });
      ctx.restore();
    },
  };
  Chart.register(barValueLabels);

  // ------------------------------------------------------------ helpers
  const CUR_SYMBOLS = { INR: '₹', USD: '$', EUR: '€' };

  // All stored values are USD; display converts via the gateway's live FX rates.
  const fmtMoney = (vUsd) => {
    if (vUsd == null || Number.isNaN(vUsd)) return '—';
    const cur = state.cur || 'USD';
    const rate = state.fx?.rates?.[cur] ?? 1;
    const v = vUsd * rate;
    const locale = cur === 'INR' ? 'en-IN' : 'en-US';
    const nf = (opts) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: cur, ...opts }).format(v);
    const abs = Math.abs(v);
    if (v !== 0 && abs < 0.01) return nf({ minimumFractionDigits: 4, maximumFractionDigits: 4 });
    if (abs >= 100000) return nf({ notation: 'compact', maximumFractionDigits: 1 }); // ₹1.2L / $120k
    return nf({ maximumFractionDigits: 2 });
  };
  const fmtUsdPlain = (v) => {
    if (v == null || Number.isNaN(v)) return '—';
    if (v !== 0 && Math.abs(v) < 0.01) return '$' + v.toFixed(4);
    if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    return '$' + v.toFixed(2);
  };
  const fmtNum = (v) => {
    if (v == null) return '—';
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(v);
  };
  const fmtMs = (v) => (v == null ? '—' : v >= 10000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms');
  const fmtClock = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtBucket = (ts, bucketMs) => {
    const d = new Date(ts);
    if (bucketMs < 24 * 3600e3) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const fmtBucketFull = (ts, bucketMs) => {
    const d = new Date(ts);
    return bucketMs < 24 * 3600e3
      ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  async function api(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }

  // ------------------------------------------------------------ state
  const state = {
    range: '7d',
    project: '',
    q: '',
    errorsOnly: false,
    cur: localStorage.getItem('aicc-currency') || null,
    fx: null,
  };
  const charts = {};
  let meta = null;
  let colorMap = new Map();
  let refreshTimer = null;

  function projectColor(name) {
    return colorMap.get(name) || OTHER_COLOR;
  }

  function assignColors(projects) {
    // Stable slot assignment: alphabetical order, first 8 get palette slots.
    const names = projects.map((p) => p.project).sort((a, b) => a.localeCompare(b));
    colorMap = new Map(names.slice(0, SERIES.length).map((n, i) => [n, SERIES[i]]));
  }

  function makeChart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), cfg);
  }

  // ------------------------------------------------------------ rendering
  function renderTiles(stats, prev) {
    const t = stats.totals;
    $('tSpend').textContent = fmtMoney(t.costUsd);
    const fxNote =
      state.cur && state.cur !== 'USD'
        ? ` <span class="t-dim">≈ ${fmtUsdPlain(t.costUsd)}${state.fx?.stale ? ' · approx fx' : ''}</span>`
        : '';
    $('tSpendSub').innerHTML = deltaHtml(t.costUsd, prev?.totals?.costUsd, { moreIsBad: true }) + fxNote;
    $('tReqs').textContent = fmtNum(t.requests);
    $('tReqsSub').innerHTML = t.errors
      ? `<span class="err-count">${fmtNum(t.errors)} errors (${(t.errorRate * 100).toFixed(1)}%)</span>`
      : deltaHtml(t.requests, prev?.totals?.requests, { moreIsBad: false });
    $('tTokens').textContent = fmtNum(t.tokens);
    $('tTokensSub').textContent = `${fmtNum(t.tokensIn)} in · ${fmtNum(t.tokensOut)} out`;
    $('tLatency').textContent = fmtMs(t.p50LatencyMs);
    $('tLatencySub').textContent = `p95 ${fmtMs(t.p95LatencyMs)}`;
    $('tProjects').textContent = String(stats.byProject.length);
    $('tProjectsSub').textContent = `${stats.byModel.length} models · ${stats.byProvider.length} providers`;
  }

  function renderCurSeg() {
    const seg = $('curSeg');
    const options = state.fx?.options || ['INR', 'USD', 'EUR'];
    seg.innerHTML = options
      .map(
        (c) =>
          `<button data-cur="${c}" role="tab" class="${c === state.cur ? 'on' : ''}" title="Show amounts in ${c}">${CUR_SYMBOLS[c] || c}</button>`,
      )
      .join('');
  }

  function deltaHtml(cur, prevVal, { moreIsBad }) {
    if (prevVal == null || prevVal === 0 || cur == null) return '<span class="t-dim">vs prev period: —</span>';
    const pct = ((cur - prevVal) / prevVal) * 100;
    if (!Number.isFinite(pct)) return '<span class="t-dim">vs prev period: —</span>';
    const up = pct >= 0;
    const cls = up ? (moreIsBad ? 'delta-up' : 'delta-up good') : moreIsBad ? 'delta-down' : 't-dim';
    return `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span> <span class="t-dim">vs prev period</span>`;
  }

  function renderSpendChart(stats) {
    const { points, bucketMs } = stats.timeseries;
    const labels = points.map((p) => fmtBucket(p.t, bucketMs));
    // Top 7 projects by cost in window + Other.
    const totals = new Map();
    for (const p of points) {
      for (const [name, v] of Object.entries(p.byProject)) totals.set(name, (totals.get(name) || 0) + v);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const top = ranked.slice(0, 7);
    const hasOther = ranked.length > top.length;
    const datasets = top.map((name) => ({
      label: name,
      data: points.map((p) => p.byProject[name] || 0),
      backgroundColor: projectColor(name),
      borderColor: SURFACE,
      borderWidth: points.length > 60 ? 0 : 1,
      borderRadius: 2,
      stack: 's',
    }));
    if (hasOther) {
      datasets.push({
        label: 'other',
        data: points.map((p) =>
          Object.entries(p.byProject).reduce((s, [n, v]) => (top.includes(n) ? s : s + v), 0),
        ),
        backgroundColor: OTHER_COLOR,
        borderColor: SURFACE,
        borderWidth: points.length > 60 ? 0 : 1,
        borderRadius: 2,
        stack: 's',
      });
    }
    $('spendNote').textContent = bucketMs < 24 * 3600e3 ? 'hourly' : 'daily';
    makeChart('spendChart', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 12, maxRotation: 0 } },
          y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => fmtMoney(v), maxTicksLimit: 6 }, border: { display: false } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14 } },
          tooltip: {
            callbacks: {
              title: (items) => (items.length ? fmtBucketFull(points[items[0].dataIndex].t, bucketMs) : ''),
              label: (item) => ` ${item.dataset.label}: ${fmtMoney(item.parsed.y)}`,
              footer: (items) => 'total ' + fmtMoney(items.reduce((s, i) => s + i.parsed.y, 0)),
            },
          },
        },
      },
    });
  }

  function renderProjectChart(stats) {
    const rows = stats.byProject.slice(0, 8);
    makeChart('projectChart', {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.project),
        datasets: [{
          data: rows.map((r) => r.costUsd),
          backgroundColor: rows.map((r) => projectColor(r.project)),
          borderRadius: 3,
          barPercentage: 0.72,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 58 } },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: INK2, autoSkip: false } },
        },
        plugins: {
          legend: { display: false },
          barValueLabels: { format: (v) => fmtMoney(v) },
          tooltip: {
            callbacks: {
              label: (item) => {
                const r = rows[item.dataIndex];
                return ` ${fmtMoney(r.costUsd)} · ${fmtNum(r.requests)} reqs · ${fmtNum(r.tokens)} tokens`;
              },
            },
          },
        },
      },
    });
  }

  function renderModelChart(stats) {
    const rows = stats.byModel.slice(0, 8);
    makeChart('modelChart', {
      type: 'bar',
      data: {
        labels: rows.map((r) => (r.model.length > 24 ? r.model.slice(0, 23) + '…' : r.model)),
        datasets: [{
          data: rows.map((r) => r.costUsd),
          backgroundColor: '#256abf',
          borderRadius: 3,
          barPercentage: 0.72,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 58 } },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: INK2, autoSkip: false, font: { size: 10 } } },
        },
        plugins: {
          legend: { display: false },
          barValueLabels: { format: (v) => fmtMoney(v) },
          tooltip: {
            callbacks: {
              title: (items) => rows[items[0].dataIndex].model,
              label: (item) => {
                const r = rows[item.dataIndex];
                return ` ${r.provider} · ${fmtMoney(r.costUsd)} · ${fmtNum(r.requests)} reqs`;
              },
            },
          },
        },
      },
    });
  }

  function renderReqChart(stats) {
    const { points, bucketMs } = stats.timeseries;
    const labels = points.map((p) => fmtBucket(p.t, bucketMs));
    makeChart('reqChart', {
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'requests',
            data: points.map((p) => p.requests),
            borderColor: '#3987e5',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
          },
          {
            type: 'bar',
            label: 'errors',
            data: points.map((p) => p.errors),
            backgroundColor: CRITICAL,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { maxTicksLimit: 5, precision: 0 }, border: { display: false } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14 } },
          tooltip: {
            callbacks: {
              title: (items) => (items.length ? fmtBucketFull(points[items[0].dataIndex].t, bucketMs) : ''),
            },
          },
        },
      },
    });
  }

  function renderProviders(stats) {
    const box = $('providerList');
    const max = Math.max(...stats.byProvider.map((r) => r.costUsd), 0.000001);
    box.innerHTML = stats.byProvider
      .map(
        (r) => `
      <div class="provider-row">
        <span class="provider-name" title="${esc(r.provider)}">${esc(r.provider)}</span>
        <span class="provider-bar"><i style="width:${Math.max(2, (r.costUsd / max) * 100)}%"></i></span>
        <span class="provider-val">${fmtMoney(r.costUsd)} · ${fmtNum(r.requests)}</span>
      </div>`,
      )
      .join('') || '<div class="feed-empty">No traffic in range.</div>';
  }

  function rowHtml(r) {
    const err = !r.ok;
    const model = r.model || '(unknown)';
    return `
      <td class="t-dim">${fmtClock(r.ts)}</td>
      <td><span class="dot" style="background:${projectColor(r.project)}"></span>${esc(r.project)}${r.simulated ? '<span class="tag">demo</span>' : ''}</td>
      <td><span class="t-dim">${esc(r.provider)} ·</span> ${esc(model)}${r.stream ? '<span class="tag">stream</span>' : ''}</td>
      <td class="num">${r.tokensTotal != null ? `${fmtNum(r.tokensIn)} <span class="t-dim">→</span> ${fmtNum(r.tokensOut)}` : '<span class="t-dim">—</span>'}</td>
      <td class="num t-cost">${r.costUsd != null ? fmtMoney(r.costUsd) : '<span class="t-dim">—</span>'}</td>
      <td class="num">${fmtMs(r.latencyMs)}</td>
      <td><span class="status${err ? ' err' : ''}">${err ? (r.status || 'ERR') + (r.errorType === 'client_abort' ? ' abort' : '') : r.status}</span></td>`;
  }

  function renderFeed(list) {
    const body = $('feedBody');
    body.innerHTML = list.items
      .map((r) => `<tr title="${esc(r.errorMessage || r.endpoint || '')}">${rowHtml(r)}</tr>`)
      .join('');
    $('feedEmpty').hidden = list.items.length > 0;
  }

  function prependFeedRow(r) {
    if (state.project && r.project !== state.project) return;
    if (state.errorsOnly && r.ok) return;
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = `${r.model || ''} ${r.project || ''} ${r.endpoint || ''}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    const body = $('feedBody');
    const tr = document.createElement('tr');
    tr.className = 'flash';
    tr.title = r.errorMessage || r.endpoint || '';
    tr.innerHTML = rowHtml(r);
    body.prepend(tr);
    while (body.children.length > 100) body.lastChild.remove();
    $('feedEmpty').hidden = true;
  }

  function renderFooter(stats) {
    let fxInfo = '';
    if (state.fx && state.cur !== 'USD') {
      const age = state.fx.fetchedAt
        ? `, updated ${Math.max(0, Math.round((Date.now() - state.fx.fetchedAt) / 3600e3))}h ago`
        : '';
      fxInfo = ` · fx: ${state.fx.source}${age}${state.fx.stale ? ' (stale)' : ''}`;
    }
    $('footMeta').textContent = meta
      ? `v${meta.version} · data: ${meta.dataDir} · gateway http://localhost:${meta.port}${fxInfo}`
      : '';
    const unpriced = stats.totals.unpriced;
    const chipU = $('unpricedChip');
    chipU.hidden = !unpriced;
    if (unpriced) chipU.textContent = `⚠ ${unpriced} calls on unpriced models — add rates in config`;
    const chipD = $('demoChip');
    chipD.hidden = !stats.totals.simulated;
    if (stats.totals.simulated) {
      chipD.innerHTML = `${fmtNum(stats.totals.simulated)} demo records · <a id="clearDemoLink">remove</a>`;
      chipD.querySelector('#clearDemoLink').onclick = async () => {
        await fetch('/api/records?simulated=1', { method: 'DELETE' });
        loadAll(true);
      };
    }
  }

  // ------------------------------------------------------------ data flow
  async function loadAll(full) {
    try {
      const statsQ = new URLSearchParams({ range: state.range });
      if (state.project) statsQ.set('project', state.project);
      const reqQ = new URLSearchParams({ limit: '100' });
      if (state.project) reqQ.set('project', state.project);
      if (state.q) reqQ.set('q', state.q);
      if (state.errorsOnly) reqQ.set('errorsOnly', '1');

      const [m, fx, stats, requests, projects] = await Promise.all([
        api('/api/meta'),
        api('/api/fx'),
        api('/api/stats?' + statsQ),
        api('/api/requests?' + reqQ),
        api('/api/projects'),
      ]);
      meta = m;
      state.fx = fx;
      if (!state.cur || !fx.options.includes(state.cur)) state.cur = fx.default;
      renderCurSeg();
      $('metaVersion').textContent = 'v' + m.version;

      const empty = m.records === 0;
      $('emptyState').hidden = !empty;
      $('main').hidden = empty;
      if (empty) {
        $('emptySnippet').textContent =
          `export OPENAI_BASE_URL="${location.origin}/p/my-app/openai/v1"\n` +
          `export ANTHROPIC_BASE_URL="${location.origin}/p/my-app/anthropic"\n` +
          `# then run your app exactly as before — that's the whole integration`;
        return;
      }

      // Previous window for deltas (same span, immediately before).
      const span = stats.to - stats.from;
      const prevQ = new URLSearchParams({ from: String(stats.from - span), to: String(stats.from) });
      if (state.project) prevQ.set('project', state.project);
      const prev = state.range === 'all' ? null : await api('/api/stats?' + prevQ);

      assignColors(projects);
      renderTiles(stats, prev);
      renderSpendChart(stats);
      renderProjectChart(stats);
      renderModelChart(stats);
      renderReqChart(stats);
      renderProviders(stats);
      renderFeed(requests);
      renderFooter(stats);

      if (full) populateProjects(projects);
    } catch (err) {
      console.error('[aicc] dashboard load failed:', err);
    }
  }

  function populateProjects(projects) {
    const sel = $('projectSel');
    const current = state.project;
    sel.innerHTML =
      '<option value="">All projects</option>' +
      projects.map((p) => `<option value="${esc(p.project)}"${p.project === current ? ' selected' : ''}>${esc(p.project)}</option>`).join('');
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      loadAll(true);
    }, 2500);
  }

  // ------------------------------------------------------------ live events
  function connectSse() {
    const es = new EventSource('/api/events');
    es.onopen = () => $('liveDot').classList.add('on');
    es.onerror = () => $('liveDot').classList.remove('on');
    es.onmessage = (ev) => {
      try {
        const r = JSON.parse(ev.data);
        prependFeedRow(r);
        scheduleRefresh();
      } catch {
        /* ignore malformed events */
      }
    };
  }

  // ------------------------------------------------------------ wiring
  $('rangeSeg').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-range]');
    if (!btn) return;
    state.range = btn.dataset.range;
    for (const b of $('rangeSeg').children) b.classList.toggle('on', b === btn);
    loadAll(false);
  });

  $('curSeg').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-cur]');
    if (!btn) return;
    state.cur = btn.dataset.cur;
    localStorage.setItem('aicc-currency', state.cur);
    renderCurSeg();
    loadAll(false); // re-render everything in the new currency
  });

  $('projectSel').addEventListener('change', (ev) => {
    state.project = ev.target.value;
    loadAll(false);
  });

  let searchTimer = null;
  $('feedSearch').addEventListener('input', (ev) => {
    state.q = ev.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadAll(false), 250);
  });

  $('errorsOnly').addEventListener('change', (ev) => {
    state.errorsOnly = ev.target.checked;
    loadAll(false);
  });

  $('seedBtn').addEventListener('click', async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    btn.textContent = 'Seeding…';
    try {
      await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: 14 }),
      });
      await loadAll(true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Seed 14 days of demo data';
    }
  });

  // Fallback poll every 45s in case SSE drops.
  setInterval(() => loadAll(false), 45000);

  loadAll(true);
  connectSse();
})();
