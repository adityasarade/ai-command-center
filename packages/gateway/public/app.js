/* AI Command Center dashboard */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ palette
  const SERIES = [
    '#3987e5',
    '#199e70',
    '#c98500',
    '#008300',
    '#9085e9',
    '#e66767',
    '#d55181',
    '#d95926',
  ];
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
    if (vUsd == null || Number.isNaN(vUsd)) return '-';
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
    if (v == null || Number.isNaN(v)) return '-';
    if (v !== 0 && Math.abs(v) < 0.01) return '$' + v.toFixed(4);
    if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    return '$' + v.toFixed(2);
  };
  const fmtNum = (v) => {
    if (v == null) return '-';
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(v);
  };
  const fmtMs = (v) =>
    v == null ? '-' : v >= 10000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms';
  const fmtClock = (ts) =>
    new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
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
      ? d.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
    );
  const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const fmtDateTime = (ts) =>
    new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const fmtDuration = (ms) => {
    if (ms == null) return '-';
    if (ms < 1000) return Math.round(ms) + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  };
  const shortModel = (m) => (m && m.length > 22 ? m.slice(0, 21) + '…' : m || '(unknown)');

  async function api(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }

  // ------------------------------------------------------------ state
  const FEED_LIMIT = 50;
  const state = {
    view: 'overview',
    range: '7d',
    project: '',
    q: '',
    errorsOnly: false,
    feedOffset: 0,
    cur: localStorage.getItem('aicc-currency') || null,
    fx: null,
  };
  const charts = {};
  let meta = null;
  let auth = null;
  let colorMap = new Map();
  let refreshTimer = null;
  let loadSeq = 0;

  async function apiSend(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  }

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
    $('tSpendSub').innerHTML =
      deltaHtml(t.costUsd, prev?.totals?.costUsd, { moreIsBad: true }) + fxNote;
    $('tReqs').textContent = fmtNum(t.requests);
    $('tReqsSub').innerHTML = t.errors
      ? `<span class="err-count">${fmtNum(t.errors)} errors (${(t.errorRate * 100).toFixed(1)}%)</span>`
      : deltaHtml(t.requests, prev?.totals?.requests, { moreIsBad: false });
    $('tTokens').textContent = fmtNum(t.tokens);
    $('tTokensSub').textContent = `${fmtNum(t.tokensIn)} in · ${fmtNum(t.tokensOut)} out`;
    $('tLatency').textContent = fmtMs(t.p50LatencyMs);
    $('tLatencySub').textContent = `p95 ${fmtMs(t.p95LatencyMs)}`;
    $('tProjects').textContent = String(stats.byProject.length);
    $('tProjectsSub').textContent =
      `${stats.byModel.length} models · ${stats.byProvider.length} providers`;
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
    if (prevVal == null || prevVal === 0 || cur == null)
      return '<span class="t-dim">vs prev period: -</span>';
    const pct = ((cur - prevVal) / prevVal) * 100;
    if (!Number.isFinite(pct)) return '<span class="t-dim">vs prev period: -</span>';
    const up = pct >= 0;
    const cls = up
      ? moreIsBad
        ? 'delta-up'
        : 'delta-up good'
      : moreIsBad
        ? 'delta-down'
        : 't-dim';
    return `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span> <span class="t-dim">vs prev period</span>`;
  }

  function renderSpendChart(stats) {
    const { points, bucketMs } = stats.timeseries;
    const labels = points.map((p) => fmtBucket(p.t, bucketMs));
    // Top 7 projects by cost in window + Other.
    const totals = new Map();
    for (const p of points) {
      for (const [name, v] of Object.entries(p.byProject))
        totals.set(name, (totals.get(name) || 0) + v);
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
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { maxTicksLimit: 12, maxRotation: 0 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { callback: (v) => fmtMoney(v), maxTicksLimit: 6 },
            border: { display: false },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14 } },
          tooltip: {
            callbacks: {
              title: (items) =>
                items.length ? fmtBucketFull(points[items[0].dataIndex].t, bucketMs) : '',
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
        datasets: [
          {
            data: rows.map((r) => r.costUsd),
            backgroundColor: rows.map((r) => projectColor(r.project)),
            borderRadius: 3,
            barPercentage: 0.72,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 58 } },
        scales: {
          x: { display: false, beginAtZero: true },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: INK2, autoSkip: false },
          },
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
        datasets: [
          {
            data: rows.map((r) => r.costUsd),
            backgroundColor: '#256abf',
            borderRadius: 3,
            barPercentage: 0.72,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 58 } },
        scales: {
          x: { display: false, beginAtZero: true },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: INK2, autoSkip: false, font: { size: 10 } },
          },
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
          y: {
            beginAtZero: true,
            ticks: { maxTicksLimit: 5, precision: 0 },
            border: { display: false },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14 } },
          tooltip: {
            callbacks: {
              title: (items) =>
                items.length ? fmtBucketFull(points[items[0].dataIndex].t, bucketMs) : '',
            },
          },
        },
      },
    });
  }

  function renderProviders(stats) {
    const box = $('providerList');
    const max = Math.max(...stats.byProvider.map((r) => r.costUsd), 0.000001);
    box.innerHTML =
      stats.byProvider
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
      <td class="num">${r.tokensTotal != null ? `${fmtNum(r.tokensIn)} <span class="t-dim">→</span> ${fmtNum(r.tokensOut)}` : '<span class="t-dim">-</span>'}</td>
      <td class="num t-cost">${r.costUsd != null ? fmtMoney(r.costUsd) : '<span class="t-dim">-</span>'}</td>
      <td class="num">${fmtMs(r.latencyMs)}</td>
      <td><span class="status${err ? ' err' : ''}">${err ? (r.status || 'ERR') + (r.errorType === 'client_abort' ? ' abort' : '') : r.status}</span></td>`;
  }

  function renderFeed(list) {
    const body = $('feedBody');
    body.innerHTML = list.items
      .map((r) => `<tr title="${esc(r.errorMessage || r.endpoint || '')}">${rowHtml(r)}</tr>`)
      .join('');
    $('feedEmpty').hidden = list.items.length > 0;
    const start = list.total ? state.feedOffset + 1 : 0;
    const end = state.feedOffset + list.items.length;
    $('feedPageInfo').textContent = `${start}-${end} of ${fmtNum(list.total)}`;
    $('feedPrev').disabled = state.feedOffset === 0;
    $('feedNext').disabled = end >= list.total;
  }

  function prependFeedRow(r) {
    if (state.view !== 'overview' || state.feedOffset !== 0) return;
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
    const dataInfo = meta?.dataDir ? ` · data: ${meta.dataDir}` : '';
    $('footMeta').textContent = meta
      ? `v${meta.version}${dataInfo} · gateway http://localhost:${meta.port}${fxInfo}`
      : '';
    const unpriced = stats.totals.unpriced;
    const chipU = $('unpricedChip');
    chipU.hidden = !unpriced;
    if (unpriced)
      chipU.textContent = `⚠ ${unpriced} calls on unpriced models - add rates in config`;
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

  // ------------------------------------------------------------ auth flow
  let brandingApplied = false;
  function applyBranding(b) {
    if (!b || brandingApplied) return;
    brandingApplied = true;
    if (b.name) {
      document.querySelector('.wordmark').textContent = b.name;
      document.title = b.name;
    }
    if (b.accent) document.documentElement.style.setProperty('--accent', b.accent);
  }

  async function refreshAuth() {
    try {
      auth = await api('/api/auth/state');
    } catch {
      auth = { enabled: false, locked: false, needsSetup: false, user: null };
    }
    applyBranding(auth.branding);
    const box = $('userBox');
    if (auth.user) {
      box.hidden = false;
      $('userName').innerHTML =
        `${esc(auth.user.username)}<span class="role">${esc(auth.user.role)}</span>`;
      $('settingsBtn').hidden = auth.user.role !== 'admin';
    } else {
      box.hidden = true;
    }
    // Setup callout only when auth is enabled but no admin exists yet.
    $('setupCallout').hidden = !(auth.enabled && auth.needsSetup);
    return auth;
  }

  function showGate(mode) {
    // mode: 'login' | 'setup'
    $('authGate').hidden = false;
    $('main').hidden = true;
    $('emptyState').hidden = true;
    const setup = mode === 'setup';
    $('gateTitle').textContent = setup ? 'Create admin account' : 'Sign in';
    $('gateDesc').textContent = setup
      ? 'This first account is the administrator - it manages users, teams, and project keys.'
      : 'AI Command Center is protected. Sign in to continue.';
    $('gateSubmit').textContent = setup ? 'Create admin & sign in' : 'Sign in';
    $('gateForm').dataset.mode = mode;
    $('gatePass').autocomplete = setup ? 'new-password' : 'current-password';
    $('gateError').hidden = true;
    $('gateCancelWrap').hidden = !(setup && !auth.needsSetup
      ? false
      : setup && auth.needsSetup
        ? true
        : false);
    // Show cancel only for a setup opened voluntarily (admin already exists is impossible here); keep simple:
    $('gateCancelWrap').hidden = true;
    $('gateUser').focus();
  }

  function hideGate() {
    $('authGate').hidden = true;
  }

  // ------------------------------------------------------------ data flow
  function rangeQuery(extra = {}) {
    const q = new URLSearchParams({ range: state.range, ...extra });
    if (state.project) q.set('project', state.project);
    return q;
  }

  async function loadAll(full) {
    const seq = ++loadSeq;
    try {
      await refreshAuth();
      // Gate the whole dashboard when auth is locked and we're not signed in.
      if (auth.locked && !auth.user) {
        showGate('login');
        return;
      }
      hideGate();

      const [m, fx, projects] = await Promise.all([
        api('/api/meta'),
        api('/api/fx'),
        api('/api/projects'),
      ]);
      if (seq !== loadSeq) return; // a newer load superseded this one

      meta = m;
      state.fx = fx;
      if (!state.cur || !fx.options.includes(state.cur)) state.cur = fx.default;
      renderCurSeg();
      $('metaVersion').textContent = 'v' + m.version;
      assignColors(projects);
      if (full) populateProjects(projects);

      const empty = m.records === 0;
      $('emptyState').hidden = !empty;
      $('main').hidden = empty && $('adminPanel').hidden;
      if (empty) {
        const base = auth.locked
          ? `${location.origin}/k/<your-project-key>`
          : `${location.origin}/p/my-app`;
        $('emptySnippet').textContent =
          `export OPENAI_BASE_URL="${base}/openai/v1"\n` +
          `export ANTHROPIC_BASE_URL="${base}/anthropic"\n` +
          `# then run your app exactly as before - that's the whole integration`;
        $('seedBtn').style.display = auth.locked && auth.user?.role !== 'admin' ? 'none' : '';
        return;
      }

      await refreshAlertBadge();
      await renderActiveView(seq);
    } catch (err) {
      if (String(err).includes('HTTP 401')) {
        await refreshAuth();
        showGate(auth.needsSetup ? 'setup' : 'login');
        return;
      }
      console.error('[aicc] dashboard load failed:', err);
    }
  }

  async function renderActiveView(seq) {
    if (state.view === 'overview') return loadOverview(seq);
    if (state.view === 'traces') return loadTraces();
    if (state.view === 'prompts') return loadPrompts();
    if (state.view === 'models') return loadModels();
    if (state.view === 'alerts') return loadAlerts();
  }

  async function loadOverview(seq) {
    const reqQ = rangeQuery({ limit: String(FEED_LIMIT), offset: String(state.feedOffset) });
    if (state.q) reqQ.set('q', state.q);
    if (state.errorsOnly) reqQ.set('errorsOnly', '1');
    const [stats, requests] = await Promise.all([
      api('/api/stats?' + rangeQuery()),
      api('/api/requests?' + reqQ),
    ]);
    if (seq !== loadSeq) return;

    let prev = null;
    if (state.range !== 'all') {
      const span = stats.to - stats.from;
      const prevQ = rangeQuery();
      prevQ.delete('range');
      prevQ.set('from', String(stats.from - span));
      prevQ.set('to', String(stats.from));
      prev = await api('/api/stats?' + prevQ);
      if (seq !== loadSeq) return;
    }

    renderTiles(stats, prev);
    renderSpendChart(stats);
    renderProjectChart(stats);
    renderModelChart(stats);
    renderReqChart(stats);
    renderProviders(stats);
    renderFeed(requests);
    renderFooter(stats);
  }

  async function refreshAlertBadge() {
    try {
      const { alerts } = await api('/api/alerts');
      const badge = $('alertBadge');
      if (alerts && alerts.length) {
        badge.textContent = String(alerts.length);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    } catch {
      /* ignore */
    }
  }

  // ---- Traces view ----
  async function loadTraces() {
    const { items } = await api('/api/traces?' + rangeQuery({ limit: '100' }));
    $('tracesNote').textContent = items.length ? `${items.length} sessions` : '';
    $('tracesEmpty').hidden = items.length > 0;
    $('tracesBody').innerHTML = items
      .map(
        (t) => `<tr class="clickable" data-trace="${esc(t.id)}">
        <td class="t-dim">${fmtDateTime(t.start)}</td>
        <td><span class="dot" style="background:${projectColor(t.project)}"></span>${esc(t.project)}</td>
        <td class="num">${t.calls}${t.errors ? ` <span class="err-count">(${t.errors} err)</span>` : ''}</td>
        <td class="t-dim">${esc(t.providers.join(', '))} · ${esc(t.models.map(shortModel).join(', '))}</td>
        <td class="num">${fmtNum(t.tokens)}</td>
        <td class="num t-cost">${fmtMoney(t.costUsd)}</td>
        <td class="num">${fmtDuration(t.spanMs)}</td></tr>`,
      )
      .join('');
    $('traceDetailCard').hidden = true;
  }

  async function openTrace(id) {
    const t = await api('/api/trace?id=' + encodeURIComponent(id));
    $('traceDetailCard').hidden = false;
    $('traceDetailTitle').textContent =
      `Trace ${id.slice(0, 12)}… · ${t.calls.length} calls · ${fmtMoney(t.costUsd)} · ${fmtDuration(t.spanMs)}`;
    const maxOff = Math.max(1, ...t.calls.map((c) => c.offsetMs + (c.latencyMs || 0)));
    $('traceTimeline').innerHTML = t.calls
      .map((c) => {
        const left = (c.offsetMs / maxOff) * 100;
        const width = Math.max(3, ((c.latencyMs || 0) / maxOff) * 100);
        return `<div class="tl-row">
          <span class="tl-off">+${fmtDuration(c.offsetMs)}</span>
          <div class="tl-bar${c.ok ? '' : ' err'}">
            <span class="fill" style="left:${left}%;width:${width}%"></span>
            <span class="tl-model">${esc(c.provider)} · ${esc(shortModel(c.model))}${c.prompt ? ` <span class="tag">${esc(c.prompt)}${c.promptVersion ? ' ' + esc(c.promptVersion) : ''}</span>` : ''}</span>
            <span class="tl-meta">${c.tokensTotal != null || c.tokensIn != null ? fmtNum((c.tokensIn || 0) + (c.tokensOut || 0)) + ' tok · ' : ''}${fmtMoney(c.costUsd)} · ${fmtMs(c.latencyMs)}${c.ok ? '' : ' · ' + (c.status || 'ERR')}</span>
          </div></div>`;
      })
      .join('');
    $('traceDetailCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---- Prompts view ----
  async function loadPrompts() {
    const { items } = await api('/api/prompts?' + rangeQuery());
    $('promptsEmpty').hidden = items.length > 0;
    $('promptsBody').innerHTML = items
      .map(
        (p) => `<tr>
        <td>${esc(p.prompt)}</td>
        <td class="t-dim">${esc(p.version || '-')}</td>
        <td><span class="dot" style="background:${projectColor(p.project)}"></span>${esc(p.project)}</td>
        <td class="num">${fmtNum(p.requests)}</td>
        <td class="num${p.errorRate > 0.05 ? ' err-count' : ''}">${(p.errorRate * 100).toFixed(1)}%</td>
        <td class="num t-cost">${fmtMoney(p.avgCostUsd)}</td>
        <td class="num">${fmtNum(p.tokens)}</td>
        <td class="num">${fmtMs(p.p50LatencyMs)}</td>
        <td class="num">${fmtMs(p.p95LatencyMs)}</td></tr>`,
      )
      .join('');
  }

  // ---- Models view ----
  async function loadModels() {
    const { items } = await api('/api/models?' + rangeQuery());
    $('modelsEmpty').hidden = items.length > 0;
    $('modelsBody').innerHTML = items
      .map(
        (m) => `<tr>
        <td><span class="t-dim">${esc(m.provider)} ·</span> ${esc(m.model)}</td>
        <td class="num">${fmtNum(m.requests)}</td>
        <td class="num t-cost">${fmtMoney(m.costUsd)}</td>
        <td class="num">${m.effectivePerMTok ? fmtMoney(m.effectivePerMTok) : '-'}</td>
        <td class="num">${fmtNum(m.tokens)}</td>
        <td class="num">${fmtMs(m.p50LatencyMs)}</td>
        <td class="num">${fmtMs(m.p95LatencyMs)}</td>
        <td class="num${m.errorRate > 0.05 ? ' err-count' : ''}">${(m.errorRate * 100).toFixed(1)}%</td></tr>`,
      )
      .join('');
  }

  // ---- Alerts view ----
  async function loadAlerts() {
    const isAdmin = !auth.locked || auth.user?.role === 'admin';
    const [data, anomaliesRes] = await Promise.all([
      api('/api/alerts'),
      api('/api/anomalies?' + rangeQuery({ range: '30d' })),
    ]);
    const sevRank = (a) => (a.severity === 'critical' ? 0 : 1);
    $('alertsList').innerHTML = data.alerts.length
      ? data.alerts
          .sort((a, b) => sevRank(a) - sevRank(b))
          .map(
            (a) => `<div class="alert-item ${a.severity}">
          <span class="a-type">${esc(a.type.replace('_', ' '))}</span>
          <span>${esc(a.message)}</span></div>`,
          )
          .join('')
      : '<div class="alerts-empty">No active alerts. All projects within budget and thresholds.</div>';

    const anomalies = anomaliesRes.anomalies || [];
    $('anomaliesList').innerHTML = anomalies.length
      ? anomalies
          .map(
            (a) => `<div class="alert-item ${a.severity}">
          <span class="a-type">${esc(a.type.replace('_', ' '))}</span>
          <span>${fmtDate(a.date)} - ${esc(a.message)}</span></div>`,
          )
          .join('')
      : '<div class="alerts-empty">No anomalies detected.</div>';

    // Budgets with progress
    const budgets = data.budgets || [];
    $('budgetsList').innerHTML = budgets.length
      ? budgets
          .map((b) => {
            const cls = b.pct >= 100 ? 'over' : b.pct >= b.alertAtPct ? 'warn' : '';
            return `<div class="budget-row">
            <span class="b-name">${esc(b.project)}</span>
            <span class="budget-bar"><i class="${cls}" style="width:${Math.min(100, b.pct)}%"></i></span>
            <span class="b-amt">${fmtMoney(b.spentUsd)} / ${fmtMoney(b.monthlyUsd)} (${b.pct.toFixed(0)}%)</span>
            ${isAdmin ? `<button class="b-del" data-del-budget="${esc(b.project)}" title="remove budget">×</button>` : '<span></span>'}
          </div>`;
          })
          .join('')
      : '<div class="alerts-empty">No budgets set yet.</div>';
    $('budgetsNote').textContent = 'this calendar month, in USD';

    // Admin budget form
    $('budgetForm').hidden = !isAdmin;
    if (isAdmin) {
      const known = (await api('/api/projects')).map((p) => p.project);
      $('budgetProject').innerHTML = known
        .map((p) => `<option value="${esc(p)}">${esc(p)}</option>`)
        .join('');
    }
    $('budgetErr').textContent = '';
  }

  function populateProjects(projects) {
    // Drop a stale filter if its project no longer has any visible records.
    if (state.project && !projects.some((p) => p.project === state.project)) {
      state.project = '';
    }
    const sel = $('projectSel');
    const current = state.project;
    sel.innerHTML =
      '<option value="">All projects</option>' +
      projects
        .map(
          (p) =>
            `<option value="${esc(p.project)}"${p.project === current ? ' selected' : ''}>${esc(p.project)}</option>`,
        )
        .join('');
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      loadAll(false);
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

  // ------------------------------------------------------------ view router
  function setView(name) {
    state.view = name;
    for (const b of $('viewNav').children) b.classList.toggle('on', b.dataset.view === name);
    for (const el of document.querySelectorAll('.view')) {
      el.hidden = el.id !== 'view-' + name;
    }
    if (!$('adminPanel').hidden) hideAdmin();
    renderActiveView(++loadSeq);
  }

  // ------------------------------------------------------------ wiring
  $('viewNav').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-view]');
    if (btn) setView(btn.dataset.view);
  });

  $('rangeSeg').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-range]');
    if (!btn) return;
    state.range = btn.dataset.range;
    state.feedOffset = 0;
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
    state.feedOffset = 0;
    loadAll(false);
  });

  let searchTimer = null;
  $('feedSearch').addEventListener('input', (ev) => {
    state.q = ev.target.value.trim();
    state.feedOffset = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadOverview(++loadSeq), 250);
  });

  $('errorsOnly').addEventListener('change', (ev) => {
    state.errorsOnly = ev.target.checked;
    state.feedOffset = 0;
    loadOverview(++loadSeq);
  });

  $('feedPrev').addEventListener('click', () => {
    state.feedOffset = Math.max(0, state.feedOffset - FEED_LIMIT);
    loadOverview(++loadSeq);
  });
  $('feedNext').addEventListener('click', () => {
    state.feedOffset += FEED_LIMIT;
    loadOverview(++loadSeq);
  });

  $('tracesBody').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-trace]');
    if (tr) openTrace(tr.dataset.trace);
  });
  $('traceClose').addEventListener('click', () => {
    $('traceDetailCard').hidden = true;
  });

  $('budgetSave').addEventListener('click', async () => {
    try {
      await apiSend('POST', '/api/admin/budget', {
        project: $('budgetProject').value,
        monthlyUsd: Number($('budgetAmount').value),
        alertAtPct: $('budgetPct').value ? Number($('budgetPct').value) : undefined,
      });
      $('budgetAmount').value = '';
      $('budgetPct').value = '';
      await loadAlerts();
      await refreshAlertBadge();
    } catch (err) {
      $('budgetErr').textContent = err.message;
    }
  });
  $('budgetsList').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-del-budget]');
    if (!btn) return;
    try {
      await apiSend('DELETE', '/api/admin/budget/' + encodeURIComponent(btn.dataset.delBudget));
      await loadAlerts();
      await refreshAlertBadge();
    } catch (err) {
      $('budgetErr').textContent = err.message;
    }
  });

  $('seedBtn').addEventListener('click', async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    btn.textContent = 'Seeding…';
    try {
      await apiSend('POST', '/api/demo', { days: 14 });
      await loadAll(true);
    } catch (err) {
      alert('Could not seed demo data: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Seed 14 days of demo data';
    }
  });

  // ---- auth gate form (login / first-run admin setup) ----
  $('gateForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const mode = ev.currentTarget.dataset.mode;
    const username = $('gateUser').value.trim();
    const password = $('gatePass').value;
    const errEl = $('gateError');
    errEl.hidden = true;
    try {
      await apiSend('POST', mode === 'setup' ? '/api/auth/setup' : '/api/auth/login', {
        username,
        password,
      });
      $('gatePass').value = '';
      await loadAll(true);
      connectSse();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  $('calloutSetupBtn').addEventListener('click', () => showGate('setup'));

  $('logoutBtn').addEventListener('click', async () => {
    await apiSend('POST', '/api/auth/logout').catch(() => {});
    hideAdmin();
    await loadAll(true);
  });

  // ---- settings / admin panel ----
  function hideAdmin() {
    $('adminPanel').hidden = true;
  }
  $('adminClose').addEventListener('click', () => {
    hideAdmin();
    loadAll(false);
  });
  $('settingsBtn').addEventListener('click', async () => {
    $('adminPanel').hidden = false;
    $('main').hidden = false;
    $('emptyState').hidden = true;
    await renderAdmin();
    $('adminPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  async function renderAdmin() {
    let data;
    try {
      data = await api('/api/admin/overview');
    } catch (err) {
      $('adminProjects').innerHTML = `<div class="admin-err">${esc(err.message)}</div>`;
      return;
    }
    const teamOpts = (sel) =>
      '<option value="">- no team -</option>' +
      data.teams
        .map(
          (t) =>
            `<option value="${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.name)}</option>`,
        )
        .join('');

    // Projects + gateway keys
    $('adminProjects').innerHTML = `
      <h3>Projects &amp; gateway keys</h3>
      <div class="admin-list">
        ${
          data.projects.length
            ? data.projects
                .map(
                  (p) => `
          <div class="admin-item">
            <div class="row1"><strong>${esc(p.name)}</strong>
              <button class="mini danger" data-del-project="${esc(p.name)}">delete</button></div>
            <div class="meta">team: ${esc(p.teamName || '-')}</div>
            <div class="keyrow">
              <code title="click to copy" data-copy="${esc(p.key)}">${esc(p.key)}</code>
              <button class="mini" data-rotate="${esc(p.name)}">rotate</button>
            </div>
            <div class="admin-form" style="margin-top:7px">
              <select data-set-project-team="${esc(p.name)}">${teamOpts(p.teamId)}</select>
            </div>
          </div>`,
                )
                .join('')
            : '<div class="meta">No projects yet. Create one to get a gateway key.</div>'
        }
      </div>
      <div class="admin-form">
        <input id="npName" placeholder="new project name" />
        <select id="npTeam">${teamOpts('')}</select>
        <button class="mini" id="npAdd">add</button>
      </div>
      <div class="admin-err" id="npErr"></div>`;

    // Teams
    $('adminTeams').innerHTML = `
      <h3>Teams</h3>
      <div class="admin-list">
        ${
          data.teams.length
            ? data.teams
                .map(
                  (t) => `<div class="admin-item"><div class="row1"><strong>${esc(t.name)}</strong>
              <button class="mini danger" data-del-team="${t.id}">delete</button></div></div>`,
                )
                .join('')
            : '<div class="meta">No teams yet.</div>'
        }
      </div>
      <div class="admin-form">
        <input id="ntName" placeholder="new team name" />
        <button class="mini" id="ntAdd">add</button>
      </div>
      <div class="admin-err" id="ntErr"></div>`;

    // Users
    $('adminUsers').innerHTML = `
      <h3>Users</h3>
      <div class="admin-list">
        ${data.users
          .map(
            (u) => `<div class="admin-item">
            <div class="row1"><strong>${esc(u.username)}</strong>
              ${u.id === auth.user.id ? '<span class="meta">you</span>' : `<button class="mini danger" data-del-user="${u.id}">delete</button>`}</div>
            <div class="admin-form" style="margin-top:7px">
              <select data-set-role="${u.id}">
                <option value="member"${u.role === 'member' ? ' selected' : ''}>member</option>
                <option value="admin"${u.role === 'admin' ? ' selected' : ''}>admin</option>
              </select>
              <select data-set-user-team="${u.id}">${teamOpts(u.teamId)}</select>
            </div>
          </div>`,
          )
          .join('')}
      </div>
      <div class="admin-form">
        <input id="nuName" placeholder="username" />
        <input id="nuPass" type="password" placeholder="password (min 8)" />
      </div>
      <div class="admin-form" style="margin-top:6px">
        <select id="nuRole"><option value="member">member</option><option value="admin">admin</option></select>
        <select id="nuTeam">${teamOpts('')}</select>
        <button class="mini" id="nuAdd">add user</button>
      </div>
      <div class="admin-err" id="nuErr"></div>`;
  }

  // Delegated admin actions
  $('adminPanel').addEventListener('click', async (ev) => {
    const t = ev.target;
    const act = async (fn, errId) => {
      try {
        await fn();
        await renderAdmin();
      } catch (err) {
        const el = errId && $(errId);
        if (el) {
          el.textContent = err.message;
        } else {
          alert(err.message);
        }
      }
    };
    if (t.dataset.copy) {
      navigator.clipboard?.writeText(t.dataset.copy);
      const prev = t.textContent;
      t.textContent = 'copied!';
      setTimeout(() => (t.textContent = prev), 1000);
    } else if (t.id === 'npAdd') {
      await act(
        () =>
          apiSend('POST', '/api/admin/projects', {
            name: $('npName').value.trim(),
            teamId: $('npTeam').value,
          }),
        'npErr',
      );
    } else if (t.dataset.rotate) {
      if (
        confirm(`Rotate key for "${t.dataset.rotate}"? Apps using the old key will stop working.`)
      )
        await act(() =>
          apiSend('POST', `/api/admin/projects/${encodeURIComponent(t.dataset.rotate)}/rotate`),
        );
    } else if (t.dataset.delProject) {
      if (
        confirm(
          `Delete project "${t.dataset.delProject}"? Its records stay but the key stops working.`,
        )
      )
        await act(() =>
          apiSend('DELETE', `/api/admin/projects/${encodeURIComponent(t.dataset.delProject)}`),
        );
    } else if (t.id === 'ntAdd') {
      await act(
        () => apiSend('POST', '/api/admin/teams', { name: $('ntName').value.trim() }),
        'ntErr',
      );
    } else if (t.dataset.delTeam) {
      await act(() => apiSend('DELETE', `/api/admin/teams/${t.dataset.delTeam}`));
    } else if (t.id === 'nuAdd') {
      await act(
        () =>
          apiSend('POST', '/api/admin/users', {
            username: $('nuName').value.trim(),
            password: $('nuPass').value,
            role: $('nuRole').value,
            teamId: $('nuTeam').value,
          }),
        'nuErr',
      );
    } else if (t.dataset.delUser) {
      if (confirm('Delete this user?'))
        await act(() => apiSend('DELETE', `/api/admin/users/${t.dataset.delUser}`));
    }
  });

  $('adminPanel').addEventListener('change', async (ev) => {
    const t = ev.target;
    try {
      if (t.dataset.setProjectTeam) {
        await apiSend(
          'PATCH',
          `/api/admin/projects/${encodeURIComponent(t.dataset.setProjectTeam)}`,
          { teamId: t.value },
        );
      } else if (t.dataset.setRole) {
        await apiSend('PATCH', `/api/admin/users/${t.dataset.setRole}`, { role: t.value });
      } else if (t.dataset.setUserTeam) {
        await apiSend('PATCH', `/api/admin/users/${t.dataset.setUserTeam}`, { teamId: t.value });
      } else return;
      await renderAdmin();
    } catch (err) {
      alert(err.message);
    }
  });

  // Fallback poll every 45s in case SSE drops.
  setInterval(() => loadAll(false), 45000);

  loadAll(true);
  connectSse();
})();
