// ABOUTME: Self-contained HTML template for a lightweight local file viewer/editor.
// ABOUTME: Features syntax highlighting, markdown rendering, hamburger editor menu, line numbers, and edit/save flow.

import { VIEWER_SCROLLBAR_STYLES } from "../viewer-scrollbar-styles.ts";

export function generateFileViewerHTML(opts: {
	title: string;
	filePath: string;
	content: string;
	port: number;
	lineRange?: string;
	editable: boolean;
	language?: string;
	mode?: "view" | "approve";
}): string {
	// Escape </ sequences to prevent </script> in file content from breaking the script block
	const esc = (v: unknown) => JSON.stringify(v).replace(/<\//g, '<\\/');
	const escapedTitle = esc(opts.title);
	const escapedFilePath = esc(opts.filePath);
	const escapedContent = esc(opts.content);
	const escapedLineRange = esc(opts.lineRange || "");
	const escapedEditable = esc(opts.editable);
	const escapedLanguage = esc(opts.language || "");
	const escapedMode = esc(opts.mode || "view");
	const isMarkdown = (opts.language || "").toLowerCase() === "markdown" || /\.(md|mdx|markdown)$/i.test(opts.filePath);
	const isHtml = (opts.language || "").toLowerCase() === "html" || /\.(html|htm)$/i.test(opts.filePath);
	const isRenderable = isMarkdown || isHtml;
	const escapedIsMarkdown = esc(isMarkdown);
	const escapedIsHtml = esc(isHtml);
	const escapedIsRenderable = esc(isRenderable);
	const lineCount = Math.max(1, opts.content.endsWith("\n") ? opts.content.split("\n").length - 1 : opts.content.split("\n").length);
	const initialGutterHtml = Array.from({ length: lineCount }, (_, i) => `<span>${i + 1}</span>`).join("");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title} — File Viewer</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark-dimmed.min.css">
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
    --warning: #f0b429;
    --error: #e85858;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
    --line-num-width: 54px;
    --control-height: 30px;
    --control-radius: 5px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
${VIEWER_SCROLLBAR_STYLES}
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
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
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    position: relative;
  }
  .header-logo {
    height: 20px;
    width: auto;
    image-rendering: pixelated;
    opacity: 0.6;
    flex-shrink: 0;
  }
  .badge {
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    font-family: var(--mono);
  }
  .lang-badge {
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-family: var(--mono);
    opacity: 0.9;
  }
  .title-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 6px;
  }
  .title {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 0 1 auto;
  }
  .subtitle {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
    opacity: 0.9;
    flex: 1 1 auto;
    min-width: 0;
  }
  .toolbar {
    display: flex;
    gap: 6px;
    align-items: center;
    position: relative;
    justify-content: flex-end;
    flex: 0 0 auto;
  }
  button {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    min-height: var(--control-height);
    height: var(--control-height);
    padding: 0 10px;
    font-size: 11px;
    font-family: var(--mono);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    background: rgba(37, 42, 50, 0.35);
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  .icon-btn {
    width: var(--control-height);
    min-width: var(--control-height);
    height: var(--control-height);
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn svg {
    width: 16px;
    height: 16px;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon-btn .fill {
    fill: currentColor;
    stroke: none;
  }
  button.primary { background: rgba(41, 128, 185, 0.08); border-color: rgba(41, 128, 185, 0.45); color: var(--accent); }
  button.primary:hover { background: rgba(41, 128, 185, 0.14); }
  button.success { background: rgba(72, 216, 137, 0.08); border-color: rgba(72, 216, 137, 0.5); color: var(--success); }
  button.success:hover { background: rgba(72, 216, 137, 0.14); }
  button.active { background: rgba(41, 128, 185, 0.08); border-color: rgba(41, 128, 185, 0.45); color: var(--accent); }
  button.secondary-muted {
    color: var(--text-muted);
    border-color: rgba(46, 52, 62, 0.9);
  }
  button:disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }
  #copyBtn {
    min-width: var(--control-height);
    width: var(--control-height);
    padding: 0;
  }
  #doneBtn {
    min-width: 72px;
    padding: 0 12px;
    color: var(--text-muted);
    border-color: var(--border);
    background: rgba(37, 42, 50, 0.35);
  }
  #doneBtn:not(:disabled):hover,
  #doneBtn:not(:disabled).active {
    color: var(--success);
    border-color: rgba(72, 216, 137, 0.5);
    background: rgba(72, 216, 137, 0.08);
  }
  #doneBtn .done-label {
    font-size: 11px;
    line-height: 1;
  }
  .save-hint {
    display: none;
  }

  .menu-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 220px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.28);
    padding: 8px;
    display: none;
    z-index: 20;
  }
  .dropdown-menu.open { display: block; }
  .menu-label {
    font-size: 10px;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-dim);
    padding: 6px 8px;
  }
  .menu-item {
    width: 100%;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    padding: 10px 12px;
  }
  .menu-item:hover {
    background: var(--surface2);
    border-color: var(--border);
    color: var(--text);
  }
  .menu-item svg {
    display: none;
  }

  .file-meta-bar {
    margin: 8px 16px 0;
    padding: 8px 12px;
    background: rgba(30, 34, 40, 0.7);
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }
  .meta-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .meta-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    margin-left: auto;
  }
  .copy-done-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .meta-item {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #metaPath {
    flex: 0 0 auto;
    min-width: 0;
    overflow: visible;
    text-overflow: clip;
  }
  .meta {
    display: none;
  }

  .render-toggle {
    margin: 0;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
    display: none;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }
  .render-toggle.visible { display: flex; }
  .render-toggle .toggle-label {
    display: none;
  }
  .view-toggle {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .view-toggle button {
    min-width: 0;
    padding: 0 10px;
  }

  .content {
    flex: 1;
    margin: 8px 16px 16px;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .notice {
    display: none;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-family: var(--mono);
  }
  .notice.visible { display: flex; align-items: center; gap: 8px; }
  .notice.success { color: var(--success); background: rgba(72, 216, 137, 0.08); }
  .notice.warning { color: var(--warning); background: rgba(240, 180, 41, 0.08); }
  .notice.error   { color: var(--error);   background: rgba(232, 88, 88, 0.08); }

  .viewer-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .viewer-wrap.hidden { display: none; }

  .viewer-table {
    display: table;
    width: 100%;
    border-collapse: collapse;
  }
  .viewer-row {
    display: table-row;
  }

  .gutter {
    display: table-cell;
    vertical-align: top;
    width: var(--line-num-width);
    padding: 16px 0;
    background: var(--surface2);
    border-right: 1px solid var(--border);
    text-align: right;
    user-select: none;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-dim);
  }
  .gutter span {
    display: block;
    padding: 0 10px 0 0;
  }

  .viewer-code {
    display: table-cell;
    vertical-align: top;
  }
  .viewer-code pre {
    margin: 0;
    padding: 16px;
    background: transparent !important;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    tab-size: 2;
  }
  .viewer-code code {
    font-family: var(--mono);
    font-size: 13px;
    background: transparent !important;
  }
  .hljs { background: transparent !important; }

  .rendered-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: none;
    padding: 20px 24px 40px;
    background: var(--bg);
  }
  .rendered-wrap.visible { display: block; }
  .html-rendered-wrap {
    padding: 0;
    background: #fff;
  }
  .html-rendered-frame {
    width: 100%;
    height: 100%;
    min-height: 100%;
    border: 0;
    background: #fff;
    color-scheme: light;
    display: block;
  }

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
    color: var(--text);
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
  .markdown-body input[type="checkbox"] {
    accent-color: var(--accent);
    margin-right: 8px;
    vertical-align: middle;
  }

  .editor-wrap {
    flex: 1;
    min-height: 0;
    display: none;
    position: relative;
    overflow: hidden;
  }
  .editor-wrap.visible { display: flex; }

  .editor-lines {
    flex-shrink: 0;
    width: var(--line-num-width);
    padding: 16px 0;
    background: var(--surface2);
    border-right: 1px solid var(--border);
    text-align: right;
    user-select: none;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-dim);
    overflow: hidden;
  }
  .editor-lines span {
    display: block;
    padding: 0 10px 0 0;
  }

  .editor-textarea {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    color: var(--text);
    border: 0;
    outline: none;
    resize: none;
    padding: 16px;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    tab-size: 2;
    white-space: pre;
    overflow-wrap: normal;
    overflow: auto;
  }

  .unsaved-dot {
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning);
    margin-left: 4px;
    vertical-align: middle;
  }
  .unsaved-dot.visible { display: inline-block; }

  .done-banner {
    display: none;
    padding: 12px 18px;
    background: rgba(72, 216, 137, 0.08);
    border-bottom: 1px solid rgba(72, 216, 137, 0.2);
    color: var(--success);
    font-family: var(--mono);
    font-size: 13px;
    align-items: center;
    gap: 8px;
  }
  .done-banner.visible { display: flex; }
  .done-banner .done-text { flex: 1; }
  .review-actions {
    display: none;
    gap: 8px;
    align-items: center;
  }
  .review-actions.visible { display: inline-flex; }
  .review-actions .btn-reject {
    color: var(--warning);
    border-color: rgba(240, 180, 41, 0.45);
    background: rgba(240, 180, 41, 0.08);
  }
  .review-actions .btn-cancel {
    color: var(--text-muted);
  }
  body.final-state .footer-disabled,
  body.final-state .toolbar button,
  body.final-state .view-toggle button,
  body.final-state .menu-wrap,
  body.final-state .editor-textarea {
    pointer-events: none;
    opacity: 0.65;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge">File</div>
    <span id="langBadge" class="lang-badge"></span>
    <div class="title-wrap">
      <div class="title"><span id="titleText"></span><span id="unsavedDot" class="unsaved-dot"></span></div>
      <div class="subtitle" id="subtitleText"></div>
    </div>
    <img src="/logo.png" alt="agent" class="header-logo">
    <div class="toolbar">
      <div class="menu-wrap">
        <button id="menuBtn" class="icon-btn" title="Open menu" aria-label="Open menu" aria-haspopup="menu" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16"></path>
            <path d="M4 12h16"></path>
            <path d="M4 17h16"></path>
          </svg>
        </button>
        <div id="editorMenu" class="dropdown-menu" role="menu" aria-label="Open in editor menu">
          <div class="menu-label">Open in editor</div>
          <button class="menu-item" data-editor="cursor" role="menuitem" title="Open in Cursor">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="fill" d="M6 4l10 8-4.2 1.1 2.7 5-2.3 1.2-2.7-5L7 18 6 4z"/>
            </svg>
            <span>Cursor</span>
          </button>
          <button class="menu-item" data-editor="windsurf" role="menuitem" title="Open in Windsurf">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 15c2.2-2.6 4.4-3.9 6.6-3.9 2.1 0 3.7 1.2 5.1 2.3 1.3 1 2.4 1.8 3.8 1.8 1 0 1.9-.3 2.8-.9"></path>
              <path d="M3 19c2.1-1.8 4.1-2.7 6-2.7 1.8 0 3.2.8 4.6 1.6 1.4.8 2.8 1.6 4.7 1.6 1.1 0 2.1-.2 3.2-.8"></path>
              <path d="M4 10c1.3-2.9 3.3-4.5 5.8-4.5 3.2 0 4.6 2.8 6.9 2.8 1.1 0 2.1-.4 3.3-1.5"></path>
            </svg>
            <span>Windsurf</span>
          </button>
          <button class="menu-item" data-editor="vscode" role="menuitem" title="Open in Visual Studio Code">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="fill" d="M16.8 3.8l-7.2 6.9-3.2-2.4-2.2 1.9 3.1 2.8-3.1 2.8 2.2 1.9 3.2-2.4 7.2 6.9 3.2-1.5V5.3l-3.2-1.5zM17 8.2v7.6l-4.6-3.8L17 8.2z"/>
            </svg>
            <span>Visual Studio Code</span>
          </button>
          <div class="menu-label">Viewer actions</div>
          <button id="menuToggleBtn" class="menu-item" role="menuitem" title="Toggle edit or preview">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4l10-10-4-4L4 16v4z"></path>
              <path d="M13 7l4 4"></path>
            </svg>
            <span id="menuToggleLabel">Edit</span>
          </button>
          <button id="menuSaveBtn" class="menu-item" role="menuitem" title="Save file">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 4h11l3 3v13H5z"></path>
              <path d="M8 4v6h8V4"></path>
              <path d="M9 20v-5h6v5"></path>
            </svg>
            <span>Save</span>
          </button>
          <button id="menuDoneBtn" class="menu-item" role="menuitem" title="Done">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12l5 5L20 7"></path>
            </svg>
            <span>Done</span>
          </button>
        </div>
      </div>
      <button id="toggleBtn" class="secondary-muted" style="display:none"></button>
      <button id="saveBtn" class="primary" title="Save file" style="display:none">Save</button>
      <span id="saveHint" class="save-hint"></span>
    </div>
  </div>

  <div class="file-meta-bar">
    <div class="meta-left">
      <span id="metaPath" class="meta-item"></span>
      <span id="metaLines" class="meta-item"></span>
      <span id="metaMode" class="meta-item"></span>
      <span id="metaSize" class="meta-item"></span>
    </div>
    <div class="meta-right">
      <div id="renderToggle" class="render-toggle">
        <span class="toggle-label">View</span>
        <div class="view-toggle">
          <button id="btnRendered" class="active" type="button">Rendered</button>
          <button id="btnRaw" type="button">Source</button>
        </div>
      </div>
      <div class="copy-done-group">
        <button id="copyBtn" class="icon-btn secondary-muted" title="Copy file contents" aria-label="Copy file contents">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="10" height="10" rx="2"></rect>
            <rect x="5" y="5" width="10" height="10" rx="2"></rect>
          </svg>
        </button>
        <button id="doneBtn" class="secondary-muted" title="Done" aria-label="Done">
          <span class="done-label">Done</span>
        </button>
        <div id="reviewActions" class="review-actions">
          <button id="approveBtn" class="success" title="Approve" aria-label="Approve">Approve</button>
          <button id="rejectBtn" class="btn-reject" title="Reject" aria-label="Reject">Reject</button>
          <button id="cancelBtn" class="btn-cancel" title="Cancel" aria-label="Cancel">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <div class="content">
    <div id="doneBanner" class="done-banner">
      <span class="done-text">Done — returned to CLI. This page is now read-only.</span>
    </div>
    <div id="notice" class="notice"></div>

    <div id="viewerWrap" class="viewer-wrap">
      <div class="viewer-table">
        <div class="viewer-row">
          <div id="gutter" class="gutter">${initialGutterHtml}</div>
          <div class="viewer-code">
            <pre><code id="codeBlock"></code></pre>
          </div>
        </div>
      </div>
    </div>

    <div id="markdownRenderedWrap" class="rendered-wrap markdown-rendered-wrap">
      <div id="markdownRendered" class="markdown-body"></div>
    </div>

    <div id="htmlRenderedWrap" class="rendered-wrap html-rendered-wrap">
      <iframe id="htmlRenderedFrame" class="html-rendered-frame" sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox" title="Rendered HTML preview"></iframe>
    </div>

    <div id="editorWrap" class="editor-wrap">
      <div id="editorLines" class="editor-lines"></div>
      <textarea id="editor" class="editor-textarea" spellcheck="false"></textarea>
    </div>
  </div>

<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/typescript.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/yaml.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/dockerfile.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/bash.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/swift.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/kotlin.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/rust.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/go.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/ini.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/toml.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/makefile.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/xml.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script>
  var PORT = ${opts.port};
  var TITLE = ${escapedTitle};
  var FILE_PATH = ${escapedFilePath};
  var ORIGINAL = ${escapedContent};
  var LINE_RANGE = ${escapedLineRange};
  var EDITABLE = ${escapedEditable};
  var LANGUAGE = ${escapedLanguage};
  var VIEWER_MODE = ${escapedMode};
  var IS_MARKDOWN = ${escapedIsMarkdown};
  var IS_HTML = ${escapedIsHtml};
  var IS_RENDERABLE = ${escapedIsRenderable};

  var currentContent = ORIGINAL;
  var savedContent = ORIGINAL;
  var modified = false;
  var mode = 'view';
  var renderView = IS_RENDERABLE ? 'rendered' : 'raw';
  var isDone = false;
  var finalAction = null;

  var titleText = document.getElementById('titleText');
  var subtitleText = document.getElementById('subtitleText');
  var unsavedDot = document.getElementById('unsavedDot');
  var langBadge = document.getElementById('langBadge');
  var metaPath = document.getElementById('metaPath');
  var metaLines = document.getElementById('metaLines');
  var metaMode = document.getElementById('metaMode');
  var metaSize = document.getElementById('metaSize');
  var notice = document.getElementById('notice');
  var doneBanner = document.getElementById('doneBanner');
  var viewerWrap = document.getElementById('viewerWrap');
  var renderToggle = document.getElementById('renderToggle');
  var markdownRenderedWrap = document.getElementById('markdownRenderedWrap');
  var markdownRendered = document.getElementById('markdownRendered');
  var htmlRenderedWrap = document.getElementById('htmlRenderedWrap');
  var htmlRenderedFrame = document.getElementById('htmlRenderedFrame');
  var btnRendered = document.getElementById('btnRendered');
  var btnRaw = document.getElementById('btnRaw');

  var gutter = document.getElementById('gutter');
  var codeBlock = document.getElementById('codeBlock');
  var editorWrap = document.getElementById('editorWrap');
  var editorLines = document.getElementById('editorLines');
  var editor = document.getElementById('editor');
  var menuBtn = document.getElementById('menuBtn');
  var editorMenu = document.getElementById('editorMenu');
  var copyBtn = document.getElementById('copyBtn');
  var toggleBtn = document.getElementById('toggleBtn');
  var saveBtn = document.getElementById('saveBtn');
  var saveHint = document.getElementById('saveHint');
  var doneBtn = document.getElementById('doneBtn');
  var menuToggleBtn = document.getElementById('menuToggleBtn');
  var menuToggleLabel = document.getElementById('menuToggleLabel');
  var menuSaveBtn = document.getElementById('menuSaveBtn');
  var menuDoneBtn = document.getElementById('menuDoneBtn');
  var reviewActions = document.getElementById('reviewActions');
  var approveBtn = document.getElementById('approveBtn');
  var rejectBtn = document.getElementById('rejectBtn');
  var cancelBtn = document.getElementById('cancelBtn');

  var EXT_MAP = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', kts: 'kotlin',
    swift: 'swift', m: 'objectivec', mm: 'objectivec',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    html: 'html', htm: 'html', vue: 'html', svelte: 'html',
    css: 'css', scss: 'scss', less: 'less', sass: 'scss',
    json: 'json', jsonc: 'json',
    md: 'markdown', mdx: 'markdown', markdown: 'markdown',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'xml', plist: 'xml',
    sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
    dockerfile: 'dockerfile',
    toml: 'toml', ini: 'ini', conf: 'ini', cfg: 'ini', properties: 'ini',
    makefile: 'makefile',
    r: 'r', R: 'r',
    php: 'php', lua: 'lua', perl: 'perl', pl: 'perl',
    graphql: 'graphql', gql: 'graphql',
    proto: 'protobuf',
    tf: 'hcl', hcl: 'hcl',
    env: 'ini', gitignore: 'ini', gitconfig: 'ini'
  };

  function detectLanguage() {
    if (LANGUAGE) return LANGUAGE;
    var parts = FILE_PATH.split('/');
    var filename = parts[parts.length - 1] || '';
    var lower = filename.toLowerCase();
    if (lower === 'dockerfile') return 'dockerfile';
    if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile';
    if (lower === '.gitignore' || lower === '.gitconfig') return 'ini';
    if (lower === 'cargo.toml') return 'toml';
    if (lower === '.env' || lower.indexOf('.env.') === 0) return 'ini';
    var dotIdx = filename.lastIndexOf('.');
    if (dotIdx === -1) return '';
    var ext = filename.substring(dotIdx + 1).toLowerCase();
    return EXT_MAP[ext] || '';
  }

  var detectedLang = detectLanguage();

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function setNotice(text, kind) {
    notice.textContent = text || '';
    notice.className = 'notice' + (text ? ' visible ' + kind : '');
  }

  var NL = String.fromCharCode(10);

  function getLineCount(content) {
    var lines = content.split(NL);
    var count = lines.length;
    if (count > 1 && lines[count - 1] === '') count--;
    return Math.max(1, count);
  }

  function renderLineNumberHtml(count) {
    var html = '';
    for (var i = 1; i <= count; i++) html += '<span>' + i + '</span>';
    return html;
  }

  function generateLineNums(content, container) {
    var html = renderLineNumberHtml(getLineCount(content));
    if (container.innerHTML !== html) container.innerHTML = html;
  }

  function updateGutter(content) {
    var html = renderLineNumberHtml(getLineCount(content));
    if (gutter.innerHTML !== html) gutter.innerHTML = html;
  }

  var lastHighlightedContent = null;

  function highlightCode() {
    if (currentContent === lastHighlightedContent) return;
    if (typeof hljs !== 'undefined') {
      var lang = (detectedLang && hljs.getLanguage(detectedLang)) ? detectedLang : null;
      var result;
      if (lang) {
        result = hljs.highlight(currentContent, { language: lang });
      } else {
        result = hljs.highlightAuto(currentContent);
      }
      codeBlock.innerHTML = result.value;
      codeBlock.className = (lang ? 'language-' + lang + ' ' : '') + 'hljs';
    } else {
      codeBlock.textContent = currentContent;
    }
    lastHighlightedContent = currentContent;
  }

  function preprocessMarkdown(content) {
    return String(content || '');
  }

  function renderMarkdown() {
    if (!IS_MARKDOWN) return;
    if (typeof marked !== 'undefined' && marked && typeof marked.parse === 'function') {
      marked.setOptions({ gfm: true, breaks: true });
      markdownRendered.innerHTML = marked.parse(preprocessMarkdown(currentContent));
    } else {
      markdownRendered.textContent = currentContent;
    }
  }

  function renderHtml() {
    if (!IS_HTML) return;
    var scrollbarCss = '<style data-file-viewer-scrollbar>' +
      ':root{--file-viewer-bg:#1a1d23;--file-viewer-thumb:#2e343e;--file-viewer-thumb-hover:#555d6e;}' +
      'html,body{scrollbar-width:thin;scrollbar-color:var(--file-viewer-thumb) var(--file-viewer-bg);}' +
      '::-webkit-scrollbar{width:8px;height:8px;}' +
      '::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:var(--file-viewer-bg);}' +
      '::-webkit-scrollbar-thumb{background:var(--file-viewer-thumb);border-radius:999px;border:2px solid var(--file-viewer-bg);}' +
      '::-webkit-scrollbar-thumb:hover{background:var(--file-viewer-thumb-hover);}' +
      '</style>';
    if (/^\\s*<!doctype\\s+html/i.test(currentContent) || /^\\s*<html[\\s>]/i.test(currentContent)) {
      if (/<\\/head>/i.test(currentContent)) {
        htmlRenderedFrame.srcdoc = currentContent.replace(/<\\/head>/i, scrollbarCss + '</head>');
      } else if (/<head[\\s>][\\s\\S]*?>/i.test(currentContent)) {
        htmlRenderedFrame.srcdoc = currentContent.replace(/<head([\\s>][\\s\\S]*?)>/i, '<head$1>' + scrollbarCss);
      } else {
        htmlRenderedFrame.srcdoc = currentContent.replace(/<html([\\s>][\\s\\S]*?)>/i, '<html$1><head>' + scrollbarCss + '</head>');
      }
    } else {
      htmlRenderedFrame.srcdoc = '<!doctype html><html><head>' + scrollbarCss + '</head><body>' + currentContent + '</body></html>';
    }
  }

  function syncEditorScroll() {
    editorLines.style.transform = 'translateY(-' + editor.scrollTop + 'px)';
  }

  function truncateMiddle(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    var half = Math.max(4, Math.floor((maxLength - 1) / 2));
    return text.slice(0, half) + '…' + text.slice(text.length - half);
  }

  function refreshMeta() {
    var lineCount = getLineCount(currentContent);
    metaPath.textContent = FILE_PATH;
    metaLines.textContent = lineCount + ' lines' + (LINE_RANGE ? ' (range ' + LINE_RANGE + ')' : '');
    var modeLabel;
    if (isDone) {
      modeLabel = 'done';
    } else if (mode === 'edit') {
      modeLabel = EDITABLE ? 'edit' : 'read-only';
    } else if (IS_RENDERABLE && renderView === 'rendered') {
      modeLabel = '';
    } else {
      modeLabel = EDITABLE ? 'read' : 'read-only';
    }
    metaMode.textContent = 'Mode: ' + modeLabel;
    metaSize.textContent = 'Size: ' + formatBytes(new Blob([currentContent]).size);
    metaMode.style.display = 'none';
    metaSize.style.display = 'none';

    subtitleText.textContent = FILE_PATH;
  }

  function refreshUI() {
    titleText.textContent = TITLE;
    unsavedDot.classList.toggle('visible', modified);

    if (detectedLang) {
      langBadge.textContent = detectedLang;
      langBadge.style.display = '';
    } else {
      langBadge.style.display = 'none';
    }

    var isEdit = mode === 'edit' && EDITABLE && !isDone;
    var showMarkdownRendered = IS_MARKDOWN && !isEdit && renderView === 'rendered';
    var showHtmlRendered = IS_HTML && !isEdit && renderView === 'rendered';
    var showCode = !isEdit && (!IS_RENDERABLE || renderView === 'raw');

    renderToggle.classList.toggle('visible', IS_RENDERABLE);
    viewerWrap.classList.toggle('hidden', !showCode);
    markdownRenderedWrap.classList.toggle('visible', showMarkdownRendered);
    htmlRenderedWrap.classList.toggle('visible', showHtmlRendered);
    editorWrap.classList.toggle('visible', isEdit);

    if (showMarkdownRendered) renderMarkdown();
    if (showHtmlRendered) renderHtml();
    if (showCode) highlightCode();

    if (isEdit) {
      if (editor.value !== currentContent) editor.value = currentContent;
      generateLineNums(currentContent, editorLines);
      syncEditorScroll();
    }

    btnRendered.classList.toggle('active', renderView === 'rendered');
    btnRaw.classList.toggle('active', renderView === 'raw');

    reviewActions.classList.toggle('visible', VIEWER_MODE === 'approve');
    doneBtn.style.display = VIEWER_MODE === 'approve' ? 'none' : '';

    if (isDone) {
      toggleBtn.textContent = 'Read Only';
      toggleBtn.disabled = true;
      saveBtn.disabled = true;
      doneBtn.disabled = true;
      doneBtn.textContent = 'Done';
      menuToggleBtn.disabled = true;
      menuSaveBtn.disabled = true;
      menuDoneBtn.disabled = true;
      menuToggleLabel.textContent = 'Read Only';
      if (approveBtn) approveBtn.disabled = true;
      if (rejectBtn) rejectBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
    } else {
      var toggleLabel = isEdit ? 'Preview' : (EDITABLE ? 'Edit' : 'Read Only');
      toggleBtn.textContent = toggleLabel;
      toggleBtn.disabled = !EDITABLE;
      saveBtn.disabled = !EDITABLE || !modified;
      doneBtn.disabled = false;
      menuToggleBtn.disabled = !EDITABLE;
      menuSaveBtn.disabled = !EDITABLE || !modified;
      menuDoneBtn.disabled = false;
      menuToggleLabel.textContent = toggleLabel;
      if (approveBtn) approveBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }

    saveHint.textContent = '';
    refreshMeta();
  }

  function closeMenu() {
    editorMenu.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    editorMenu.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');
  }

  function openInEditor(editorName) {
    closeMenu();
    fetch('http://127.0.0.1:' + PORT + '/open-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editor: editorName })
    }).then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || ('Failed to open in ' + editorName));
      setNotice('Opened in ' + editorName, 'success');
      setTimeout(function() { setNotice('', ''); }, 2000);
    }).catch(function(err) {
      setNotice(err && err.message ? err.message : ('Failed to open in ' + editorName), 'error');
    });
  }

  menuBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (editorMenu.classList.contains('open')) closeMenu();
    else openMenu();
  });

  menuToggleBtn.addEventListener('click', function() {
    closeMenu();
    toggleBtn.click();
  });

  menuSaveBtn.addEventListener('click', function() {
    closeMenu();
    doSave();
  });

  menuDoneBtn.addEventListener('click', function() {
    closeMenu();
    doneBtn.click();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-editor]'), function(btn) {
    btn.addEventListener('click', function() {
      openInEditor(btn.getAttribute('data-editor'));
    });
  });

  document.addEventListener('click', function(e) {
    if (!editorMenu.contains(e.target) && e.target !== menuBtn) closeMenu();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMenu();
  });

  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(mode === 'edit' ? editor.value : currentContent).then(function() {
      setNotice('Copied to clipboard', 'success');
      setTimeout(function() { setNotice('', ''); }, 2000);
    }, function() {
      setNotice('Failed to copy', 'error');
    });
  });

  btnRendered.addEventListener('click', function() {
    if (!IS_RENDERABLE || isDone) return;
    if (mode === 'edit') {
      currentContent = editor.value;
      modified = currentContent !== savedContent;
      mode = 'view';
      updateGutter(currentContent);
    }
    renderView = 'rendered';
    refreshUI();
  });

  btnRaw.addEventListener('click', function() {
    if (!IS_RENDERABLE || isDone) return;
    renderView = 'raw';
    refreshUI();
  });

  toggleBtn.addEventListener('click', function() {
    if (!EDITABLE || isDone) return;
    if (mode === 'view') {
      mode = 'edit';
      renderView = 'raw';
      setNotice('Edit mode — changes are local until you Save', 'warning');
      refreshUI();
      setTimeout(function() { editor.focus(); }, 0);
    } else {
      currentContent = editor.value;
      modified = currentContent !== savedContent;
      mode = 'view';
      updateGutter(currentContent);
      setNotice(modified ? 'Unsaved changes' : '', modified ? 'warning' : '');
      refreshUI();
    }
  });

  editor.addEventListener('input', function() {
    currentContent = editor.value;
    modified = currentContent !== savedContent;
    generateLineNums(currentContent, editorLines);
    updateGutter(currentContent);
    unsavedDot.classList.toggle('visible', modified);
    saveBtn.disabled = !modified;
  });

  editor.addEventListener('scroll', syncEditorScroll);

  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      var start = editor.selectionStart;
      var end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      editor.dispatchEvent(new Event('input'));
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      var start = editor.selectionStart;
      var end = editor.selectionEnd;
      var selected = editor.value.substring(start, end);
      if (!selected) {
        if (editor.value.substring(Math.max(0, start - 2), start) === '  ') {
          editor.value = editor.value.substring(0, start - 2) + editor.value.substring(start);
          editor.selectionStart = editor.selectionEnd = start - 2;
          editor.dispatchEvent(new Event('input'));
        }
        return;
      }
      var dedented = selected.replace(/^  /gm, '');
      editor.value = editor.value.substring(0, start) + dedented + editor.value.substring(end);
      editor.selectionStart = start;
      editor.selectionEnd = start + dedented.length;
      editor.dispatchEvent(new Event('input'));
    }
  });

  function doSave() {
    if (!EDITABLE || !modified || isDone) return;
    currentContent = editor.value;
    fetch('http://127.0.0.1:' + PORT + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: currentContent })
    }).then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Save failed');
      savedContent = currentContent;
      modified = false;
      updateGutter(currentContent);
      renderMarkdown();
      setNotice('Saved', 'success');
      setTimeout(function() { if (!modified) setNotice('', ''); }, 2000);
      refreshUI();
    }).catch(function(err) {
      setNotice(err && err.message ? err.message : 'Save failed', 'error');
    });
  }

  saveBtn.addEventListener('click', doSave);

  document.addEventListener('keydown', function(e) {
    var lower = String(e.key || '').toLowerCase();
    if ((e.metaKey || e.ctrlKey) && lower === 's') {
      e.preventDefault();
      doSave();
    }
  });

  function submitResult(action) {
    closeMenu();
    var content = mode === 'edit' ? editor.value : currentContent;
    fetch('http://127.0.0.1:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, modified: modified, content: content })
    }).then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Failed to finish');
      isDone = true;
      finalAction = action;
      modified = false;
      document.body.classList.add('final-state');
      if (action === 'approved') {
        doneBanner.querySelector('.done-text').textContent = 'Approved — returned to CLI. This page is now read-only.';
      } else if (action === 'rejected') {
        doneBanner.querySelector('.done-text').textContent = 'Rejected — returned to CLI. This page is now read-only.';
      } else if (action === 'cancelled') {
        doneBanner.querySelector('.done-text').textContent = 'Cancelled — returned to CLI. This page is now read-only.';
      } else {
        doneBanner.querySelector('.done-text').textContent = 'Done — returned to CLI. This page is now read-only.';
      }
      doneBtn.classList.add('active');
      doneBanner.classList.add('visible');
      setNotice('', '');
      refreshUI();
    }).catch(function(err) {
      setNotice(err && err.message ? err.message : 'Failed to finish', 'error');
    });
  }

  doneBtn.addEventListener('click', function() {
    submitResult('done');
  });

  if (approveBtn) approveBtn.addEventListener('click', function() { submitResult('approved'); });
  if (rejectBtn) rejectBtn.addEventListener('click', function() { submitResult('rejected'); });
  if (cancelBtn) cancelBtn.addEventListener('click', function() { submitResult('cancelled'); });

  editor.value = ORIGINAL;
  generateLineNums(currentContent, editorLines);
  updateGutter(currentContent);
  refreshUI();
</script>
</body>
</html>`;
}
