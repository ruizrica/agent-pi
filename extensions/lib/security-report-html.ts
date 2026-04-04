// ABOUTME: HTML renderer for the Security Analysis Report viewer.
// ABOUTME: Presents summary, findings, mitigations, and source data in a browser-friendly format.

export interface SecurityReportFinding {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  evidence?: string;
  recommendation?: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ScanSnapshotSummary {
  id: string;
  title: string;
  summary: string;
  scope: string;
  createdAt: string;
  severityCounts: SeverityCounts;
  totalFindings: number;
  mitigations: string[];
  findings: SecurityReportFinding[];
}

export interface TrendPoint {
  createdAt: string;
  totalFindings: number;
  severityCounts: SeverityCounts;
}

export interface ScanDelta {
  newFindings: SecurityReportFinding[];
  resolvedFindings: SecurityReportFinding[];
  unchangedCount: number;
  previousScanAt: string;
}

export interface HistoryData {
  snapshots: ScanSnapshotSummary[];
  trend: TrendPoint[];
  delta: ScanDelta | null;
}

export interface SecurityReportData {
  title: string;
  summary: string;
  generatedAt: string;
  scope?: string;
  intelligence?: string;
  inspection?: string;
  scan?: string;
  findings: SecurityReportFinding[];
  mitigations: string[];
  history?: HistoryData;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityColor(severity: SecurityReportFinding["severity"]): string {
  switch (severity) {
    case "critical": return "#ff5f56";
    case "high": return "#ff9f43";
    case "medium": return "#feca57";
    case "low": return "#54a0ff";
    default: return "#7f8c8d";
  }
}

function findingsMarkup(findings: SecurityReportFinding[]): string {
  if (!findings.length) {
    return `<div class="empty">No structured findings were recorded.</div>`;
  }
  return findings.map((finding) => `
    <section class="finding">
      <div class="finding-header">
        <span class="pill" style="background:${severityColor(finding.severity)}">${escapeHtml(finding.severity.toUpperCase())}</span>
        <h3>${escapeHtml(finding.title)}</h3>
      </div>
      <div class="meta">${escapeHtml(finding.category)}</div>
      ${finding.evidence ? `<pre>${escapeHtml(finding.evidence)}</pre>` : ""}
      ${finding.recommendation ? `<p><strong>Recommendation:</strong> ${escapeHtml(finding.recommendation)}</p>` : ""}
    </section>
  `).join("\n");
}

function listMarkup(items: string[], empty: string): string {
  if (!items.length) return `<div class="empty">${escapeHtml(empty)}</div>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function section(title: string, body: string): string {
  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

function deltaMarkup(delta: ScanDelta | null | undefined): string {
  if (!delta) return "";
  const ago = timeAgo(delta.previousScanAt);
  return `
    <section class="delta-banner">
      <div class="delta-items">
        ${delta.newFindings.length > 0 ? `<span class="delta-item delta-new">+${delta.newFindings.length} new</span>` : ""}
        ${delta.resolvedFindings.length > 0 ? `<span class="delta-item delta-resolved">&minus;${delta.resolvedFindings.length} resolved</span>` : ""}
        <span class="delta-item delta-unchanged">${delta.unchangedCount} unchanged</span>
        <span class="delta-vs">vs. scan from ${escapeHtml(ago)}</span>
      </div>
    </section>
  `;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function trendChartSvg(trend: TrendPoint[]): string {
  if (trend.length < 2) return `<div class="empty">Need at least 2 scans for trend chart.</div>`;

  const W = 1060;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(1, ...trend.map((t) => t.totalFindings));
  const severities: Array<{ key: keyof SeverityCounts; color: string; label: string }> = [
    { key: "critical", color: "#ff5f56", label: "Critical" },
    { key: "high", color: "#ff9f43", label: "High" },
    { key: "medium", color: "#feca57", label: "Medium" },
    { key: "low", color: "#54a0ff", label: "Low" },
    { key: "info", color: "#7f8c8d", label: "Info" },
  ];

  function x(i: number): number {
    return PAD.left + (i / (trend.length - 1)) * chartW;
  }
  function y(val: number): number {
    return PAD.top + chartH - (val / maxVal) * chartH;
  }

  // Grid lines
  const gridLines: string[] = [];
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((maxVal / ySteps) * i);
    const yPos = y(val);
    gridLines.push(`<line x1="${PAD.left}" y1="${yPos}" x2="${W - PAD.right}" y2="${yPos}" stroke="#1e293b" stroke-dasharray="4,4" />`);
    gridLines.push(`<text x="${PAD.left - 8}" y="${yPos + 4}" text-anchor="end" fill="#64748b" font-size="11">${val}</text>`);
  }

  // X-axis labels (smart: show date for multi-day, time for same-day)
  const xLabels: string[] = [];
  const allSameDay = trend.length > 0 && trend.every((t) => t.createdAt.slice(0, 10) === trend[0].createdAt.slice(0, 10));
  const labelStep = Math.max(1, Math.floor(trend.length / 6));
  for (let i = 0; i < trend.length; i += labelStep) {
    const d = new Date(trend[i].createdAt);
    const label = allSameDay ? d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en", { month: "short", day: "numeric" });
    xLabels.push(`<text x="${x(i)}" y="${H - 5}" text-anchor="middle" fill="#64748b" font-size="11">${escapeHtml(label)}</text>`);
  }

  // Lines per severity
  const lines: string[] = [];
  const dots: string[] = [];
  for (const sev of severities) {
    const hasData = trend.some((t) => t.severityCounts[sev.key] > 0);
    if (!hasData) continue;

    const points = trend.map((t, i) => `${x(i)},${y(t.severityCounts[sev.key])}`).join(" ");
    lines.push(`<polyline points="${points}" fill="none" stroke="${sev.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />`);

    // Data point dots (only for endpoints and every Nth point)
    const dotStep = Math.max(1, Math.floor(trend.length / 12));
    for (let i = 0; i < trend.length; i++) {
      if (i === 0 || i === trend.length - 1 || i % dotStep === 0) {
        const val = trend[i].severityCounts[sev.key];
        dots.push(`<circle cx="${x(i)}" cy="${y(val)}" r="3" fill="${sev.color}" stroke="#0f172a" stroke-width="1.5" />`);
      }
    }
  }

