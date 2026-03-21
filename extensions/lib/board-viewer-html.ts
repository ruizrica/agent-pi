// ABOUTME: Self-contained HTML template for the Task Board Viewer.
// ABOUTME: Renders a live Kanban-style task board with agent chips, activity feed, and auto-refresh.

export interface BoardViewerOptions {
	title: string;
	port: number;
}

/**
 * Generate the full HTML page for the task board viewer.
 * This is a single self-contained page with all CSS/JS inlined.
 * Data is fetched live from /api/board-data every few seconds.
 */
export function generateBoardViewerHTML(opts: BoardViewerOptions): string {
	const { title, port } = opts;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Task Board</title>
<style>
  :root {
    --bg: #1a1d23;
    --surface: #1e2228;
    --surface2: #252a32;
    --surface3: #2a303a;
    --border: #2e343e;
    --border-light: #3a4250;
    --text: #e2e8f0;
    --text-muted: #8892a0;
    --text-dim: #555d6e;
    --accent: #2980b9;
    --accent-hover: #3a9ad5;
    --accent-dim: rgba(41, 128, 185, 0.12);
    --success: #48d889;
    --success-bg: rgba(72, 216, 137, 0.08);
    --success-border: rgba(72, 216, 137, 0.25);
    --warning: #f0b429;
    --warning-bg: rgba(240, 180, 41, 0.08);
    --warning-border: rgba(240, 180, 41, 0.25);
    --error: #e85858;
    --error-bg: rgba(232, 88, 88, 0.08);
    --error-border: rgba(232, 88, 88, 0.25);
    --pending-color: #8892a0;
    --pending-bg: rgba(136, 146, 160, 0.08);
    --pending-border: rgba(136, 146, 160, 0.25);
    --working-color: #2980b9;
    --working-bg: rgba(41, 128, 185, 0.08);
    --working-border: rgba(41, 128, 185, 0.25);
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
    --radius: 8px;
    --radius-sm: 6px;
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

  /* ── Header ──────────────────────────── */
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    z-index: 100;
  }

  .header-logo {
    height: 22px;
    width: auto;
    opacity: 0.9;
  }

  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }

  .header-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-dim);
    transition: background 0.3s;
  }

  .status-dot.connected { background: var(--success); box-shadow: 0 0 6px rgba(72, 216, 137, 0.4); }
  .status-dot.offline { background: var(--error); box-shadow: 0 0 6px rgba(232, 88, 88, 0.4); }
  .status-dot.stale { background: var(--warning); box-shadow: 0 0 6px rgba(240, 180, 41, 0.4); }

  .refresh-timer {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-dim);
    min-width: 20px;
    text-align: right;
  }

  .btn-refresh {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-refresh:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Agent Strip ─────────────────────── */
  .agent-strip {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 8px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    overflow-x: auto;
    min-height: 44px;
  }

  .agent-strip-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    font-weight: 600;
    flex-shrink: 0;
    margin-right: 4px;
  }

  .agent-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .agent-chip .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .agent-chip.state-idle { background: var(--pending-bg); color: var(--pending-color); }
  .agent-chip.state-idle .chip-dot { background: var(--pending-color); }

  .agent-chip.state-running,
  .agent-chip.state-working,
  .agent-chip.state-spawning { background: var(--working-bg); color: var(--working-color); }
  .agent-chip.state-running .chip-dot,
  .agent-chip.state-working .chip-dot,
  .agent-chip.state-spawning .chip-dot { background: var(--working-color); }

  .agent-chip.state-done,
  .agent-chip.state-stopped { background: var(--success-bg); color: var(--success); }
  .agent-chip.state-done .chip-dot,
  .agent-chip.state-stopped .chip-dot { background: var(--success); }

  .agent-chip.state-stuck,
  .agent-chip.state-dead { background: var(--error-bg); color: var(--error); }
  .agent-chip.state-stuck .chip-dot,
  .agent-chip.state-dead .chip-dot { background: var(--error); }

  .agent-chip:hover { border-color: var(--border-light); }
  .agent-chip.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }

  .no-agents {
    font-size: 12px;
    color: var(--text-dim);
    font-style: italic;
  }

  /* ── Main Layout ─────────────────────── */
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ── Kanban Board ────────────────────── */
  .board {
    flex: 1;
    display: flex;
    gap: 12px;
    padding: 16px;
    overflow-x: auto;
    min-width: 0;
  }

  .column {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius) var(--radius) 0 0;
    border: 1px solid var(--border);
    border-bottom: none;
    background: var(--surface);
  }

  .column-header .col-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .column-header .col-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .column-header .col-count {
    margin-left: auto;
    font-size: 11px;
    font-family: var(--mono);
    background: var(--surface2);
    padding: 1px 7px;
    border-radius: 10px;
    color: var(--text-muted);
  }

  .col-pending .col-icon { background: var(--pending-color); }
  .col-pending .col-title { color: var(--pending-color); }

  .col-working .col-icon { background: var(--working-color); }
  .col-working .col-title { color: var(--working-color); }

  .col-completed .col-icon { background: var(--success); }
  .col-completed .col-title { color: var(--success); }

  .col-failed .col-icon { background: var(--error); }
  .col-failed .col-title { color: var(--error); }

  .column-body {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
    background: var(--surface);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .column-body::-webkit-scrollbar { width: 4px; }
  .column-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .column-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-dim);
    font-size: 12px;
    font-style: italic;
    opacity: 0.7;
  }

  .column-empty::before {
    display: block;
    font-size: 20px;
    margin-bottom: 6px;
    font-style: normal;
    opacity: 0.5;
  }

  .col-pending .column-empty::before   { content: "☁️"; }
  .col-working .column-empty::before   { content: "⏳"; }
  .col-completed .column-empty::before { content: "✨"; }
  .col-failed .column-empty::before    { content: "🛡️"; }

  /* ── Task Card ───────────────────────── */
  .task-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-left: 4px solid var(--pending-color);
    border-radius: var(--radius);
    padding: 14px 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .task-card:hover {
    border-color: var(--border-light);
    background: var(--surface3);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }

  .task-card.expanded {
    border-color: var(--accent);
    background: var(--surface3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  /* Status-specific left border + subtle background tint */
  .col-pending .task-card   { border-left-color: var(--pending-color); }
  .col-working .task-card   { border-left-color: var(--working-color); background: linear-gradient(135deg, rgba(41, 128, 185, 0.06) 0%, var(--surface2) 100%); }
  .col-completed .task-card { border-left-color: var(--success); background: linear-gradient(135deg, rgba(72, 216, 137, 0.05) 0%, var(--surface2) 100%); }
  .col-failed .task-card    { border-left-color: var(--error); background: linear-gradient(135deg, rgba(232, 88, 88, 0.05) 0%, var(--surface2) 100%); }

  .col-working .task-card:hover   { border-left-color: var(--accent-hover); }
  .col-completed .task-card:hover { border-left-color: #5ce8a0; }
  .col-failed .task-card:hover    { border-left-color: #ff6b6b; }

  .task-card .card-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .task-card .card-id {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-dim);
    flex-shrink: 0;
    margin-top: 2px;
    background: var(--surface);
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--border);
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .task-card .card-desc {
    font-size: 13px;
    color: var(--text);
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-weight: 450;
  }

  .task-card.expanded .card-desc {
    -webkit-line-clamp: unset;
    overflow: visible;
  }

  .task-card .card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .card-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 0.2px;
  }

  .badge-agent {
    background: var(--accent-dim);
    color: var(--accent);
    border: 1px solid rgba(41, 128, 185, 0.2);
  }

  .badge-group {
    background: rgba(161, 134, 255, 0.12);
    color: #a186ff;
    border: 1px solid rgba(161, 134, 255, 0.2);
  }

  .badge-ready {
    background: var(--success-bg);
    color: var(--success);
    border: 1px solid var(--success-border);
  }

  .card-time {
    font-size: 10px;
    color: var(--text-dim);
    margin-left: auto;
    font-family: var(--mono);
    letter-spacing: 0.2px;
  }

  /* Expanded card details */
  .card-details {
    display: none;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
  }

  .task-card.expanded .card-details { display: block; }

  .card-details .detail-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }

  .card-details .detail-label {
    color: var(--text-dim);
    min-width: 70px;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .card-details .detail-value {
    color: var(--text-muted);
    word-break: break-word;
  }

  /* ── Sidebar: Activity Feed ──────────── */
  .sidebar {
    width: 320px;
    border-left: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 0.2s;
  }

  .sidebar.collapsed {
    width: 40px;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sidebar-header .sidebar-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    flex: 1;
  }

  .sidebar.collapsed .sidebar-title,
  .sidebar.collapsed .sidebar-body,
  .sidebar.collapsed .group-section { display: none; }

  .btn-collapse {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 14px;
    padding: 2px;
    transition: color 0.15s;
  }
  .btn-collapse:hover { color: var(--text); }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar-body::-webkit-scrollbar { width: 4px; }
  .sidebar-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .message-item {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    border: 1px solid transparent;
    transition: background 0.15s;
  }

  .message-item:hover { background: var(--surface2); }

  .message-item .msg-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
  }

  .message-item .msg-from {
    font-weight: 600;
    color: var(--accent);
    font-size: 11px;
  }

  .message-item .msg-arrow {
    color: var(--text-dim);
    font-size: 10px;
  }

  .message-item .msg-to {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 11px;
  }

  .message-item .msg-time {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-dim);
    font-family: var(--mono);
  }

  .message-item .msg-body {
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .message-item .msg-type {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px;
    border-radius: 3px;
    font-weight: 600;
  }

  .msg-type.type-status { background: var(--accent-dim); color: var(--accent); }
  .msg-type.type-error { background: var(--error-bg); color: var(--error); }
  .msg-type.type-result { background: var(--success-bg); color: var(--success); }
  .msg-type.type-dispatch { background: rgba(161, 134, 255, 0.12); color: #a186ff; }

  .no-messages {
    text-align: center;
    padding: 20px;
    color: var(--text-dim);
    font-size: 12px;
    font-style: italic;
  }

  /* ── Group Section ───────────────────── */
  .group-section {
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    max-height: 180px;
    overflow-y: auto;
  }

  .group-section-header {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    padding: 10px 14px 6px;
  }

  .group-card {
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
  }

  .group-card:last-child { border-bottom: none; }

  .group-card .group-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
  }

  .group-card .group-bar-wrap {
    height: 4px;
    background: var(--surface2);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .group-card .group-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  .group-card .group-stats {
    font-size: 10px;
    color: var(--text-dim);
    display: flex;
    justify-content: space-between;
  }

  /* ── Offline Overlay ─────────────────── */
  .offline-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(26, 29, 35, 0.85);
    z-index: 200;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    gap: 16px;
  }

  .offline-overlay.visible {
    display: flex;
  }

  .offline-icon {
    font-size: 48px;
    opacity: 0.5;
  }

  .offline-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text);
  }

  .offline-desc {
    font-size: 14px;
    color: var(--text-muted);
    text-align: center;
    max-width: 400px;
  }

  /* ── Local Mode Banner ───────────────── */
  .local-mode-banner {
    display: none;
    background: rgba(240, 180, 41, 0.1);
    border-bottom: 1px solid rgba(240, 180, 41, 0.3);
    padding: 8px 20px;
    font-size: 13px;
    color: var(--warning);
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    font-family: var(--mono);
    letter-spacing: 0.3px;
    transition: opacity 0.3s ease;
  }

  .local-mode-banner.visible { display: flex; }

  .local-mode-banner .local-icon { font-size: 14px; }

  .local-mode-banner .local-title-name {
    color: var(--text);
    font-weight: 600;
    margin-left: 4px;
  }

  .local-mode-banner .local-hint {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-dim);
  }

  /* ── Filter Active Indicator ─────────── */
  .filter-bar {
    display: none;
    background: var(--accent-dim);
    border-bottom: 1px solid var(--accent);
    padding: 6px 20px;
    font-size: 12px;
    color: var(--accent);
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .filter-bar.visible { display: flex; }

  .filter-bar .filter-clear {
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 11px;
    cursor: pointer;
    margin-left: auto;
  }
  .filter-bar .filter-clear:hover { background: var(--accent); color: white; }

  /* ── Pulse animation for working ─────── */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .pulse { animation: pulse 2s ease-in-out infinite; }

  /* ── Fade-in for new items ───────────── */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .fade-in { animation: fadeIn 0.3s cubic-bezier(0.22, 1, 0.36, 1); }

</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <img class="header-logo" src="/logo.png" alt="Pi" onerror="this.style.display='none'">
  <div class="header-title">${title}</div>
  <div class="header-status">
    <div class="status-dot" id="statusDot"></div>
    <span id="statusText">Connecting…</span>
  </div>
  <span class="refresh-timer" id="refreshTimer">3</span>
  <button class="btn-refresh" onclick="fetchNow()" title="Refresh (R)">↻ Refresh</button>
</div>

<!-- Filter Bar -->
<div class="filter-bar" id="filterBar">
  <span>🔍 Filtering by agent: <strong id="filterAgent"></strong></span>
  <button class="filter-clear" onclick="clearFilter()">Clear (Esc)</button>
</div>

<!-- Agent Strip -->
<div class="agent-strip" id="agentStrip">
  <span class="agent-strip-label">Agents</span>
  <span class="no-agents" id="noAgents">No agents registered</span>
</div>

<!-- Main Area -->
<div class="main">
  <!-- Kanban Board -->
  <div class="board" id="board">
    <!-- Pending Column -->
    <div class="column col-pending">
      <div class="column-header col-pending">
        <div class="col-icon"></div>
        <span class="col-title">Pending</span>
        <span class="col-count" id="countPending">0</span>
      </div>
      <div class="column-body" id="colPending">
        <div class="column-empty">No pending tasks</div>
      </div>
    </div>

    <!-- Working Column -->
    <div class="column col-working">
      <div class="column-header col-working">
        <div class="col-icon pulse"></div>
        <span class="col-title">Working</span>
        <span class="col-count" id="countWorking">0</span>
      </div>
      <div class="column-body" id="colWorking">
        <div class="column-empty">No tasks in progress</div>
      </div>
    </div>

    <!-- Completed Column -->
    <div class="column col-completed">
      <div class="column-header col-completed">
        <div class="col-icon"></div>
        <span class="col-title">Completed</span>
        <span class="col-count" id="countCompleted">0</span>
      </div>
      <div class="column-body" id="colCompleted">
        <div class="column-empty">No completed tasks</div>
      </div>
    </div>

    <!-- Failed Column -->
    <div class="column col-failed">
      <div class="column-header col-failed">
        <div class="col-icon"></div>
        <span class="col-title">Failed</span>
        <span class="col-count" id="countFailed">0</span>
      </div>
      <div class="column-body" id="colFailed">
        <div class="column-empty">No failed tasks</div>
      </div>
    </div>
  </div>

  <!-- Sidebar -->
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Activity</span>
      <button class="btn-collapse" onclick="toggleSidebar()" title="Toggle sidebar">◀</button>
    </div>
    <div class="sidebar-body" id="messageList">
      <div class="no-messages">No messages yet</div>
    </div>
    <div class="group-section" id="groupSection">
      <div class="group-section-header">Groups</div>
    </div>
  </div>
</div>

<!-- Local Mode Banner -->
<div class="local-mode-banner" id="localModeBanner">
  <span class="local-icon">⚡</span>
  <span>Local Mode</span>
  <span id="localTitleLabel" class="local-title-name"></span>
  <span class="local-hint">Commander offline — showing local tasks</span>
</div>

<!-- Offline Overlay (only shown when no local tasks) -->
<div class="offline-overlay" id="offlineOverlay">
  <div class="offline-icon">⚡</div>
  <div class="offline-title">Commander Offline</div>
  <div class="offline-desc">
    The Commander service is not running or not reachable.<br>
    No local tasks found. Use <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:12px">tasks add</code> to get started.<br>
    The board will reconnect automatically when Commander comes back online.
  </div>
</div>

<script>
(function() {
  'use strict';

  const API = 'http://127.0.0.1:${port}';
  const POLL_INTERVAL = 3; // seconds
  let countdown = POLL_INTERVAL;
  let pollTimer = null;
  let selectedAgent = null;
  let lastData = null;
  let expandedCards = new Set();
  let sidebarCollapsed = false;

  // ── DOM refs ─────────────────────────
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const refreshTimer = document.getElementById('refreshTimer');
  const agentStrip = document.getElementById('agentStrip');
  const noAgents = document.getElementById('noAgents');
  const filterBar = document.getElementById('filterBar');
  const filterAgent = document.getElementById('filterAgent');
  const offlineOverlay = document.getElementById('offlineOverlay');
  const localModeBanner = document.getElementById('localModeBanner');
  const localTitleLabel = document.getElementById('localTitleLabel');
  const sidebar = document.getElementById('sidebar');
  const messageList = document.getElementById('messageList');
  const groupSection = document.getElementById('groupSection');

  const columns = {
    pending:   { body: document.getElementById('colPending'),   count: document.getElementById('countPending') },
    working:   { body: document.getElementById('colWorking'),   count: document.getElementById('countWorking') },
    completed: { body: document.getElementById('colCompleted'), count: document.getElementById('countCompleted') },
    failed:    { body: document.getElementById('colFailed'),    count: document.getElementById('countFailed') },
  };

  // ── Data Fetching ────────────────────
  async function fetchData() {
    try {
      const res = await fetch(API + '/api/board-data');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      lastData = data;
      renderBoard(data);
      setStatus(data.connected ? 'connected' : (data.localMode ? 'local' : 'offline'));
    } catch (err) {
      setStatus('offline');
      console.error('Fetch error:', err);
    }
  }

  function fetchNow() {
    countdown = POLL_INTERVAL;
    refreshTimer.textContent = countdown;
    fetchData();
  }

  // ── Status ───────────────────────────
  function setStatus(state) {
    statusDot.className = 'status-dot ' + (state === 'local' ? 'offline' : state);
    if (state === 'connected') {
      statusText.textContent = 'Connected';
      offlineOverlay.classList.remove('visible');
      localModeBanner.classList.remove('visible');
      // Restore Commander-only sections
      agentStrip.style.display = '';
      sidebar.style.display = '';
    } else if (state === 'local') {
      statusText.textContent = 'Local Mode';
      offlineOverlay.classList.remove('visible');
      localModeBanner.classList.add('visible');
      // Update local title
      if (lastData && lastData.localTitle) {
        localTitleLabel.textContent = '— ' + lastData.localTitle;
      } else {
        localTitleLabel.textContent = '';
      }
      // Hide Commander-only sections (no data in local mode)
      agentStrip.style.display = 'none';
      sidebar.style.display = 'none';
    } else if (state === 'offline') {
      statusText.textContent = 'Offline';
      offlineOverlay.classList.add('visible');
      localModeBanner.classList.remove('visible');
    } else {
      statusText.textContent = 'Stale';
      offlineOverlay.classList.remove('visible');
      localModeBanner.classList.remove('visible');
    }
  }

  // ── Render Board ─────────────────────
  function renderBoard(data) {
    renderAgents(data.agents || []);
    renderTasks(data.tasks || [], data.readyTasks || []);
    renderMessages(data.messages || []);
    renderGroups(data.groups || []);
  }

  // ── Render Agents ────────────────────
  function renderAgents(agents) {
    // Remove old chips (keep label)
    const label = agentStrip.querySelector('.agent-strip-label');
    agentStrip.innerHTML = '';
    agentStrip.appendChild(label);

    if (agents.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'no-agents';
      empty.textContent = 'No agents registered';
      agentStrip.appendChild(empty);
      return;
    }

    // Sort: active states first
    const stateOrder = { working: 0, running: 1, spawning: 2, idle: 3, done: 4, stopped: 5, stuck: 6, dead: 7 };
    agents.sort((a, b) => (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9));

    for (const agent of agents) {
      const chip = document.createElement('div');
      const state = (agent.state || 'idle').toLowerCase();
      chip.className = 'agent-chip state-' + state + (selectedAgent === agent.name ? ' selected' : '');
      chip.innerHTML = '<span class="chip-dot"></span>' +
        escapeHtml(agent.name || 'unnamed') +
        (agent.role ? ' <span style="opacity:0.6;font-size:10px">(' + escapeHtml(agent.role) + ')</span>' : '');
      chip.onclick = () => toggleAgentFilter(agent.name);
      chip.title = 'State: ' + state + (agent.agent_type ? ' | Type: ' + agent.agent_type : '');
      agentStrip.appendChild(chip);
    }
  }

  // ── Render Tasks ─────────────────────
  function renderTasks(tasks, readyTaskIds) {
    const readySet = new Set(readyTaskIds.map(t => typeof t === 'object' ? t.task_id : t));

    // Bucket tasks by status
    const buckets = { pending: [], working: [], completed: [], failed: [] };
    for (const task of tasks) {
      const status = (task.status || 'pending').toLowerCase();
      // Map 'backlog' to pending
      const bucket = status === 'backlog' ? 'pending' : (buckets[status] ? status : 'pending');

      // Apply agent filter
      if (selectedAgent && task.agent_name !== selectedAgent && task.claimed_by !== selectedAgent) {
        continue;
      }

      buckets[bucket].push(task);
    }

    // Sort: most recent first within each bucket
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => {
        const tA = a.updated_at || a.created_at || '';
        const tB = b.updated_at || b.created_at || '';
        return tB.localeCompare(tA);
      });
    }

    // Render each column
    for (const [status, col] of Object.entries(columns)) {
      const items = buckets[status] || [];
      col.count.textContent = items.length;

      if (items.length === 0) {
        col.body.innerHTML = '<div class="column-empty">No ' + status + ' tasks</div>';
        continue;
      }

      // Limit display to 50 per column
      const visible = items.slice(0, 50);
      col.body.innerHTML = '';

      for (const task of visible) {
        const card = document.createElement('div');
        const isExpanded = expandedCards.has(task.task_id);
        card.className = 'task-card' + (isExpanded ? ' expanded' : '');
        card.onclick = (e) => {
          if (e.target.closest('button')) return;
          toggleCard(task.task_id, card);
        };

        const isReady = readySet.has(task.task_id);
        const agentName = task.agent_name || task.claimed_by || '';
        const groupName = task.group_name || '';
        const timeStr = formatTime(task.updated_at || task.created_at);

        let metaHtml = '';
        if (agentName) metaHtml += '<span class="card-badge badge-agent">' + escapeHtml(agentName) + '</span>';
        if (groupName) metaHtml += '<span class="card-badge badge-group">' + escapeHtml(groupName) + '</span>';
        if (isReady) metaHtml += '<span class="card-badge badge-ready">Ready</span>';
        metaHtml += '<span class="card-time">' + timeStr + '</span>';

        let detailsHtml = '';
        if (task.working_directory) detailsHtml += '<div class="detail-row"><span class="detail-label">Directory</span><span class="detail-value">' + escapeHtml(task.working_directory) + '</span></div>';
        if (task.result) detailsHtml += '<div class="detail-row"><span class="detail-label">Result</span><span class="detail-value">' + escapeHtml(task.result) + '</span></div>';
        if (task.error_message) detailsHtml += '<div class="detail-row"><span class="detail-label">Error</span><span class="detail-value" style="color:var(--error)">' + escapeHtml(task.error_message) + '</span></div>';
        if (task.group_id) detailsHtml += '<div class="detail-row"><span class="detail-label">Group ID</span><span class="detail-value">#' + task.group_id + '</span></div>';

        card.innerHTML =
          '<div class="card-top">' +
            '<span class="card-id">#' + (task.task_id || '?') + '</span>' +
            '<span class="card-desc">' + escapeHtml(task.description || 'Untitled task') + '</span>' +
          '</div>' +
          '<div class="card-meta">' + metaHtml + '</div>' +
          '<div class="card-details">' + (detailsHtml || '<span style="color:var(--text-dim)">No additional details</span>') + '</div>';

        col.body.appendChild(card);
      }

      if (items.length > 50) {
        const more = document.createElement('div');
        more.className = 'column-empty';
        more.textContent = '+ ' + (items.length - 50) + ' more tasks';
        col.body.appendChild(more);
      }
    }
  }

  // ── Render Messages ──────────────────
  function renderMessages(messages) {
    if (messages.length === 0) {
      messageList.innerHTML = '<div class="no-messages">No messages yet</div>';
      return;
    }

    // Sort by most recent first, limit to 30
    const sorted = [...messages].sort((a, b) => {
      const tA = a.created_at || '';
      const tB = b.created_at || '';
      return tB.localeCompare(tA);
    }).slice(0, 30);

    messageList.innerHTML = '';
    for (const msg of sorted) {
      const item = document.createElement('div');
      item.className = 'message-item';

      const typeClass = 'type-' + (msg.message_type || 'status');
      const typeLabel = (msg.message_type || 'status').toUpperCase();

      item.innerHTML =
        '<div class="msg-header">' +
          '<span class="msg-from">' + escapeHtml(msg.from_agent || '?') + '</span>' +
          '<span class="msg-arrow">→</span>' +
          '<span class="msg-to">' + escapeHtml(msg.to_agent || '?') + '</span>' +
          '<span class="msg-type ' + typeClass + '">' + typeLabel + '</span>' +
          '<span class="msg-time">' + formatTime(msg.created_at) + '</span>' +
        '</div>' +
        '<div class="msg-body">' + escapeHtml(msg.body || '') + '</div>';

      messageList.appendChild(item);
    }
  }

  // ── Render Groups ────────────────────
  function renderGroups(groups) {
    if (groups.length === 0) {
      groupSection.style.display = 'none';
      return;
    }

    groupSection.style.display = '';
    groupSection.innerHTML = '<div class="group-section-header">Groups</div>';

    // Sort by most recently updated
    const sorted = [...groups].sort((a, b) => {
      const tA = a.updated_at || a.created_at || '';
      const tB = b.updated_at || b.created_at || '';
      return tB.localeCompare(tA);
    }).slice(0, 10);

    for (const group of sorted) {
      const card = document.createElement('div');
      card.className = 'group-card';

      const total = group.total_tasks || group.task_count || 0;
      const completed = group.completed_tasks || 0;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      card.innerHTML =
        '<div class="group-name">' + escapeHtml(group.group_name || group.name || 'Unnamed') + '</div>' +
        '<div class="group-bar-wrap"><div class="group-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="group-stats">' +
          '<span>' + completed + '/' + total + ' tasks</span>' +
          '<span>' + pct + '%</span>' +
        '</div>';

      groupSection.appendChild(card);
    }
  }

  // ── Interactions ─────────────────────
  function toggleCard(taskId, el) {
    if (expandedCards.has(taskId)) {
      expandedCards.delete(taskId);
      el.classList.remove('expanded');
    } else {
      expandedCards.add(taskId);
      el.classList.add('expanded');
    }
  }

  function toggleAgentFilter(name) {
    if (selectedAgent === name) {
      clearFilter();
    } else {
      selectedAgent = name;
      filterAgent.textContent = name;
      filterBar.classList.add('visible');
      // Re-render with filter
      if (lastData) renderTasks(lastData.tasks || [], lastData.readyTasks || []);
      // Update chip selection
      document.querySelectorAll('.agent-chip').forEach(chip => {
        chip.classList.toggle('selected', chip.textContent.includes(name));
      });
    }
  }

  window.clearFilter = function() {
    selectedAgent = null;
    filterBar.classList.remove('visible');
    document.querySelectorAll('.agent-chip').forEach(c => c.classList.remove('selected'));
    if (lastData) renderTasks(lastData.tasks || [], lastData.readyTasks || []);
  };

  window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    sidebar.querySelector('.btn-collapse').textContent = sidebarCollapsed ? '▶' : '◀';
  };

  window.fetchNow = fetchNow;

  // ── Keyboard Shortcuts ───────────────
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); fetchNow(); }
    if (e.key === 'Escape') { clearFilter(); }
  });

  // ── Helpers ──────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now - d;
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return diffSec + 's ago';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return diffMin + 'm ago';
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return diffHr + 'h ago';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  // ── Polling Loop ─────────────────────
  function startPolling() {
    fetchData(); // initial fetch

    pollTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        countdown = POLL_INTERVAL;
        fetchData();
      }
      refreshTimer.textContent = countdown;
    }, 1000);
  }

  // ── Init ─────────────────────────────
  startPolling();

})();
</script>
</body>
</html>`;
}
