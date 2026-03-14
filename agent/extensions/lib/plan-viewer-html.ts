// ABOUTME: Self-contained HTML template for the Plan Viewer GUI window.
// ABOUTME: Renders markdown with marked.js, supports checkboxes, inline editing, reorder, approve/decline.

/**
 * Generate the full HTML page for the plan viewer window.
 * This is a single self-contained page with all CSS/JS inlined.
 */
export function generatePlanViewerHTML(opts: {
	markdown: string;
	title: string;
	mode: "plan" | "questions";
	port: number;
}): string {
	const { markdown, title, mode, port } = opts;
	// Escape </ sequences to prevent </script> in content from breaking the script block
	const escapedMarkdown = JSON.stringify(markdown).replace(/<\//g, '<\\/');
	const escapedTitle = JSON.stringify(title).replace(/<\//g, '<\\/');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Plan Viewer</title>
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
    --answer-bg: rgba(78, 205, 196, 0.06);
    --cursor-bg: rgba(78, 205, 196, 0.06);
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
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    margin: 12px 16px 0;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    position: sticky;
    top: 12px;
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
  .header .badge.questions { color: var(--success); border-color: var(--success); }
  .header .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .header .progress {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-muted);
  }
  .header .modified-badge {
    font-size: 10px;
    font-family: var(--mono);
    font-weight: 600;
    color: var(--warning);
    border: 1px solid var(--warning);
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: none;
  }

  /* ── Content Area ────────────────────── */
  .content {
    flex: 1;
    width: 100%;
    padding: 12px 24px 100px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .content.scrollable {
    overflow: auto;
  }

  /* ── Markdown Rendering ──────────────── */
  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 {
    color: var(--text);
    margin: 28px 0 12px;
    font-weight: 600;
    line-height: 1.3;
  }
  .markdown-body h1 {
    font-size: 22px;
    color: var(--accent);
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
    letter-spacing: -0.3px;
  }
  .markdown-body h2 {
    font-size: 16px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    font-weight: 700;
  }
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
  .markdown-body pre code {
    background: none;
    padding: 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
  }
  .markdown-body blockquote {
    border-left: 3px solid var(--accent);
    background: var(--accent-dim);
    padding: 12px 16px;
    border-radius: 0 6px 6px 0;
    margin: 12px 0;
    color: var(--text-muted);
    font-size: 14px;
  }
  .markdown-body table {
    border-collapse: collapse;
    margin: 12px 0;
    width: 100%;
    font-size: 13px;
  }
  .markdown-body th, .markdown-body td {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
  }
  .markdown-body th {
    background: var(--surface);
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
    font-family: var(--mono);
  }
  .markdown-body td { color: var(--text-muted); }
  .markdown-body hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }
  .markdown-body a { color: var(--accent); text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body strong { color: var(--text); font-weight: 600; }
  .markdown-body em { color: var(--text-muted); }

  /* ── Structured Plan: Phase Blocks ───── */
  .phase-block {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 20px 24px 16px;
    margin: 20px 0;
    position: relative;
  }
  .phase-block .phase-number {
    position: absolute;
    top: -12px;
    left: 16px;
    background: var(--accent);
    color: var(--bg);
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    padding: 3px 12px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .phase-block h2 {
    margin-top: 4px !important;
    border-bottom: none !important;
    padding-bottom: 0 !important;
  }

  /* ── Structured Plan: Why callout ────── */
  .why-callout {
    background: rgba(41, 128, 185, 0.06);
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
    padding: 10px 16px;
    margin: 12px 0;
    font-size: 14px;
    color: var(--text-muted);
  }
  .why-callout strong { color: var(--accent); }

  /* ── Structured Plan: File indicators ── */
  .file-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 0 6px;
    padding: 6px 0;
  }
  .file-indicator .file-action {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 3px 10px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .file-indicator .file-action.new {
    background: rgba(72, 216, 137, 0.12);
    color: var(--success);
    border: 1px solid rgba(72, 216, 137, 0.3);
  }
  .file-indicator .file-action.modify {
    background: rgba(240, 180, 41, 0.12);
    color: var(--warning);
    border: 1px solid rgba(240, 180, 41, 0.3);
  }
  .file-indicator .file-action.test {
    background: rgba(41, 128, 185, 0.12);
    color: var(--accent);
    border: 1px solid rgba(41, 128, 185, 0.3);
  }
  .file-indicator .file-action.reference {
    background: var(--surface2);
    color: var(--text-dim);
    border: 1px solid var(--border);
  }
  .file-indicator .file-action.readonly {
    background: var(--surface2);
    color: var(--text-dim);
    border: 1px solid var(--border);
  }
  .file-indicator .file-path {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    word-break: break-all;
  }

  /* ── Structured Plan: Critical Files ─── */
  .critical-files-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
    margin: 20px 0;
  }
  .critical-files-section h2 {
    margin-top: 0 !important;
    font-size: 13px !important;
  }
  .critical-files-section table {
    margin-top: 12px;
  }
  .critical-files-section td:first-child {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    white-space: nowrap;
  }
  .critical-files-section td:last-child {
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ── Structured Plan: Reusable section ─ */
  .reusable-section {
    background: rgba(72, 216, 137, 0.04);
    border: 1px solid rgba(72, 216, 137, 0.15);
    border-left: 3px solid var(--success);
    border-radius: 0 8px 8px 0;
    padding: 16px 20px;
    margin: 20px 0;
  }
  .reusable-section h2 {
    color: var(--success) !important;
    margin-top: 0 !important;
    font-size: 13px !important;
  }

  /* ── Structured Plan: Verification ───── */
  .verification-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 16px 20px;
    margin: 20px 0;
  }
  .verification-section h2 {
    margin-top: 0 !important;
    font-size: 13px !important;
  }
  .verification-section ol {
    counter-reset: verify-counter;
    list-style: none;
    padding-left: 0;
  }
  .verification-section ol li {
    counter-increment: verify-counter;
    position: relative;
    padding-left: 32px;
    margin: 8px 0;
  }
  .verification-section ol li::before {
    content: counter(verify-counter);
    position: absolute;
    left: 0;
    top: 1px;
    width: 22px;
    height: 22px;
    background: var(--accent-dim);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    border-radius: 4px;
    border: 1px solid rgba(41, 128, 185, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 22px;
  }

  /* ── Structured Plan: Phase separator ── */
  .phase-separator {
    border: none;
    border-top: 1px dashed var(--border);
    margin: 28px 0;
    position: relative;
  }

  /* ── Checkbox Items ──────────────────── */
  .plan-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    margin: 1px 0;
    cursor: default;
    transition: background 0.15s;
    border-left: 2px solid transparent;
  }
  .plan-item:hover {
    background: var(--cursor-bg);
    border-left-color: var(--accent);
  }
  .plan-item.checked { border-left-color: var(--success); }
  .plan-item.checked .plan-item-text {
    color: var(--text-dim);
    text-decoration: line-through;
  }
  .plan-item input[type="checkbox"] {
    appearance: none;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--text-dim);
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 3px;
    position: relative;
    transition: all 0.15s;
  }
  .plan-item input[type="checkbox"]:hover { border-color: var(--accent); }
  .plan-item input[type="checkbox"]:checked {
    background: var(--success);
    border-color: var(--success);
  }
  .plan-item input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 4px;
    width: 5px;
    height: 8px;
    border: solid #1a1d23;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .plan-item-text {
    flex: 1;
    color: var(--text-muted);
    font-size: 14px;
    min-height: 22px;
  }
  .plan-item-text[contenteditable="true"] {
    outline: none;
    color: var(--text);
    border-bottom: 1px dashed var(--accent);
    padding-bottom: 2px;
  }
  .plan-item .drag-handle {
    cursor: grab;
    color: var(--text-dim);
    padding: 0 4px;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.15s;
    user-select: none;
  }
  .plan-item:hover .drag-handle { opacity: 0.6; }
  .plan-item .drag-handle:active { cursor: grabbing; }
  .plan-item .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    border-radius: 3px;
    opacity: 0;
    transition: all 0.15s;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .plan-item:hover .delete-btn { opacity: 1; }
  .plan-item .delete-btn:hover { color: var(--error); background: rgba(232, 88, 88, 0.1); }

  /* ── Question Items ──────────────────── */
  .question-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 16px;
    margin: 12px 0;
    transition: border-color 0.15s;
  }
  .question-item:focus-within { border-color: var(--accent); }
  .question-item .question-text {
    color: var(--text);
    font-weight: 500;
    font-size: 14px;
    margin-bottom: 8px;
  }
  .question-item .question-default {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .question-item .answer-input {
    width: 100%;
    background: var(--answer-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.15s;
  }
  .question-item .answer-input:focus { border-color: var(--accent); }
  .question-item .answer-input::placeholder { color: var(--text-dim); }
  .question-item.answered { border-left-color: var(--success); }
  .question-item.answered .answer-input { border-color: var(--success); }
  .question-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--accent);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    width: 22px;
    height: 22px;
    border-radius: 4px;
    margin-right: 8px;
  }

  /* ── Raw Markdown View ───────────────── */
  .raw-view {
    display: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px;
    flex: 1;
    min-height: 0;
  }
  .raw-view.active {
    display: flex;
    flex-direction: column;
  }
  .raw-view textarea {
    width: 100%;
    flex: 1;
    min-height: 0;
    background: transparent;
    color: var(--text-muted);
    border: none;
    outline: none;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.7;
    resize: none;
  }

  /* ── Footer ──────────────────────────── */
  .footer-wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
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
  .toggle-bar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px 0;
    position: sticky;
    top: 68px;
    z-index: 99;
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

  .btn-success {
    background: transparent;
    color: var(--success);
    border-color: var(--success);
    font-weight: 600;
  }
  .btn-success:hover { background: var(--success-bg); }

  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-dim);
    font-size: 12px;
  }
  .btn-ghost:hover { color: var(--text-muted); background: var(--surface2); }

  .btn-icon {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Toggle switch ───────────────────── */
  .view-toggle {
    display: flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .view-toggle button {
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
  .view-toggle button:hover { color: var(--text-muted); }
  .view-toggle button.active {
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 600;
  }

  /* ── Notification toast ──────────────── */
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

  /* ── Sortable drag ───────────────────── */
  .plan-item.dragging { opacity: 0.4; background: var(--surface2); }
  .plan-item.drag-over { border-top: 2px solid var(--accent); }

  /* ── Approved State ──────────────────── */
  .approved-banner {
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
  .approved-banner .approved-content {
    min-width: 0;
    flex: 1;
  }
  .approved-banner .approved-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .approved-banner .approved-actions .btn {
    white-space: nowrap;
  }
  .approved-banner .approved-icon {
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
  .approved-banner .approved-text {
    font-size: 15px;
    font-weight: 600;
    color: var(--success);
    font-family: var(--mono);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .approved-banner .approved-sub {
    font-size: 12px;
    color: var(--text-dim);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    margin-top: 2px;
  }

  /* When approved, disable all interactive elements */
  body.approved-state .plan-item { cursor: default; }
  body.approved-state .plan-item:hover { background: transparent; border-left-color: transparent; }
  body.approved-state .plan-item.checked:hover { border-left-color: var(--success); }
  body.approved-state .plan-item input[type="checkbox"] { pointer-events: none; }
  body.approved-state .plan-item .drag-handle { display: none; }
  body.approved-state .plan-item .delete-btn { display: none; }
  body.approved-state .plan-item-text { cursor: default; }
  body.approved-state .footer-wrapper { display: none; }
  body.approved-state .toggle-bar { display: none; }
  body.approved-state .header .modified-badge { display: none !important; }
  body.approved-state .content { padding-bottom: 24px; }

  /* ── Responsive ──────────────────────── */
  @media (max-width: 600px) {
    .content { padding: 12px 12px 130px; }
    .header { padding: 10px 12px; }
    .footer { padding: 10px 12px; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span class="badge ${mode === "questions" ? "questions" : ""}" id="modeBadge">
    ${mode === "questions" ? "QUESTIONS" : "PLAN"}
  </span>
  <span class="title" id="titleText">${title}</span>
  <span class="progress" id="progressText"></span>
  <span class="modified-badge" id="modifiedBadge">modified</span>
  <img src="/logo.png" alt="agent" class="header-logo">
</div>
<!-- View Toggle Bar -->
<div class="toggle-bar">
  <div class="view-toggle">
    <button class="active" id="btnRendered" onclick="setView('rendered')">Rendered</button>
    <button id="btnRaw" onclick="setView('raw')">Markdown</button>
  </div>
</div>

<!-- Content -->
<div class="content scrollable">
  <div id="renderedView" class="markdown-body" style="display:block;"></div>
  <div id="rawView" class="raw-view">
    <textarea id="rawEditor" spellcheck="false"></textarea>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <button class="btn btn-ghost" onclick="copyToClipboard()" title="Copy markdown"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
    <button class="btn btn-ghost" onclick="saveToDesktop()" title="Save to desktop"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Save</button>
    <button class="btn btn-ghost" onclick="downloadStandalone()" title="Download standalone read-only HTML"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Standalone</button>
    <div class="spacer"></div>
    <button class="btn" onclick="decline()" id="btnDecline">Close</button>
    <button class="btn btn-primary" onclick="approve()" id="btnApprove">
      ${mode === "questions" ? "Submit Answers" : "Approve Plan"}
    </button>
  </div>

</div>

<!-- marked.js (markdown parser) — loaded from CDN for simplicity -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>

<script>
(function() {
  // ── State ─────────────────────────────────────
  const PORT = ${port};
  const MODE = ${JSON.stringify(mode).replace(/<\//g, '<\\/')};
  let markdown = ${escapedMarkdown};
  let originalMarkdown = markdown;
  let modified = false;
  let currentView = 'rendered';
  let answers = {};  // questionId -> answer text
  let questionCount = 0;

  // ── Marked config ─────────────────────────────
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }

  // ── Render ────────────────────────────────────
  function render() {
    if (MODE === 'questions') {
      renderQuestions();
    } else {
      renderPlan();
    }
    document.getElementById('rawEditor').value = markdown;
    updateModifiedState();
  }

  // Pre-process markdown to prevent "N." inside checkbox items from creating
  // nested ordered lists. Escapes the period so marked treats it as plain text.
  function preprocessCheckboxMarkdown(md) {
    return md.replace(/^(\\s*- \\[[ xX]\\] )(\\d+)\\./gm, '$1$2\\\\.');
  }

  function renderPlan() {
    const container = document.getElementById('renderedView');
    // Pre-process to fix checkbox items with numbered prefixes (e.g. "- [ ] 1. text")
    const preprocessed = preprocessCheckboxMarkdown(markdown);
    // Parse markdown and convert checkbox syntax to interactive elements
    let html = marked.parse(preprocessed);

    // Convert checkbox list items to interactive plan items
    // Handles both tight lists (<li><input>text</li>) and loose lists (<li><p><input>text</p></li>)
    html = html.replace(
      /<li>\\s*(?:<p>)?\\s*<input([^>]*)>\\s*([\\s\\S]*?)\\s*(?:<\\/p>)?\\s*<\\/li>/gi,
      function(match, attrs, text) {
        if (!/type=(?:"|')checkbox(?:"|')/i.test(attrs)) return match;
        // Clean up any stray whitespace/newlines in the captured text
        text = text.replace(/^\\s+|\\s+$/g, '');
        const isChecked = /checked/i.test(attrs) ? 'checked' : '';
        const checkedClass = /checked/i.test(attrs) ? ' checked' : '';
        return '<li class="plan-item' + checkedClass + '" draggable="true">' +
          '<span class="drag-handle"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="3" cy="2" r="1"/><circle cx="7" cy="2" r="1"/><circle cx="3" cy="5" r="1"/><circle cx="7" cy="5" r="1"/><circle cx="3" cy="8" r="1"/><circle cx="7" cy="8" r="1"/></svg></span>' +
          '<input type="checkbox" ' + isChecked + ' onchange="toggleCheckbox(this)">' +
          '<span class="plan-item-text" ondblclick="startEdit(this)">' + text + '</span>' +
          '<button class="delete-btn" onclick="deleteItem(this)" title="Delete item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</li>';
      }
    );

    // Also handle [ ] and [x] that marked might not convert
    html = html.replace(
      /<li>\\s*(?:<p>)?\\s*\\[( |x|X)\\]\\s*([\\s\\S]*?)\\s*(?:<\\/p>)?\\s*<\\/li>/gi,
      function(match, check, text) {
        text = text.replace(/^\\s+|\\s+$/g, '');
        const isChecked = check.toLowerCase() === 'x' ? 'checked' : '';
        const checkedClass = check.toLowerCase() === 'x' ? ' checked' : '';
        return '<li class="plan-item' + checkedClass + '" draggable="true">' +
          '<span class="drag-handle"><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="3" cy="2" r="1"/><circle cx="7" cy="2" r="1"/><circle cx="3" cy="5" r="1"/><circle cx="7" cy="5" r="1"/><circle cx="3" cy="8" r="1"/><circle cx="7" cy="8" r="1"/></svg></span>' +
          '<input type="checkbox" ' + isChecked + ' onchange="toggleCheckbox(this)">' +
          '<span class="plan-item-text" ondblclick="startEdit(this)">' + text + '</span>' +
          '<button class="delete-btn" onclick="deleteItem(this)" title="Delete item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</li>';
      }
    );

    container.innerHTML = html;
    enhanceStructuredPlan(container);
    setupDragAndDrop();
  }

  // ── Post-process rendered HTML for structured plan format ──
  function enhanceStructuredPlan(container) {
    // 1. Detect phase headings (## Phase N: ...) and wrap them in phase blocks
    var headings = container.querySelectorAll('h2');
    headings.forEach(function(h2) {
      var text = h2.textContent || '';

      // Phase headings: "Phase N: Title" or "Phase N: Title (TDD)"
      var phaseMatch = text.match(/^Phase\\s+(\\d+)\\s*[:.]\\s*(.+)/i);
      if (phaseMatch) {
        var phaseNum = phaseMatch[1];
        // Wrap the h2 and all siblings until the next h2 or hr in a phase-block div
        var block = document.createElement('div');
        block.className = 'phase-block';
        var badge = document.createElement('span');
        badge.className = 'phase-number';
        badge.textContent = 'PHASE ' + phaseNum;
        block.appendChild(badge);

        h2.parentNode.insertBefore(block, h2);
        block.appendChild(h2);

        // Collect siblings until next h2, hr, or end
        var next = block.nextSibling;
        while (next) {
          var nextEl = next;
          next = next.nextSibling;
          if (nextEl.nodeType === 1) {
            var tag = nextEl.tagName;
            if (tag === 'H2' || tag === 'H1') break;
            if (tag === 'HR') {
              // Convert HR between phases to phase-separator
              nextEl.className = 'phase-separator';
              break;
            }
          }
          block.appendChild(nextEl);
        }

        // Enhance "Why:" paragraphs inside phase blocks
        var paras = block.querySelectorAll('p');
        paras.forEach(function(p) {
          var pStrong = p.querySelector('strong');
          if (pStrong && /^Why:/i.test(pStrong.textContent)) {
            p.className = 'why-callout';
          }
        });

        // Enhance file indicator paragraphs: "Test first →", "New file →", "Modify →"
        paras.forEach(function(p) {
          var pStrong = p.querySelector('strong');
          if (!pStrong) return;
          var strongText = pStrong.textContent || '';
          var actionType = null;
          var actionLabel = null;

          if (/^Test first/i.test(strongText)) {
            actionType = 'test';
            actionLabel = 'TEST';
          } else if (/^New file/i.test(strongText)) {
            actionType = 'new';
            actionLabel = 'NEW';
          } else if (/^Modify/i.test(strongText)) {
            actionType = 'modify';
            actionLabel = 'MODIFY';
          }

          if (actionType) {
            // Extract the file path from the code element if present
            var codeEl = p.querySelector('code');
            var filePath = codeEl ? codeEl.textContent : '';

            var indicator = document.createElement('div');
            indicator.className = 'file-indicator';
            indicator.innerHTML =
              '<span class="file-action ' + actionType + '">' + actionLabel + '</span>' +
              (filePath ? '<span class="file-path">' + escapeHtml(filePath) + '</span>' : '');

            p.parentNode.insertBefore(indicator, p);
            p.style.display = 'none';
          }
        });

        return;
      }

      // Critical Files section
      if (/^Critical Files/i.test(text)) {
        var section = document.createElement('div');
        section.className = 'critical-files-section';
        h2.parentNode.insertBefore(section, h2);
        section.appendChild(h2);

        var nextSib = section.nextSibling;
        while (nextSib) {
          var nextNode = nextSib;
          nextSib = nextSib.nextSibling;
          if (nextNode.nodeType === 1) {
            var nt = nextNode.tagName;
            if (nt === 'H2' || nt === 'H1' || nt === 'HR') break;
          }
          section.appendChild(nextNode);
        }

        // Color-code the Action column based on content
        var cells = section.querySelectorAll('td:last-child');
        cells.forEach(function(td) {
          var val = (td.textContent || '').toLowerCase();
          if (val.indexOf('new') === 0) {
            td.style.color = 'var(--success)';
          } else if (val.indexOf('modify') === 0) {
            td.style.color = 'var(--warning)';
          } else if (val.indexOf('reference') === 0 || val.indexOf('read-only') === 0) {
            td.style.color = 'var(--text-dim)';
          }
        });
        return;
      }

      // Reusable Components section
      if (/^Reusable Components/i.test(text)) {
        var reuseSec = document.createElement('div');
        reuseSec.className = 'reusable-section';
        h2.parentNode.insertBefore(reuseSec, h2);
        reuseSec.appendChild(h2);

        var rn = reuseSec.nextSibling;
        while (rn) {
          var rNext = rn;
          rn = rn.nextSibling;
          if (rNext.nodeType === 1) {
            var rt = rNext.tagName;
            if (rt === 'H2' || rt === 'H1' || rt === 'HR') break;
          }
          reuseSec.appendChild(rNext);
        }
        return;
      }

      // Verification section
      if (/^Verification/i.test(text)) {
        var verifySec = document.createElement('div');
        verifySec.className = 'verification-section';
        h2.parentNode.insertBefore(verifySec, h2);
        verifySec.appendChild(h2);

        var vn = verifySec.nextSibling;
        while (vn) {
          var vNext = vn;
          vn = vn.nextSibling;
          if (vNext.nodeType === 1) {
            var vt = vNext.tagName;
            if (vt === 'H2' || vt === 'H1' || vt === 'HR') break;
          }
          verifySec.appendChild(vNext);
        }
        return;
      }
    });

    // 2. Convert remaining HRs between sections to phase separators
    container.querySelectorAll('hr').forEach(function(hr) {
      if (!hr.className) hr.className = 'phase-separator';
    });
  }

  function renderQuestions() {
    const container = document.getElementById('renderedView');
    const lines = markdown.split('\\n');
    let html = '';
    let qNum = 0;

    // First pass: render non-question content as markdown, questions as interactive cards
    let buffer = [];

    for (const line of lines) {
      const isQuestion = isQuestionLine(line);
      if (isQuestion) {
        // Flush buffer as markdown
        if (buffer.length > 0) {
          html += '<div class="markdown-body">' + marked.parse(buffer.join('\\n')) + '</div>';
          buffer = [];
        }
        qNum++;
        const qText = extractQuestionText(line);
        const defaultVal = extractDefaultValue(line);
        const qId = 'q' + qNum;
        const existing = answers[qId] || '';
        const answered = existing.trim().length > 0 ? ' answered' : '';

        html += '<div class="question-item' + answered + '" data-qid="' + qId + '">' +
          '<div class="question-text"><span class="question-number">' + qNum + '</span>' + escapeHtml(qText) + '</div>' +
          (defaultVal ? '<div class="question-default">Default: ' + escapeHtml(defaultVal) + '</div>' : '') +
          '<input type="text" class="answer-input" data-qid="' + qId + '" ' +
          'placeholder="' + (defaultVal ? 'Press Enter for default: ' + escapeHtml(defaultVal) : 'Type your answer...') + '" ' +
          'value="' + escapeHtml(existing) + '" ' +
          'oninput="updateAnswer(this)" onkeydown="handleAnswerKey(event, this)">' +
          '</div>';
      } else {
        buffer.push(line);
      }
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      html += '<div class="markdown-body">' + marked.parse(buffer.join('\\n')) + '</div>';
    }

    questionCount = qNum;
    container.innerHTML = html;
    updateProgress();
  }

  function isQuestionLine(line) {
    const trimmed = line.trim();
    // Numbered question: "1. ... ?" or "1) ... ?"
    if (/^\\d+[.)\\s]/.test(trimmed) && (trimmed.endsWith('?') || /Default:/i.test(trimmed))) return true;
    // Bullet question ending with ?
    if (/^[-*+]\\s/.test(trimmed) && trimmed.endsWith('?')) return true;
    // Any line ending with ? that's not too short
    if (trimmed.endsWith('?') && trimmed.length > 10) return true;
    // Line containing Default:
    if (/\\b_?Default:\\s/i.test(trimmed) && trimmed.length > 10) return true;
    return false;
  }

  function extractQuestionText(line) {
    return line.replace(/^\\s*\\d+[.)\\s]+/, '').replace(/^\\s*[-*+]\\s+/, '').replace(/_?Default:[^_]*_?/gi, '').trim();
  }

  function extractDefaultValue(line) {
    const m = line.match(/_?Default:\\s*([^_]+)_?/i);
    return m ? m[1].trim() : null;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Question handling ─────────────────────────
  window.updateAnswer = function(input) {
    const qid = input.dataset.qid;
    answers[qid] = input.value;
    const card = input.closest('.question-item');
    if (input.value.trim()) {
      card.classList.add('answered');
    } else {
      card.classList.remove('answered');
    }
    updateProgress();
  };

  window.handleAnswerKey = function(e, input) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Accept default if empty
      const qid = input.dataset.qid;
      if (!input.value.trim()) {
        const defEl = input.parentElement.querySelector('.question-default');
        if (defEl) {
          const defaultVal = defEl.textContent.replace('Default: ', '');
          input.value = defaultVal;
          answers[qid] = defaultVal;
          input.parentElement.classList.add('answered');
          updateProgress();
        }
      }
      // Jump to next question
      const allInputs = document.querySelectorAll('.answer-input');
      const idx = Array.from(allInputs).indexOf(input);
      if (idx < allInputs.length - 1) {
        allInputs[idx + 1].focus();
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const allInputs = document.querySelectorAll('.answer-input');
      const idx = Array.from(allInputs).indexOf(input);
      const next = e.shiftKey ? idx - 1 : idx + 1;
      if (next >= 0 && next < allInputs.length) {
        allInputs[next].focus();
      }
    }
  };

  function updateProgress() {
    const answered = Object.values(answers).filter(a => a.trim().length > 0).length;
    const el = document.getElementById('progressText');
    if (questionCount > 0) {
      el.textContent = answered + '/' + questionCount + ' answered';
    } else if (MODE === 'plan') {
      // Show phase count for structured plans, or checkbox count for flat plans
      var phases = document.querySelectorAll('.phase-block');
      if (phases.length > 0) {
        el.textContent = phases.length + ' phases';
      } else {
        var checks = document.querySelectorAll('.plan-item');
        var done = document.querySelectorAll('.plan-item.checked');
        if (checks.length > 0) {
          el.textContent = done.length + '/' + checks.length + ' done';
        }
      }
    }
  }

  // ── Plan item interactions ────────────────────
  window.toggleCheckbox = function(cb) {
    const li = cb.closest('.plan-item');
    if (cb.checked) {
      li.classList.add('checked');
    } else {
      li.classList.remove('checked');
    }
    syncMarkdownFromDOM();
  };

  window.deleteItem = function(btn) {
    const li = btn.closest('.plan-item');
    li.style.transition = 'opacity 0.2s, transform 0.2s';
    li.style.opacity = '0';
    li.style.transform = 'translateX(-20px)';
    setTimeout(function() {
      li.remove();
      syncMarkdownFromDOM();
    }, 200);
  };

  window.startEdit = function(el) {
    el.contentEditable = 'true';
    el.focus();
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    el.onblur = function() {
      el.contentEditable = 'false';
      el.onblur = null;
      syncMarkdownFromDOM();
    };
    el.onkeydown = function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
      if (e.key === 'Escape') {
        el.blur();
      }
    };
  };

  function syncMarkdownFromDOM() {
    // Rebuild markdown from the rendered DOM, handling edits, reorders, and deletions
    const lines = markdown.split('\\n');
    const checkboxItems = Array.from(document.querySelectorAll('.plan-item'));

    // Build a set of current item texts from DOM
    const domItems = checkboxItems.map(function(item) {
      const checked = item.querySelector('input[type="checkbox"]').checked;
      const text = item.querySelector('.plan-item-text').textContent;
      return { checked: checked, text: text };
    });

    // Separate checkbox lines from non-checkbox lines, preserving structure
    var sections = [];
    var currentNonCb = [];
    var cbCount = 0;

    for (var i = 0; i < lines.length; i++) {
      var cbMatch = lines[i].match(/^(\\s*)- \\[[ xX]\\]\\s+(.*)/);
      if (cbMatch) {
        if (currentNonCb.length > 0) {
          sections.push({ type: 'text', lines: currentNonCb });
          currentNonCb = [];
        }
        // Check if we still have this item in DOM
        if (cbCount < domItems.length) {
          var d = domItems[cbCount];
          sections.push({ type: 'cb', indent: cbMatch[1], checked: d.checked, text: d.text });
          cbCount++;
        }
        // If cbCount >= domItems.length, this line was deleted — skip it
      } else {
        currentNonCb.push(lines[i]);
      }
    }
    if (currentNonCb.length > 0) {
      sections.push({ type: 'text', lines: currentNonCb });
    }

    // Rebuild
    var newLines = [];
    for (var s = 0; s < sections.length; s++) {
      if (sections[s].type === 'text') {
        newLines = newLines.concat(sections[s].lines);
      } else {
        newLines.push(sections[s].indent + '- [' + (sections[s].checked ? 'x' : ' ') + '] ' + sections[s].text);
      }
    }

    markdown = newLines.join('\\n');
    updateModifiedState();
  }

  // ── Drag and drop ─────────────────────────────
  function setupDragAndDrop() {
    const items = document.querySelectorAll('.plan-item[draggable="true"]');
    items.forEach(item => {
      item.addEventListener('dragstart', function(e) {
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        syncMarkdownFromDOM();
      });
      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });
      item.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
      });
      item.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        const dragging = document.querySelector('.dragging');
        if (dragging && dragging !== this) {
          const list = this.parentNode;
          const rect = this.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (e.clientY < mid) {
            list.insertBefore(dragging, this);
          } else {
            list.insertBefore(dragging, this.nextSibling);
          }
        }
      });
    });
  }

  // ── View toggle ───────────────────────────────
  window.setView = function(view) {
    currentView = view;
    const rendered = document.getElementById('renderedView');
    const raw = document.getElementById('rawView');
    const btnR = document.getElementById('btnRendered');
    const btnM = document.getElementById('btnRaw');

    const content = document.querySelector('.content');
    if (view === 'raw') {
      rendered.style.display = 'none';
      raw.classList.add('active');
      content.classList.remove('scrollable');
      btnR.classList.remove('active');
      btnM.classList.add('active');
      document.getElementById('rawEditor').value = markdown;
    } else {
      // Sync from raw editor if switching back
      markdown = document.getElementById('rawEditor').value;
      rendered.style.display = 'block';
      raw.classList.remove('active');
      content.classList.add('scrollable');
      btnR.classList.add('active');
      btnM.classList.remove('active');
      render();
    }
    updateModifiedState();
  };

  // ── Modified state ────────────────────────────
  function updateModifiedState() {
    modified = (markdown !== originalMarkdown);
    document.getElementById('modifiedBadge').style.display = modified ? 'inline' : 'none';
  }

  // ── Actions ───────────────────────────────────
  window.approve = function() {
    // Sync from raw editor if in raw view
    if (currentView === 'raw') {
      markdown = document.getElementById('rawEditor').value;
    }
    sendResult('approved');
  };

  window.decline = function() {
    sendResult('declined');
  };

  window.copyToClipboard = function() {
    if (currentView === 'raw') {
      markdown = document.getElementById('rawEditor').value;
    }
    navigator.clipboard.writeText(markdown).then(() => {
      showToast('Copied to clipboard');
    }).catch(() => {
      showToast('Copy failed');
    });
  };

  window.saveToDesktop = function() {
    if (currentView === 'raw') {
      markdown = document.getElementById('rawEditor').value;
    }
    // Send save request to server
    fetch('http://localhost:' + PORT + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: markdown }),
    }).then(r => r.json()).then(data => {
      showToast(data.message || 'Saved');
    }).catch(() => {
      showToast('Save failed');
    });
  };

  window.downloadStandalone = function() {
    if (currentView === 'raw') {
      markdown = document.getElementById('rawEditor').value;
    }
    fetch('http://localhost:' + PORT + '/export-standalone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: markdown }),
    }).then(r => r.json()).then(data => {
      showToast(data.message || 'Standalone export saved');
    }).catch(() => {
      showToast('Standalone export failed');
    });
  };

  function sendResult(action) {
    const body = {
      action: action,
      markdown: markdown,
      modified: modified,
    };

    if (MODE === 'questions') {
      // Build formatted answers
      const answerLines = [];
      document.querySelectorAll('.question-item').forEach(card => {
        const qText = card.querySelector('.question-text').textContent.trim();
        const input = card.querySelector('.answer-input');
        const answer = input.value.trim();
        const defEl = card.querySelector('.question-default');
        const defaultVal = defEl ? defEl.textContent.replace('Default: ', '').trim() : null;

        if (answer) {
          answerLines.push(qText + ' → ' + answer);
        } else if (defaultVal) {
          answerLines.push(qText + ' → (default: ' + defaultVal + ')');
        } else {
          answerLines.push(qText + ' → (no answer)');
        }
      });
      body.answers = answerLines.join('\\n');
      body.answerMap = answers;
    }

    fetch('http://localhost:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => {
      if (action === 'approved' || action === 'submitted') {
        // Show approved state: banner + full read-only content
        var label = MODE === 'questions' ? 'Answers Submitted' : 'Plan Approved';
        var sub = MODE === 'questions' ? 'Your answers have been sent to the agent.' : 'The agent will now proceed with implementation.';

        // Insert approved banner after header
        var banner = document.createElement('div');
        banner.className = 'approved-banner';
        banner.innerHTML = '<div class="approved-icon">✓</div>' +
          '<div class="approved-content"><div class="approved-text">' + label + '</div>' +
          '<div class="approved-sub">' + sub + '</div></div>' +
          '<div class="approved-actions">' +
          '<button class="btn btn-ghost" onclick="copyToClipboard()">Copy</button>' +
          '<button class="btn btn-ghost" onclick="saveToDesktop()">Save</button>' +
          '<button class="btn btn-ghost" onclick="downloadStandalone()">Standalone</button>' +
          '</div>';
        var header = document.querySelector('.header');
        header.parentNode.insertBefore(banner, header.nextSibling);

        // Switch to approved state (disables all interactivity via CSS)
        document.body.classList.add('approved-state');

        // Update header badge
        var badge = document.getElementById('modeBadge');
        if (badge) {
          badge.textContent = MODE === 'questions' ? 'SUBMITTED' : 'APPROVED';
          badge.style.color = 'var(--success)';
          badge.style.borderColor = 'var(--success)';
        }

        // Ensure rendered view is showing (not raw)
        if (currentView === 'raw') {
          setView('rendered');
        }
      } else {
        // Closed/declined — show simple close message
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-muted);font-family:var(--font);">' +
          '<div style="text-align:center"><p style="font-size:20px;margin-bottom:8px;">Closed</p>' +
          '<p style="color:var(--text-dim);">You can close this tab.</p></div></div>';
      }
    }).catch(() => {
      showToast('Failed to send result');
    });
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ── Raw editor sync ───────────────────────────
  document.getElementById('rawEditor').addEventListener('input', function() {
    markdown = this.value;
    updateModifiedState();
  });

  // ── Init ──────────────────────────────────────
  render();

  // Focus first answer input in questions mode
  if (MODE === 'questions') {
    setTimeout(() => {
      const first = document.querySelector('.answer-input');
      if (first) first.focus();
    }, 100);
  }
})();
<\/script>
</body>
</html>`;
}