  // Total line (dashed)
  const totalPoints = trend.map((t, i) => `${x(i)},${y(t.totalFindings)}`).join(" ");
  lines.push(`<polyline points="${totalPoints}" fill="none" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,3" stroke-linejoin="round" opacity="0.5" />`);

  // Legend
  const legend = severities
    .filter((s) => trend.some((t) => t.severityCounts[s.key] > 0))
    .map((s, i) => `<g transform="translate(${i * 90}, 0)"><rect width="12" height="12" rx="2" fill="${s.color}" opacity="0.85" /><text x="16" y="10" fill="#94a3b8" font-size="11">${s.label}</text></g>`)
    .join("");

  return `
    <svg viewBox="0 0 ${W} ${H + 30}" width="100%" height="${H + 30}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
      <rect width="${W}" height="${H + 30}" fill="transparent" />
      ${gridLines.join("\n")}
      ${xLabels.join("\n")}
      ${lines.join("\n")}
      ${dots.join("\n")}
      <g transform="translate(${PAD.left}, ${H + 10})">${legend}</g>
    </svg>
  `;
}

function historyPanelMarkup(history: HistoryData | undefined): string {
  if (!history || !history.snapshots.length) {
    return `<div class="empty">No previous scans recorded yet. Run additional scans to see history.</div>`;
  }

  // Embed the data as JSON for client-side pagination
  const snapshotsJson = JSON.stringify(history.snapshots.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    scope: s.scope,
    createdAt: s.createdAt,
    severityCounts: s.severityCounts,
    totalFindings: s.totalFindings,
    findingsCount: s.findings?.length ?? s.totalFindings,
    mitigationsCount: s.mitigations?.length ?? 0,
  })));

  return `
    <div id="history-data" style="display:none">${escapeHtml(snapshotsJson)}</div>
    <div class="trend-section">
      <h3 style="margin:0 0 12px 0;color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Vulnerability Trend</h3>
      ${trendChartSvg(history.trend)}
    </div>
    <div class="history-controls">
      <div class="time-filters" id="timeFilters"></div>
      <div class="page-controls" id="pageControls"></div>
    </div>
    <div id="historyList" class="history-list"></div>
  `;
}

