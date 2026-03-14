// ABOUTME: Self-contained HTML template for the Spec Viewer GUI window.
// ABOUTME: Multi-page wizard with step navigation, inline comments, markdown editing, visuals gallery, approve/request-changes.

export interface SpecDocument {
	/** Unique key (e.g. "spec", "requirements", "tasks", "visuals") */
	key: string;
	/** Display label for the step bar */
	label: string;
	/** The markdown content (empty string for visuals-only steps) */
	markdown: string;
	/** Relative file path within the spec folder */
	filePath: string;
	/** Whether this is the visuals step (renders images instead of markdown) */
	isVisuals?: boolean;
	/** List of visual asset relative paths (for visuals step) */
	visualFiles?: string[];
}

/**
 * Generate the full HTML page for the spec viewer window.
 * Self-contained page with all CSS/JS inlined.
 */
export function generateSpecViewerHTML(opts: {
	documents: SpecDocument[];
	title: string;
	port: number;
	existingComments?: string; // JSON string of existing comments
}): string {
	const { documents, title, port, existingComments } = opts;
	// Escape </ sequences to prevent </script> in content from breaking the script block
	const escapedDocs = JSON.stringify(documents).replace(/<\//g, '<\\/');
	const escapedTitle = JSON.stringify(title).replace(/<\//g, '<\\/');
	const escapedComments = existingComments ? existingComments.replace(/<\//g, '<\\/') : "[]";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Spec Viewer</title>
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
    --comment-accent: var(--accent);
    --comment-dim: var(--accent-dim);
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
  .header .comment-count {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--comment-accent);
    display: none;
  }
  .header .comment-count.has-comments { display: inline; }
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

  /* ── Step Navigation Bar ─────────────── */
  .step-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 8px 16px 0;
    padding: 6px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    flex-shrink: 0;
    overflow-x: auto;
  }
  .step-bar.single-doc { display: none; }
  .step-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-family: var(--mono);
    font-weight: 500;
    color: var(--text-dim);
    transition: all 0.15s;
    white-space: nowrap;
    border: 1px solid transparent;
    position: relative;
  }
  .step-item:hover { color: var(--text-muted); background: var(--surface2); }
  .step-item.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-color: var(--accent);
  }
  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    border: 1.5px solid var(--text-dim);
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .step-item.active .step-num {
    border-color: var(--accent);
    color: var(--accent);
  }
  .step-connector {
    width: 16px;
    height: 1px;
    background: var(--border);
    flex-shrink: 0;
  }
  .step-comment-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--comment-accent);
    display: none;
    position: absolute;
    top: 4px;
    right: 4px;
  }
  .step-item.has-comments .step-comment-dot { display: block; }

  /* ── View Toggle ─────────────────────── */
  .toggle-bar {
    display: flex;
    justify-content: flex-end;
    padding: 6px 16px 0;
    flex-shrink: 0;
  }
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

  /* ── Content Area ────────────────────── */
  .content-wrapper {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
  .content {
    flex: 1;
    padding: 12px 24px 100px;
    overflow-y: auto;
    min-height: 0;
  }
  .comment-sidebar {
    width: 280px;
    flex-shrink: 0;
    padding: 12px 12px 100px 0;
    overflow-y: auto;
    display: none;
  }
  .comment-sidebar.visible { display: block; }

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

  /* ── Commentable sections ────────────── */
  .commentable {
    position: relative;
    border-left: 2px solid transparent;
    padding-left: 12px;
    margin-left: -14px;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
    border-radius: 0 4px 4px 0;
  }
  .commentable:hover {
    border-left-color: var(--comment-accent);
    background: var(--comment-dim);
  }
  .commentable.has-comment {
    border-left-color: var(--comment-accent);
  }
  .commentable .comment-badge {
    position: absolute;
    top: 2px;
    right: -8px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--comment-accent);
    color: var(--bg);
    font-size: 10px;
    font-weight: 700;
    display: none;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
  }
  .commentable.has-comment .comment-badge { display: flex; }

  /* ── Comment Cards (sidebar) ─────────── */
  .comment-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--comment-accent);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
    font-size: 13px;
    position: relative;
    animation: slideIn 0.2s ease;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .comment-card .comment-section-ref {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--comment-accent);
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .comment-card .comment-text {
    color: var(--text-muted);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .comment-card .comment-time {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--text-dim);
    margin-top: 6px;
  }
  .comment-card .comment-delete {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.15s;
  }
  .comment-card:hover .comment-delete { opacity: 1; }
  .comment-card .comment-delete:hover { color: var(--error); background: rgba(232, 88, 88, 0.1); }

  /* ── Comment Input (inline popup) ────── */
  .comment-input-popup {
    position: fixed;
    z-index: 150;
    background: var(--surface);
    border: 1px solid var(--comment-accent);
    border-radius: 6px;
    padding: 12px;
    width: 320px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    display: none;
    animation: popIn 0.15s ease;
  }
  @keyframes popIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .comment-input-popup textarea {
    width: 100%;
    min-height: 60px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    padding: 8px;
    outline: none;
    resize: vertical;
  }
  .comment-input-popup textarea:focus { border-color: var(--comment-accent); }
  .comment-input-popup .comment-input-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
  }

  /* ── Visuals Gallery ─────────────────── */
  .visuals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    padding: 12px 0;
  }
  .visual-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .visual-card:hover { border-color: var(--accent); }
  .visual-card img {
    width: 100%;
    height: auto;
    display: block;
    background: var(--surface2);
  }
  .visual-card iframe {
    width: 100%;
    height: 300px;
    border: none;
    background: #fff;
  }
  .visual-card .visual-caption {
    padding: 8px 12px;
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-dim);
  }

  /* ── Lightbox ────────────────────────── */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0,0,0,0.85);
    display: none;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
  }
  .lightbox.active { display: flex; }
  .lightbox img {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }
  .lightbox-close {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 36px;
    height: 36px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Raw Markdown View ───────────────── */
  .raw-view {
    display: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px;
    flex: 1;
    min-height: 300px;
  }
  .raw-view.active {
    display: flex;
    flex-direction: column;
  }
  .raw-view textarea {
    width: 100%;
    flex: 1;
    min-height: 300px;
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
  .btn-warning {
    background: transparent;
    color: var(--warning);
    border-color: var(--warning);
    font-weight: 600;
  }
  .btn-warning:hover { background: var(--warning-bg); }
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
    bottom: 70px;
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
  body.approved-state .footer-wrapper { display: none; }
  body.approved-state .toggle-bar { display: none; }
  body.approved-state .header .modified-badge { display: none !important; }
  body.approved-state .header .comment-count { display: none !important; }
  body.approved-state .comment-sidebar { display: none !important; }
  body.approved-state .comment-input-popup { display: none !important; }
  body.approved-state .commentable { cursor: default; pointer-events: none; }
  body.approved-state .commentable:hover { border-left-color: transparent; background: transparent; }
  body.approved-state .commentable.has-comment:hover { border-left-color: var(--comment-accent); }
  body.approved-state .commentable .comment-badge { display: none !important; }
  body.approved-state .content { padding-bottom: 24px; }
  body.approved-state .step-item { cursor: pointer; }

  /* ── Responsive ──────────────────────── */
  @media (max-width: 700px) {
    .content { padding: 12px 12px 100px; }
    .header { padding: 10px 12px; margin: 8px 8px 0; }
    .step-bar { margin: 6px 8px 0; }
    .comment-sidebar { display: none !important; }
    .footer { padding: 10px 12px; }
    .step-bar { overflow-x: auto; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span class="badge">SPEC</span>
  <span class="title" id="titleText">${title}</span>
  <span class="comment-count" id="commentCount"></span>
  <span class="modified-badge" id="modifiedBadge">modified</span>
  <img src="/logo.png" alt="agent" class="header-logo">
</div>

<!-- Step Navigation Bar -->
<div class="step-bar" id="stepBar"></div>

<!-- View Toggle -->
<div class="toggle-bar" id="toggleBar">
  <div class="view-toggle">
    <button class="active" id="btnRendered" onclick="setView('rendered')">Rendered</button>
    <button id="btnRaw" onclick="setView('raw')">Markdown</button>
  </div>
</div>

<!-- Content Area -->
<div class="content-wrapper">
  <div class="content" id="contentArea">
    <div id="renderedView" class="markdown-body"></div>
    <div id="visualsView" style="display:none;"></div>
    <div id="rawView" class="raw-view">
      <textarea id="rawEditor" spellcheck="false"></textarea>
    </div>
  </div>
  <div class="comment-sidebar" id="commentSidebar"></div>
</div>

<!-- Comment Input Popup -->
<div class="comment-input-popup" id="commentPopup">
  <textarea id="commentInput" placeholder="Add a comment..." rows="3"></textarea>
  <div class="comment-input-actions">
    <button class="btn btn-ghost" onclick="closeCommentPopup()">Cancel</button>
    <button class="btn btn-primary" onclick="submitComment()" style="padding:5px 14px;font-size:12px;">Add Comment</button>
  </div>
</div>

<!-- Lightbox -->
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <button class="lightbox-close" onclick="closeLightbox()">✕</button>
  <img id="lightboxImg" src="" alt="">
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <button class="btn btn-ghost" onclick="copyToClipboard()" title="Copy current document markdown">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>Copy
    </button>
    <button class="btn btn-ghost" onclick="downloadStandalone()" title="Download standalone read-only spec HTML">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;">
        <path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>
      </svg>Standalone
    </button>
    <button class="btn btn-ghost" onclick="toggleComments()" title="Toggle comment sidebar" id="btnToggleComments">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>Comments
    </button>
    <div class="spacer"></div>
    <button class="btn" onclick="decline()" id="btnDecline">Close</button>
    <button class="btn btn-warning" onclick="requestChanges()" id="btnChanges">Request Changes</button>
    <button class="btn btn-success" onclick="approve()" id="btnApprove">Approve Spec</button>
  </div>
</div>

<!-- marked.js CDN -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>

<script>
(function() {
  // ── State ─────────────────────────────────────
  const PORT = ${port};
  const documents = ${escapedDocs};
  let comments = ${escapedComments};
  let currentStep = 0;
  let currentView = 'rendered';
  let modified = {};        // docKey -> bool
  let docMarkdown = {};     // docKey -> current markdown
  let originalMarkdown = {}; // docKey -> original markdown
  let scrollPositions = {};  // docKey -> scrollTop
  let commentPopupTarget = null; // { docKey, sectionId, sectionText, rect }

  // Init markdown state
  documents.forEach(function(doc) {
    docMarkdown[doc.key] = doc.markdown;
    originalMarkdown[doc.key] = doc.markdown;
    modified[doc.key] = false;
  });

  // ── Marked config ─────────────────────────────
  if (typeof marked !== 'undefined') {
    marked.setOptions({ gfm: true, breaks: true });
  }

  // ── Step Bar ──────────────────────────────────
  function renderStepBar() {
    const bar = document.getElementById('stepBar');
    if (documents.length <= 1) {
      bar.classList.add('single-doc');
      return;
    }
    let html = '';
    documents.forEach(function(doc, idx) {
      if (idx > 0) html += '<div class="step-connector"></div>';
      const active = idx === currentStep ? ' active' : '';
      const hasComments = getCommentsForDoc(doc.key).length > 0 ? ' has-comments' : '';
      html += '<div class="step-item' + active + hasComments + '" onclick="goToStep(' + idx + ')">' +
        '<span class="step-num">' + (idx + 1) + '</span>' +
        doc.label +
        '<div class="step-comment-dot"></div>' +
        '</div>';
    });
    bar.innerHTML = html;
  }

  window.goToStep = function(idx) {
    if (idx < 0 || idx >= documents.length) return;
    // Save scroll position
    scrollPositions[documents[currentStep].key] = document.getElementById('contentArea').scrollTop;
    // Sync raw editor if needed
    if (currentView === 'raw') {
      var doc = documents[currentStep];
      if (!doc.isVisuals) {
        docMarkdown[doc.key] = document.getElementById('rawEditor').value;
        updateModifiedState(doc.key);
      }
    }
    currentStep = idx;
    render();
    // Restore scroll position
    var savedScroll = scrollPositions[documents[currentStep].key] || 0;
    setTimeout(function() {
      document.getElementById('contentArea').scrollTop = savedScroll;
    }, 0);
  };

  // ── Render ────────────────────────────────────
  function render() {
    var doc = documents[currentStep];
    renderStepBar();
    renderCommentSidebar();
    updateCommentCount();

    // Toggle bar visibility
    var toggleBar = document.getElementById('toggleBar');
    if (doc.isVisuals) {
      toggleBar.style.display = 'none';
    } else {
      toggleBar.style.display = 'flex';
    }

    if (currentView === 'raw' && !doc.isVisuals) {
      renderRawView(doc);
    } else {
      currentView = 'rendered';
      document.getElementById('btnRendered').classList.add('active');
      document.getElementById('btnRaw').classList.remove('active');
      if (doc.isVisuals) {
        renderVisuals(doc);
      } else {
        renderMarkdown(doc);
      }
    }

    updateGlobalModifiedState();
  }

  function renderMarkdown(doc) {
    var renderedView = document.getElementById('renderedView');
    var visualsView = document.getElementById('visualsView');
    var rawView = document.getElementById('rawView');

    renderedView.style.display = 'block';
    visualsView.style.display = 'none';
    rawView.classList.remove('active');

    var md = docMarkdown[doc.key] || '';
    // Pre-process: escape "N." in checkbox items to prevent nested ordered lists
    md = md.replace(/^(\\s*- \\[[ xX]\\] )(\\d+)\\./gm, '$1$2\\\\.');
    var html = marked.parse(md);
    renderedView.innerHTML = html;

    // Make sections commentable
    makeCommentable(renderedView, doc.key);
  }

  function renderVisuals(doc) {
    var renderedView = document.getElementById('renderedView');
    var visualsView = document.getElementById('visualsView');
    var rawView = document.getElementById('rawView');

    renderedView.style.display = 'none';
    visualsView.style.display = 'block';
    rawView.classList.remove('active');

    var files = doc.visualFiles || [];
    if (files.length === 0) {
      visualsView.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">' +
        '<p style="font-size:16px;">No visual assets found</p>' +
        '<p style="font-size:13px;margin-top:8px;">Drop images or HTML files into planning/visuals/</p></div>';
      return;
    }

    var html = '<div class="visuals-grid">';
    files.forEach(function(filePath) {
      var ext = filePath.split('.').pop().toLowerCase();
      var name = filePath.split('/').pop();
      var url = 'http://127.0.0.1:' + PORT + '/file?path=' + encodeURIComponent(filePath);

      if (ext === 'html' || ext === 'htm') {
        html += '<div class="visual-card">' +
          '<iframe src="' + url + '" sandbox="allow-scripts"></iframe>' +
          '<div class="visual-caption">' + escapeHtml(name) + '</div></div>';
      } else {
        html += '<div class="visual-card" onclick="openLightbox(\\'' + url + '\\')">' +
          '<img src="' + url + '" alt="' + escapeHtml(name) + '" loading="lazy">' +
          '<div class="visual-caption">' + escapeHtml(name) + '</div></div>';
      }
    });
    html += '</div>';
    visualsView.innerHTML = html;
  }

  function renderRawView(doc) {
    var renderedView = document.getElementById('renderedView');
    var visualsView = document.getElementById('visualsView');
    var rawView = document.getElementById('rawView');

    renderedView.style.display = 'none';
    visualsView.style.display = 'none';
    rawView.classList.add('active');

    document.getElementById('rawEditor').value = docMarkdown[doc.key] || '';
  }

  // ── Commentable Sections ──────────────────────
  function makeCommentable(container, docKey) {
    var elements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, table');
    elements.forEach(function(el, idx) {
      var sectionId = docKey + '-s' + idx;
      el.dataset.sectionId = sectionId;
      el.dataset.docKey = docKey;

      // Wrap in commentable div
      var wrapper = document.createElement('div');
      wrapper.className = 'commentable';
      wrapper.dataset.sectionId = sectionId;

      var commentCount = getCommentsForSection(docKey, sectionId).length;
      if (commentCount > 0) {
        wrapper.classList.add('has-comment');
      }

      // Add comment badge
      var badge = document.createElement('span');
      badge.className = 'comment-badge';
      badge.textContent = commentCount > 0 ? commentCount : '';
      wrapper.appendChild(badge);

      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);

      wrapper.addEventListener('click', function(e) {
        if (e.target.tagName === 'A') return; // Don't intercept link clicks
        var rect = wrapper.getBoundingClientRect();
        openCommentPopup(docKey, sectionId, el.textContent.substring(0, 80), rect);
      });
    });
  }

  // ── Comment System ────────────────────────────
  function getCommentsForDoc(docKey) {
    return comments.filter(function(c) { return c.document === docKey; });
  }

  function getCommentsForSection(docKey, sectionId) {
    return comments.filter(function(c) { return c.document === docKey && c.sectionId === sectionId; });
  }

  function openCommentPopup(docKey, sectionId, sectionText, rect) {
    commentPopupTarget = { docKey: docKey, sectionId: sectionId, sectionText: sectionText };
    var popup = document.getElementById('commentPopup');
    var input = document.getElementById('commentInput');

    // Position near the clicked element
    var top = Math.min(rect.bottom + 4, window.innerHeight - 160);
    var left = Math.min(rect.right - 160, window.innerWidth - 340);
    popup.style.top = top + 'px';
    popup.style.left = Math.max(20, left) + 'px';
    popup.style.display = 'block';

    input.value = '';
    input.focus();
  }

  window.closeCommentPopup = function() {
    document.getElementById('commentPopup').style.display = 'none';
    commentPopupTarget = null;
  };

  window.submitComment = function() {
    var input = document.getElementById('commentInput');
    var text = input.value.trim();
    if (!text || !commentPopupTarget) return;

    var comment = {
      id: 'c' + Date.now() + Math.random().toString(36).substr(2, 4),
      document: commentPopupTarget.docKey,
      sectionId: commentPopupTarget.sectionId,
      sectionText: commentPopupTarget.sectionText,
      text: text,
      timestamp: new Date().toISOString()
    };
    comments.push(comment);
    closeCommentPopup();
    render();
    saveComments();
    showToast('Comment added');
  };

  window.deleteComment = function(commentId) {
    comments = comments.filter(function(c) { return c.id !== commentId; });
    render();
    saveComments();
    showToast('Comment removed');
  };

  function saveComments() {
    fetch('http://127.0.0.1:' + PORT + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments: comments })
    }).catch(function() {});
  }

  function renderCommentSidebar() {
    var sidebar = document.getElementById('commentSidebar');
    var doc = documents[currentStep];
    var docComments = getCommentsForDoc(doc.key);

    if (docComments.length === 0) {
      sidebar.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:12px;">' +
        'Click on any section to add a comment</div>';
      return;
    }

    var html = '';
    docComments.forEach(function(c) {
      var time = new Date(c.timestamp);
      var timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      html += '<div class="comment-card">' +
        '<button class="comment-delete" onclick="deleteComment(\\'' + c.id + '\\')" title="Delete comment">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="comment-section-ref">' + escapeHtml(c.sectionText || '(section)') + '</div>' +
        '<div class="comment-text">' + escapeHtml(c.text) + '</div>' +
        '<div class="comment-time">' + timeStr + '</div>' +
        '</div>';
    });
    sidebar.innerHTML = html;
  }

  function updateCommentCount() {
    var el = document.getElementById('commentCount');
    var total = comments.length;
    if (total > 0) {
      el.textContent = total + ' comment' + (total > 1 ? 's' : '');
      el.classList.add('has-comments');
    } else {
      el.classList.remove('has-comments');
    }
  }

  window.toggleComments = function() {
    var sidebar = document.getElementById('commentSidebar');
    sidebar.classList.toggle('visible');
  };

  // ── View Toggle ───────────────────────────────
  window.setView = function(view) {
    var doc = documents[currentStep];
    if (doc.isVisuals) return; // No raw view for visuals

    if (view === 'raw' && currentView !== 'raw') {
      currentView = 'raw';
      document.getElementById('btnRendered').classList.remove('active');
      document.getElementById('btnRaw').classList.add('active');
      renderRawView(doc);
    } else if (view === 'rendered' && currentView !== 'rendered') {
      // Sync from raw editor
      docMarkdown[doc.key] = document.getElementById('rawEditor').value;
      updateModifiedState(doc.key);
      currentView = 'rendered';
      document.getElementById('btnRendered').classList.add('active');
      document.getElementById('btnRaw').classList.remove('active');
      renderMarkdown(doc);
    }
  };

  // ── Modified State ────────────────────────────
  function updateModifiedState(docKey) {
    modified[docKey] = docMarkdown[docKey] !== originalMarkdown[docKey];
    updateGlobalModifiedState();
  }

  function updateGlobalModifiedState() {
    var anyModified = Object.values(modified).some(function(v) { return v; });
    document.getElementById('modifiedBadge').style.display = anyModified ? 'inline' : 'none';
  }

  function isAnyModified() {
    return Object.values(modified).some(function(v) { return v; });
  }

  // ── Lightbox ──────────────────────────────────
  window.openLightbox = function(url) {
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightbox').classList.add('active');
  };
  window.closeLightbox = function() {
    document.getElementById('lightbox').classList.remove('active');
  };

  // ── Actions ───────────────────────────────────
  window.approve = function() {
    syncCurrentDoc();
    sendResult('approved');
  };

  window.requestChanges = function() {
    syncCurrentDoc();
    if (comments.length === 0) {
      showToast('Add comments before requesting changes');
      return;
    }
    sendResult('changes_requested');
  };

  window.decline = function() {
    syncCurrentDoc();
    sendResult('declined');
  };

  function syncCurrentDoc() {
    if (currentView === 'raw') {
      var doc = documents[currentStep];
      if (!doc.isVisuals) {
        docMarkdown[doc.key] = document.getElementById('rawEditor').value;
        updateModifiedState(doc.key);
      }
    }
  }

  window.copyToClipboard = function() {
    syncCurrentDoc();
    var doc = documents[currentStep];
    var text = doc.isVisuals ? '(visuals step)' : docMarkdown[doc.key];
    navigator.clipboard.writeText(text).then(function() {
      showToast('Copied to clipboard');
    }).catch(function() {
      showToast('Copy failed');
    });
  };

  window.downloadStandalone = function() {
    syncCurrentDoc();
    var markdownChanges = {};
    documents.forEach(function(doc) {
      if (!doc.isVisuals && docMarkdown[doc.key] !== originalMarkdown[doc.key]) {
        markdownChanges[doc.filePath] = docMarkdown[doc.key];
      }
    });

    fetch('http://127.0.0.1:' + PORT + '/export-standalone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdownChanges: markdownChanges })
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      showToast(data.message || 'Standalone export saved');
    }).catch(function() {
      showToast('Standalone export failed');
    });
  };

  function sendResult(action) {
    // Build changes map for any modified docs
    var markdownChanges = {};
    documents.forEach(function(doc) {
      if (modified[doc.key]) {
        markdownChanges[doc.filePath] = docMarkdown[doc.key];
      }
    });

    var body = {
      action: action,
      comments: comments,
      markdownChanges: markdownChanges,
      modified: isAnyModified()
    };

    fetch('http://127.0.0.1:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function() {
      if (action === 'approved') {
        // Show approved state: banner + full read-only content
        var banner = document.createElement('div');
        banner.className = 'approved-banner';
        banner.innerHTML = '<div class="approved-icon">✓</div>' +
          '<div class="approved-content"><div class="approved-text">Spec Approved</div>' +
          '<div class="approved-sub">The agent will now proceed with implementation.</div></div>' +
          '<div class="approved-actions">' +
          '<button class="btn btn-ghost" onclick="copyToClipboard()">Copy</button>' +
          '<button class="btn btn-ghost" onclick="downloadStandalone()">Standalone</button>' +
          '</div>';
        var header = document.querySelector('.header');
        header.parentNode.insertBefore(banner, header.nextSibling);

        // Switch to approved state (disables interactivity via CSS)
        document.body.classList.add('approved-state');

        // Update header badge
        var badge = document.querySelector('.header .badge');
        if (badge) {
          badge.textContent = 'APPROVED';
          badge.style.color = 'var(--success)';
          badge.style.borderColor = 'var(--success)';
        }

        // Ensure rendered view is showing (not raw)
        if (currentView === 'raw') {
          setView('rendered');
        }

        // Close comment sidebar and popup
        closeCommentPopup();
        document.getElementById('commentSidebar').classList.remove('visible');
      } else {
        // Closed/declined/changes_requested — show simple message
        var msg = action === 'changes_requested' ? 'Changes requested' : 'Closed';
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-muted);font-family:var(--font);">' +
          '<div style="text-align:center"><p style="font-size:20px;margin-bottom:8px;">' + msg +
          '</p><p style="color:var(--text-dim);">You can close this tab.</p></div></div>';
      }
    }).catch(function() {
      showToast('Failed to send result');
    });
  }

  // ── Keyboard Navigation ───────────────────────
  document.addEventListener('keydown', function(e) {
    // Don't intercept when typing in inputs
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToStep(currentStep - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToStep(currentStep + 1);
    } else if (e.key === 'Escape') {
      closeCommentPopup();
      closeLightbox();
    }
  });

  // Handle Enter in comment input
  document.getElementById('commentInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitComment();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommentPopup();
    }
  });

  // Raw editor change tracking
  document.getElementById('rawEditor').addEventListener('input', function() {
    var doc = documents[currentStep];
    docMarkdown[doc.key] = this.value;
    updateModifiedState(doc.key);
  });

  // ── Helpers ───────────────────────────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 2500);
  }

  // ── Init ──────────────────────────────────────
  render();

  // Auto-show comment sidebar if there are existing comments
  if (comments.length > 0) {
    document.getElementById('commentSidebar').classList.add('visible');
  }
})();
<\/script>
</body>
</html>`;
}
