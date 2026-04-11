// ABOUTME: Self-contained HTML template for the Disk Cleanup viewer GUI window.
// ABOUTME: Renders scan results grouped by category, AI analysis panel, and delete controls with confirmation.

export interface CleanupFile {
	path: string;
	name: string;
	size: number;
	sizeFormatted: string;
	modified: string;
	isDirectory: boolean;
	category: "temp" | "compiled" | "archives";
}

export interface CleanupScanResult {
	results: Record<string, CleanupFile[]>;
	summary: Record<string, { count: number; size: number; sizeFormatted: string }>;
	totalFiles: number;
	totalSize: number;
	totalSizeFormatted: string;
	scanTime: number;
	directory: string;
}

export function generateCleanupViewerHTML(opts: {
	port: number;
	defaultDir: string;
}): string {
	const { port, defaultDir } = opts;

	const escapeHtml = (str: string) =>
		String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Disk Cleanup</title>
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
    --error-bg: rgba(232, 88, 88, 0.08);
    --temp: #f0b429;
    --compiled: #60a5fa;
    --archives: #48d889;
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

  /* -- Header -- */
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
  .header .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .header .subtitle {
    font-size: 12px;
    color: var(--text-dim);
    font-family: var(--mono);
  }
  .header-logo {
    height: 20px;
    width: auto;
    image-rendering: pixelated;
    opacity: 0.6;
    flex-shrink: 0;
  }

  /* -- Content -- */
  .content {
    flex: 1;
    width: 100%;
    padding: 12px 16px 120px;
    overflow-y: auto;
    overflow-x: hidden;
    max-width: 1080px;
    margin: 0 auto;
  }

  /* -- Controls -- */
  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }
  .control-row:last-child { margin-bottom: 0; }
  .control-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    width: 80px;
    flex-shrink: 0;
  }
  .input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .input:focus { border-color: var(--accent); }

  .checkbox-group { display: flex; gap: 10px; flex: 1; }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .checkbox-label input[type="checkbox"] {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    cursor: pointer;
    position: relative;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .checkbox-label input[type="checkbox"]:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .checkbox-label input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 4px;
    width: 4px;
    height: 8px;
    border: solid var(--bg);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  .tag { padding: 2px 8px; border-radius: 3px; letter-spacing: 0.3px; }
  .tag-temp     { color: var(--temp); background: rgba(240, 180, 41, 0.1); }
  .tag-compiled { color: var(--compiled); background: rgba(96, 165, 250, 0.1); }
  .tag-archives { color: var(--archives); background: rgba(72, 216, 137, 0.1); }

  .control-actions { display: flex; gap: 8px; margin-top: 14px; }

  /* -- Buttons -- */
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
  .btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .btn-primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-dim);
    font-size: 12px;
  }
  .btn-ghost:hover { color: var(--text-muted); background: var(--surface2); }
  .btn-danger {
    background: transparent;
    color: var(--error);
    border-color: var(--error);
    font-weight: 600;
  }
  .btn-danger:hover { background: var(--error-bg); }
  .btn-accent {
    background: transparent;
    color: var(--accent);
    border-color: var(--accent);
  }
  .btn-accent:hover { background: var(--accent-dim); }

  /* -- Status -- */
  .status {
    text-align: center;
    padding: 28px;
    color: var(--text-muted);
    font-size: 14px;
  }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* -- Results header -- */
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .results-summary {
    font-size: 13px;
    color: var(--text-muted);
    font-family: var(--mono);
  }
  .results-summary strong { color: var(--text); font-weight: 600; }

  /* -- Category group -- */
  .category-group {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 8px;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .category-group:hover { border-color: var(--text-dim); }
  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }
  .category-header:hover { background: var(--surface2); }
  .category-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .category-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .category-dot-temp     { background: var(--temp); }
  .category-dot-compiled { background: var(--compiled); }
  .category-dot-archives { background: var(--archives); }
  .category-name {
    font-size: 13px;
    font-weight: 500;
  }
  .category-meta {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--mono);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .category-chevron {
    transition: transform 0.2s;
    color: var(--text-dim);
    font-size: 10px;
  }
  .category-group.expanded .category-chevron { transform: rotate(90deg); }

  .category-body {
    max-height: 0;
    overflow: hidden;
    transition: max-height 300ms ease;
  }
  .category-group.expanded .category-body { max-height: 8000px; }

  .category-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  /* -- File rows -- */
  .file-row {
    display: flex;
    align-items: center;
    padding: 6px 16px;
    gap: 10px;
    font-size: 13px;
    border-top: 1px solid var(--border);
    transition: background 0.15s;
  }
  .file-row:hover { background: var(--surface2); }
  .file-row input[type="checkbox"] {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
    transition: all 0.15s;
  }
  .file-row input[type="checkbox"]:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .file-row input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 4px;
    width: 4px;
    height: 8px;
    border: solid var(--bg);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: 13px;
  }
  .file-path-col {
    flex: 2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-dim);
    font-family: var(--mono);
    font-size: 11px;
  }
  .file-size {
    width: 72px;
    text-align: right;
    color: var(--text-muted);
    font-family: var(--mono);
    font-size: 11px;
    flex-shrink: 0;
  }
  .file-date {
    width: 84px;
    text-align: right;
    color: var(--text-dim);
    font-size: 11px;
    flex-shrink: 0;
  }
  .dir-badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--surface2);
    color: var(--text-dim);
    border: 1px solid var(--border);
    flex-shrink: 0;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* -- AI Panel -- */
  .ai-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    margin-bottom: 14px;
    overflow: hidden;
  }
  .ai-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
  }
  .ai-panel-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
  }
  .ai-panel-body {
    padding: 14px 16px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-muted);
    white-space: pre-wrap;
    font-family: var(--font);
    max-height: 400px;
    overflow-y: auto;
  }
  .ai-cursor {
    display: inline-block;
    width: 6px;
    height: 14px;
    background: var(--accent);
    margin-left: 2px;
    animation: blink 1s step-end infinite;
    vertical-align: text-bottom;
  }
  @keyframes blink { 50% { opacity: 0; } }

  /* -- Footer -- */
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
    gap: 12px;
  }
  .footer .spacer { flex: 1; }
  .footer-info {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
  }
  .footer-info .sep { color: var(--text-dim); margin: 0 4px; }

  /* -- Modal -- */
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
    max-width: 520px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .modal h3 {
    color: var(--error);
    font-size: 15px;
    margin-bottom: 8px;
  }
  .modal p {
    color: var(--text-muted);
    font-size: 13px;
    margin-bottom: 12px;
    line-height: 1.5;
  }
  .modal .file-list {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 12px;
    max-height: 220px;
    overflow-y: auto;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.8;
  }
  .modal-summary {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 16px;
  }
  .modal-summary strong { color: var(--text); }
  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* -- History -- */
  .history-section { margin-top: 16px; }
  .history-list {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-top: 8px;
    max-height: 240px;
    overflow-y: auto;
  }
  .history-item {
    display: flex;
    justify-content: space-between;
    padding: 6px 16px;
    font-size: 11px;
    font-family: var(--mono);
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
  }
  .history-item:last-child { border-bottom: none; }
  .history-item-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .history-item-meta {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    color: var(--text-dim);
  }

  /* -- Toast -- */
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
  .toast.error { color: var(--error); border-color: var(--error); }
  .toast.success { color: var(--success); border-color: var(--success); }

  /* -- Scan Stats -- */
  .scan-stats {
    text-align: center;
    font-size: 11px;
    color: var(--text-dim);
    padding: 8px;
    font-family: var(--mono);
  }

  /* -- Responsive -- */
  @media (max-width: 640px) {
    .content { padding: 12px 12px 120px; }
    .header { padding: 10px 12px; flex-wrap: wrap; }
    .control-row { flex-direction: column; align-items: flex-start; gap: 6px; }
    .control-label { width: auto; }
    .file-path-col { display: none; }
    .file-date { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <span class="badge">CLEANUP</span>
  <span class="title">Disk Cleanup</span>
  <span class="subtitle">Scan, analyze, reclaim</span>
  <img src="/logo.png" alt="agent" class="header-logo">
</div>

<div class="content">

  <div class="controls">
    <div class="control-row">
      <span class="control-label">Directory</span>
      <input type="text" id="dir-input" class="input" value="${escapeHtml(defaultDir)}" autocomplete="off" spellcheck="false">
    </div>
    <div class="control-row">
      <span class="control-label">Categories</span>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" id="cat-temp" checked>
          <span class="tag tag-temp">Temporary</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="cat-compiled" checked>
          <span class="tag tag-compiled">Compiled</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="cat-archives" checked>
          <span class="tag tag-archives">Archives</span>
        </label>
      </div>
    </div>
    <div class="control-actions">
      <button class="btn btn-primary" id="btn-scan" onclick="scan()">Scan</button>
      <button class="btn btn-ghost" id="btn-clear" onclick="clearResults()" style="display:none">Clear</button>
    </div>
  </div>

  <div id="status" class="status" style="display:none"></div>

  <div id="results" style="display:none">
    <div class="results-header">
      <div class="results-summary" id="results-summary"></div>
      <button class="btn btn-accent" id="btn-analyze" onclick="analyzeWithAI()" style="display:none">Analyze with AI</button>
    </div>

    <div id="ai-panel" class="ai-panel" style="display:none">
      <div class="ai-panel-header">
        <span class="ai-panel-title">AI Analysis</span>
        <button class="btn-ghost" onclick="document.getElementById('ai-panel').style.display='none'" style="font-size:16px;border:none;background:none;color:var(--text-dim);cursor:pointer">&times;</button>
      </div>
      <div class="ai-panel-body" id="ai-body"></div>
    </div>

    <div id="category-groups"></div>
    <div id="scan-stats" class="scan-stats" style="display:none"></div>
  </div>

  <div id="history-section" class="history-section" style="display:none">
    <button class="btn btn-ghost" onclick="toggleHistory()">Deletion History</button>
    <div id="history-list" class="history-list" style="display:none"></div>
  </div>

</div>

<div class="toast" id="toast"></div>

<!-- Delete Confirm Modal -->
<div class="modal-overlay" id="deleteModal">
  <div class="modal">
    <h3>Confirm Deletion</h3>
    <p>The following items will be permanently deleted. This cannot be undone.</p>
    <div class="file-list" id="modal-file-list"></div>
    <div class="modal-summary" id="modal-summary"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="confirmDelete()" id="modal-confirm-btn">Delete</button>
    </div>
  </div>
</div>

<!-- Footer -->
<div class="footer-wrapper" id="footer-bar" style="display:none">
  <div class="footer">
    <div class="footer-info">
      <span id="selected-count">0 selected</span>
      <span class="sep">|</span>
      <span id="selected-size">0 B</span>
    </div>
    <div class="spacer"></div>
    <button class="btn btn-danger" id="btn-delete" onclick="showDeleteModal()" disabled>Delete Selected</button>
    <button class="btn" onclick="done()">Done</button>
  </div>
</div>

<script>
(function() {
  var PORT = ${port};
  var scanData = null;
  var selectedFiles = new Set();

  // -- Scan --
  window.scan = function() {
    var dir = document.getElementById('dir-input').value.trim();
    if (!dir) return;

    var cats = [];
    if (document.getElementById('cat-temp').checked) cats.push('temp');
    if (document.getElementById('cat-compiled').checked) cats.push('compiled');
    if (document.getElementById('cat-archives').checked) cats.push('archives');
    if (cats.length === 0) return;

    showStatus('Scanning directory...', true);
    hideResults();

    fetch('http://127.0.0.1:' + PORT + '/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: dir, categories: cats })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { showStatus(data.error); return; }
      if (data.totalFiles === 0) { showStatus('No matching files found.'); return; }
      scanData = data;
      selectedFiles.clear();
      renderResults(data);
      hideStatus();
    })
    .catch(function(err) { showStatus('Scan failed: ' + err.message); });
  };

  // -- Render Results --
  function renderResults(data) {
    var container = document.getElementById('category-groups');
    container.innerHTML = '';

    var order = ['temp', 'compiled', 'archives'];
    var labels = { temp: 'Temporary Files', compiled: 'Compiled / Build Artifacts', archives: 'Archives' };

    order.forEach(function(cat) {
      var files = data.results[cat];
      if (!files || files.length === 0) return;
      var summary = data.summary[cat];

      var group = document.createElement('div');
      group.className = 'category-group';
      group.dataset.category = cat;

      group.innerHTML =
        '<div class="category-header" onclick="toggleCategory(this.parentElement)">' +
          '<div class="category-header-left">' +
            '<span class="category-dot category-dot-' + cat + '"></span>' +
            '<span class="category-name">' + labels[cat] + '</span>' +
          '</div>' +
          '<div class="category-meta">' +
            '<span>' + summary.count + ' items</span>' +
            '<span>' + summary.sizeFormatted + '</span>' +
            '<span class="category-chevron">&#9654;</span>' +
          '</div>' +
        '</div>' +
        '<div class="category-body">' +
          '<div class="category-actions">' +
            '<button class="btn btn-ghost" onclick="selectCategory(\\''+cat+'\\',true)">Select all</button>' +
            '<button class="btn btn-ghost" onclick="selectCategory(\\''+cat+'\\',false)">Deselect all</button>' +
          '</div>' +
          '<div class="file-list-rows" data-cat="' + cat + '"></div>' +
        '</div>';

      var fileListEl = group.querySelector('.file-list-rows');
      files.forEach(function(file) {
        var row = document.createElement('div');
        row.className = 'file-row';
        row.innerHTML =
          '<input type="checkbox" data-path="' + escapeAttr(file.path) + '" onchange="toggleFileSelection(this)">' +
          '<span class="file-name">' + escapeHtml(file.name) + '</span>' +
          '<span class="file-path-col" title="' + escapeAttr(file.path) + '">' + escapeHtml(file.path) + '</span>' +
          (file.isDirectory ? '<span class="dir-badge">dir</span>' : '') +
          '<span class="file-size">' + file.sizeFormatted + '</span>' +
          '<span class="file-date">' + formatDate(file.modified) + '</span>';
        fileListEl.appendChild(row);
      });

      container.appendChild(group);
    });

    document.getElementById('results').style.display = 'block';
    document.getElementById('results-summary').innerHTML =
      'Found <strong>' + data.totalFiles + '</strong> items totaling <strong>' + data.totalSizeFormatted + '</strong>';
    document.getElementById('btn-analyze').style.display = 'inline-flex';
    document.getElementById('btn-clear').style.display = 'inline-flex';
    document.getElementById('footer-bar').style.display = 'block';
    document.getElementById('scan-stats').style.display = 'block';
    document.getElementById('scan-stats').textContent = 'Scanned in ' + data.scanTime + 'ms';
    updateFooter();
  }

  window.toggleCategory = function(group) { group.classList.toggle('expanded'); };

  window.selectCategory = function(cat, sel) {
    var cbs = document.querySelectorAll('.file-list-rows[data-cat="'+cat+'"] input[type="checkbox"]');
    cbs.forEach(function(cb) {
      cb.checked = sel;
      if (sel) selectedFiles.add(cb.dataset.path);
      else selectedFiles.delete(cb.dataset.path);
    });
    updateFooter();
  };

  window.toggleFileSelection = function(cb) {
    if (cb.checked) selectedFiles.add(cb.dataset.path);
    else selectedFiles.delete(cb.dataset.path);
    updateFooter();
  };

  function updateFooter() {
    var count = selectedFiles.size;
    var totalSize = 0;
    if (scanData) {
      Object.values(scanData.results).forEach(function(files) {
        files.forEach(function(f) {
          if (selectedFiles.has(f.path)) totalSize += f.size;
        });
      });
    }
    document.getElementById('selected-count').textContent = count + ' selected';
    document.getElementById('selected-size').textContent = formatSize(totalSize);
    document.getElementById('btn-delete').disabled = count === 0;
  }

  // -- AI Analysis --
  window.analyzeWithAI = function() {
    if (!scanData) return;
    var panel = document.getElementById('ai-panel');
    var body = document.getElementById('ai-body');
    panel.style.display = 'block';
    body.innerHTML = '<span class="ai-cursor"></span>';

    var sampleFiles = {};
    Object.keys(scanData.results).forEach(function(cat) {
      sampleFiles[cat] = scanData.results[cat].slice(0, 10).map(function(f) {
        return { name: f.name, path: f.path, size: f.sizeFormatted, isDirectory: f.isDirectory };
      });
    });

    fetch('http://127.0.0.1:' + PORT + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: scanData.summary, sampleFiles: sampleFiles })
    })
    .then(function(res) {
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var fullText = '';

      function read() {
        reader.read().then(function(result) {
          if (result.done) {
            var cursor = body.querySelector('.ai-cursor');
            if (cursor) cursor.remove();
            return;
          }
          var chunk = decoder.decode(result.value, { stream: true });
          var lines = chunk.split('\\n');
          lines.forEach(function(line) {
            if (!line.startsWith('data: ')) return;
            var payload = line.slice(6).trim();
            if (payload === '[DONE]') return;
            try {
              var msg = JSON.parse(payload);
              if (msg.text) {
                fullText += msg.text;
                body.innerHTML = escapeHtml(fullText) + '<span class="ai-cursor"></span>';
                body.scrollTop = body.scrollHeight;
              } else if (msg.done && msg.result) {
                fullText = msg.result;
                body.innerHTML = escapeHtml(fullText);
              } else if (msg.error) {
                body.innerHTML = '<span style="color:var(--error)">Error: ' + escapeHtml(msg.error) + '</span>';
              }
            } catch(e) {}
          });
          read();
        });
      }
      read();
    })
    .catch(function(err) {
      body.innerHTML = '<span style="color:var(--error)">Failed: ' + escapeHtml(err.message) + '</span>';
    });
  };

  // -- Delete --
  window.showDeleteModal = function() {
    if (selectedFiles.size === 0) return;
    var list = document.getElementById('modal-file-list');
    list.innerHTML = '';
    var totalSize = 0;
    var filesToDelete = [];

    Object.values(scanData.results).forEach(function(files) {
      files.forEach(function(f) {
        if (selectedFiles.has(f.path)) {
          filesToDelete.push(f);
          totalSize += f.size;
        }
      });
    });

    list.innerHTML = filesToDelete.map(function(f) {
      return escapeHtml(f.path) + '  (' + f.sizeFormatted + ')';
    }).join('<br>');

    document.getElementById('modal-summary').innerHTML =
      '<strong>' + filesToDelete.length + '</strong> items, <strong>' + formatSize(totalSize) + '</strong> will be freed.';
    document.getElementById('deleteModal').classList.add('active');
  };

  window.closeModal = function() {
    document.getElementById('deleteModal').classList.remove('active');
  };

  window.confirmDelete = function() {
    var btn = document.getElementById('modal-confirm-btn');
    btn.textContent = 'Deleting...';
    btn.disabled = true;

    var files = Array.from(selectedFiles);

    fetch('http://127.0.0.1:' + PORT + '/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      closeModal();
      btn.textContent = 'Delete';
      btn.disabled = false;

      if (data.deletedCount > 0) {
        showToast('Deleted ' + data.deletedCount + ' items, freed ' + data.freedFormatted, 'success');

        // Remove from scan data and re-render
        data.results.forEach(function(r) {
          if (r.success) {
            selectedFiles.delete(r.path);
            Object.keys(scanData.results).forEach(function(cat) {
              var idx = scanData.results[cat].findIndex(function(f) { return f.path === r.path; });
              if (idx !== -1) scanData.results[cat].splice(idx, 1);
            });
          }
        });

        // Recalculate
        var totalFiles = 0, totalSize = 0;
        Object.keys(scanData.results).forEach(function(cat) {
          var files = scanData.results[cat];
          var catSize = files.reduce(function(s,f){ return s+f.size; }, 0);
          scanData.summary[cat] = { count: files.length, size: catSize, sizeFormatted: formatSize(catSize) };
          totalFiles += files.length;
          totalSize += catSize;
        });
        scanData.totalFiles = totalFiles;
        scanData.totalSize = totalSize;
        scanData.totalSizeFormatted = formatSize(totalSize);
        renderResults(scanData);
      } else {
        showToast('No files deleted. ' + (data.results[0] && data.results[0].error || ''), 'error');
      }
    })
    .catch(function(err) {
      closeModal();
      btn.textContent = 'Delete';
      btn.disabled = false;
      showToast('Delete failed: ' + err.message, 'error');
    });
  };

  // -- History --
  window.toggleHistory = function() {
    var list = document.getElementById('history-list');
    var section = document.getElementById('history-section');
    if (list.style.display === 'none') {
      loadHistory();
      list.style.display = 'block';
      section.style.display = 'block';
    } else {
      list.style.display = 'none';
    }
  };

  function loadHistory() {
    fetch('http://127.0.0.1:' + PORT + '/history')
    .then(function(r) { return r.json(); })
    .then(function(entries) {
      var list = document.getElementById('history-list');
      if (entries.length === 0) {
        list.innerHTML = '<div class="history-item"><span class="history-item-path">No deletions recorded.</span></div>';
        return;
      }
      list.innerHTML = entries.map(function(e) {
        return '<div class="history-item">' +
          '<span class="history-item-path">' + escapeHtml(e.path) + '</span>' +
          '<span class="history-item-meta">' +
            '<span>' + formatSize(e.size) + '</span>' +
            '<span>' + formatDate(e.timestamp) + '</span>' +
          '</span>' +
        '</div>';
      }).join('');
    })
    .catch(function(){});
  }

  // -- Done --
  window.done = function() {
    fetch('http://127.0.0.1:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'done', deletedCount: 0 })
    }).catch(function(){});
  };

  window.addEventListener('pagehide', function() {
    try {
      navigator.sendBeacon('http://127.0.0.1:' + PORT + '/result', JSON.stringify({ action: 'closed' }));
    } catch(e) {}
  });

  // -- Helpers --
  function showStatus(msg, loading) {
    var el = document.getElementById('status');
    el.style.display = 'block';
    el.innerHTML = (loading ? '<span class="spinner"></span>' : '') + escapeHtml(msg);
  }
  function hideStatus() { document.getElementById('status').style.display = 'none'; }
  function hideResults() {
    document.getElementById('results').style.display = 'none';
    document.getElementById('footer-bar').style.display = 'none';
    document.getElementById('ai-panel').style.display = 'none';
    document.getElementById('scan-stats').style.display = 'none';
  }
  window.clearResults = function() {
    scanData = null;
    selectedFiles.clear();
    hideResults();
    hideStatus();
    document.getElementById('btn-clear').style.display = 'none';
    document.getElementById('category-groups').innerHTML = '';
  };

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(function() { t.className = 'toast'; }, 3000);
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function escapeHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function escapeAttr(str) { return escapeHtml(str); }

})();
</script>
</body>
</html>`;
}