export function generateSecurityReportHTML(report: SecurityReportData): string {
  const hasHistory = !!report.history && (report.history.snapshots.length > 0 || report.history.trend.length > 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f172a;
      --panel: #111827;
      --border: #334155;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }
    body {
      margin: 0;
      padding: 24px;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      background: linear-gradient(180deg, #020617, var(--bg));
      color: var(--text);
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .hero, .panel {
      background: rgba(17, 24, 39, 0.95);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.25);
    }
    h1, h2, h3 {
      margin-top: 0;
    }
    .meta {
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #0b1020;
      margin-right: 10px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 12px;
      color: #cbd5e1;
      font-size: 13px;
      overflow: auto;
    }
    ul {
      padding-left: 20px;
    }
    .finding {
      padding: 16px 0;
      border-top: 1px solid rgba(148, 163, 184, 0.18);
    }
    .finding:first-child {
      border-top: none;
      padding-top: 0;
    }
    .finding-header {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .empty {
      color: var(--muted);
      font-style: italic;
    }
    .summary {
      line-height: 1.6;
      color: #dbeafe;
    }
    .source-block {
      min-height: 120px;
    }

    /* ── Delta Banner ── */
    .delta-banner {
      background: rgba(17, 24, 39, 0.95);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.25);
    }
    .delta-items {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .delta-item {
      display: inline-flex;
      align-items: center;
      padding: 5px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
    }
    .delta-new {
      background: rgba(255, 95, 86, 0.15);
      color: #ff5f56;
      border: 1px solid rgba(255, 95, 86, 0.3);
    }
    .delta-resolved {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .delta-unchanged {
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .delta-vs {
      color: #64748b;
      font-size: 13px;
      margin-left: auto;
    }

    /* ── Tab System ── */
    .tab-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 6px 16px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .tab-btn:hover {
      background: rgba(56, 189, 248, 0.08);
      color: var(--text);
      border-color: rgba(56, 189, 248, 0.3);
    }
    .tab-btn.active {
      background: rgba(56, 189, 248, 0.12);
      color: var(--accent);
      border-color: var(--accent);
    }
    .tab-spacer {
      flex: 1;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }

    /* ── Trend Chart ── */
    .trend-section {
      margin-bottom: 20px;
      padding: 16px;
      background: rgba(2, 6, 23, 0.5);
      border: 1px solid #1e293b;
      border-radius: 12px;
    }

    /* ── History List ── */
    .history-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .time-filters {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .time-btn {
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .time-btn:hover {
      background: rgba(56, 189, 248, 0.08);
      color: var(--text);
    }
    .time-btn.active {
      background: rgba(56, 189, 248, 0.12);
      color: var(--accent);
      border-color: var(--accent);
    }
    .time-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.15);
      color: #64748b;
      font-size: 10px;
      margin-left: 4px;
      vertical-align: 1px;
    }
    .page-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .page-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    .page-btn:hover:not(:disabled) {
      background: rgba(56, 189, 248, 0.08);
      color: var(--text);
    }
    .page-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .history-list {
      display: grid;
      gap: 8px;
    }
    .scan-card {
      background: rgba(2, 6, 23, 0.4);
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 14px 16px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .scan-card:hover {
      background: rgba(2, 6, 23, 0.7);
      border-color: var(--accent);
    }
    .scan-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .scan-card-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--text);
    }
    .scan-card-time {
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
    }
    .scan-card-stats {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .scan-mini-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      color: #0b1020;
    }
    .scan-card-details {
      display: none;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #1e293b;
      font-size: 13px;
      color: var(--muted);
      line-height: 1.5;
    }
    .scan-card-details.open {
      display: block;
    }
    .scan-detail-findings {
      margin-top: 8px;
    }
    .scan-detail-finding {
      padding: 6px 0;
      border-bottom: 1px solid rgba(30,41,59,0.5);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .scan-detail-finding:last-child {
      border-bottom: none;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>${escapeHtml(report.title)}</h1>
      <p class="summary">${escapeHtml(report.summary)}</p>
      <div class="meta">Generated: ${escapeHtml(report.generatedAt)}${report.scope ? ` &bull; Scope: ${escapeHtml(report.scope)}` : ""}${hasHistory ? ` &bull; Scan #${(report.history!.snapshots.length + 1)}` : ""}</div>
    </section>

    ${deltaMarkup(report.history?.delta)}

    <section class="panel">
      <div class="tab-bar">
        <button class="tab-btn active" onclick="switchTab('findings')">Findings <span class="time-badge">${report.findings.length}</span></button>
        <button class="tab-btn" onclick="switchTab('critical')" ${report.findings.filter((f) => f.severity === "critical").length === 0 ? "style=\"display:none\"" : ""}>Critical <span class="time-badge">${report.findings.filter((f) => f.severity === "critical").length}</span></button>
        <button class="tab-btn" onclick="switchTab('high')" ${report.findings.filter((f) => f.severity === "high").length === 0 ? "style=\"display:none\"" : ""}>High <span class="time-badge">${report.findings.filter((f) => f.severity === "high").length}</span></button>
        <button class="tab-btn" onclick="switchTab('medium')" ${report.findings.filter((f) => f.severity === "medium").length === 0 ? "style=\"display:none\"" : ""}>Medium <span class="time-badge">${report.findings.filter((f) => f.severity === "medium").length}</span></button>
        <button class="tab-btn" onclick="switchTab('low')" ${report.findings.filter((f) => f.severity === "low").length === 0 ? "style=\"display:none\"" : ""}>Low <span class="time-badge">${report.findings.filter((f) => f.severity === "low").length}</span></button>
        <button class="tab-btn" onclick="switchTab('info')" ${report.findings.filter((f) => f.severity === "info").length === 0 ? "style=\"display:none\"" : ""}>Info <span class="time-badge">${report.findings.filter((f) => f.severity === "info").length}</span></button>
        ${hasHistory ? `<span class="tab-spacer"></span><button class="tab-btn" onclick="switchTab('history')" style="border-color:rgba(56,189,248,0.3);">&#x1f4ca; History <span class="time-badge">${report.history!.snapshots.length}</span></button>` : ""}
      </div>

      <div id="tab-findings" class="tab-content active">
        ${findingsMarkup(report.findings)}
      </div>
      <div id="tab-critical" class="tab-content">
        ${findingsMarkup(report.findings.filter((f) => f.severity === "critical"))}
      </div>
      <div id="tab-high" class="tab-content">
        ${findingsMarkup(report.findings.filter((f) => f.severity === "high"))}
      </div>
      <div id="tab-medium" class="tab-content">
        ${findingsMarkup(report.findings.filter((f) => f.severity === "medium"))}
      </div>
      <div id="tab-low" class="tab-content">
        ${findingsMarkup(report.findings.filter((f) => f.severity === "low"))}
      </div>
      <div id="tab-info" class="tab-content">
        ${findingsMarkup(report.findings.filter((f) => f.severity === "info"))}
      </div>
      ${hasHistory ? `<div id="tab-history" class="tab-content">${historyPanelMarkup(report.history)}</div>` : ""}
    </section>

    <div class="grid">
      ${section("Recommended Mitigations", listMarkup(report.mitigations, "No mitigation recommendations provided."))}
      ${section("Threat Intelligence", report.intelligence ? `<pre class="source-block">${escapeHtml(report.intelligence)}</pre>` : `<div class="empty">No intelligence summary provided.</div>`)}
      ${section("Passive Inspection", report.inspection ? `<pre class="source-block">${escapeHtml(report.inspection)}</pre>` : `<div class="empty">No passive inspection summary provided.</div>`)}
      ${section("Port Analysis", report.scan ? `<pre class="source-block">${escapeHtml(report.scan)}</pre>` : `<div class="empty">No port analysis summary provided.</div>`)}
    </div>
  </main>

  <script>
    // ── Tab switching ──
    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      const panel = document.getElementById('tab-' + tabName);
      if (panel) panel.classList.add('active');
      // Find the button that triggered this
      document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('onclick') === "switchTab('" + tabName + "')") {
          btn.classList.add('active');
        }
      });
      // Initialize history pagination when switching to history tab
      if (tabName === 'history' && !window._historyInitialized) {
        initHistory();
        window._historyInitialized = true;
      }
    }

    // ── History: Smart Pagination ──
    const PER_PAGE = 20;
    let historyData = [];
    let currentFilter = 'all';
    let currentPage = 0;

    function initHistory() {
      const dataEl = document.getElementById('history-data');
      if (!dataEl) return;
      try {
        historyData = JSON.parse(dataEl.textContent || '[]');
      } catch(e) {
        historyData = [];
      }
      renderTimeFilters();
      renderPage();
    }

    function getFilteredData() {
      const now = Date.now();
      const DAY = 86400000;
      return historyData.filter(s => {
        const t = new Date(s.createdAt).getTime();
        switch(currentFilter) {
          case 'today': return (now - t) < DAY;
          case 'week': return (now - t) < 7 * DAY;
          case 'month': return (now - t) < 30 * DAY;
          default: return true;
        }
      });
    }

    function countByFilter(filter) {
      const now = Date.now();
      const DAY = 86400000;
      return historyData.filter(s => {
        const t = new Date(s.createdAt).getTime();
        switch(filter) {
          case 'today': return (now - t) < DAY;
          case 'week': return (now - t) < 7 * DAY;
          case 'month': return (now - t) < 30 * DAY;
          default: return true;
        }
      }).length;
    }

    function renderTimeFilters() {
      const el = document.getElementById('timeFilters');
      if (!el) return;
      const filters = [
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'all', label: 'All Time' },
      ];
      // Auto-select: if > 100 scans default to month, if > 1000 to week
      if (historyData.length > 1000 && currentFilter === 'all') {
        currentFilter = 'month';
      } else if (historyData.length > 100 && currentFilter === 'all') {
        // keep all but it's fine
      }
      el.innerHTML = filters.map(f =>
        '<button class="time-btn' + (currentFilter === f.key ? ' active' : '') +
        '" onclick="setFilter(\'' + f.key + '\')">' + f.label +
        ' <span class="time-badge">' + countByFilter(f.key) + '</span></button>'
      ).join('');
    }

    function setFilter(filter) {
      currentFilter = filter;
      currentPage = 0;
      renderTimeFilters();
      renderPage();
    }

    function renderPage() {
      const filtered = getFilteredData();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      const start = currentPage * PER_PAGE;
      const pageItems = filtered.slice(start, start + PER_PAGE);

      // Page controls
      const pcEl = document.getElementById('pageControls');
      if (pcEl) {
        if (filtered.length > PER_PAGE) {
          pcEl.innerHTML =
            '<button class="page-btn" onclick="prevPage()"' + (currentPage <= 0 ? ' disabled' : '') + '>&laquo; Prev</button>' +
            '<span>' + (currentPage + 1) + ' / ' + totalPages + '</span>' +
            '<button class="page-btn" onclick="nextPage()"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>Next &raquo;</button>';
        } else {
          pcEl.innerHTML = '<span>' + filtered.length + ' scan' + (filtered.length !== 1 ? 's' : '') + '</span>';
        }
      }

      // Render scan cards
      const listEl = document.getElementById('historyList');
      if (!listEl) return;
      if (!pageItems.length) {
        listEl.innerHTML = '<div class="empty">No scans in this time range.</div>';
        return;
      }

      const severityColors = { critical: '#ff5f56', high: '#ff9f43', medium: '#feca57', low: '#54a0ff', info: '#7f8c8d' };

      listEl.innerHTML = pageItems.map((scan, idx) => {
        const pills = Object.entries(scan.severityCounts || {})
          .filter(([, count]) => count > 0)
          .map(([sev, count]) => '<span class="scan-mini-pill" style="background:' + (severityColors[sev] || '#7f8c8d') + '">' + count + ' ' + sev + '</span>')
          .join('');

        const time = formatTime(scan.createdAt);
        const cardId = 'scan-detail-' + (start + idx);

        return '<div class="scan-card" onclick="toggleScanDetail(\'' + cardId + '\')">' +
          '<div class="scan-card-header">' +
            '<span class="scan-card-title">' + escapeText(scan.title) + '</span>' +
            '<span class="scan-card-time">' + time + '</span>' +
          '</div>' +
          '<div class="scan-card-stats">' +
            '<span style="font-size:12px;color:#94a3b8;">' + scan.totalFindings + ' findings</span>' +
            pills +
          '</div>' +
          '<div class="scan-card-details" id="' + cardId + '">' +
            '<div><strong>Summary:</strong> ' + escapeText(scan.summary || 'No summary') + '</div>' +
            (scan.scope ? '<div><strong>Scope:</strong> ' + escapeText(scan.scope) + '</div>' : '') +
            '<div style="margin-top:4px;"><strong>Mitigations:</strong> ' + (scan.mitigationsCount || 0) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function toggleScanDetail(id) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('open');
    }

    function prevPage() {
      if (currentPage > 0) { currentPage--; renderPage(); }
    }
    function nextPage() {
      const filtered = getFilteredData();
      const totalPages = Math.ceil(filtered.length / PER_PAGE);
      if (currentPage < totalPages - 1) { currentPage++; renderPage(); }
    }

    function formatTime(iso) {
      const d = new Date(iso);
      const now = Date.now();
      const diff = now - d.getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
    }

    function escapeText(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}
