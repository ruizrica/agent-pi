// ABOUTME: HTML renderer for the Security Analysis Report viewer.
// ABOUTME: Presents summary, findings, mitigations, and source data in a browser-friendly format.

export interface SecurityReportFinding {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  evidence?: string;
  recommendation?: string;
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

export function generateSecurityReportHTML(report: SecurityReportData): string {
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
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>${escapeHtml(report.title)}</h1>
      <p class="summary">${escapeHtml(report.summary)}</p>
      <div class="meta">Generated: ${escapeHtml(report.generatedAt)}${report.scope ? ` • Scope: ${escapeHtml(report.scope)}` : ""}</div>
    </section>

    <section class="panel">
      <h2>Findings</h2>
      ${findingsMarkup(report.findings)}
    </section>

    <div class="grid">
      ${section("Recommended Mitigations", listMarkup(report.mitigations, "No mitigation recommendations provided."))}
      ${section("Threat Intelligence", report.intelligence ? `<pre class="source-block">${escapeHtml(report.intelligence)}</pre>` : `<div class="empty">No intelligence summary provided.</div>`)}
      ${section("Passive Inspection", report.inspection ? `<pre class="source-block">${escapeHtml(report.inspection)}</pre>` : `<div class="empty">No passive inspection summary provided.</div>`)}
      ${section("Port Analysis", report.scan ? `<pre class="source-block">${escapeHtml(report.scan)}</pre>` : `<div class="empty">No port analysis summary provided.</div>`)}
    </div>
  </main>
</body>
</html>`;
}
