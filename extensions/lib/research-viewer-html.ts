// ABOUTME: Self-contained HTML template for the research sessions browser view.
// ABOUTME: Card-based layout with search, status filters, detail view, and resume command copy.

import type { ResearchSession, ResearchSessionSummary } from "./research-session.ts";
import { VIEWER_SCROLLBAR_STYLES } from "./viewer-scrollbar-styles.ts";

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeForScript(str: string): string {
	return str.replace(/<\/(script|style)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

export function generateResearchViewerHTML(opts: {
	title: string;
	port: number;
	sessions: ResearchSessionSummary[];
}): string {
	const { title, port, sessions } = opts;
	const escaped = escapeForScript(JSON.stringify(sessions));

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #1a1d23;
    --surface: #1e2228;
    --surface2: #252a32;
    --border: #2e343e;
    --text: #e2e8f0;
    --text-muted: #8892a0;
    --text-dim: #555d6e;
    --accent: #2980b9;
    --accent-hover: #3a9ad5;
    --accent-dim: rgba(41, 128, 185, 0.12);
    --success: #48d889;
    --success-bg: rgba(72, 216, 137, 0.08);
    --warning: #f0b429;
    --warning-bg: rgba(240, 180, 41, 0.08);
    --error: #e85858;
    --purple: #a78bfa;
    --purple-bg: rgba(167, 139, 250, 0.08);
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

${VIEWER_SCROLLBAR_STYLES}
  html { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 15px;
    line-height: 1.65;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    margin: 12px 16px 0;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }
  .badge {
    background: transparent;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--mono);
  }
  .title { font-size: 15px; font-weight: 600; color: var(--text); flex: 1; }
  .header-logo { height: 20px; width: auto; image-rendering: pixelated; opacity: 0.6; flex-shrink: 0; }

  .content {
    flex: 1;
    width: 100%;
    padding: 12px 24px 100px;
    overflow: auto;
  }

  .hero {
    max-width: 980px;
    margin: 18px auto 24px;
    padding: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .hero h1 { font-size: 20px; color: var(--accent); margin-bottom: 8px; font-weight: 600; }
  .hero p { margin-bottom: 16px; color: var(--text-muted); font-size: 14px; }

  .search-wrap {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .search-wrap input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 14px;
    font-family: var(--font);
  }
  .search-wrap svg { color: var(--text-dim); flex-shrink: 0; }

  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .chip {
    padding: 5px 16px;
    font-size: 11px;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--surface);
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover { color: var(--text-muted); }
  .chip.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; border-color: var(--accent); }

  .stats {
    max-width: 980px;
    margin: 0 auto 16px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 20px;
    flex: 1;
    min-width: 100px;
    text-align: center;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    line-height: 1;
    margin-bottom: 4px;
    color: var(--accent);
  }
  .stat-label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--mono);
  }

  /* Session cards */
  .sessions { max-width: 980px; margin: 0 auto; }
  .session-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 18px 22px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .session-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .session-card .card-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .status-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    color: #fff;
  }
  .status-understanding { background: var(--purple); }
  .status-planning { background: #60a5fa; }
  .status-researching { background: var(--accent); }
  .status-implementing { background: var(--warning); color: #1a1d23; }
  .status-complete { background: var(--success); color: #1a1d23; }
  .status-paused { background: var(--text-dim); }

  .card-goal { font-size: 15px; font-weight: 600; color: var(--text); flex: 1; }
  .card-date { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }

  .card-metrics {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .card-metric {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-muted);
  }
  .card-metric span { color: var(--accent); font-weight: 600; }
  .card-metric .delta-positive { color: var(--success); }
  .card-metric .delta-negative { color: var(--error); }

  .card-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tag {
    font-size: 10px;
    padding: 1px 8px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-dim);
    font-family: var(--mono);
    text-transform: uppercase;
  }

  /* Detail view */
  .detail-view { display: none; max-width: 980px; margin: 0 auto; }
  .detail-view.active { display: block; }
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    border-radius: 4px;
    margin-bottom: 16px;
    transition: all 0.15s;
  }
  .back-btn:hover { background: var(--surface2); color: var(--text); }

  .detail-header {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 22px;
    margin-bottom: 16px;
  }
  .detail-header h2 { font-size: 18px; color: var(--text); margin-bottom: 8px; }
  .detail-header .detail-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }

  .detail-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 18px 22px;
    margin-bottom: 12px;
  }
  .detail-section h3 {
    font-size: 13px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    font-weight: 700;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .detail-section pre {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
  }

  .iter-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: var(--mono);
  }
  .iter-table th {
    text-align: left;
    padding: 8px 12px;
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border);
  }
  .iter-table td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
  }
  .iter-table tr:hover td { background: var(--surface2); }
  .iter-keep { color: var(--success) !important; }
  .iter-discard { color: var(--error) !important; }
  .iter-crash { color: var(--warning) !important; }
  .iter-baseline { color: var(--accent) !important; }

  .next-steps-list { list-style: none; }
  .next-steps-list li {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .next-steps-list li:last-child { border-bottom: none; }
  .step-priority {
    font-size: 11px;
    font-family: var(--mono);
    font-weight: 700;
    color: var(--accent);
    min-width: 24px;
  }
  .step-status {
    font-size: 10px;
    font-family: var(--mono);
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }
  .step-pending { background: var(--surface2); color: var(--text-dim); }
  .step-implementing { background: var(--warning-bg); color: var(--warning); }
  .step-done { background: var(--success-bg); color: var(--success); }
  .step-skipped { background: var(--surface2); color: var(--text-dim); text-decoration: line-through; }

  .resume-box {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 18px;
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .resume-box code {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--accent);
    flex: 1;
  }
  .copy-btn {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    border-radius: 4px;
    transition: all 0.15s;
    font-family: var(--mono);
  }
  .copy-btn:hover { background: var(--accent-dim); }

  /* ── Inline SVG Icons ────────────────── */
  .icon-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    vertical-align: -2px;
    flex-shrink: 0;
  }
  .icon-inline svg {
    width: 100%;
    height: 100%;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-dim);
    font-size: 14px;
  }
  .empty-state h2 { color: var(--text-muted); font-size: 18px; margin-bottom: 8px; }
