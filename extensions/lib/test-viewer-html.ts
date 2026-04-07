// ABOUTME: Self-contained HTML template for the Gherkin & Playwright Test Viewer GUI window.
// ABOUTME: Renders Gherkin .feature files with syntax highlighting, Playwright code with JS highlighting,
// ABOUTME: tabbed navigation between features, split-panel layout, inline editing, and approve/decline flow.

export interface TestFeature {
	name: string;
	gherkin: string;
	playwrightCode: string;
	filePath?: string;
}

/**
 * Generate the full HTML page for the test viewer window.
 * Self-contained page with all CSS/JS inlined.
 */
export function generateTestViewerHTML(opts: {
	features: TestFeature[];
	title: string;
	port: number;
}): string {
	const { features, title, port } = opts;
	const escapedFeatures = JSON.stringify(features).replace(/<\//g, '<\\/');
	const escapedTitle = JSON.stringify(title).replace(/<\//g, '<\\/');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Test Viewer</title>
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
    --gherkin-keyword: #c678dd;
    --gherkin-step: #61afef;
    --gherkin-string: #98c379;
    --gherkin-tag: #e5c07b;
    --gherkin-comment: #5c6370;
    --gherkin-table: #56b6c2;
    --gherkin-variable: #e06c75;
    --pw-keyword: #c678dd;
    --pw-string: #98c379;
    --pw-function: #61afef;
    --pw-comment: #5c6370;
    --pw-number: #d19a66;
    --pw-type: #e5c07b;
    --pw-variable: #e06c75;
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
    color: var(--gherkin-keyword);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border: 1px solid var(--gherkin-keyword);
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

  /* ── Main Layout ─────────────────────── */
  .main-layout {
    flex: 1;
    display: flex;
    min-height: 0;
    margin: 12px 16px 0;
    gap: 0;
  }

  /* ── Sidebar ─────────────────────────── */
  .sidebar {
    width: 240px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px 0 0 6px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }
  .sidebar-title {
    padding: 14px 16px 10px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-family: var(--mono);
    border-bottom: 1px solid var(--border);
  }
  .sidebar-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
  }
  .sidebar-item {
    padding: 10px 16px;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sidebar-item:hover {
    background: var(--accent-dim);
    border-left-color: var(--border);
  }
  .sidebar-item.active {
    background: var(--accent-dim);
    border-left-color: var(--accent);
  }
  .sidebar-item .feature-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    font-family: var(--mono);
    flex-shrink: 0;
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid rgba(41, 128, 185, 0.3);
  }
  .sidebar-item.active .feature-icon {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .sidebar-item.modified .feature-icon {
    border-color: var(--warning);
    color: var(--warning);
  }
  .sidebar-item .feature-name {
    font-size: 13px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .sidebar-item.active .feature-name {
    color: var(--text);
    font-weight: 500;
  }
  .sidebar-item .scenario-count {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--text-dim);
    padding: 2px 6px;
    background: var(--surface2);
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* ── Content Area ────────────────────── */
  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--border);
    border-left: none;
    border-radius: 0 6px 6px 0;
    background: var(--surface);
    overflow: hidden;
  }

  /* ── Panel Tabs ──────────────────────── */
  .panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--surface2);
    flex-shrink: 0;
  }
  .panel-tab {
    padding: 10px 20px;
    font-size: 12px;
    font-family: var(--mono);
    font-weight: 500;
    color: var(--text-dim);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
  }
  .panel-tab:hover {
    color: var(--text-muted);
    background: rgba(255,255,255,0.02);
  }
  .panel-tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  .panel-tab .tab-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .panel-tab .tab-dot.gherkin { background: var(--gherkin-keyword); }
  .panel-tab .tab-dot.playwright { background: var(--pw-function); }
  .panel-tab .tab-dot.split { background: var(--warning); }

  .panel-tab-actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
    padding-right: 8px;
    align-items: center;
  }

  /* ── View Mode Toggle ────────────────── */
  .view-toggle {
    display: flex;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .view-toggle button {
    padding: 4px 12px;
    font-size: 10px;
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

  /* ── Panel Content ───────────────────── */
  .panels-container {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .panel.hidden { display: none; }

  .split-view .panel {
    flex: 1;
  }
  .split-view .panel + .panel {
    border-left: 1px solid var(--border);
  }
  .split-divider {
    width: 4px;
    background: var(--border);
    cursor: col-resize;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .split-divider:hover { background: var(--accent); }

  .panel-header {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.15);
    flex-shrink: 0;
  }
  .panel-label {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .panel-label.gherkin { color: var(--gherkin-keyword); }
  .panel-label.playwright { color: var(--pw-function); }
  .panel-label .file-path {
    font-weight: 400;
    color: var(--text-dim);
    font-size: 11px;
    margin-left: 8px;
  }

  .panel-body {
    flex: 1;
    overflow: auto;
    padding: 0;
    min-height: 0;
  }

  /* ── Code Display ────────────────────── */
  .code-block {
    padding: 20px;
    margin: 0;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    tab-size: 2;
    color: var(--text);
    background: transparent;
    min-height: 100%;
  }

  /* Gherkin syntax highlighting */
  .gh-keyword { color: var(--gherkin-keyword); font-weight: 600; }
  .gh-step { color: var(--gherkin-step); font-weight: 500; }
  .gh-string { color: var(--gherkin-string); }
  .gh-tag { color: var(--gherkin-tag); font-style: italic; }
  .gh-comment { color: var(--gherkin-comment); font-style: italic; }
  .gh-table { color: var(--gherkin-table); }
  .gh-variable { color: var(--gherkin-variable); }
  .gh-scenario-name { color: var(--text); font-weight: 500; }

  /* Playwright / JS syntax highlighting */
  .pw-keyword { color: var(--pw-keyword); font-weight: 600; }
  .pw-string { color: var(--pw-string); }
  .pw-function { color: var(--pw-function); }
  .pw-comment { color: var(--pw-comment); font-style: italic; }
  .pw-number { color: var(--pw-number); }
  .pw-type { color: var(--pw-type); }
  .pw-variable { color: var(--pw-variable); }
  .pw-operator { color: var(--text-muted); }
  .pw-punctuation { color: var(--text-dim); }

  /* Line numbers */
  .line-numbers {
    counter-reset: line;
    padding: 20px 0;
  }
  .code-line {
    display: block;
    padding: 0 20px 0 60px;
    position: relative;
    min-height: 1.7em;
  }
  .code-line::before {
    counter-increment: line;
    content: counter(line);
    position: absolute;
    left: 0;
    width: 44px;
    text-align: right;
    color: var(--text-dim);
    font-size: 12px;
    user-select: none;
    opacity: 0.5;
  }
  .code-line:hover {
    background: rgba(255,255,255,0.02);
  }

  /* ── Edit Mode ───────────────────────── */
  .edit-textarea {
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    border: none;
    outline: none;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.7;
    padding: 20px;
    resize: none;
    tab-size: 2;
    min-height: 100%;
  }
  .edit-textarea:focus {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--accent);
  }

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

  /* ── Toast ───────────────────────────── */
  .toast {
    position: fixed;
    bottom: 80px;
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
  .approved-banner .approved-content { flex: 1; }
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
    margin-top: 2px;
  }

  body.approved-state .footer-wrapper { display: none; }
  body.approved-state .edit-textarea { pointer-events: none; opacity: 0.7; }

  /* ── Empty State ─────────────────────── */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-dim);
    font-family: var(--mono);
    font-size: 14px;
    text-align: center;
    padding: 40px;
  }
  .empty-state .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.3;
  }

  /* ── Responsive ──────────────────────── */
  @media (max-width: 800px) {
    .sidebar { width: 180px; }
    .split-view .panel { min-width: 200px; }
  }
  @media (max-width: 600px) {
    .sidebar { display: none; }
    .main-layout { margin: 8px; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span class="badge" id="modeBadge">TESTS</span>
  <span class="title" id="titleText">${title}</span>
  <span class="stats" id="statsText"></span>
  <span class="modified-badge" id="modifiedBadge">modified</span>
  <img src="/logo.png" alt="agent" class="header-logo">
</div>

<!-- Main Layout -->
<div class="main-layout">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-title">Features</div>
    <div class="sidebar-list" id="sidebarList"></div>
  </div>

  <!-- Content -->
  <div class="content-area">
    <!-- Panel Tabs -->
    <div class="panel-tabs">
      <button class="panel-tab active" data-view="split" onclick="setViewMode('split')">
        <span class="tab-dot split"></span>Split View
      </button>
      <button class="panel-tab" data-view="gherkin" onclick="setViewMode('gherkin')">
        <span class="tab-dot gherkin"></span>Gherkin
      </button>
      <button class="panel-tab" data-view="playwright" onclick="setViewMode('playwright')">
        <span class="tab-dot playwright"></span>Playwright
      </button>
      <div class="panel-tab-actions">
        <div class="view-toggle">
          <button class="active" id="btnRendered" onclick="setEditMode(false)">View</button>
          <button id="btnEdit" onclick="setEditMode(true)">Edit</button>
        </div>
      </div>
    </div>

    <!-- Panels Container -->
    <div class="panels-container" id="panelsContainer">
      <div class="panel" id="gherkinPanel">
        <div class="panel-header">
          <span class="panel-label gherkin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Gherkin
            <span class="file-path" id="gherkinFilePath"></span>
          </span>
        </div>
        <div class="panel-body" id="gherkinBody"></div>
      </div>
      <div class="split-divider" id="splitDivider"></div>
      <div class="panel" id="playwrightPanel">
        <div class="panel-header">
          <span class="panel-label playwright">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Playwright
            <span class="file-path" id="playwrightFilePath"></span>
          </span>
        </div>
        <div class="panel-body" id="playwrightBody"></div>
      </div>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <button class="btn btn-ghost" onclick="copyCurrentCode()" title="Copy current view code">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy
    </button>
    <button class="btn btn-ghost" onclick="saveToDesktop()" title="Save to desktop">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Save
    </button>
    <button class="btn btn-ghost" onclick="downloadStandalone()" title="Download standalone HTML">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Standalone
    </button>
    <div class="spacer"></div>
    <button class="btn" onclick="decline()">Close</button>
    <button class="btn btn-success" onclick="approve()">Approve &amp; Save Tests</button>
  </div>
</div>

<script>
(function() {
  // ── State ─────────────────────────────────────
  const PORT = ${port};
  const features = ${escapedFeatures};
  const originalFeatures = JSON.parse(JSON.stringify(features));
  let currentFeatureIdx = 0;
  let viewMode = 'split'; // 'split', 'gherkin', 'playwright'
  let editMode = false;
  let modified = false;

  // ── Gherkin Syntax Highlighter ────────────────
  function highlightGherkin(text) {
    var lines = text.split('\\n');
    var html = '<div class="line-numbers">';
    for (var i = 0; i < lines.length; i++) {
      html += '<span class="code-line">' + highlightGherkinLine(lines[i]) + '</span>';
    }
    html += '</div>';
    return html;
  }

  function highlightGherkinLine(line) {
    var trimmed = line.trim();
    // Empty line
    if (!trimmed) return '\\n';

    // Comments
    if (trimmed.startsWith('#')) {
      return escapeHtml(line).replace(/(#.*)/, '<span class="gh-comment">$1</span>');
    }

    // Tags
    if (trimmed.startsWith('@')) {
      return escapeHtml(line).replace(/(@\\S+)/g, '<span class="gh-tag">$1</span>');
    }

    // Table rows
    if (trimmed.startsWith('|')) {
      return '<span class="gh-table">' + escapeHtml(line) + '</span>';
    }

    // Feature-level keywords
    var featureKeywords = /^(Feature|Background|Scenario Outline|Scenario Template|Scenario|Examples|Rule):/;
    var match = trimmed.match(featureKeywords);
    if (match) {
      var keyword = match[1];
      var rest = trimmed.slice(keyword.length + 1);
      var indent = line.slice(0, line.indexOf(trimmed));
      return escapeHtml(indent) + '<span class="gh-keyword">' + escapeHtml(keyword) + ':</span>' +
             '<span class="gh-scenario-name">' + highlightStringsAndVars(escapeHtml(rest)) + '</span>';
    }

    // Step keywords
    var stepKeywords = /^(Given|When|Then|And|But|\\*)/;
    var stepMatch = trimmed.match(stepKeywords);
    if (stepMatch) {
      var stepKw = stepMatch[1];
      var stepRest = trimmed.slice(stepKw.length);
      var stepIndent = line.slice(0, line.indexOf(trimmed));
      return escapeHtml(stepIndent) + '<span class="gh-step">' + escapeHtml(stepKw) + '</span>' +
             highlightStringsAndVars(escapeHtml(stepRest));
    }

    // Doc strings
    if (trimmed === '"""' || trimmed === "'''") {
      return '<span class="gh-string">' + escapeHtml(line) + '</span>';
    }

    return highlightStringsAndVars(escapeHtml(line));
  }

  function highlightStringsAndVars(escapedLine) {
    // Highlight quoted strings
    var result = escapedLine.replace(/&quot;([^&]*?)&quot;/g, '<span class="gh-string">&quot;$1&quot;</span>');
    // Highlight <angle bracket> variables
    result = result.replace(/&lt;(\\w+)&gt;/g, '<span class="gh-variable">&lt;$1&gt;</span>');
    return result;
  }

  // ── Playwright / JS Syntax Highlighter ────────
  function highlightPlaywright(text) {
    var lines = text.split('\\n');
    var html = '<div class="line-numbers">';
    var inBlockComment = false;
    for (var i = 0; i < lines.length; i++) {
      var result = highlightJSLine(lines[i], inBlockComment);
      html += '<span class="code-line">' + result.html + '</span>';
      inBlockComment = result.inBlockComment;
    }
    html += '</div>';
    return html;
  }

  function highlightJSLine(line, inBlockComment) {
    if (!line.trim() && !inBlockComment) {
      return { html: '\\n', inBlockComment: false };
    }

    var escaped = escapeHtml(line);

    // Handle block comments continuation
    if (inBlockComment) {
      var endIdx = escaped.indexOf('*/');
      if (endIdx >= 0) {
        var commentPart = escaped.slice(0, endIdx + 2);
        var rest = escaped.slice(endIdx + 2);
        return {
          html: '<span class="pw-comment">' + commentPart + '</span>' + highlightJSTokens(rest),
          inBlockComment: false
        };
      }
      return { html: '<span class="pw-comment">' + escaped + '</span>', inBlockComment: true };
    }

    // Check for block comment start
    var blockStart = escaped.indexOf('/*');
    if (blockStart >= 0) {
      var before = escaped.slice(0, blockStart);
      var blockEnd = escaped.indexOf('*/', blockStart + 2);
      if (blockEnd >= 0) {
        var comment = escaped.slice(blockStart, blockEnd + 2);
        var after = escaped.slice(blockEnd + 2);
        return {
          html: highlightJSTokens(before) + '<span class="pw-comment">' + comment + '</span>' + highlightJSTokens(after),
          inBlockComment: false
        };
      }
      return {
        html: highlightJSTokens(before) + '<span class="pw-comment">' + escaped.slice(blockStart) + '</span>',
        inBlockComment: true
      };
    }

    // Line comment
    var lineCommentIdx = findLineComment(escaped);
    if (lineCommentIdx >= 0) {
      var codePart = escaped.slice(0, lineCommentIdx);
      var commentStr = escaped.slice(lineCommentIdx);
      return {
        html: highlightJSTokens(codePart) + '<span class="pw-comment">' + commentStr + '</span>',
        inBlockComment: false
      };
    }

    return { html: highlightJSTokens(escaped), inBlockComment: false };
  }

  function findLineComment(escaped) {
    var inString = false;
    var stringChar = '';
    for (var i = 0; i < escaped.length - 1; i++) {
      var ch = escaped[i];
      if (inString) {
        if (ch === '\\\\') { i++; continue; }
        if (ch === stringChar) inString = false;
        continue;
      }
      if (ch === "'" || ch === '&' && escaped.slice(i, i+6) === '&quot;' || ch === '\\x60') {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === '/' && escaped[i+1] === '/') return i;
    }
    return -1;
  }

  function highlightJSTokens(code) {
    if (!code.trim()) return code;

    // Keywords
    var keywords = '\\\\b(import|export|from|const|let|var|function|async|await|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|typeof|instanceof|class|extends|super|this|true|false|null|undefined|void|delete|in|of|default|yield)\\\\b';
    // Test framework keywords
    var testKw = '\\\\b(test|describe|it|expect|beforeAll|afterAll|beforeEach|afterEach|test\\\\.describe|test\\\\.beforeEach|test\\\\.afterEach|test\\\\.step)\\\\b';
    // Playwright-specific
    var pwKw = '\\\\b(page|browser|context|request|expect)(?=\\\\.)';
    // Types
    var types = '\\\\b(Page|Browser|BrowserContext|APIRequestContext|Locator|Response|string|number|boolean|any|void|Promise|Record|Array)\\\\b';

    // Apply highlighting in order (most specific first)
    var result = code;

    // Strings (single, double, template)
    result = result.replace(/(&quot;)(.*?)(&quot;)/g, '<span class="pw-string">$1$2$3</span>');
    result = result.replace(/(&#x27;|')(.*?)(&#x27;|')/g, '<span class="pw-string">$1$2$3</span>');
    result = result.replace(/(\\x60)(.*?)(\\x60)/g, '<span class="pw-string">$1$2$3</span>');

    // Numbers
    result = result.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="pw-number">$1</span>');

    // Keywords (applied on non-tagged portions)
    result = result.replace(new RegExp(keywords, 'g'), '<span class="pw-keyword">$1</span>');

    // Test framework keywords
    result = result.replace(new RegExp(testKw, 'g'), '<span class="pw-function">$1</span>');

    // Playwright-specific
    result = result.replace(new RegExp(pwKw, 'g'), '<span class="pw-type">$1</span>');

    // Types
    result = result.replace(new RegExp(types, 'g'), '<span class="pw-type">$1</span>');

    // Function calls: word followed by (
    result = result.replace(/\\b(\\w+)(?=\\s*\\()/g, function(m, name) {
      // Don't re-highlight if already in a span
      if (result.indexOf('>' + name + '<') >= 0) return m;
      return '<span class="pw-function">' + name + '</span>';
    });

    // Arrows
    result = result.replace(/=&gt;/g, '<span class="pw-operator">=&gt;</span>');

    return result;
  }

  // ── Utility ───────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function countScenarios(gherkin) {
    var matches = gherkin.match(/^\\s*(Scenario|Scenario Outline|Scenario Template):/gm);
    return matches ? matches.length : 0;
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 2500);
  }

  // ── Render Sidebar ────────────────────────────
  function renderSidebar() {
    var list = document.getElementById('sidebarList');
    var html = '';
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var active = i === currentFeatureIdx ? ' active' : '';
      var modifiedCls = isFeatureModified(i) ? ' modified' : '';
      var scenarios = countScenarios(f.gherkin);
      html += '<div class="sidebar-item' + active + modifiedCls + '" data-idx="' + i + '" onclick="selectFeature(' + i + ')">' +
        '<span class="feature-icon">' + (i + 1) + '</span>' +
        '<span class="feature-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</span>' +
        (scenarios > 0 ? '<span class="scenario-count">' + scenarios + '</span>' : '') +
        '</div>';
    }
    list.innerHTML = html;
  }

  // ── Render Content ────────────────────────────
  function renderContent() {
    var feature = features[currentFeatureIdx];
    if (!feature) {
      document.getElementById('gherkinBody').innerHTML = '<div class="empty-state"><div><div class="empty-icon">📋</div>No features to display</div></div>';
      document.getElementById('playwrightBody').innerHTML = '<div class="empty-state"><div><div class="empty-icon">🎭</div>No tests to display</div></div>';
      return;
    }

    // Update file path labels
    var gherkinPath = feature.filePath ? feature.filePath.replace(/\\.spec\\.ts$/, '.feature') : feature.name.toLowerCase().replace(/\\s+/g, '-') + '.feature';
    var pwPath = feature.filePath || feature.name.toLowerCase().replace(/\\s+/g, '-') + '.spec.ts';
    document.getElementById('gherkinFilePath').textContent = gherkinPath;
    document.getElementById('playwrightFilePath').textContent = pwPath;

    if (editMode) {
      renderEditMode(feature);
    } else {
      renderViewMode(feature);
    }

    updateStats();
    updateModifiedState();
  }

  function renderViewMode(feature) {
    document.getElementById('gherkinBody').innerHTML = '<div class="code-block">' + highlightGherkin(feature.gherkin) + '</div>';
    document.getElementById('playwrightBody').innerHTML = '<div class="code-block">' + highlightPlaywright(feature.playwrightCode) + '</div>';
  }

  function renderEditMode(feature) {
    document.getElementById('gherkinBody').innerHTML = '<textarea class="edit-textarea" id="gherkinEditor" spellcheck="false" oninput="onGherkinEdit(this)">' + escapeHtml(feature.gherkin) + '</textarea>';
    document.getElementById('playwrightBody').innerHTML = '<textarea class="edit-textarea" id="playwrightEditor" spellcheck="false" oninput="onPlaywrightEdit(this)">' + escapeHtml(feature.playwrightCode) + '</textarea>';
  }

  // ── View Mode ─────────────────────────────────
  window.setViewMode = function(mode) {
    viewMode = mode;
    var tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.view === mode);
    });

    var container = document.getElementById('panelsContainer');
    var gherkinPanel = document.getElementById('gherkinPanel');
    var playwrightPanel = document.getElementById('playwrightPanel');
    var divider = document.getElementById('splitDivider');

    container.classList.remove('split-view');

    if (mode === 'split') {
      container.classList.add('split-view');
      gherkinPanel.classList.remove('hidden');
      playwrightPanel.classList.remove('hidden');
      divider.style.display = 'block';
    } else if (mode === 'gherkin') {
      gherkinPanel.classList.remove('hidden');
      playwrightPanel.classList.add('hidden');
      divider.style.display = 'none';
    } else {
      gherkinPanel.classList.add('hidden');
      playwrightPanel.classList.remove('hidden');
      divider.style.display = 'none';
    }
  };

  // ── Edit Mode ─────────────────────────────────
  window.setEditMode = function(enabled) {
    editMode = enabled;
    document.getElementById('btnRendered').classList.toggle('active', !enabled);
    document.getElementById('btnEdit').classList.toggle('active', enabled);
    renderContent();
  };

  window.onGherkinEdit = function(textarea) {
    features[currentFeatureIdx].gherkin = textarea.value;
    updateModifiedState();
    renderSidebar();
  };

  window.onPlaywrightEdit = function(textarea) {
    features[currentFeatureIdx].playwrightCode = textarea.value;
    updateModifiedState();
    renderSidebar();
  };

  // ── Feature Selection ─────────────────────────
  window.selectFeature = function(idx) {
    // Save edits if in edit mode before switching
    if (editMode) {
      var ghEditor = document.getElementById('gherkinEditor');
      var pwEditor = document.getElementById('playwrightEditor');
      if (ghEditor) features[currentFeatureIdx].gherkin = ghEditor.value;
      if (pwEditor) features[currentFeatureIdx].playwrightCode = pwEditor.value;
    }
    currentFeatureIdx = idx;
    renderSidebar();
    renderContent();
  };

  // ── State Tracking ────────────────────────────
  function isFeatureModified(idx) {
    var orig = originalFeatures[idx];
    var curr = features[idx];
    return orig.gherkin !== curr.gherkin || orig.playwrightCode !== curr.playwrightCode;
  }

  function isAnyModified() {
    for (var i = 0; i < features.length; i++) {
      if (isFeatureModified(i)) return true;
    }
    return false;
  }

  function updateModifiedState() {
    modified = isAnyModified();
    document.getElementById('modifiedBadge').style.display = modified ? 'inline' : 'none';
  }

  function updateStats() {
    var totalScenarios = 0;
    for (var i = 0; i < features.length; i++) {
      totalScenarios += countScenarios(features[i].gherkin);
    }
    document.getElementById('statsText').textContent = features.length + ' feature' + (features.length !== 1 ? 's' : '') + ' · ' + totalScenarios + ' scenario' + (totalScenarios !== 1 ? 's' : '');
  }

  // ── Actions ───────────────────────────────────
  window.approve = function() {
    syncEdits();
    sendResult('approved');
  };

  window.decline = function() {
    syncEdits();
    sendResult('declined');
  };

  function syncEdits() {
    if (editMode) {
      var ghEditor = document.getElementById('gherkinEditor');
      var pwEditor = document.getElementById('playwrightEditor');
      if (ghEditor) features[currentFeatureIdx].gherkin = ghEditor.value;
      if (pwEditor) features[currentFeatureIdx].playwrightCode = pwEditor.value;
    }
  }

  window.copyCurrentCode = function() {
    syncEdits();
    var feature = features[currentFeatureIdx];
    if (!feature) return;
    var text = '';
    if (viewMode === 'gherkin' || viewMode === 'split') {
      text += '# ' + feature.name + '\\n\\n' + feature.gherkin;
    }
    if (viewMode === 'split') text += '\\n\\n---\\n\\n';
    if (viewMode === 'playwright' || viewMode === 'split') {
      text += feature.playwrightCode;
    }
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied to clipboard');
    }).catch(function() {
      showToast('Copy failed');
    });
  };

  window.saveToDesktop = function() {
    syncEdits();
    fetch('http://localhost:' + PORT + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: features }),
    }).then(function(r) { return r.json(); }).then(function(data) {
      showToast(data.message || 'Saved');
    }).catch(function() {
      showToast('Save failed');
    });
  };

  window.downloadStandalone = function() {
    syncEdits();
    fetch('http://localhost:' + PORT + '/export-standalone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: features }),
    }).then(function(r) { return r.json(); }).then(function(data) {
      showToast(data.message || 'Standalone export saved');
    }).catch(function() {
      showToast('Standalone export failed');
    });
  };

  function sendResult(action) {
    var body = {
      action: action,
      features: features,
      modified: isAnyModified(),
    };

    fetch('http://localhost:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function() {
      if (action === 'approved') {
        // Show approved state
        var banner = document.createElement('div');
        banner.className = 'approved-banner';
        banner.innerHTML = '<div class="approved-icon">✓</div>' +
          '<div class="approved-content"><div class="approved-text">Tests Approved</div>' +
          '<div class="approved-sub">Test files will be written to disk.</div></div>';
        var header = document.querySelector('.header');
        header.parentNode.insertBefore(banner, header.nextSibling);
        document.body.classList.add('approved-state');
        var badge = document.getElementById('modeBadge');
        if (badge) {
          badge.textContent = 'APPROVED';
          badge.style.color = 'var(--success)';
          badge.style.borderColor = 'var(--success)';
        }
        if (editMode) setEditMode(false);
      } else {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-muted);font-family:var(--font);">' +
          '<div style="text-align:center"><p style="font-size:20px;margin-bottom:8px;">Closed</p>' +
          '<p style="color:var(--text-dim);">You can close this tab.</p></div></div>';
      }
    }).catch(function() {
      showToast('Failed to send result');
    });
  }

  // ── Split Divider Drag ────────────────────────
  (function() {
    var divider = document.getElementById('splitDivider');
    var container = document.getElementById('panelsContainer');
    var gherkinPanel = document.getElementById('gherkinPanel');
    var isDragging = false;

    divider.addEventListener('mousedown', function(e) {
      isDragging = true;
      e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var rect = container.getBoundingClientRect();
      var ratio = (e.clientX - rect.left) / rect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      gherkinPanel.style.flex = 'none';
      gherkinPanel.style.width = (ratio * 100) + '%';
    });

    window.addEventListener('mouseup', function() {
      isDragging = false;
    });
  })();

  // ── Keyboard shortcuts ────────────────────────
  document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter = Approve
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      approve();
    }
    // Escape = Close
    if (e.key === 'Escape' && !editMode) {
      decline();
    }
    // Ctrl/Cmd + E = Toggle edit
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      setEditMode(!editMode);
    }
    // Arrow up/down = navigate features (when not in edit mode)
    if (!editMode && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'ArrowUp' && currentFeatureIdx > 0) {
        e.preventDefault();
        selectFeature(currentFeatureIdx - 1);
      }
      if (e.key === 'ArrowDown' && currentFeatureIdx < features.length - 1) {
        e.preventDefault();
        selectFeature(currentFeatureIdx + 1);
      }
    }
  });

  // ── Init ──────────────────────────────────────
  setViewMode('split');
  renderSidebar();
  renderContent();
})();
<\/script>
</body>
</html>`;
}
