// ABOUTME: Self-contained HTML/CSS/JS for the browser-based Soundcn sound viewer.
// ABOUTME: Categories, search, preview playback via Web Audio API, hook assignment, config management.

import type { SoundsConfig, HookName } from "./sounds-config.ts";

export interface CatalogItem {
	name: string;
	title: string;
	description: string;
	categories: string[];
	author?: string;
	meta?: {
		duration?: number;
		format?: string;
		sizeKb?: number;
		license?: string;
		tags?: string[];
		keywords?: string[];
	};
}

export function generateSoundsViewerHTML(opts: {
	catalog: CatalogItem[];
	config: SoundsConfig;
	port: number;
}): string {
	const { catalog, config, port } = opts;
	const escapedCatalog = JSON.stringify(catalog).replace(/<\//g, "<\\/");
	const escapedConfig = JSON.stringify(config).replace(/<\//g, "<\\/");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sound Browser — Pi</title>
<style>
  :root {
    --bg: #1a1d23;
    --surface: #1e2228;
    --surface2: #252a32;
    --surface3: #2a303a;
    --border: #2e343e;
    --border-hover: #3e4650;
    --text: #e2e8f0;
    --text-muted: #8892a0;
    --text-dim: #555d6e;
    --accent: #2980b9;
    --accent-hover: #3a9ad5;
    --accent-dim: rgba(41, 128, 185, 0.12);
    --accent-glow: rgba(41, 128, 185, 0.25);
    --success: #48d889;
    --success-bg: rgba(72, 216, 137, 0.08);
    --success-dim: rgba(72, 216, 137, 0.15);
    --warning: #f0b429;
    --warning-bg: rgba(240, 180, 41, 0.08);
    --error: #e85858;
    --error-bg: rgba(232, 88, 88, 0.08);
    --purple: #a78bfa;
    --purple-dim: rgba(167, 139, 250, 0.12);
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
    --radius: 8px;
    --shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.5;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Scrollbar ──────────────────────── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

  /* ── Header ─────────────────────────── */
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
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
    flex-shrink: 0;
  }
  .header .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .header .sound-count {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-muted);
  }

  /* ── Toolbar ────────────────────────── */
  .toolbar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 10px 20px;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
  }
  .search-box {
    flex: 1;
    max-width: 400px;
    position: relative;
  }
  .search-box svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: var(--text-dim);
    pointer-events: none;
  }
  .search-box input {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 13px;
    padding: 8px 12px 8px 34px;
    outline: none;
    transition: border-color 0.15s;
    font-family: var(--font);
  }
  .search-box input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-dim);
  }
  .search-box input::placeholder { color: var(--text-dim); }

  .volume-control {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .volume-control input[type="range"] {
    width: 80px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .toggle-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-size: 12px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font);
  }
  .toggle-btn:hover { border-color: var(--accent); color: var(--text); }
  .toggle-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

  /* ── Main Layout ────────────────────── */
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ── Sidebar: Categories ────────────── */
  .sidebar {
    width: 220px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    flex-shrink: 0;
    padding: 12px 0;
  }
  .sidebar-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    padding: 4px 16px 8px;
  }
  .cat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 16px;
    cursor: pointer;
    transition: all 0.1s;
    font-size: 13px;
    color: var(--text-muted);
    border-left: 2px solid transparent;
  }
  .cat-item:hover { background: var(--surface2); color: var(--text); }
  .cat-item.active {
    background: var(--accent-dim);
    color: var(--accent);
    border-left-color: var(--accent);
    font-weight: 600;
  }
  .cat-item .count {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-dim);
    background: var(--surface2);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .cat-item.active .count { background: var(--accent-dim); color: var(--accent); }

  /* ── Content Area ───────────────────── */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }
  .content-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .content-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .content-header .result-count {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-dim);
  }

  /* ── Sound Grid ─────────────────────── */
  .sound-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }

  .sound-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    cursor: default;
    transition: border-color 0.15s, box-shadow 0.15s;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sound-card:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow);
  }
  .sound-card.playing {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-dim), var(--shadow);
  }
  .sound-card.assigned {
    border-left: 3px solid var(--success);
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .card-info { flex: 1; min-width: 0; }
  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-desc {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 4px;
  }

  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-dim);
  }
  .card-meta span { display: flex; align-items: center; gap: 3px; }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag {
    font-size: 10px;
    font-family: var(--mono);
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--surface2);
    color: var(--text-dim);
    text-transform: lowercase;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  /* ── Buttons ────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--font);
    padding: 5px 12px;
    cursor: pointer;
    transition: all 0.15s;
    background: var(--surface2);
    color: var(--text-muted);
  }
  .btn:hover { border-color: var(--accent); color: var(--text); }
  .btn svg { width: 14px; height: 14px; }

  .btn-play { }
  .btn-play.playing {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn-play.loading { opacity: 0.6; pointer-events: none; }

  .btn-assign {
    position: relative;
  }
  .btn-assign.assigned {
    background: var(--success-bg);
    border-color: var(--success);
    color: var(--success);
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .btn-primary:hover { background: var(--accent-hover); }

  .btn-ghost {
    background: transparent;
    border-color: transparent;
  }
  .btn-ghost:hover { background: var(--surface2); border-color: var(--border); }

  /* ── Assign Dropdown ────────────────── */
  .assign-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 200;
    min-width: 260px;
    padding: 6px 0;
    max-height: 360px;
    overflow-y: auto;
  }
  .assign-dropdown.open { display: block; }
  .assign-dropdown-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    padding: 6px 14px 4px;
  }
  .assign-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.1s;
    font-size: 13px;
    gap: 10px;
  }
  .assign-option:hover { background: var(--surface2); }
  .assign-option .hook-name { color: var(--text); font-weight: 500; }
  .assign-option .hook-desc { font-size: 11px; color: var(--text-dim); }
  .assign-option .hook-current {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--accent);
    white-space: nowrap;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .assign-option .hook-check {
    color: var(--success);
    font-size: 14px;
    flex-shrink: 0;
  }
  .assign-option.clear-option { color: var(--error); }
  .assign-option.clear-option:hover { background: var(--error-bg); }

  /* ── Detail Panel ───────────────────── */
  .detail-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 300;
    justify-content: center;
    align-items: center;
  }
  .detail-overlay.open { display: flex; }
  .detail-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  }
  .detail-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
  }
  .detail-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 6px;
  }
  .detail-header p {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .detail-body { padding: 16px 24px; }
  .detail-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }
  .detail-meta-item {
    background: var(--surface2);
    border-radius: 6px;
    padding: 10px 14px;
  }
  .detail-meta-item label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    font-weight: 700;
    display: block;
    margin-bottom: 2px;
  }
  .detail-meta-item span {
    font-size: 14px;
    color: var(--text);
    font-family: var(--mono);
  }
  .detail-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }
  .detail-tags .tag {
    font-size: 11px;
    padding: 3px 8px;
  }
  .detail-actions {
    display: flex;
    gap: 10px;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
  }
  .detail-actions .btn { padding: 8px 18px; font-size: 13px; }
  .detail-hotkeys {
    padding: 12px 24px;
    background: var(--surface2);
    border-top: 1px solid var(--border);
    border-radius: 0 0 12px 12px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .hotkey {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .hotkey kbd {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ── Assignments Panel ──────────────── */
  .assignments-panel {
    width: 280px;
    background: var(--surface);
    border-left: 1px solid var(--border);
    overflow-y: auto;
    flex-shrink: 0;
    padding: 12px 0;
  }
  .assignments-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    padding: 4px 16px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .hook-slot {
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
  }
  .hook-slot-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .hook-slot-desc {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  .hook-slot-sound {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .hook-slot-sound .sound-name {
    font-family: var(--mono);
    color: var(--accent);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hook-slot-sound .empty {
    color: var(--text-dim);
    font-style: italic;
    font-family: var(--font);
  }
  .hook-slot-sound .remove-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 2px;
    font-size: 14px;
    line-height: 1;
    transition: color 0.1s;
  }
  .hook-slot-sound .remove-btn:hover { color: var(--error); }
  .hook-slot-sound .preview-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 2px;
    font-size: 12px;
    transition: color 0.1s;
  }
  .hook-slot-sound .preview-btn:hover { color: var(--accent); }

  /* ── Footer ─────────────────────────── */
  .footer {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }
  .footer-left {
    font-size: 12px;
    color: var(--text-dim);
  }
  .footer-right { display: flex; gap: 8px; }
  .footer .btn { padding: 8px 20px; }

  /* ── Toast Notifications ────────────── */
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 500;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toast {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 16px;
    font-size: 13px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: toastIn 0.2s ease-out;
    max-width: 340px;
  }
  .toast.success { border-left: 3px solid var(--success); }
  .toast.error { border-left: 3px solid var(--error); }
  .toast.info { border-left: 3px solid var(--accent); }
  @keyframes toastIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

  /* ── Empty State ────────────────────── */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-dim);
  }
  .empty-state .icon { font-size: 48px; margin-bottom: 12px; }
  .empty-state h3 { font-size: 16px; color: var(--text-muted); margin-bottom: 6px; }
  .empty-state p { font-size: 13px; }

  /* ── Loading ────────────────────────── */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spinner { animation: spin 1s linear infinite; display: inline-block; }

  /* ── Playing Pulse ──────────────────── */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .playing-indicator { animation: pulse 1s ease-in-out infinite; color: var(--accent); }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <img src="/logo.png" class="header-logo" alt="">
  <span class="badge">SOUNDS</span>
  <span class="title">Sound Browser</span>
  <span class="sound-count" id="soundCount"></span>
</div>

<!-- Toolbar -->
<div class="toolbar">
  <div class="search-box">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="text" id="searchInput" placeholder="Search sounds by name, tags, keywords..." autocomplete="off" spellcheck="false">
  </div>
  <div class="volume-control">
    <span>🔊</span>
    <input type="range" id="volumeSlider" min="0" max="100" step="5">
    <span id="volumeLabel">50%</span>
  </div>
  <button class="toggle-btn" id="enableToggle">Enabled</button>
</div>

<!-- Main -->
<div class="main">
  <!-- Sidebar: Categories -->
  <div class="sidebar">
    <div class="sidebar-title">Categories</div>
    <div id="categoryList"></div>
  </div>

  <!-- Content: Sound Grid -->
  <div class="content">
    <div class="content-header">
      <h2 id="contentTitle">All Sounds</h2>
      <span class="result-count" id="resultCount"></span>
    </div>
    <div class="sound-grid" id="soundGrid"></div>
    <div class="empty-state" id="emptyState" style="display:none">
      <div class="icon">🔇</div>
      <h3>No sounds found</h3>
      <p>Try a different search or category</p>
    </div>
  </div>

  <!-- Right Panel: Assignments -->
  <div class="assignments-panel">
    <div class="assignments-title">
      <span>Hook Assignments</span>
      <span id="assignCount" style="font-family:var(--mono);font-size:11px;color:var(--text-dim)"></span>
    </div>
    <div id="hookSlots"></div>
  </div>
</div>

<!-- Detail Overlay -->
<div class="detail-overlay" id="detailOverlay">
  <div class="detail-panel" id="detailPanel"></div>
</div>

<!-- Toasts -->
<div class="toast-container" id="toastContainer"></div>

<!-- Footer -->
<div class="footer">
  <div class="footer-left">
    <span id="footerStatus">Browse and assign sounds to Pi hooks</span>
  </div>
  <div class="footer-right">
    <button class="btn btn-ghost" onclick="cancelAndClose()">Cancel</button>
    <button class="btn btn-primary" onclick="applyAndClose()">✓ Apply & Close</button>
  </div>
</div>

<script>
(function() {
  const PORT = ${port};
  const catalog = ${escapedCatalog};
  const config = JSON.parse(JSON.stringify(${escapedConfig}));

  // ── State ──────────────────────────────────
  let activeCategory = 'all';
  let searchQuery = '';
  let playingSound = null; // name of currently playing sound
  let audioCtx = null;
  let currentSource = null;
  let openDropdown = null; // name of sound with open dropdown
  let detailSound = null; // name of sound in detail view

  // Hook definitions
  const HOOKS = [
    { name: 'agent_end', label: 'Task Complete', desc: 'Agent finishes, ready for input' },
    { name: 'agent_start', label: 'Agent Starting', desc: 'Agent starts processing' },
    { name: 'tool_execution_start', label: 'Tool Called', desc: 'Tool begins executing' },
    { name: 'tool_execution_end', label: 'Tool Finished', desc: 'Tool finishes executing' },
    { name: 'turn_start', label: 'Turn Start', desc: 'LLM turn begins' },
    { name: 'turn_end', label: 'Turn End', desc: 'LLM turn ends' },
    { name: 'session_start', label: 'Session Boot', desc: 'New session starts' },
    { name: 'session_compact', label: 'Context Compacted', desc: 'Context compaction' },
  ];

  // ── Init ───────────────────────────────────
  document.getElementById('volumeSlider').value = Math.round(config.volume * 100);
  document.getElementById('volumeLabel').textContent = Math.round(config.volume * 100) + '%';
  updateEnableToggle();
  buildCategories();
  renderSounds();
  renderHookSlots();
  updateCounts();

  // ── Search ─────────────────────────────────
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderSounds();
    updateCounts();
  });

  // Keyboard shortcut: / to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      if (detailSound) { closeDetail(); return; }
      if (openDropdown) { closeDropdowns(); return; }
      if (searchInput.value) { searchInput.value = ''; searchQuery = ''; renderSounds(); updateCounts(); return; }
    }
  });

  // Close dropdowns on click outside
  document.addEventListener('click', (e) => {
    if (openDropdown && !e.target.closest('.btn-assign') && !e.target.closest('.assign-dropdown')) {
      closeDropdowns();
    }
  });

  // ── Volume ─────────────────────────────────
  document.getElementById('volumeSlider').addEventListener('input', (e) => {
    config.volume = parseInt(e.target.value) / 100;
    document.getElementById('volumeLabel').textContent = e.target.value + '%';
  });

  // ── Enable Toggle ──────────────────────────
  document.getElementById('enableToggle').addEventListener('click', () => {
    config.enabled = !config.enabled;
    updateEnableToggle();
  });

  function updateEnableToggle() {
    const btn = document.getElementById('enableToggle');
    if (config.enabled) {
      btn.textContent = '🔊 Enabled';
      btn.classList.add('active');
    } else {
      btn.textContent = '🔇 Disabled';
      btn.classList.remove('active');
    }
  }

  // ── Categories ─────────────────────────────
  function buildCategories() {
    const counts = {};
    catalog.forEach(s => {
      const primary = (s.categories || [])[0] || 'other';
      counts[primary] = (counts[primary] || 0) + 1;
    });

    // Sort by count desc
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const el = document.getElementById('categoryList');
    let html = '<div class="cat-item active" data-cat="all" onclick="setCategory(\\'all\\')"><span>All</span><span class="count">' + catalog.length + '</span></div>';
    sorted.forEach(([cat, count]) => {
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      html += '<div class="cat-item" data-cat="' + cat + '" onclick="setCategory(\\'' + cat + '\\')">' +
        '<span>' + label + '</span><span class="count">' + count + '</span></div>';
    });
    el.innerHTML = html;
  }

  window.setCategory = function(cat) {
    activeCategory = cat;
    document.querySelectorAll('.cat-item').forEach(el => {
      el.classList.toggle('active', el.dataset.cat === cat);
    });
    const label = cat === 'all' ? 'All Sounds' : cat.charAt(0).toUpperCase() + cat.slice(1);
    document.getElementById('contentTitle').textContent = label;
    renderSounds();
    updateCounts();
  };

  // ── Filtering ──────────────────────────────
  function getFilteredSounds() {
    return catalog.filter(s => {
      // Category filter
      if (activeCategory !== 'all') {
        const primary = (s.categories || [])[0] || 'other';
        if (primary !== activeCategory) return false;
      }
      // Search filter
      if (searchQuery) {
        const fields = [
          s.name, s.title, s.description,
          ...(s.meta?.tags || []),
          ...(s.meta?.keywords || []),
          ...(s.categories || []),
        ].map(f => (f || '').toLowerCase());
        return fields.some(f => f.includes(searchQuery));
      }
      return true;
    });
  }

  // ── Render Sound Grid ──────────────────────
  function renderSounds() {
    const sounds = getFilteredSounds();
    const grid = document.getElementById('soundGrid');
    const empty = document.getElementById('emptyState');

    if (sounds.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    grid.innerHTML = sounds.map(s => {
      const isPlaying = playingSound === s.name;
      const isAssigned = Object.values(config.assignments).includes(s.name);
      const duration = s.meta?.duration ? s.meta.duration.toFixed(2) + 's' : '—';
      const size = s.meta?.sizeKb ? s.meta.sizeKb + 'KB' : '—';
      const license = s.meta?.license || '—';
      const tags = (s.meta?.tags || []).slice(0, 4);
      const assignedHooks = Object.entries(config.assignments)
        .filter(([_, v]) => v === s.name)
        .map(([k]) => HOOKS.find(h => h.name === k)?.label || k);

      return '<div class="sound-card' + (isPlaying ? ' playing' : '') + (isAssigned ? ' assigned' : '') + '" data-name="' + s.name + '">' +
        '<div class="card-top">' +
          '<div class="card-info">' +
            '<div class="card-title" onclick="openDetail(\\'' + s.name + '\\')" style="cursor:pointer">' + esc(s.title) + '</div>' +
            '<div class="card-desc">' + esc(s.description) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-meta">' +
          '<span>⏱ ' + duration + '</span>' +
          '<span>📦 ' + size + '</span>' +
          '<span>📜 ' + license + '</span>' +
        '</div>' +
        (tags.length ? '<div class="card-tags">' + tags.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' : '') +
        (assignedHooks.length ? '<div style="font-size:11px;color:var(--success);margin-top:2px">✓ ' + assignedHooks.join(', ') + '</div>' : '') +
        '<div class="card-actions">' +
          '<button class="btn btn-play' + (isPlaying ? ' playing' : '') + '" onclick="togglePlay(\\'' + s.name + '\\')">' +
            (isPlaying ? '<span class="playing-indicator">♪</span> Playing' : '▶ Play') +
          '</button>' +
          '<div style="position:relative">' +
            '<button class="btn btn-assign' + (isAssigned ? ' assigned' : '') + '" onclick="toggleAssignDropdown(event, \\'' + s.name + '\\')">' +
              (isAssigned ? '✓ Assigned' : '+ Assign') +
            '</button>' +
            '<div class="assign-dropdown' + (openDropdown === s.name ? ' open' : '') + '" data-dropdown="' + s.name + '">' +
              '<div class="assign-dropdown-title">Assign to Hook</div>' +
              HOOKS.map(h => {
                const current = config.assignments[h.name];
                const isThis = current === s.name;
                return '<div class="assign-option" onclick="assignSound(\\'' + h.name + '\\', \\'' + s.name + '\\')">' +
                  '<div>' +
                    '<div class="hook-name">' + h.label + '</div>' +
                    '<div class="hook-desc">' + h.desc + '</div>' +
                  '</div>' +
                  (isThis ? '<span class="hook-check">✓</span>' : (current ? '<span class="hook-current">' + esc(current) + '</span>' : '')) +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<button class="btn btn-ghost" onclick="openDetail(\\'' + s.name + '\\')" title="Details">⋯</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Counts ─────────────────────────────────
  function updateCounts() {
    const filtered = getFilteredSounds();
    document.getElementById('soundCount').textContent = catalog.length + ' sounds';
    document.getElementById('resultCount').textContent = filtered.length + ' sounds';
    const assignCount = Object.keys(config.assignments).length;
    document.getElementById('assignCount').textContent = assignCount + '/' + HOOKS.length;
  }

  // ── Audio Playback ─────────────────────────
  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  window.togglePlay = async function(name) {
    // If same sound is playing, stop it
    if (playingSound === name) {
      stopPlayback();
      return;
    }
    // Stop any current playback
    stopPlayback();

    playingSound = name;
    renderSounds();
    if (detailSound === name) renderDetail(name);

    try {
      // Fetch sound data from soundcn.xyz
      const resp = await fetch('https://soundcn.xyz/r/' + name + '.json');
      if (!resp.ok) throw new Error('Failed to fetch sound');
      const data = await resp.json();

      // Extract dataUri from the file content
      const fileContent = data.files?.[0]?.content || '';
      const match = fileContent.match(/dataUri:\\s*"(data:audio\\/[^"]+)"/);
      if (!match) throw new Error('No audio data found');

      const dataUri = match[1];
      const base64 = dataUri.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();

      source.buffer = buffer;
      gain.gain.value = config.volume;
      source.connect(gain);
      gain.connect(ctx.destination);

      source.onended = () => {
        if (playingSound === name) {
          playingSound = null;
          currentSource = null;
          renderSounds();
          if (detailSound === name) renderDetail(name);
        }
      };

      currentSource = source;
      source.start(0);

      // Also send to server for install if assigning
      window.__lastPlayedData = window.__lastPlayedData || {};
      window.__lastPlayedData[name] = dataUri;

    } catch (err) {
      playingSound = null;
      renderSounds();
      showToast('Failed to play: ' + err.message, 'error');
    }
  };

  function stopPlayback() {
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
    }
    playingSound = null;
  }

  // ── Assign Dropdown ────────────────────────
  window.toggleAssignDropdown = function(event, name) {
    event.stopPropagation();
    if (openDropdown === name) {
      openDropdown = null;
    } else {
      openDropdown = name;
    }
    renderSounds();
  };

  function closeDropdowns() {
    openDropdown = null;
    renderSounds();
  }

  window.assignSound = async function(hookName, soundName) {
    // If already assigned to this hook, unassign
    if (config.assignments[hookName] === soundName) {
      delete config.assignments[hookName];
      showToast('Unassigned from ' + HOOKS.find(h => h.name === hookName)?.label, 'info');
    } else {
      config.assignments[hookName] = soundName;
      showToast('Assigned to ' + HOOKS.find(h => h.name === hookName)?.label, 'success');

      // Install the sound data if we have it cached from playback
      const cachedUri = window.__lastPlayedData?.[soundName];
      if (cachedUri) {
        try {
          await fetch('http://127.0.0.1:' + PORT + '/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: soundName, dataUri: cachedUri }),
          });
        } catch {}
      } else {
        // Fetch and install
        try {
          const resp = await fetch('https://soundcn.xyz/r/' + soundName + '.json');
          const data = await resp.json();
          const fileContent = data.files?.[0]?.content || '';
          const match = fileContent.match(/dataUri:\\s*"(data:audio\\/[^"]+)"/);
          if (match) {
            await fetch('http://127.0.0.1:' + PORT + '/install', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: soundName, dataUri: match[1] }),
            });
          }
        } catch {}
      }
    }

    // Clean up unassigned sounds
    const assignedNames = new Set(Object.values(config.assignments));
    for (const key of Object.keys(window.__lastPlayedData || {})) {
      if (!assignedNames.has(key)) {
        try {
          await fetch('http://127.0.0.1:' + PORT + '/uninstall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: key }),
          });
        } catch {}
      }
    }

    openDropdown = null;
    renderSounds();
    renderHookSlots();
    updateCounts();
  };

  // ── Hook Slots Panel ───────────────────────
  function renderHookSlots() {
    const el = document.getElementById('hookSlots');
    el.innerHTML = HOOKS.map(h => {
      const sound = config.assignments[h.name];
      return '<div class="hook-slot">' +
        '<div class="hook-slot-label">' + h.label + '</div>' +
        '<div class="hook-slot-desc">' + h.desc + '</div>' +
        '<div class="hook-slot-sound">' +
          (sound
            ? '<span class="sound-name">' + esc(sound) + '</span>' +
              '<button class="preview-btn" onclick="togglePlay(\\'' + sound + '\\')" title="Preview">▶</button>' +
              '<button class="remove-btn" onclick="unassignHook(\\'' + h.name + '\\')" title="Remove">×</button>'
            : '<span class="empty">No sound assigned</span>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.unassignHook = async function(hookName) {
    const soundName = config.assignments[hookName];
    delete config.assignments[hookName];

    // Uninstall if no longer assigned to any hook
    if (soundName && !Object.values(config.assignments).includes(soundName)) {
      try {
        await fetch('http://127.0.0.1:' + PORT + '/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: soundName }),
        });
      } catch {}
    }

    renderSounds();
    renderHookSlots();
    updateCounts();
    showToast('Unassigned ' + HOOKS.find(h => h.name === hookName)?.label, 'info');
  };

  // ── Detail View ────────────────────────────
  window.openDetail = function(name) {
    detailSound = name;
    renderDetail(name);
    document.getElementById('detailOverlay').classList.add('open');
  };

  window.closeDetail = function() {
    detailSound = null;
    document.getElementById('detailOverlay').classList.remove('open');
  };

  // Close detail on overlay click
  document.getElementById('detailOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('detailOverlay')) closeDetail();
  });

  function renderDetail(name) {
    const s = catalog.find(x => x.name === name);
    if (!s) return;

    const isPlaying = playingSound === name;
    const duration = s.meta?.duration ? s.meta.duration.toFixed(3) + 's' : '—';
    const size = s.meta?.sizeKb ? s.meta.sizeKb + ' KB' : '—';
    const license = s.meta?.license || '—';
    const format = s.meta?.format || '—';
    const author = s.author || '—';
    const tags = s.meta?.tags || [];
    const keywords = s.meta?.keywords || [];
    const allTags = [...new Set([...tags, ...keywords])];
    const assignedHooks = Object.entries(config.assignments)
      .filter(([_, v]) => v === name)
      .map(([k]) => HOOKS.find(h => h.name === k)?.label || k);

    document.getElementById('detailPanel').innerHTML =
      '<div class="detail-header">' +
        '<h2>' + esc(s.title) + '</h2>' +
        '<p>' + esc(s.description) + '</p>' +
        (assignedHooks.length ? '<div style="margin-top:8px;font-size:12px;color:var(--success)">✓ Assigned to: ' + assignedHooks.join(', ') + '</div>' : '') +
      '</div>' +
      '<div class="detail-body">' +
        '<div class="detail-meta-grid">' +
          '<div class="detail-meta-item"><label>Duration</label><span>' + duration + '</span></div>' +
          '<div class="detail-meta-item"><label>Size</label><span>' + size + '</span></div>' +
          '<div class="detail-meta-item"><label>Format</label><span>' + format.toUpperCase() + '</span></div>' +
          '<div class="detail-meta-item"><label>License</label><span>' + license + '</span></div>' +
          '<div class="detail-meta-item"><label>Author</label><span>' + esc(author.replace(/<[^>]+>/g, '')) + '</span></div>' +
          '<div class="detail-meta-item"><label>Category</label><span>' + (s.categories || []).join(', ') + '</span></div>' +
        '</div>' +
        (allTags.length ? '<div class="detail-tags">' + allTags.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' : '') +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-play' + (isPlaying ? ' playing' : '') + '" onclick="togglePlay(\\'' + name + '\\')">' +
          (isPlaying ? '<span class="playing-indicator">♪</span> Stop' : '▶ Play Preview') +
        '</button>' +
        '<div style="position:relative">' +
          '<button class="btn btn-assign" onclick="toggleDetailAssign(event, \\'' + name + '\\')">' +
            '+ Assign to Hook' +
          '</button>' +
          '<div class="assign-dropdown' + (openDropdown === name + '-detail' ? ' open' : '') + '">' +
            '<div class="assign-dropdown-title">Assign to Hook</div>' +
            HOOKS.map(h => {
              const current = config.assignments[h.name];
              const isThis = current === name;
              return '<div class="assign-option" onclick="assignFromDetail(\\'' + h.name + '\\', \\'' + name + '\\')">' +
                '<div><div class="hook-name">' + h.label + '</div><div class="hook-desc">' + h.desc + '</div></div>' +
                (isThis ? '<span class="hook-check">✓</span>' : (current ? '<span class="hook-current">' + esc(current) + '</span>' : '')) +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-hotkeys">' +
        '<div class="hotkey"><kbd>Space</kbd> Play/Stop</div>' +
        '<div class="hotkey"><kbd>Esc</kbd> Close</div>' +
        '<div class="hotkey"><kbd>/</kbd> Search</div>' +
      '</div>';
  }

  window.toggleDetailAssign = function(event, name) {
    event.stopPropagation();
    openDropdown = openDropdown === name + '-detail' ? null : name + '-detail';
    renderDetail(name);
  };

  window.assignFromDetail = function(hookName, soundName) {
    window.assignSound(hookName, soundName);
    openDropdown = null;
    renderDetail(soundName);
    renderHookSlots();
    updateCounts();
  };

  // Space to play/stop in detail view
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && detailSound && document.activeElement !== searchInput) {
      e.preventDefault();
      window.togglePlay(detailSound);
    }
  });

  // ── Toast ──────────────────────────────────
  function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
  }

  // ── Apply / Cancel ─────────────────────────
  window.applyAndClose = async function() {
    try {
      await fetch('http://127.0.0.1:' + PORT + '/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'applied',
          assignments: config.assignments,
          volume: config.volume,
          enabled: config.enabled,
        }),
      });
    } catch {}
  };

  window.cancelAndClose = async function() {
    try {
      await fetch('http://127.0.0.1:' + PORT + '/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancelled' }),
      });
    } catch {}
  };

  // ── Helpers ────────────────────────────────
  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
</script>
</body>
</html>`;
}