</style>
</head>
<body>
  <div class="header">
    <img class="header-logo" src="/logo.png" alt="" onerror="this.style.display='none'">
    <span class="badge">Research</span>
    <span class="title">${escapeHtml(title)}</span>
  </div>
  <div class="content">
    <div id="list-view">
      <div class="hero">
        <h1>Research Sessions</h1>
        <p>Browse, search, and resume autoresearch sessions. Each session tracks the full lifecycle from goal through implementation.</p>
        <div class="search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" id="search" placeholder="Search by goal, metric, tags..." autocomplete="off">
        </div>
        <div class="filters" id="filters"></div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="sessions" id="sessions"></div>
    </div>
    <div class="detail-view" id="detail-view"></div>
  </div>

<script>
const PORT = ${port};
const sessions = JSON.parse('${escaped}');
let activeFilter = 'all';
let searchQuery = '';
let detailSession = null;

// Heartbeat
setInterval(() => fetch('/heartbeat', { method: 'POST' }).catch(() => {}), 5000);

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function statusClass(status) {
  return 'status-' + (status || 'paused');
}

function statusLabel(status) {
  const labels = { understanding: 'Understanding', planning: 'Planning', researching: 'Researching', implementing: 'Implementing', complete: 'Complete', paused: 'Paused' };
  return labels[status] || status || 'Unknown';
}

function renderStats() {
  const total = sessions.length;
  const active = sessions.filter(s => ['researching', 'implementing', 'understanding', 'planning'].includes(s.status)).length;
  const complete = sessions.filter(s => s.status === 'complete').length;
  const paused = sessions.filter(s => s.status === 'paused').length;
  const totalIterations = sessions.reduce((sum, s) => sum + (s.iterationCount || 0), 0);

  document.getElementById('stats').innerHTML = [
    { value: total, label: 'Sessions' },
    { value: active, label: 'Active' },
    { value: complete, label: 'Complete' },
    { value: paused, label: 'Paused' },
    { value: totalIterations, label: 'Iterations' },
  ].map(s => '<div class="stat-card"><div class="stat-value">' + s.value + '</div><div class="stat-label">' + s.label + '</div></div>').join('');
}

