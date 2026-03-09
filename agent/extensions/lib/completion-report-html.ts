// ABOUTME: Self-contained HTML template for the Completion Report viewer GUI window.
// ABOUTME: Renders work summary, file diffs with syntax highlighting, and per-file rollback controls.

/**
 * Data structure for a single changed file.
 */
export interface ChangedFile {
	path: string;
	status: "modified" | "added" | "deleted" | "renamed";
	additions: number;
	deletions: number;
	diff: string;
	oldPath?: string; // for renames
}

/**
 * Data structure for the full completion report.
 */
export interface ReportData {
	title: string;
	summary: string; // markdown summary of work done
	files: ChangedFile[];
	baseRef: string;
	totalAdditions: number;
	totalDeletions: number;
	taskMarkdown?: string; // contents of .context/todo.md if it exists
}

/**
 * Generate the full HTML page for the completion report viewer window.
 */
export function generateCompletionReportHTML(opts: {
	report: ReportData;
	port: number;
}): string {
	const { report, port } = opts;
	const escapedReport = JSON.stringify(report);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${report.title} — Completion Report</title>
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
    --success-dim: rgba(72, 216, 137, 0.15);
    --warning: #f0b429;
    --warning-bg: rgba(240, 180, 41, 0.08);
    --error: #e85858;
    --error-bg: rgba(232, 88, 88, 0.08);
    --error-dim: rgba(232, 88, 88, 0.15);
    --diff-add-bg: rgba(72, 216, 137, 0.08);
    --diff-add-text: #48d889;
    --diff-del-bg: rgba(232, 88, 88, 0.08);
    --diff-del-text: #e85858;
    --diff-hunk-bg: rgba(41, 128, 185, 0.08);
    --diff-hunk-text: #5fa8d3;
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

  /* ── Header ──────────────────────────── */
  .header {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--success);
    border-radius: 6px;
    margin: 12px 16px 0;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    z-index: 100;
  }
  .header-logo {
    height: 20px;
    width: auto;
    image-rendering: pixelated;
    opacity: 0.6;
    flex-shrink: 0;
  }
  .header .badge {
    background: transparent;
    color: var(--success);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border: 1px solid var(--success);
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--mono);
  }
  .header .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .header .stats {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-muted);
    display: flex;
    gap: 12px;
  }
  .stat-add { color: var(--success); }
  .stat-del { color: var(--error); }
  .stat-files { color: var(--text-muted); }

  /* ── Content Area ────────────────────── */
  .content {
    flex: 1;
    width: 100%;
    padding: 12px 16px 100px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Summary Section ─────────────────── */
  .summary-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .summary-section h2 {
    font-size: 13px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    font-weight: 700;
    margin-bottom: 12px;
  }

  /* ── Markdown in summary ─────────────── */
  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    color: var(--text);
    margin: 16px 0 8px;
    font-weight: 600;
    line-height: 1.3;
  }
  .markdown-body h1 { font-size: 20px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .markdown-body h2 { font-size: 16px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.8px; font-family: var(--mono); font-weight: 700; }
  .markdown-body h3 { font-size: 15px; color: var(--text); }
  .markdown-body p { margin: 8px 0; color: var(--text-muted); font-size: 14px; }
  .markdown-body ul, .markdown-body ol { margin: 8px 0; padding-left: 24px; }
  .markdown-body li { margin: 4px 0; color: var(--text-muted); font-size: 14px; }
  .markdown-body code {
    background: var(--surface2);
    color: var(--accent);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 12px;
  }
  .markdown-body pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    overflow-x: auto;
    margin: 12px 0;
  }
  .markdown-body pre code { background: none; padding: 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
  .markdown-body blockquote {
    border-left: 3px solid var(--accent);
    background: var(--accent-dim);
    padding: 12px 16px;
    border-radius: 0 6px 6px 0;
    margin: 12px 0;
    color: var(--text-muted);
    font-size: 14px;
  }
  .markdown-body .table-wrap {
    margin: 16px 0 !important;
    overflow-x: auto !important;
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
    background: var(--surface) !important;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02) !important;
  }
  .markdown-body table,
  .markdown-body table.ui-table {
    display: table !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    width: 100% !important;
    min-width: 520px !important;
    margin: 0 !important;
    font-size: 13px !important;
    background: var(--surface) !important;
    color: var(--text-muted) !important;
  }
  .markdown-body table thead,
  .markdown-body table thead tr,
  .markdown-body table.ui-table thead,
  .markdown-body table.ui-table thead tr {
    background: var(--surface2) !important;
  }
  .markdown-body table tbody,
  .markdown-body table.ui-table tbody {
    background: var(--surface) !important;
  }
  .markdown-body table th,
  .markdown-body table td,
  .markdown-body table.ui-table th,
  .markdown-body table.ui-table td {
    padding: 12px 16px !important;
    text-align: left !important;
    vertical-align: top !important;
  }
  .markdown-body table th,
  .markdown-body table.ui-table th {
    background: var(--surface2) !important;
    color: var(--accent) !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    font-size: 11px !important;
    letter-spacing: 0.6px !important;
    font-family: var(--mono) !important;
    white-space: nowrap !important;
    border-bottom: 1px solid var(--border) !important;
  }
  .markdown-body table td,
  .markdown-body table.ui-table td {
    color: var(--text-muted) !important;
    background: var(--surface) !important;
    border-bottom: 1px solid var(--border) !important;
    word-break: break-word !important;
    overflow-wrap: anywhere !important;
    hyphens: auto !important;
  }
  .markdown-body table th + th,
  .markdown-body table td + td,
  .markdown-body table.ui-table th + th,
  .markdown-body table.ui-table td + td {
    border-left: 1px solid rgba(255,255,255,0.06) !important;
  }
  .markdown-body table tbody tr:nth-child(even) td,
  .markdown-body table.ui-table tbody tr:nth-child(even) td {
    background: rgba(255,255,255,0.02) !important;
  }
  .markdown-body table tr:last-child td,
  .markdown-body table.ui-table tr:last-child td {
    border-bottom: none !important;
  }
  .markdown-body table tbody tr:hover td,
  .markdown-body table.ui-table tbody tr:hover td {
    background: var(--surface2) !important;
  }
  .markdown-body strong { color: var(--text); font-weight: 600; }
  .markdown-body em { color: var(--text-muted); }

  /* checkbox items in summary */
  .markdown-body li.task-done { color: var(--text-dim); text-decoration: line-through; }
  .markdown-body li.task-done::marker { color: var(--success); }
  .markdown-body li.task-pending::marker { color: var(--text-dim); }

  /* ── Task Summary ────────────────────── */
  .task-overview {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .task-stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 20px;
    flex: 1;
    min-width: 120px;
    text-align: center;
  }
  .task-stat .value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    line-height: 1;
    margin-bottom: 4px;
  }
  .task-stat .label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--mono);
  }
  .task-stat.files .value { color: var(--accent); }
  .task-stat.additions .value { color: var(--success); }
  .task-stat.deletions .value { color: var(--error); }

  /* ── Files Section ───────────────────── */
  .files-section {
    margin-bottom: 16px;
  }
  .files-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .files-header h2 {
    font-size: 13px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    font-weight: 700;
    flex: 1;
  }
  .files-header .toggle-all {
    font-size: 11px;
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: transparent;
    transition: all 0.15s;
  }
  .files-header .toggle-all:hover { color: var(--text-muted); border-color: var(--text-dim); }

  /* ── File Card ───────────────────────── */
  .file-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 8px;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .file-card:hover { border-color: var(--text-dim); }
  .file-card.rolled-back {
    opacity: 0.5;
    border-left: 3px solid var(--warning);
  }
  .file-card.rolled-back .file-header { background: var(--warning-bg); }

  .file-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }
  .file-header:hover { background: var(--surface2); }

  .file-chevron {
    color: var(--text-dim);
    font-size: 10px;
    transition: transform 0.2s;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }
  .file-card.expanded .file-chevron { transform: rotate(90deg); }

  .file-status {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--mono);
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  .file-status.modified { color: var(--accent); border: 1px solid var(--accent); }
  .file-status.added { color: var(--success); border: 1px solid var(--success); }
  .file-status.deleted { color: var(--error); border: 1px solid var(--error); }
  .file-status.renamed { color: var(--warning); border: 1px solid var(--warning); }

  .file-path {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-path .dir { color: var(--text-dim); }
  .file-path .name { color: var(--text); font-weight: 500; }

  .file-stats {
    font-family: var(--mono);
    font-size: 11px;
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .file-stats .add { color: var(--success); }
  .file-stats .del { color: var(--error); }

  .file-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .rollback-btn {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--warning);
    border: 1px solid var(--warning);
    background: transparent;
    padding: 3px 10px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  .rollback-btn:hover { background: var(--warning-bg); }
  .rollback-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .rollback-btn.done { color: var(--text-dim); border-color: var(--text-dim); }

  /* ── Diff View ───────────────────────── */
  .file-diff {
    display: none;
    border-top: 1px solid var(--border);
    max-height: 500px;
    overflow: auto;
  }
  .file-card.expanded .file-diff { display: block; }

  .diff-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.6;
  }
  .diff-table td {
    padding: 0 12px;
    white-space: pre-wrap;
    word-break: break-all;
    vertical-align: top;
  }
  .diff-line-num {
    width: 50px;
    min-width: 50px;
    text-align: right;
    color: var(--text-dim);
    user-select: none;
    padding-right: 8px !important;
    border-right: 1px solid var(--border);
  }
  .diff-line-content {
    padding-left: 12px !important;
  }
  .diff-add {
    background: var(--diff-add-bg);
  }
  .diff-add .diff-line-content { color: var(--diff-add-text); }
  .diff-add .diff-line-num { color: var(--diff-add-text); opacity: 0.5; }
  .diff-del {
    background: var(--diff-del-bg);
  }
  .diff-del .diff-line-content { color: var(--diff-del-text); }
  .diff-del .diff-line-num { color: var(--diff-del-text); opacity: 0.5; }
  .diff-hunk {
    background: var(--diff-hunk-bg);
  }
  .diff-hunk td {
    color: var(--diff-hunk-text);
    font-style: italic;
    padding: 6px 12px;
  }
  .diff-context .diff-line-content { color: var(--text-dim); }
  .diff-note {
    background: rgba(41, 128, 185, 0.08);
  }
  .diff-note .diff-line-content {
    color: var(--accent);
    font-style: italic;
  }

  /* ── Done Banner ──────────────────────── */
  .done-banner {
    background: var(--surface);
    border: 1px solid var(--success);
    border-left: 4px solid var(--success);
    border-radius: 6px;
    margin: 12px 16px 0;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .done-banner .done-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--success);
    color: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .done-banner .done-text {
    font-size: 15px;
    font-weight: 600;
    color: var(--success);
    font-family: var(--mono);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .done-banner .done-sub {
    font-size: 12px;
    color: var(--text-dim);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    margin-top: 2px;
  }

  /* When done, disable all interactive elements */
  body.done-state .footer-wrapper { display: none; }
  body.done-state .rollback-btn { display: none; }
  body.done-state .files-header .toggle-all { pointer-events: auto; }
  body.done-state .content { padding-bottom: 24px; }

  /* ── Footer ──────────────────────────── */
  .footer-wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
  }
  .footer {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .footer .spacer { flex: 1; }

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

  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-dim);
    font-size: 12px;
  }
  .btn-ghost:hover { color: var(--text-muted); background: var(--surface2); }

  .btn-warning {
    background: transparent;
    color: var(--warning);
    border-color: var(--warning);
    font-weight: 600;
  }
  .btn-warning:hover { background: var(--warning-bg); }
  .btn-warning:disabled { opacity: 0.3; cursor: not-allowed; }

  .btn-success {
    background: transparent;
    color: var(--success);
    border-color: var(--success);
    font-weight: 600;
  }
  .btn-success:hover { background: var(--success-bg); }

  /* ── Toast ───────────────────────────── */
  .toast {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--accent);
    padding: 8px 20px;
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--mono);
    font-weight: 500;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 200;
  }
  .toast.show { opacity: 1; }
  .toast.error { color: var(--error); border-color: var(--error); }
  .toast.success { color: var(--success); border-color: var(--success); }

  /* ── Rollback confirm modal ──────────── */
  .modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 300;
    align-items: center;
    justify-content: center;
  }
  .modal-overlay.active { display: flex; }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
  }
  .modal h3 {
    color: var(--warning);
    font-size: 16px;
    margin-bottom: 12px;
  }
  .modal p {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 16px;
    line-height: 1.5;
  }
  .modal .file-list {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 16px;
    max-height: 200px;
    overflow-y: auto;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.8;
  }
  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* ── Responsive ──────────────────────── */
  @media (max-width: 600px) {
    .content { padding: 12px 12px 130px; }
    .header { padding: 10px 12px; flex-wrap: wrap; }
    .footer { padding: 10px 12px; }
    .task-overview { flex-direction: column; }
    .file-stats { display: none; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span class="badge" id="modeBadge">REPORT</span>
  <span class="title" id="titleText"></span>
  <div class="stats" id="headerStats"></div>
  <img src="/logo.png" alt="agent" class="header-logo">
</div>

<!-- Content -->
<div class="content">
  <!-- Task overview stats -->
  <div class="task-overview" id="taskOverview"></div>

  <!-- Summary -->
  <div class="summary-section" id="summarySection" style="display:none;">
    <h2>Summary</h2>
    <div class="markdown-body" id="summaryContent"></div>
  </div>

  <!-- Task list from todo.md -->
  <div class="summary-section" id="taskSection" style="display:none;">
    <h2>Tasks Completed</h2>
    <div class="markdown-body" id="taskContent"></div>
  </div>

  <!-- Files -->
  <div class="files-section" id="filesSection">
    <div class="files-header">
      <h2>Files Changed</h2>
      <button class="toggle-all" id="toggleAllBtn" onclick="toggleAll()">Expand All</button>
    </div>
    <div id="filesList"></div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Rollback Confirm Modal -->
<div class="modal-overlay" id="rollbackModal">
  <div class="modal">
    <h3 id="modalTitle">Confirm Rollback</h3>
    <p id="modalDesc">This will revert the following files to their state before changes:</p>
    <div class="file-list" id="modalFileList"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-warning" onclick="confirmRollback()" id="modalConfirmBtn">Rollback</button>
    </div>
  </div>
</div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <button class="btn btn-ghost" onclick="copyReport()" title="Copy report summary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy
    </button>
    <button class="btn btn-ghost" onclick="saveReport()" title="Save report to desktop">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Save
    </button>
    <button class="btn btn-ghost" onclick="downloadStandalone()" title="Download standalone read-only report HTML">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Standalone
    </button>
    <div class="spacer"></div>
    <button class="btn btn-warning" onclick="rollbackAll()" id="rollbackAllBtn" title="Rollback all changes">Rollback All</button>
    <button class="btn btn-success" onclick="done()">Done</button>
  </div>
</div>

<!-- marked.js (markdown parser) -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>

<script>
(function() {
  const PORT = ${port};
  const report = ${escapedReport};
  let rolledBackFiles = new Set();
  let allExpanded = false;
  let pendingRollback = null; // { files: string[] }

  // ── Init ──────────────────────────────────────
  function init() {
    if (typeof marked !== 'undefined') {
      marked.setOptions({ gfm: true, breaks: true });
    }

    // Title
    document.getElementById('titleText').textContent = report.title;

    // Header stats
    const statsEl = document.getElementById('headerStats');
    statsEl.innerHTML =
      '<span class="stat-files">' + report.files.length + ' file' + (report.files.length !== 1 ? 's' : '') + '</span>' +
      '<span class="stat-add">+' + report.totalAdditions + '</span>' +
      '<span class="stat-del">-' + report.totalDeletions + '</span>';

    // Task overview cards
    renderOverviewCards();

    // Summary section
    if (report.summary && report.summary.trim()) {
      document.getElementById('summarySection').style.display = 'block';
      document.getElementById('summaryContent').innerHTML = renderMarkdownWithTables(report.summary);
    }

    // Task section
    if (report.taskMarkdown && report.taskMarkdown.trim()) {
      document.getElementById('taskSection').style.display = 'block';
      renderTasks(report.taskMarkdown);
    }

    // Files
    renderFiles();

    // Update rollback all button state
    updateRollbackAllBtn();
  }

  function renderOverviewCards() {
    const el = document.getElementById('taskOverview');
    el.innerHTML =
      '<div class="task-stat files"><div class="value">' + report.files.length + '</div><div class="label">Files Changed</div></div>' +
      '<div class="task-stat additions"><div class="value">+' + report.totalAdditions + '</div><div class="label">Additions</div></div>' +
      '<div class="task-stat deletions"><div class="value">-' + report.totalDeletions + '</div><div class="label">Deletions</div></div>';
  }

  // Pre-process markdown to prevent "N." inside checkbox items from creating
  // nested ordered lists. Escapes the period so marked treats it as plain text.
  function preprocessCheckboxMarkdown(md) {
    return md.replace(/^(\\s*- \\[[ xX]\\] )(\\d+)\\./gm, '$1$2\\\\.');
  }

  function renderMarkdownWithTables(md) {
    let html = '';
    try {
      html = marked.parse(md);
    } catch (e) {
      html = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
    }
    return html
      .split('<table>').join('<div class="table-wrap"><table class="ui-table">')
      .split('</table>').join('</table></div>');
  }

  function renderTasks(taskMd) {
    // Pre-process to fix checkbox items with numbered prefixes
    let html = renderMarkdownWithTables(preprocessCheckboxMarkdown(taskMd));
    // Enhance checkbox rendering
    // Handles both tight lists (<li><input>text</li>) and loose lists (<li><p><input>text</p></li>)
    html = html.replace(
      /<li>\\s*(?:<p>)?\\s*<input([^>]*)>\\s*([\\s\\S]*?)\\s*(?:<\\/p>)?\\s*<\\/li>/gi,
      function(match, attrs, text) {
        if (!/type=(?:"|')checkbox(?:"|')/i.test(attrs)) return match;
        text = text.replace(/^\\s+|\\s+$/g, '');
        if (/checked/i.test(attrs)) {
          return '<li class="task-done">✓ ' + text + '</li>';
        }
        return '<li class="task-pending">☐ ' + text + '</li>';
      }
    );
    // Handle [ ] and [x] syntax
    html = html.replace(
      /<li>\\s*(?:<p>)?\\s*\\[( |x|X)\\]\\s*([\\s\\S]*?)\\s*(?:<\\/p>)?\\s*<\\/li>/gi,
      function(match, check, text) {
        text = text.replace(/^\\s+|\\s+$/g, '');
        if (check.toLowerCase() === 'x') {
          return '<li class="task-done">✓ ' + text + '</li>';
        }
        return '<li class="task-pending">☐ ' + text + '</li>';
      }
    );
    document.getElementById('taskContent').innerHTML = html;
  }

  // ── File Rendering ────────────────────────────
  function renderFiles() {
    const container = document.getElementById('filesList');
    container.innerHTML = '';

    report.files.forEach(function(file, idx) {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.id = 'file-' + idx;
      if (rolledBackFiles.has(file.path)) {
        card.classList.add('rolled-back');
      }

      // Split path into directory and filename
      const lastSlash = file.path.lastIndexOf('/');
      const dir = lastSlash >= 0 ? file.path.substring(0, lastSlash + 1) : '';
      const name = lastSlash >= 0 ? file.path.substring(lastSlash + 1) : file.path;

      // Header
      const header = document.createElement('div');
      header.className = 'file-header';
      header.onclick = function() { toggleFile(idx); };

      header.innerHTML =
        '<span class="file-chevron">▶</span>' +
        '<span class="file-status ' + file.status + '">' + file.status + '</span>' +
        '<span class="file-path"><span class="dir">' + escapeHtml(dir) + '</span><span class="name">' + escapeHtml(name) + '</span></span>' +
        '<span class="file-stats"><span class="add">+' + file.additions + '</span><span class="del">-' + file.deletions + '</span></span>' +
        '<div class="file-actions">' +
          '<button class="rollback-btn' + (rolledBackFiles.has(file.path) ? ' done' : '') + '" ' +
          'onclick="event.stopPropagation(); rollbackFile(' + idx + ')" ' +
          (rolledBackFiles.has(file.path) ? 'disabled' : '') +
          '>' + (rolledBackFiles.has(file.path) ? 'Reverted' : 'Rollback') + '</button>' +
        '</div>';

      card.appendChild(header);

      // Diff
      const diffEl = document.createElement('div');
      diffEl.className = 'file-diff';
      diffEl.innerHTML = renderDiff(file.diff);
      card.appendChild(diffEl);

      container.appendChild(card);
    });
  }

  function renderDiff(diff) {
    if (!diff || !diff.trim()) {
      return '<div style="padding:16px;color:var(--text-dim);font-family:var(--mono);font-size:12px;">(binary file or no diff available)</div>';
    }

    const lines = diff.split('\\n');
    let html = '<table class="diff-table">';
    let oldLine = 0;
    let newLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip diff header lines (---, +++, diff, index)
      if (line.startsWith('diff ') || line.startsWith('index ') ||
          line.startsWith('--- ') || line.startsWith('+++ ') ||
          line.startsWith('old mode') || line.startsWith('new mode') ||
          line.startsWith('new file') || line.startsWith('deleted file') ||
          line.startsWith('similarity') || line.startsWith('rename') ||
          line.startsWith('Binary files')) {
        continue;
      }

      // Hunk header
      if (line.startsWith('@@')) {
        const hunkMatch = line.match(/@@ -(\\d+)(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@(.*)/);
        if (hunkMatch) {
          oldLine = parseInt(hunkMatch[1]);
          newLine = parseInt(hunkMatch[2]);
          const context = hunkMatch[3] || '';
          html += '<tr class="diff-hunk"><td colspan="3">' + escapeHtml(line) + '</td></tr>';
        }
        continue;
      }

      // Added line
      if (line.startsWith('+')) {
        html += '<tr class="diff-add">' +
          '<td class="diff-line-num"></td>' +
          '<td class="diff-line-num">' + newLine + '</td>' +
          '<td class="diff-line-content">' + escapeHtml(line.substring(1)) + '</td></tr>';
        newLine++;
        continue;
      }

      // Deleted line
      if (line.startsWith('-')) {
        html += '<tr class="diff-del">' +
          '<td class="diff-line-num">' + oldLine + '</td>' +
          '<td class="diff-line-num"></td>' +
          '<td class="diff-line-content">' + escapeHtml(line.substring(1)) + '</td></tr>';
        oldLine++;
        continue;
      }

      // Context line (starts with space or is empty)
      if (line.startsWith(' ') || line === '') {
        html += '<tr class="diff-context">' +
          '<td class="diff-line-num">' + oldLine + '</td>' +
          '<td class="diff-line-num">' + newLine + '</td>' +
          '<td class="diff-line-content">' + escapeHtml(line.substring(1) || '') + '</td></tr>';
        oldLine++;
        newLine++;
        continue;
      }

      if (line.includes('Diff preview suppressed for generated or bulky artifact')) {
        var noteText = line.charAt(0) === '+' ? line.substring(1) : line;
        html += '<tr class="diff-note"><td class="diff-line-num"></td><td class="diff-line-num"></td>' +
          '<td class="diff-line-content">' + escapeHtml(noteText) + '</td></tr>';
        continue;
      }

      // Other lines (e.g. \\ No newline at end of file)
      if (line.startsWith('\\\\')) {
        html += '<tr class="diff-context"><td class="diff-line-num"></td><td class="diff-line-num"></td>' +
          '<td class="diff-line-content" style="color:var(--text-dim);font-style:italic;">' + escapeHtml(line) + '</td></tr>';
      }
    }

    html += '</table>';
    return html;
  }

  // ── File Toggle ───────────────────────────────
  window.toggleFile = function(idx) {
    const card = document.getElementById('file-' + idx);
    card.classList.toggle('expanded');
  };

  window.toggleAll = function() {
    allExpanded = !allExpanded;
    const cards = document.querySelectorAll('.file-card');
    cards.forEach(function(card) {
      if (allExpanded) {
        card.classList.add('expanded');
      } else {
        card.classList.remove('expanded');
      }
    });
    document.getElementById('toggleAllBtn').textContent = allExpanded ? 'Collapse All' : 'Expand All';
  };

  // ── Rollback ──────────────────────────────────
  window.rollbackFile = function(idx) {
    const file = report.files[idx];
    pendingRollback = { files: [file.path], type: 'single', idx: idx };
    showRollbackModal([file.path]);
  };

  window.rollbackAll = function() {
    const files = report.files
      .filter(function(f) { return !rolledBackFiles.has(f.path); })
      .map(function(f) { return f.path; });
    if (files.length === 0) {
      showToast('All files already rolled back', 'info');
      return;
    }
    pendingRollback = { files: files, type: 'all' };
    showRollbackModal(files);
  };

  function showRollbackModal(files) {
    document.getElementById('modalFileList').innerHTML = files.map(function(f) {
      return escapeHtml(f);
    }).join('<br>');
    document.getElementById('modalTitle').textContent =
      files.length === 1 ? 'Rollback File' : 'Rollback ' + files.length + ' Files';
    document.getElementById('rollbackModal').classList.add('active');
  }

  window.closeModal = function() {
    document.getElementById('rollbackModal').classList.remove('active');
    pendingRollback = null;
  };

  window.confirmRollback = function() {
    if (!pendingRollback) return;

    const files = pendingRollback.files;
    const confirmBtn = document.getElementById('modalConfirmBtn');
    confirmBtn.textContent = 'Rolling back...';
    confirmBtn.disabled = true;

    fetch('http://localhost:' + PORT + '/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files, baseRef: report.baseRef }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      closeModal();
      if (data.ok) {
        files.forEach(function(f) { rolledBackFiles.add(f); });
        renderFiles();
        updateRollbackAllBtn();
        showToast('Rolled back ' + files.length + ' file' + (files.length > 1 ? 's' : ''), 'success');
        // Notify server about rollback for result tracking
        sendResult('rollback', files);
      } else {
        showToast('Rollback failed: ' + (data.error || 'unknown error'), 'error');
      }
      confirmBtn.textContent = 'Rollback';
      confirmBtn.disabled = false;
    })
    .catch(function(err) {
      closeModal();
      showToast('Rollback failed: ' + err.message, 'error');
      confirmBtn.textContent = 'Rollback';
      confirmBtn.disabled = false;
    });
  };

  function updateRollbackAllBtn() {
    const remaining = report.files.filter(function(f) { return !rolledBackFiles.has(f.path); }).length;
    const btn = document.getElementById('rollbackAllBtn');
    if (remaining === 0) {
      btn.disabled = true;
      btn.textContent = 'All Rolled Back';
    } else {
      btn.disabled = false;
      btn.textContent = 'Rollback All (' + remaining + ')';
    }
  }

  // ── Result Communication ──────────────────────
  function sendResult(action, files) {
    fetch('http://localhost:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        rolledBackFiles: Array.from(rolledBackFiles),
      }),
    }).catch(function() {});
  }

  function showDoneState() {
    var banner = document.createElement('div');
    banner.className = 'done-banner';
    banner.innerHTML = '<div class="done-icon">\u2713</div>' +
      '<div><div class="done-text">Report Complete</div>' +
      '<div class="done-sub">You can close this tab.</div></div>';
    var header = document.querySelector('.header');
    header.parentNode.insertBefore(banner, header.nextSibling);

    document.body.classList.add('done-state');

    var badge = document.getElementById('modeBadge');
    if (badge) {
      badge.textContent = 'DONE';
      badge.style.color = 'var(--success)';
      badge.style.borderColor = 'var(--success)';
    }
  }

  function handleDone() {
    fetch('http://localhost:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'done',
        rolledBackFiles: Array.from(rolledBackFiles),
      }),
    }).then(function() {
      showDoneState();
    }).catch(function() {
      showDoneState();
      showToast('Report closed locally; server did not acknowledge', 'error');
    });
  }

  window.done = handleDone;
  globalThis.done = handleDone;

  window.addEventListener('pagehide', function() {
    try {
      navigator.sendBeacon('http://localhost:' + PORT + '/result', JSON.stringify({
        action: 'closed',
        rolledBackFiles: Array.from(rolledBackFiles)
      }));
    } catch (e) {}
  });

  // ── Copy / Save ───────────────────────────────
  window.copyReport = function() {
    const text = buildReportText();
    navigator.clipboard.writeText(text).then(function() {
      showToast('Report copied to clipboard', 'success');
    }).catch(function() {
      showToast('Copy failed', 'error');
    });
  };

  window.saveReport = function() {
    const text = buildReportText();
    fetch('http://localhost:' + PORT + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      showToast(data.message || 'Saved', 'success');
    })
    .catch(function() {
      showToast('Save failed', 'error');
    });
  };

  window.downloadStandalone = function() {
    fetch('http://localhost:' + PORT + '/export-standalone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      showToast(data.message || 'Standalone export saved', 'success');
    })
    .catch(function() {
      showToast('Standalone export failed', 'error');
    });
  };

  function buildReportText() {
    let text = '# ' + report.title + '\\n\\n';
    text += '## Summary\\n\\n';
    text += 'Files Changed: ' + report.files.length + '\\n';
    text += 'Additions: +' + report.totalAdditions + '\\n';
    text += 'Deletions: -' + report.totalDeletions + '\\n\\n';
    if (report.summary) {
      text += report.summary + '\\n\\n';
    }
    text += '## Files\\n\\n';
    report.files.forEach(function(f) {
      const rb = rolledBackFiles.has(f.path) ? ' [ROLLED BACK]' : '';
      text += '- [' + f.status.toUpperCase() + '] ' + f.path + ' (+' + f.additions + ' -' + f.deletions + ')' + rb + '\\n';
    });
    if (rolledBackFiles.size > 0) {
      text += '\\n## Rolled Back Files\\n\\n';
      rolledBackFiles.forEach(function(f) {
        text += '- ' + f + '\\n';
      });
    }
    return text;
  }

  // ── Toast ─────────────────────────────────────
  function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(function() { toast.className = 'toast'; }, 3000);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Boot ──────────────────────────────────────
  init();
})();
<\/script>
</body>
</html>`;
}
