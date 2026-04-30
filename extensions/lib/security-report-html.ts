// ABOUTME: HTML renderer for the Security Analysis Report viewer using the Mako/Plan Viewer design system.
// ABOUTME: Presents summary, findings, mitigations, and source data with consistent Pi viewer styling and dismiss support.

import { VIEWER_SCROLLBAR_STYLES } from "./viewer-scrollbar-styles.ts";

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

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityBorderColor(severity: SecurityReportFinding["severity"]): string {
  switch (severity) {
    case "critical": return "var(--error)";
    case "high": return "var(--high)";
    case "medium": return "var(--warning)";
    case "low": return "var(--accent)";
    default: return "var(--text-dim)";
  }
}

function severityDotColor(severity: SecurityReportFinding["severity"]): string {
  switch (severity) {
    case "critical": return "var(--error)";
    case "high": return "var(--high)";
    case "medium": return "var(--warning)";
    case "low": return "var(--accent)";
    default: return "var(--text-dim)";
  }
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

// ── SVG Icons (matching plan viewer / Mako style) ────────────────────

const SVG = {
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  bot: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
};

// ── Content Generators ───────────────────────────────────────────────

function findingsMarkup(findings: SecurityReportFinding[]): string {
  if (!findings.length) {
    return `<div class="empty-state">No structured findings were recorded.</div>`;
  }
  return findings.map((f) => `
    <div class="finding-card" style="border-left-color:${severityBorderColor(f.severity)}">
      <div class="finding-header">
        <span class="severity-badge" style="background:${severityDotColor(f.severity)}">${escapeHtml(f.severity.toUpperCase())}</span>
        <h4>${escapeHtml(f.title)}</h4>
      </div>
      <div class="finding-meta">${escapeHtml(f.category)}</div>
      ${f.evidence ? `<pre class="finding-evidence"><code>${escapeHtml(f.evidence)}</code></pre>` : ""}
      ${f.recommendation ? `<p class="finding-rec"><strong>Recommendation:</strong> ${escapeHtml(f.recommendation)}</p>` : ""}
    </div>
  `).join("\n");
}

function listMarkup(items: string[], empty: string): string {
  if (!items.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<ul class="mitigation-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function sourceSection(title: string, content: string | undefined, emptyMsg: string): string {
  if (!content) return `
    <div class="source-panel">
      <h3>${escapeHtml(title)}</h3>
      <div class="empty-state">${escapeHtml(emptyMsg)}</div>
    </div>`;
  return `
    <div class="source-panel">
      <h3>${escapeHtml(title)}</h3>
      <pre class="source-block"><code>${escapeHtml(content)}</code></pre>
    </div>`;
}

function deltaMarkup(delta: ScanDelta | null | undefined): string {
  if (!delta) return "";
  const ago = timeAgo(delta.previousScanAt);
  return `
    <div class="delta-banner">
      ${delta.newFindings.length > 0 ? `<span class="delta-chip delta-new">+${delta.newFindings.length} new</span>` : ""}
      ${delta.resolvedFindings.length > 0 ? `<span class="delta-chip delta-resolved">&minus;${delta.resolvedFindings.length} resolved</span>` : ""}
      <span class="delta-chip delta-unchanged">${delta.unchangedCount} unchanged</span>
      <span class="delta-vs">vs. scan from ${escapeHtml(ago)}</span>
    </div>`;
}

function statChipsMarkup(findings: SecurityReportFinding[]): string {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const chips: string[] = [];
  if (counts.critical > 0) chips.push(`<div class="stat-chip critical" onclick="switchTab('critical')"><span class="dot"></span>${counts.critical} Critical</div>`);
  if (counts.high > 0) chips.push(`<div class="stat-chip high" onclick="switchTab('high')"><span class="dot"></span>${counts.high} High</div>`);
  if (counts.medium > 0) chips.push(`<div class="stat-chip medium" onclick="switchTab('medium')"><span class="dot"></span>${counts.medium} Medium</div>`);
  if (counts.low > 0) chips.push(`<div class="stat-chip low" onclick="switchTab('low')"><span class="dot"></span>${counts.low} Low</div>`);
  if (counts.info > 0) chips.push(`<div class="stat-chip info" onclick="switchTab('info')"><span class="dot"></span>${counts.info} Info</div>`);
  chips.push(`<div class="stat-chip total"><span class="dot" style="background:var(--text-muted)"></span>${findings.length} Total</div>`);
  return chips.join("\n    ");
}

function trendChartSvg(trend: TrendPoint[]): string {
  if (trend.length < 2) return `<div class="empty-state">Need at least 2 scans for trend chart.</div>`;

  const W = 1060;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(1, ...trend.map((t) => t.totalFindings));
  const severities: Array<{ key: keyof SeverityCounts; color: string; label: string }> = [
    { key: "critical", color: "var(--error)", label: "Critical" },
    { key: "high", color: "var(--high)", label: "High" },
    { key: "medium", color: "var(--warning)", label: "Medium" },
    { key: "low", color: "var(--accent)", label: "Low" },
    { key: "info", color: "var(--text-dim)", label: "Info" },
  ];

  function x(i: number): number { return PAD.left + (i / (trend.length - 1)) * chartW; }
  function y(val: number): number { return PAD.top + chartH - (val / maxVal) * chartH; }

  const gridLines: string[] = [];
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((maxVal / ySteps) * i);
    const yPos = y(val);
    gridLines.push(`<line x1="${PAD.left}" y1="${yPos}" x2="${W - PAD.right}" y2="${yPos}" stroke="var(--border)" stroke-dasharray="4,4" />`);
    gridLines.push(`<text x="${PAD.left - 8}" y="${yPos + 4}" text-anchor="end" fill="var(--text-dim)" font-size="11">${val}</text>`);
  }

  const xLabels: string[] = [];
  const allSameDay = trend.length > 0 && trend.every((t) => t.createdAt.slice(0, 10) === trend[0].createdAt.slice(0, 10));
  const labelStep = Math.max(1, Math.floor(trend.length / 6));
  for (let i = 0; i < trend.length; i += labelStep) {
    const d = new Date(trend[i].createdAt);
    const label = allSameDay ? d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en", { month: "short", day: "numeric" });
    xLabels.push(`<text x="${x(i)}" y="${H - 5}" text-anchor="middle" fill="var(--text-dim)" font-size="11">${escapeHtml(label)}</text>`);
  }

  // Use raw hex colors for SVG polylines (CSS vars don't work inside SVG attributes reliably)
  const sevColors: Record<string, string> = { critical: "#e85858", high: "#f0983a", medium: "#f0b429", low: "#4a9eda", info: "#555d6e" };
  const lines: string[] = [];
  const dots: string[] = [];
  for (const sev of severities) {
    const hasData = trend.some((t) => t.severityCounts[sev.key] > 0);
    if (!hasData) continue;
    const color = sevColors[sev.key] || "#555d6e";
    const points = trend.map((t, i) => `${x(i)},${y(t.severityCounts[sev.key])}`).join(" ");
    lines.push(`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />`);
    const dotStep = Math.max(1, Math.floor(trend.length / 12));
    for (let i = 0; i < trend.length; i++) {
      if (i === 0 || i === trend.length - 1 || i % dotStep === 0) {
        const val = trend[i].severityCounts[sev.key];
        dots.push(`<circle cx="${x(i)}" cy="${y(val)}" r="3" fill="${color}" stroke="#1a1d23" stroke-width="1.5" />`);
      }
    }
  }

  const totalPoints = trend.map((t, i) => `${x(i)},${y(t.totalFindings)}`).join(" ");
  lines.push(`<polyline points="${totalPoints}" fill="none" stroke="#8892a0" stroke-width="1.5" stroke-dasharray="6,3" stroke-linejoin="round" opacity="0.5" />`);

  const legend = severities
    .filter((s) => trend.some((t) => t.severityCounts[s.key] > 0))
    .map((s, i) => {
      const color = sevColors[s.key] || "#555d6e";
      return `<g transform="translate(${i * 90}, 0)"><rect width="12" height="12" rx="2" fill="${color}" opacity="0.85" /><text x="16" y="10" fill="#8892a0" font-size="11">${s.label}</text></g>`;
    }).join("");

  return `
    <svg viewBox="0 0 ${W} ${H + 30}" width="100%" height="${H + 30}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
      <rect width="${W}" height="${H + 30}" fill="transparent" />
      ${gridLines.join("\n")}
      ${xLabels.join("\n")}
      ${lines.join("\n")}
      ${dots.join("\n")}
      <g transform="translate(${PAD.left}, ${H + 10})">${legend}</g>
    </svg>`;
}

function historyPanelMarkup(history: HistoryData | undefined): string {
  if (!history || !history.snapshots.length) {
    return `<div class="empty-state">No previous scans recorded yet. Run additional scans to see history.</div>`;
  }
  const snapshotsJson = JSON.stringify(history.snapshots.map((s) => ({
    id: s.id, title: s.title, summary: s.summary, scope: s.scope,
    createdAt: s.createdAt, severityCounts: s.severityCounts,
    totalFindings: s.totalFindings,
    findingsCount: s.findings?.length ?? s.totalFindings,
    mitigationsCount: s.mitigations?.length ?? 0,
  })));
  return `
    <div id="history-data" style="display:none">${escapeHtml(snapshotsJson)}</div>
    <div class="trend-section">
      <h3 style="margin:0 0 12px 0;color:var(--text-muted);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;font-family:var(--mono);">Vulnerability Trend</h3>
      ${trendChartSvg(history.trend)}
    </div>
    <div class="history-controls">
      <div class="time-filters" id="timeFilters"></div>
      <div class="page-controls" id="pageControls"></div>
    </div>
    <div id="historyList" class="history-list"></div>`;
}

// ── Agent Prompt Generator ───────────────────────────────────────────

function generateAgentPrompt(report: SecurityReportData): string {
  const lines: string[] = [];
  lines.push(`# Security Remediation — ${report.title}`);
  lines.push("");
  lines.push("You are a security remediation agent. Fix ALL of the following findings.");
  lines.push("For each finding, apply the recommendation. Verify your changes compile/pass tests.");
  lines.push("");

  if (report.scope) {
    lines.push(`**Scope:** ${report.scope}`);
    lines.push("");
  }

  // Group findings by severity
  const bySeverity: Record<string, SecurityReportFinding[]> = {};
  for (const f of report.findings) {
    if (!bySeverity[f.severity]) bySeverity[f.severity] = [];
    bySeverity[f.severity].push(f);
  }

  const order: Array<SecurityReportFinding["severity"]> = ["critical", "high", "medium", "low", "info"];
  for (const sev of order) {
    const group = bySeverity[sev];
    if (!group || group.length === 0) continue;
    lines.push(`## ${sev.toUpperCase()} (${group.length})`);
    lines.push("");
    for (const f of group) {
      lines.push(`### ${f.title}`);
      lines.push(`- **Category:** ${f.category}`);
      if (f.evidence) lines.push(`- **Evidence:** \`${f.evidence}\``);
      if (f.recommendation) lines.push(`- **Action:** ${f.recommendation}`);
      lines.push("");
    }
  }

  if (report.mitigations.length > 0) {
    lines.push("## Mitigations to Apply");
    lines.push("");
    for (const m of report.mitigations) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Fix each finding in priority order (critical first). Verify all changes compile and tests pass before marking complete.");

  return lines.join("\n");
}

// ── Main HTML Generator ──────────────────────────────────────────────

export function generateSecurityReportHTML(report: SecurityReportData, port?: number): string {
  const hasHistory = !!report.history && (report.history.snapshots.length > 0 || report.history.trend.length > 0);
  const serverPort = port || 0;
  const agentPrompt = generateAgentPrompt(report);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(report.title)} — Security Report</title>
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
    --error: #e85858;
    --high: #f0983a;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

${VIEWER_SCROLLBAR_STYLES}
  html { height: 100%; }
  body {
    background: var(--bg); color: var(--text); font-family: var(--font);
    font-size: 15px; line-height: 1.65; height: 100%;
    display: flex; flex-direction: column; overflow: hidden;
  }

  /* ── Header (matches plan viewer) ──── */
  .header {
    background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--error); border-radius: 6px;
    margin: 12px 16px 0; padding: 14px 20px;
    display: flex; align-items: center; gap: 14px;
    position: sticky; top: 12px; z-index: 100;
  }
  .header .badge {
    background: transparent; color: var(--error); font-size: 11px; font-weight: 700;
    padding: 3px 10px; border: 1px solid var(--error); border-radius: 4px;
    text-transform: uppercase; letter-spacing: 1px; font-family: var(--mono);
    display: inline-flex; align-items: center; gap: 6px;
  }
  .header .spacer { flex: 1; }
  .header-logo { height: 20px; width: auto; image-rendering: pixelated; opacity: 0.6; flex-shrink: 0; }

  /* ── Stats Bar ─────────────────────── */
  .stats-bar {
    display: flex; gap: 8px; padding: 10px 16px; flex-wrap: wrap; align-items: center;
  }
  .stat-chip {
    display: flex; align-items: center; gap: 6px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    padding: 6px 12px; font-size: 12px; font-family: var(--mono); font-weight: 600;
    cursor: pointer; transition: all 0.15s;
  }
  .stat-chip:hover { background: var(--surface2); border-color: var(--text-dim); }
  .stat-chip .dot { width: 8px; height: 8px; border-radius: 50%; }
  .stat-chip.critical .dot { background: var(--error); }
  .stat-chip.high .dot { background: var(--high); }
  .stat-chip.medium .dot { background: var(--warning); }
  .stat-chip.low .dot { background: var(--accent); }
  .stat-chip.info .dot { background: var(--text-dim); }
  .stat-chip.total .dot { background: var(--text-muted); }
  .stat-chip.total { cursor: default; }

  /* ── Content ───────────────────────── */
  .content { flex: 1; width: 100%; padding: 8px 24px 100px; overflow: auto; }

  /* ── Tab System ────────────────────── */
  .tab-bar {
    display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
    padding: 0 24px;
  }
  .tab-btn {
    padding: 5px 16px; border-radius: 4px; font-size: 11px; font-family: var(--mono);
    text-transform: uppercase; letter-spacing: 0.5px;
    background: transparent; color: var(--text-dim); border: 1px solid var(--border);
    cursor: pointer; transition: all 0.15s; font-weight: 600;
  }
  .tab-btn:hover { background: var(--surface2); color: var(--text-muted); border-color: var(--text-dim); }
  .tab-btn.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
  .tab-count {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    background: var(--surface2); font-size: 10px; margin-left: 4px;
    font-family: var(--mono); color: var(--text-dim);
  }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* ── Finding Cards ─────────────────── */
  .finding-card {
    background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--warning); border-radius: 0 8px 8px 0;
    padding: 16px 20px; margin: 12px 0;
  }
  .finding-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .finding-header h4 { margin: 0; font-size: 14px; font-weight: 600; color: var(--text); }
  .severity-badge {
    display: inline-block; padding: 3px 10px; border-radius: 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
    color: var(--bg); font-family: var(--mono);
  }
  .finding-meta { color: var(--text-dim); font-size: 12px; margin-top: 4px; font-family: var(--mono); }
  .finding-evidence {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px; margin: 8px 0; overflow-x: auto;
  }
  .finding-evidence code {
    color: var(--text); font-size: 12px; line-height: 1.6; font-family: var(--mono);
    background: none; padding: 0;
  }
  .finding-rec { margin: 8px 0 0; font-size: 13px; color: var(--text-muted); }
  .finding-rec strong { color: var(--text); }

  /* ── Summary Section ───────────────── */
  .summary-section {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 20px; margin-bottom: 16px;
  }
  .summary-section h3 { font-size: 14px; color: var(--accent); font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 700; }
  .report-title { font-size: 20px; color: var(--text); margin: 0 0 10px; font-weight: 600; letter-spacing: -0.3px; }
  .summary-text { color: var(--text-muted); font-size: 14px; line-height: 1.65; }
  .summary-meta { color: var(--text-dim); font-size: 12px; font-family: var(--mono); margin-top: 8px; }

  /* ── Source Panels (grid) ──────────── */
  .source-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }
  .source-panel {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px;
  }
  .source-panel h3 { font-size: 13px; color: var(--accent); font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 700; }
  .source-block {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px; overflow-x: auto; min-height: 80px;
  }
  .source-block code {
    color: var(--text); font-size: 12px; line-height: 1.6; font-family: var(--mono);
    white-space: pre-wrap; word-break: break-word; background: none; padding: 0;
  }

  /* ── Mitigation List ───────────────── */
  .mitigation-list { padding-left: 20px; margin: 0; }
  .mitigation-list li { margin: 6px 0; color: var(--text-muted); font-size: 14px; }

  /* ── Delta Banner ──────────────────── */
  .delta-banner {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 24px; margin-bottom: 4px;
  }
  .delta-chip {
    display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 4px;
    font-size: 12px; font-weight: 600; font-family: var(--mono);
  }
  .delta-new { background: rgba(232, 88, 88, 0.12); color: var(--error); border: 1px solid rgba(232, 88, 88, 0.3); }
  .delta-resolved { background: rgba(72, 216, 137, 0.12); color: var(--success); border: 1px solid rgba(72, 216, 137, 0.3); }
  .delta-unchanged { background: var(--surface2); color: var(--text-dim); border: 1px solid var(--border); }
  .delta-vs { color: var(--text-dim); font-size: 12px; margin-left: auto; }

  /* ── History / Trend ───────────────── */
  .trend-section {
    margin-bottom: 16px; padding: 16px;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  }
  .history-controls {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
  }
  .time-filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .time-btn {
    padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-dim); font-size: 12px;
    cursor: pointer; transition: all 0.15s; font-family: var(--mono);
  }
  .time-btn:hover { background: var(--surface2); color: var(--text-muted); }
  .time-btn.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
  .history-list { display: grid; gap: 8px; }
  .scan-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; cursor: pointer; transition: all 0.15s;
  }
  .scan-card:hover { background: var(--surface2); border-color: var(--text-dim); }
  .scan-card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .scan-card-title { font-weight: 600; font-size: 14px; color: var(--text); }
  .scan-card-time { font-size: 12px; color: var(--text-dim); font-family: var(--mono); white-space: nowrap; }
  .scan-card-stats { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .scan-mini-pill {
    display: inline-block; padding: 2px 8px; border-radius: 3px;
    font-size: 11px; font-weight: 700; color: var(--bg); font-family: var(--mono);
  }
  .scan-card-details { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-muted); }
  .scan-card-details.open { display: block; }
  .page-controls { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }
  .page-btn {
    padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-dim); font-size: 12px;
    cursor: pointer; font-family: var(--mono);
  }
  .page-btn:hover:not(:disabled) { background: var(--surface2); color: var(--text-muted); }
  .page-btn:disabled { opacity: 0.3; cursor: default; }

  /* ── Empty State ───────────────────── */
  .empty-state { color: var(--text-dim); font-style: italic; font-size: 13px; padding: 8px 0; }

  /* ── View Toggle (header) ──────────── */
  .view-toggle {
    display: flex; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px;
    overflow: hidden; flex-shrink: 0;
  }
  .view-toggle button {
    padding: 5px 16px; font-size: 11px; font-family: var(--mono); text-transform: uppercase;
    letter-spacing: 0.5px; background: transparent; color: var(--text-dim);
    border: none; cursor: pointer; transition: all 0.15s;
  }
  .view-toggle button:hover { color: var(--text-muted); }
  .view-toggle button.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; }

  /* ── Agent View ─────────────────────── */
  .agent-view { display: none; flex-direction: column; gap: 12px; }
  .agent-view.active { display: flex; }
  .agent-prompt-box {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  }
  .agent-prompt-header {
    display: flex; align-items: center; gap: 10px; padding: 12px 16px;
    border-bottom: 1px solid var(--border); background: var(--surface2);
  }
  .agent-prompt-header .agent-label {
    font-size: 11px; font-family: var(--mono); font-weight: 700; color: var(--accent);
    text-transform: uppercase; letter-spacing: 1px;
  }
  .agent-prompt-header .agent-hint { font-size: 12px; color: var(--text-dim); margin-left: auto; }
  .agent-prompt-content {
    padding: 20px; font-size: 14px; line-height: 1.7; color: var(--text-muted);
    max-height: calc(100vh - 260px); overflow: auto;
  }
  .agent-prompt-content h1, .agent-prompt-content h2, .agent-prompt-content h3 {
    color: var(--text); margin: 20px 0 8px; font-weight: 600;
  }
  .agent-prompt-content h1 { font-size: 18px; color: var(--accent); }
  .agent-prompt-content h2 { font-size: 15px; color: var(--accent); font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px; }
  .agent-prompt-content h3 { font-size: 14px; }
  .agent-prompt-content p { margin: 6px 0; }
  .agent-prompt-content ul, .agent-prompt-content ol { padding-left: 20px; margin: 6px 0; }
  .agent-prompt-content li { margin: 3px 0; font-size: 13px; }
  .agent-prompt-content code {
    background: var(--surface2); color: var(--accent); padding: 1px 5px;
    border-radius: 3px; font-family: var(--mono); font-size: 12px;
  }
  .agent-prompt-content pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 14px; overflow-x: auto; margin: 10px 0;
  }
  .agent-prompt-content pre code { background: none; padding: 0; color: var(--text); font-size: 12px; line-height: 1.5; }
  .agent-prompt-content strong { color: var(--text); }
  .agent-prompt-content hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  .agent-copy-bar { display: flex; justify-content: flex-end; padding: 0 4px; }

  /* ── Footer (matches plan viewer) ──── */
  .footer-wrapper {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
    display: flex; flex-direction: column;
  }
  .footer {
    background: var(--surface); border-top: 1px solid var(--border);
    padding: 10px 20px; display: flex; align-items: center; gap: 8px;
  }
  .footer .spacer { flex: 1; }
  .btn {
    padding: 7px 18px; border-radius: 4px; font-size: 13px; font-weight: 500;
    cursor: pointer; border: 1px solid var(--border); background: var(--surface2);
    color: var(--text-muted); transition: all 0.15s; font-family: var(--font);
  }
  .btn:hover { background: var(--border); color: var(--text); }
  .btn-ghost {
    background: transparent; border-color: transparent; color: var(--text-dim); font-size: 12px;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .btn-ghost:hover { color: var(--text-muted); background: var(--surface2); }
  .btn-success {
    background: transparent; color: var(--success); border-color: var(--success); font-weight: 600;
  }
  .btn-success:hover { background: var(--success-bg); }

  /* ── Acknowledged State ──────────── */
  .acknowledged-banner {
    background: var(--surface); border: 1px solid var(--success);
    border-left: 4px solid var(--success); border-radius: 6px;
    margin: 12px 16px 0; padding: 16px 24px;
    display: flex; align-items: center; gap: 12px; flex-shrink: 0;
  }
  .acknowledged-banner .ack-icon {
    width: 32px; height: 32px; border-radius: 50%; background: var(--success);
    color: var(--bg); display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 700; flex-shrink: 0;
  }
  .acknowledged-banner .ack-text {
    font-size: 15px; font-weight: 600; color: var(--success);
    font-family: var(--mono); letter-spacing: 0.5px; text-transform: uppercase;
  }
  .acknowledged-banner .ack-sub {
    font-size: 12px; color: var(--text-dim); font-weight: 400;
    text-transform: none; letter-spacing: 0; margin-top: 2px;
  }
  body.acknowledged-state .footer-wrapper { display: none; }
  body.acknowledged-state .content { padding-bottom: 24px; }

  /* ── Toast ─────────────────────────── */
  .toast {
    position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
    background: var(--surface); color: var(--accent); border: 1px solid var(--accent);
    padding: 8px 20px; border-radius: 4px; font-size: 13px; font-family: var(--mono);
    font-weight: 500; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 200;
  }
  .toast.show { opacity: 1; }

  @media (max-width: 600px) {
    .content { padding: 8px 12px 120px; }
    .header { padding: 10px 12px; }
    .footer { padding: 10px 12px; }
    .stats-bar { padding: 8px 12px; }
    .tab-bar { padding: 0 12px; }
    .source-grid { grid-template-columns: 1fr; }
    .delta-banner { padding: 8px 12px; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span class="badge">${SVG.shield} Security Report</span>
  <div class="spacer"></div>
  <div class="view-toggle">
    <button class="active" id="btnReport" onclick="setView('report')">Report</button>
    <button id="btnAgent" onclick="setView('agent')">Agent</button>
  </div>
  <img src="/logo.png" alt="" class="header-logo" onerror="this.style.display='none'">
</div>

<!-- Stat Chips -->
<div class="stats-bar">
  ${statChipsMarkup(report.findings)}
</div>

<!-- Delta Banner -->
${deltaMarkup(report.history?.delta)}

<!-- Tabs -->
<div class="tab-bar">
  <button class="tab-btn active" onclick="switchTab('all')">All <span class="tab-count">${report.findings.length}</span></button>
  ${report.findings.some((f) => f.severity === "critical") ? `<button class="tab-btn" onclick="switchTab('critical')">Critical <span class="tab-count">${report.findings.filter((f) => f.severity === "critical").length}</span></button>` : ""}
  ${report.findings.some((f) => f.severity === "high") ? `<button class="tab-btn" onclick="switchTab('high')">High <span class="tab-count">${report.findings.filter((f) => f.severity === "high").length}</span></button>` : ""}
  ${report.findings.some((f) => f.severity === "medium") ? `<button class="tab-btn" onclick="switchTab('medium')">Medium <span class="tab-count">${report.findings.filter((f) => f.severity === "medium").length}</span></button>` : ""}
  ${report.findings.some((f) => f.severity === "low") ? `<button class="tab-btn" onclick="switchTab('low')">Low <span class="tab-count">${report.findings.filter((f) => f.severity === "low").length}</span></button>` : ""}
  ${report.findings.some((f) => f.severity === "info") ? `<button class="tab-btn" onclick="switchTab('info')">Info <span class="tab-count">${report.findings.filter((f) => f.severity === "info").length}</span></button>` : ""}
  ${hasHistory ? `<button class="tab-btn" onclick="switchTab('history')" style="margin-left:auto;">History <span class="tab-count">${report.history!.snapshots.length}</span></button>` : ""}
</div>

<!-- Content -->
<div class="content">
  <!-- Report View -->
  <div id="reportView" style="display:block;">
    <!-- Summary -->
    <div class="summary-section">
      <h2 class="report-title">${escapeHtml(report.title)}</h2>
      <p class="summary-text">${escapeHtml(report.summary)}</p>
      <div class="summary-meta">Generated: ${escapeHtml(report.generatedAt)}${report.scope ? ` · Scope: ${escapeHtml(report.scope)}` : ""}${hasHistory ? ` · Scan #${(report.history!.snapshots.length + 1)}` : ""}</div>
    </div>

    <!-- Tab: All Findings -->
    <div id="tab-all" class="tab-content active">
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

    <!-- Mitigations -->
    <div class="source-panel" style="margin-top:16px;">
      <h3>Recommended Mitigations</h3>
      ${listMarkup(report.mitigations, "No mitigation recommendations provided.")}
    </div>

    <!-- Source Data Grid -->
    <div class="source-grid">
      ${sourceSection("Threat Intelligence", report.intelligence, "No intelligence summary provided.")}
      ${sourceSection("Passive Inspection", report.inspection, "No passive inspection summary provided.")}
      ${sourceSection("Port Analysis", report.scan, "No port analysis summary provided.")}
    </div>
  </div>

  <!-- Agent View -->
  <div id="agentView" class="agent-view">
    <div class="agent-copy-bar">
      <button class="btn btn-ghost" onclick="copyAgentPrompt()">
        ${SVG.copy} Copy Prompt
      </button>
    </div>
    <div class="agent-prompt-box">
      <div class="agent-prompt-header">
        <span style="color:var(--accent);display:flex;align-items:center;">${SVG.bot}</span>
        <span class="agent-label">Agent Prompt</span>
        <span class="agent-hint">Paste this into any AI agent to fix all findings</span>
      </div>
      <div class="agent-prompt-content" id="agentPromptContent"></div>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <button class="btn btn-ghost" onclick="copyReport()">${SVG.copy}Copy</button>
    <button class="btn btn-ghost" onclick="saveToDesktop()">${SVG.download}Save</button>
    <div class="spacer"></div>
    <button class="btn btn-success" onclick="acknowledgeReport()">Acknowledge</button>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script>
(function() {
  var PORT = ${serverPort};
  var agentPrompt = ${JSON.stringify(agentPrompt).replace(/<\//g, '<\\/')};
  var currentView = 'report';

  // ── Tab switching ──
  function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
    var panel = document.getElementById('tab-' + tabName);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      if (btn.getAttribute('onclick') === "switchTab('" + tabName + "')") btn.classList.add('active');
    });
    if (tabName === 'history' && !window._historyInit) {
      initHistory();
      window._historyInit = true;
    }
  }
  window.switchTab = switchTab;

  // ── View Toggle (Report / Agent) ──
  window.setView = function(view) {
    currentView = view;
    var reportEl = document.getElementById('reportView');
    var agentEl = document.getElementById('agentView');
    var btnR = document.getElementById('btnReport');
    var btnA = document.getElementById('btnAgent');
    var tabBar = document.querySelector('.tab-bar');
    var statsBar = document.querySelector('.stats-bar');
    if (view === 'agent') {
      reportEl.style.display = 'none';
      agentEl.classList.add('active');
      btnR.classList.remove('active');
      btnA.classList.add('active');
      if (tabBar) tabBar.style.display = 'none';
      if (statsBar) statsBar.style.display = 'none';
      // Render agent prompt on first switch
      if (!window._agentRendered) {
        renderAgentPrompt();
        window._agentRendered = true;
      }
    } else {
      reportEl.style.display = 'block';
      agentEl.classList.remove('active');
      btnR.classList.add('active');
      btnA.classList.remove('active');
      if (tabBar) tabBar.style.display = '';
      if (statsBar) statsBar.style.display = '';
    }
  };

  function renderAgentPrompt() {
    var el = document.getElementById('agentPromptContent');
    if (!el) return;
    if (typeof marked !== 'undefined') {
      el.innerHTML = marked.parse(agentPrompt);
    } else {
      el.textContent = agentPrompt;
    }
  }

  // ── Copy Agent Prompt ──
  window.copyAgentPrompt = function() {
    navigator.clipboard.writeText(agentPrompt).then(function() {
      showToast('Agent prompt copied to clipboard');
    }).catch(function() { showToast('Copy failed'); });
  };

  // ── Acknowledge ──
  function acknowledgeReport() {
    if (document.body.classList.contains('acknowledged-state')) return;

    // Show green banner after header
    var banner = document.createElement('div');
    banner.className = 'acknowledged-banner';
    banner.innerHTML = '<div class="ack-icon">✓</div>' +
      '<div><div class="ack-text">Acknowledged</div>' +
      '<div class="ack-sub">Report has been reviewed. You can continue browsing or close this tab.</div></div>';
    var header = document.querySelector('.header');
    header.parentNode.insertBefore(banner, header.nextSibling);

    // Enter acknowledged state (hides footer via CSS)
    document.body.classList.add('acknowledged-state');

    // Update header badge to green
    var badge = document.querySelector('.header .badge');
    if (badge) {
      badge.style.color = 'var(--success)';
      badge.style.borderColor = 'var(--success)';
    }

    // Notify server that user acknowledged the report
    if (PORT > 0) {
      fetch('http://127.0.0.1:' + PORT + '/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledged' }),
      }).catch(function() {});
    }
  }
  window.acknowledgeReport = acknowledgeReport;

  // ── Escape key to acknowledge ──
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') acknowledgeReport();
  });

  // ── Copy ──
  window.copyReport = function() {
    var text = document.querySelector('.content').innerText;
    navigator.clipboard.writeText(text).then(function() {
      showToast('Report copied to clipboard');
    }).catch(function() { showToast('Copy failed'); });
  };

  // ── Save to Desktop ──
  window.saveToDesktop = function() {
    if (PORT > 0) {
      fetch('http://127.0.0.1:' + PORT + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.ok) showToast('Saved to Desktop');
        else showToast('Save failed');
      }).catch(function() { showToast('Save failed'); });
    }
  };

  // ── Toast ──
  function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function() { t.classList.remove('show'); }, 2500);
  }

  // ── History Pagination ──
  var PER_PAGE = 20;
  var historyData = [];
  var currentFilter = 'all';
  var currentPage = 0;

  function initHistory() {
    var dataEl = document.getElementById('history-data');
    if (!dataEl) return;
    try { historyData = JSON.parse(dataEl.textContent || '[]'); } catch(e) { historyData = []; }
    renderTimeFilters();
    renderPage();
  }

  function getFilteredData() {
    var now = Date.now(), DAY = 86400000;
    return historyData.filter(function(s) {
      var t = new Date(s.createdAt).getTime();
      switch(currentFilter) {
        case 'today': return (now - t) < DAY;
        case 'week': return (now - t) < 7 * DAY;
        case 'month': return (now - t) < 30 * DAY;
        default: return true;
      }
    });
  }

  function countByFilter(filter) {
    var now = Date.now(), DAY = 86400000;
    return historyData.filter(function(s) {
      var t = new Date(s.createdAt).getTime();
      switch(filter) {
        case 'today': return (now - t) < DAY;
        case 'week': return (now - t) < 7 * DAY;
        case 'month': return (now - t) < 30 * DAY;
        default: return true;
      }
    }).length;
  }

  function renderTimeFilters() {
    var el = document.getElementById('timeFilters');
    if (!el) return;
    var filters = [
      { key: 'today', label: 'Today' },
      { key: 'week', label: 'This Week' },
      { key: 'month', label: 'This Month' },
      { key: 'all', label: 'All Time' },
    ];
    el.innerHTML = filters.map(function(f) {
      return '<button class="time-btn' + (currentFilter === f.key ? ' active' : '') +
        '" onclick="setTimeFilter(\\''+f.key+'\\')">'+f.label+
        ' <span class="tab-count">'+countByFilter(f.key)+'</span></button>';
    }).join('');
  }
  window.setTimeFilter = function(filter) {
    currentFilter = filter;
    currentPage = 0;
    renderTimeFilters();
    renderPage();
  };

  function renderPage() {
    var filtered = getFilteredData();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    var start = currentPage * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    var pcEl = document.getElementById('pageControls');
    if (pcEl) {
      if (filtered.length > PER_PAGE) {
        pcEl.innerHTML =
          '<button class="page-btn" onclick="histPrev()"' + (currentPage <= 0 ? ' disabled' : '') + '>&laquo; Prev</button>' +
          '<span>' + (currentPage + 1) + ' / ' + totalPages + '</span>' +
          '<button class="page-btn" onclick="histNext()"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>Next &raquo;</button>';
      } else {
        pcEl.innerHTML = '<span>' + filtered.length + ' scan' + (filtered.length !== 1 ? 's' : '') + '</span>';
      }
    }

    var listEl = document.getElementById('historyList');
    if (!listEl) return;
    if (!pageItems.length) {
      listEl.innerHTML = '<div class="empty-state">No scans in this time range.</div>';
      return;
    }

    var sevColors = { critical: '#e85858', high: '#f0983a', medium: '#f0b429', low: '#4a9eda', info: '#555d6e' };
    listEl.innerHTML = pageItems.map(function(scan, idx) {
      var pills = Object.keys(scan.severityCounts || {}).filter(function(sev) { return scan.severityCounts[sev] > 0; })
        .map(function(sev) { return '<span class="scan-mini-pill" style="background:'+(sevColors[sev]||'#555d6e')+'">'+scan.severityCounts[sev]+' '+sev+'</span>'; }).join('');
      var cardId = 'scan-detail-' + (start + idx);
      return '<div class="scan-card" onclick="toggleScanDetail(\\''+cardId+'\\')">'+
        '<div class="scan-card-header"><span class="scan-card-title">'+escapeText(scan.title)+'</span>'+
        '<span class="scan-card-time">'+formatTime(scan.createdAt)+'</span></div>'+
        '<div class="scan-card-stats"><span style="font-size:12px;color:var(--text-dim);">'+scan.totalFindings+' findings</span>'+pills+'</div>'+
        '<div class="scan-card-details" id="'+cardId+'">'+
        '<div><strong>Summary:</strong> '+escapeText(scan.summary||'No summary')+'</div>'+
        (scan.scope ? '<div><strong>Scope:</strong> '+escapeText(scan.scope)+'</div>' : '')+
        '<div style="margin-top:4px;"><strong>Mitigations:</strong> '+(scan.mitigationsCount||0)+'</div></div></div>';
    }).join('');
  }

  window.toggleScanDetail = function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  };
  window.histPrev = function() { if (currentPage > 0) { currentPage--; renderPage(); } };
  window.histNext = function() {
    var totalPages = Math.ceil(getFilteredData().length / PER_PAGE);
    if (currentPage < totalPages - 1) { currentPage++; renderPage(); }
  };

  function formatTime(iso) {
    var d = new Date(iso), now = Date.now(), diff = now - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
    return d.toLocaleDateString('en',{month:'short',day:'numeric'});
  }
  function escapeText(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
})();
<\/script>
</body>
</html>`;
}