function renderFilters() {
  const statuses = ['all', 'researching', 'implementing', 'complete', 'paused'];
  const counts = {};
  statuses.forEach(s => { counts[s] = s === 'all' ? sessions.length : sessions.filter(x => x.status === s).length; });
  document.getElementById('filters').innerHTML = statuses.map(s =>
    '<button class="chip' + (activeFilter === s ? ' active' : '') + '" data-filter="' + s + '">' +
    (s === 'all' ? 'All' : statusLabel(s)) + ' (' + counts[s] + ')</button>'
  ).join('');
}

function getFiltered() {
  let filtered = sessions;
  if (activeFilter !== 'all') filtered = filtered.filter(s => s.status === activeFilter);
  if (searchQuery) {
    const terms = searchQuery.toLowerCase().split(/\\s+/);
    filtered = filtered.filter(s => {
      const text = [s.goal, s.metricName, s.status, ...(s.tags || [])].join(' ').toLowerCase();
      return terms.every(t => text.includes(t));
    });
  }
  return filtered;
}

function renderSessions() {
  const filtered = getFiltered();
  if (filtered.length === 0) {
    document.getElementById('sessions').innerHTML = '<div class="empty-state"><h2>No sessions found</h2><p>Try adjusting your search or filter.</p></div>';
    return;
  }
  document.getElementById('sessions').innerHTML = filtered.map(s => {
    const delta = s.final != null && s.baseline != null ? (s.final - s.baseline) : null;
    const deltaStr = delta != null ? (delta >= 0 ? '+' + delta.toFixed(2) : delta.toFixed(2)) : '';
    const deltaClass = delta != null ? (delta >= 0 === (s.metricDirection === 'higher') ? 'delta-positive' : 'delta-negative') : '';

    return '<div class="session-card" data-id="' + s.id + '">' +
      '<div class="card-top">' +
        '<span class="status-badge ' + statusClass(s.status) + '">' + statusLabel(s.status) + '</span>' +
        '<span class="card-goal">' + escapeHtmlJS(s.goal) + '</span>' +
        '<span class="card-date">' + formatDate(s.updatedAt) + '</span>' +
      '</div>' +
      '<div class="card-metrics">' +
        (s.metricName ? '<span class="card-metric">' + escapeHtmlJS(s.metricName) + ': ' + (s.baseline != null ? '<span>' + s.baseline + '</span>' : '-') + (s.final != null ? ' <span class="icon-inline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span> <span>' + s.final + '</span>' : '') + (deltaStr ? ' (<span class="' + deltaClass + '">' + deltaStr + '</span>)' : '') + '</span>' : '') +
        '<span class="card-metric">Iterations: <span>' + (s.iterationCount || 0) + '</span> (' + (s.keepCount || 0) + ' keeps, ' + (s.discardCount || 0) + ' discards)</span>' +
        (s.nextStepCount > 0 ? '<span class="card-metric">Next steps: <span>' + s.nextStepsDone + '/' + s.nextStepCount + '</span></span>' : '') +
      '</div>' +
      (s.tags && s.tags.length > 0 ? '<div class="card-tags">' + s.tags.map(t => '<span class="tag">' + escapeHtmlJS(t) + '</span>').join('') + '</div>' : '') +
    '</div>';
  }).join('');
}

function escapeHtmlJS(str) {
  const el = document.createElement('span');
  el.textContent = str || '';
  return el.innerHTML;
}

async function showDetail(id) {
  try {
    const res = await fetch('/api/sessions/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Failed to load session');
    const session = await res.json();
    detailSession = session;
    renderDetail(session);
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('detail-view').classList.add('active');
  } catch (err) {
    console.error(err);
  }
}

