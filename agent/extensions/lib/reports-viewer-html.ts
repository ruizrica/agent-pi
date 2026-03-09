// ABOUTME: Self-contained HTML template for the persisted /reports browser view.
// ABOUTME: Provides search-first landing page, recent category sections, and full-screen table views opening reports in new tabs.

import type { PersistedReportEntry } from "./report-index.ts";

function escapeForScript(str: string): string {
	return str.replace(/<\/(script|style)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

export function generateReportsViewerHTML(opts: {
	title: string;
	port: number;
	entries: PersistedReportEntry[];
}): string {
	const { title, port, entries } = opts;
	const escaped = escapeForScript(JSON.stringify(entries));

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
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
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
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
    z-index: 100;
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
  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .header-logo {
    height: 20px;
    width: auto;
    image-rendering: pixelated;
    opacity: 0.6;
    flex-shrink: 0;
  }
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
  .hero h1 {
    font-size: 20px;
    color: var(--accent);
    margin-bottom: 8px;
    font-weight: 600;
    line-height: 1.3;
  }
  .hero p {
    margin-bottom: 16px;
    color: var(--text-muted);
    font-size: 14px;
  }
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

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .view-toggle {
    display: flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    flex-wrap: wrap;
  }
  .chip {
    padding: 5px 16px;
    font-size: 11px;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: transparent;
    color: var(--text-dim);
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover { color: var(--text-muted); }
  .chip.active {
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 600;
  }

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
    min-width: 120px;
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

  .sections, .table-view {
    max-width: 980px;
    margin: 0 auto;
  }
  .section {
    margin-bottom: 16px;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 13px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    font-weight: 700;
    flex: 1;
  }
  .section-sub {
    font-size: 11px;
    color: var(--text-dim);
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .btn {
    padding: 7px 18px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--text-muted);
    transition: all 0.15s;
    font-family: var(--font);
  }
  .btn:hover { background: var(--border); color: var(--text); }
  .btn-primary {
    background: transparent;
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }
  .btn-primary:hover { background: var(--accent-dim); color: var(--accent-hover); }
  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-dim);
    font-size: 12px;
  }
  .btn-ghost:hover { color: var(--text-muted); background: var(--surface2); }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 8px;
  }
  .report-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
  }
  .report-card:hover { border-color: var(--text-dim); background: var(--surface2); }
  .report-card h3 {
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--text);
    font-weight: 600;
    line-height: 1.4;
  }
  .report-card p {
    margin-bottom: 12px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }
  .meta {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-dim);
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .meta .open { color: var(--accent); }

  .empty {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px;
    color: var(--text-dim);
    font-family: var(--mono);
    font-size: 12px;
  }

  .table-view { display: none; }
  .table-view.active { display: block; }
  .table-shell {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
    font-size: 13px;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 10px 14px;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
    overflow-wrap: anywhere;
    hyphens: auto;
  }
  th {
    background: var(--surface);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
  }
  td {
    color: var(--text-muted);
  }
  tr[data-clickable="true"] { cursor: pointer; }
  tr[data-clickable="true"]:hover { background: var(--surface2); }
  .row-title {
    color: var(--text);
    font-weight: 600;
    margin-bottom: 6px;
  }
  .pill {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    font-family: var(--mono);
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 1px solid var(--border);
  }
  .pill.plan { color: var(--accent); border-color: var(--accent); }
  .pill.questions { color: var(--success); border-color: var(--success); }
  .pill.spec { color: var(--warning); border-color: var(--warning); }
  .pill.completion { color: #d291ff; border-color: #d291ff; }
  .open-cell {
    font-family: var(--mono);
    color: var(--accent);
    white-space: nowrap;
  }
  .table-shell {
    overflow-x: auto;
  }

  @media (max-width: 700px) {
    .content { padding: 12px 12px 32px; }
    .header { margin: 8px 8px 0; padding: 10px 12px; }
    .hero { padding: 14px; }
    .stats { flex-direction: column; gap: 8px; }
    .cards { grid-template-columns: 1fr; }
    .section-header { flex-wrap: wrap; }
    th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { display: none; }
  }
</style>
</head>
<body>
<div class="header">
  <span class="badge">REPORTS</span>
  <span class="title">${title}</span>
  <img src="/logo.png" alt="agent" class="header-logo">
</div>

<div class="content">
  <div id="homeView">
    <section class="hero">
      <h1>Reports Index</h1>
      <p>Search persisted plans, clarifying questions, specs, and completion reports.</p>
      <div class="search-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
        <input id="searchInput" type="text" placeholder="Search reports..." />
      </div>
      <div class="chips"><div class="view-toggle" id="chips"></div></div>
    </section>

    <section class="stats" id="stats"></section>
    <section class="sections" id="sections"></section>
  </div>

  <div class="table-view" id="tableView">
    <div class="section-header" style="margin-bottom:12px;">
      <button class="btn btn-ghost" onclick="showHome()">Back</button>
      <div class="section-title" id="tableTitle"></div>
      <div class="section-sub" id="tableCount"></div>
    </div>
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Summary</th>
            <th>Source</th>
            <th>Updated</th>
            <th>Open</th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
(function() {
  const PORT = ${port};
  const entries = ${escaped};
  const categories = ["plan", "questions", "spec", "completion"];
  const labels = {
    plan: "Plans",
    questions: "Clarifying Questions",
    spec: "Specs",
    completion: "Completion Reports"
  };
  let query = "";
  let activeCategory = "all";

  function fmtDate(value) {
    try { return new Date(value).toLocaleString(); } catch { return value || ""; }
  }
  function escapeHtml(str) {
    return String(str || "").replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function matches(entry) {
    const text = (entry.searchText || "").toLowerCase();
    const q = query.trim().toLowerCase();
    return (!q || text.includes(q)) && (activeCategory === 'all' || entry.category === activeCategory);
  }
  function filtered() { return entries.filter(matches); }
  function byCategory(category) { return filtered().filter((e) => e.category === category); }
  function openEntry(entry) {
    fetch('http://127.0.0.1:' + PORT + '/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id })
    }).catch(function() {});
  }

  setInterval(function() {
    fetch('http://127.0.0.1:' + PORT + '/heartbeat', { method: 'POST' }).catch(function(){});
  }, 5000);

  window.showHome = function() {
    document.getElementById('homeView').style.display = 'block';
    document.getElementById('tableView').classList.remove('active');
  };

  window.showCategory = function(category) {
    const rows = byCategory(category);
    document.getElementById('homeView').style.display = 'none';
    document.getElementById('tableView').classList.add('active');
    document.getElementById('tableTitle').textContent = labels[category];
    document.getElementById('tableCount').textContent = rows.length + ' result' + (rows.length === 1 ? '' : 's');
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = rows.length ? rows.map((entry) =>
      '<tr data-clickable="true" onclick="openFromTable(\\'' + entry.id + '\\')">' +
        '<td><div class="row-title">' + escapeHtml(entry.title) + '</div><span class="pill ' + entry.category + '">' + escapeHtml(entry.category) + '</span></td>' +
        '<td>' + escapeHtml(entry.summary || '—') + '</td>' +
        '<td>' + escapeHtml(entry.sourceLabel || entry.viewerLabel || 'Viewer') + '</td>' +
        '<td>' + escapeHtml(fmtDate(entry.updatedAt)) + '</td>' +
        '<td class="open-cell">Open ↗</td>' +
      '</tr>'
    ).join('') : '<tr><td colspan="5"><div class="empty">No reports match this filter.</div></td></tr>';
  };

  window.openFromTable = function(id) {
    const entry = entries.find((e) => e.id === id);
    if (entry) openEntry(entry);
  };

  window.setCategory = function(cat) {
    activeCategory = cat;
    renderAll();
  };

  function renderChips() {
    const wrap = document.getElementById('chips');
    const all = ['all'].concat(categories);
    wrap.innerHTML = all.map((cat) =>
      '<button class="chip ' + (activeCategory === cat ? 'active' : '') + '" onclick="setCategory(\\'' + cat + '\\')">' +
      (cat === 'all' ? 'All Reports' : labels[cat]) +
      '</button>'
    ).join('');
  }

  function renderStats() {
    const total = filtered().length;
    const stats = document.getElementById('stats');
    const counts = Object.fromEntries(categories.map((c) => [c, byCategory(c).length]));
    stats.innerHTML = [
      ['Visible Reports', total],
      ['Plans', counts.plan],
      ['Questions', counts.questions],
      ['Specs', counts.spec],
      ['Completion', counts.completion],
    ].map(([label, value]) =>
      '<div class="stat-card"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>'
    ).join('');
  }

  function renderSections() {
    const sections = document.getElementById('sections');
    sections.innerHTML = categories.map((category) => {
      const rows = byCategory(category);
      const recent = rows.slice(0, 5);
      return '<div class="section">' +
        '<div class="section-header">' +
          '<div class="section-title">' + labels[category] + '</div>' +
          '<div class="section-sub">Most recent ' + Math.min(5, rows.length) + ' of ' + rows.length + '</div>' +
          '<button class="btn btn-ghost" onclick="showCategory(\\'' + category + '\\')">Table View</button>' +
        '</div>' +
        (recent.length ?
          '<div class="cards">' + recent.map((entry) =>
            '<div class="report-card" onclick="openFromTable(\\'' + entry.id + '\\')">' +
              '<h3>' + escapeHtml(entry.title) + '</h3>' +
              '<p>' + escapeHtml(entry.summary || 'No summary available.') + '</p>' +
              '<div class="meta"><span>' + escapeHtml(fmtDate(entry.updatedAt)) + '</span><span>' + escapeHtml(entry.sourceLabel || entry.viewerLabel || 'Viewer') + '</span><span class="open">Open ↗</span></div>' +
            '</div>'
          ).join('') + '</div>'
          : '<div class="empty">No reports in this section yet.</div>') +
      '</div>';
    }).join('');
  }

  function renderAll() {
    renderChips();
    renderStats();
    renderSections();
  }

  document.getElementById('searchInput').addEventListener('input', function(e) {
    query = e.target.value || '';
    renderAll();
    showHome();
  });

  renderAll();
})();
<\/script>
</body>
</html>`;
}