function hideDetail() {
  detailSession = null;
  document.getElementById('detail-view').classList.remove('active');
  document.getElementById('list-view').style.display = '';
}

function renderDetail(s) {
  const delta = s.metric.final != null && s.metric.baseline != null ? (s.metric.final - s.metric.baseline) : null;
  const deltaStr = delta != null ? (delta >= 0 ? '+' + delta.toFixed(2) : delta.toFixed(2)) : '';
  const keeps = (s.iterations || []).filter(i => i.status === 'keep').length;
  const discards = (s.iterations || []).filter(i => i.status === 'discard').length;
  const crashes = (s.iterations || []).filter(i => i.status === 'crash').length;

  let html = '<button class="back-btn" onclick="hideDetail()"><span class="icon-inline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></span> Back to sessions</button>';

  // Header
  html += '<div class="detail-header">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
    '<span class="status-badge ' + statusClass(s.status) + '">' + statusLabel(s.status) + '</span>' +
    '</div>' +
    '<h2>' + escapeHtmlJS(s.goal) + '</h2>' +
    '<div class="detail-meta">' +
    '<span class="card-metric">Metric: <span>' + escapeHtmlJS(s.metric.name || 'Not set') + '</span></span>' +
    (s.metric.baseline != null ? '<span class="card-metric">Baseline: <span>' + s.metric.baseline + '</span></span>' : '') +
    (s.metric.final != null ? '<span class="card-metric">Final: <span>' + s.metric.final + '</span></span>' : '') +
    (deltaStr ? '<span class="card-metric">Delta: <span>' + deltaStr + '</span></span>' : '') +
    '<span class="card-metric">Iterations: <span>' + (s.iterations || []).length + '</span> (' + keeps + ' keeps, ' + discards + ' discards, ' + crashes + ' crashes)</span>' +
    '<span class="card-metric">Created: <span>' + formatDate(s.createdAt) + '</span></span>' +
    '<span class="card-metric">Updated: <span>' + formatDate(s.updatedAt) + '</span></span>' +
    '</div></div>';

  // Clarifying Q&A
  if (s.clarifyingQA && s.clarifyingQA.length > 0) {
    html += '<div class="detail-section"><h3>Clarifying Questions</h3>';
    s.clarifyingQA.forEach(qa => {
      html += '<div style="margin-bottom:12px"><div style="color:var(--accent);font-weight:600;font-size:13px;margin-bottom:4px">Q: ' + escapeHtmlJS(qa.question) + '</div>' +
        '<div style="color:var(--text-muted);font-size:13px;padding-left:16px">A: ' + escapeHtmlJS(qa.answer) + '</div></div>';
    });
    html += '</div>';
  }

  // Plan
  if (s.plan) {
    html += '<div class="detail-section"><h3>Research Plan</h3><pre>' + escapeHtmlJS(s.plan) + '</pre></div>';
  }

  // Scope
  if (s.scope && (s.scope.inScope.length > 0 || s.scope.readOnly.length > 0)) {
    html += '<div class="detail-section"><h3>Scope</h3>' +
      (s.scope.inScope.length > 0 ? '<div style="margin-bottom:8px"><span style="color:var(--success);font-size:12px;font-family:var(--mono)">IN SCOPE:</span> <span style="color:var(--text-muted);font-size:13px">' + s.scope.inScope.map(escapeHtmlJS).join(', ') + '</span></div>' : '') +
      (s.scope.readOnly.length > 0 ? '<div style="margin-bottom:8px"><span style="color:var(--warning);font-size:12px;font-family:var(--mono)">READ ONLY:</span> <span style="color:var(--text-muted);font-size:13px">' + s.scope.readOnly.map(escapeHtmlJS).join(', ') + '</span></div>' : '') +
      (s.scope.outOfScope.length > 0 ? '<div><span style="color:var(--error);font-size:12px;font-family:var(--mono)">OUT OF SCOPE:</span> <span style="color:var(--text-muted);font-size:13px">' + s.scope.outOfScope.map(escapeHtmlJS).join(', ') + '</span></div>' : '') +
    '</div>';
  }

  // Iterations
  if (s.iterations && s.iterations.length > 0) {
    html += '<div class="detail-section"><h3>Iterations (' + s.iterations.length + ')</h3>' +
      '<table class="iter-table"><thead><tr><th>#</th><th>Status</th><th>Metric</th><th>Delta</th><th>Commit</th><th>Description</th></tr></thead><tbody>';
    s.iterations.forEach(it => {
      const cls = it.status === 'keep' ? 'iter-keep' : it.status === 'discard' ? 'iter-discard' : it.status === 'crash' ? 'iter-crash' : 'iter-baseline';
      html += '<tr><td>' + it.iteration + '</td><td class="' + cls + '">' + (it.status || '').toUpperCase() + '</td><td>' + (it.metric != null ? it.metric : '-') + '</td><td>' + (it.delta != null ? (it.delta >= 0 ? '+' : '') + it.delta.toFixed(3) : '-') + '</td><td style="color:var(--text-dim)">' + (it.commit || '-').slice(0, 7) + '</td><td>' + escapeHtmlJS(it.description) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // Findings
  if (s.findings) {
    html += '<div class="detail-section"><h3>Findings</h3><pre>' + escapeHtmlJS(s.findings) + '</pre></div>';
  }

  // Next Steps
  if (s.nextSteps && s.nextSteps.length > 0) {
    html += '<div class="detail-section"><h3>Next Steps</h3><ul class="next-steps-list">';
    s.nextSteps.forEach(step => {
      const statusCls = 'step-' + (step.status || 'pending');
      html += '<li><span class="step-priority">#' + step.priority + '</span>' +
        '<span class="step-status ' + statusCls + '">' + (step.status || 'pending') + '</span>' +
        '<span style="flex:1">' + escapeHtmlJS(step.description) + '</span></li>';
    });
    html += '</ul></div>';
  }

  // Implementation
  if (s.implementation && (s.implementation.startedAt || s.implementation.summary)) {
    html += '<div class="detail-section"><h3>Implementation</h3>';
    if (s.implementation.startedAt) html += '<div class="card-metric" style="margin-bottom:8px">Started: <span>' + formatDate(s.implementation.startedAt) + '</span></div>';
    if (s.implementation.completedAt) html += '<div class="card-metric" style="margin-bottom:8px">Completed: <span>' + formatDate(s.implementation.completedAt) + '</span></div>';
    if (s.implementation.teamUsed) html += '<div class="card-metric" style="margin-bottom:8px">Team: <span>' + escapeHtmlJS(s.implementation.teamUsed) + '</span></div>';
    if (s.implementation.tasksCreated) html += '<div class="card-metric" style="margin-bottom:8px">Tasks: <span>' + s.implementation.tasksCreated + '</span></div>';
    if (s.implementation.summary) html += '<pre style="margin-top:8px">' + escapeHtmlJS(s.implementation.summary) + '</pre>';
    html += '</div>';
  }

  // Resume command
  if (s.status !== 'complete') {
    const cmd = '/autoresearch --resume ' + s.id;
    html += '<div class="resume-box"><code>' + escapeHtmlJS(cmd) + '</code>' +
      '<button class="copy-btn" onclick="navigator.clipboard.writeText(\\'' + cmd.replace(/'/g, "\\\\'") + '\\');this.textContent=\\'Copied!\\';setTimeout(()=>this.textContent=\\'Copy\\',2000)">Copy</button></div>';
  }

  document.getElementById('detail-view').innerHTML = html;
}

// Event listeners
document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderSessions();
});

document.getElementById('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  renderFilters();
  renderSessions();
});

document.getElementById('sessions').addEventListener('click', (e) => {
  const card = e.target.closest('.session-card');
  if (!card) return;
  showDetail(card.dataset.id);
});

// Initial render
renderStats();
renderFilters();
renderSessions();

// Focus search
document.getElementById('search').focus();
</script>
</body>
</html>`;
}
