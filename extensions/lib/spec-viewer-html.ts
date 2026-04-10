// ABOUTME: Self-contained HTML template for the Spec Viewer GUI window.
// ABOUTME: Multi-page wizard with step navigation, inline comments, markdown editing, visuals gallery, approve/request-changes.

import { getMermaidNormalizationBrowserScript } from "./mermaid-normalization.ts";

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #1e1e24;
    --surface: #252530;
    --surface2: #2d2d3a;
    --border: #454558;
    --border-subtle: #3a3a48;
    --text: #f0f0f5;
    --text-muted: #b8b8c8;
    --text-dim: #606078;
    --accent: #2980b9;
    --accent-hover: #5dade2;
    --accent-dim: rgba(41, 128, 185, 0.12);
    --success: #2ecc71;
    --success-bg: rgba(46, 204, 113, 0.1);
    --warning: #f1c40f;
    --warning-bg: rgba(241, 196, 15, 0.1);
    --error: #e74c3c;
    --comment-accent: var(--accent);
    --comment-dim: var(--accent-dim);
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 2px 6px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.5);
    --font: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
    --mono: 'IBM Plex Mono', 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.5;
    font-weight: 400;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ── Header ──────────────────────────── */
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    z-index: 100;
    box-shadow: var(--shadow-sm);
  }
  .header-logo {
    height: 22px;
    width: auto;
    opacity: 0.9;
    flex-shrink: 0;
  }
  .header .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(41, 128, 185, 0.15);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border: 1px solid rgba(41, 128, 185, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-family: var(--mono);
  }
  .header .title {
    font-size: 16px;
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
    background: rgba(241, 196, 15, 0.1);
    border: 1px solid rgba(241, 196, 15, 0.3);
    padding: 2px 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: none;
  }

  /* ── Step Navigation Bar ─────────────── */
  .step-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
    overflow-x: auto;
  }
  .step-bar.single-doc { display: none; }
  .step-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    font-family: var(--mono);
    font-weight: 500;
    color: var(--text-muted);
    transition: all 0.15s;
    white-space: nowrap;
    border: none;
    position: relative;
  }
  .step-item:hover { color: var(--text); background: var(--surface2); }
  .step-item.active {
    color: #fff;
    background: var(--accent);
  }
  .step-num {
    display: none;
  }
  .step-connector {
    display: none;
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
    border: 1px solid var(--border-subtle);
    overflow: hidden;
  }
  .view-toggle button {
    padding: 5px 16px;
    font-size: 11px;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: transparent;
    color: var(--text-dim);
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }
  .view-toggle button:hover { color: var(--text-muted); }
  .view-toggle button.active {
    background: var(--accent);
    color: #fff;
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
    padding: 32px 40px 100px;
    overflow-y: auto;
    min-height: 0;
    max-width: 900px;
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
    font-size: 24px;
    color: var(--text);
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 12px;
    font-weight: 700;
  }
  .markdown-body h2 {
    font-size: 20px;
    color: var(--accent);
    font-weight: 600;
  }
  .markdown-body h3 { font-size: 16px; color: var(--text); font-weight: 600; }
  .markdown-body h4 { font-size: 14px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .markdown-body p { margin: 8px 0; color: var(--text); font-size: 14px; line-height: 1.7; }
  .markdown-body ul, .markdown-body ol { margin: 8px 0; padding-left: 24px; }
  .markdown-body li { margin: 6px 0; color: var(--text); font-size: 14px; line-height: 1.6; }
  .markdown-body code {
    background: var(--surface2);
    color: #22d3ee;
    padding: 1px 6px;
    font-family: var(--mono);
    font-size: 12px;
  }
  .markdown-body pre {
    background: #011627;
    border: 1px solid var(--border-subtle);
    padding: 12px 16px;
    overflow-x: auto;
    margin: 12px 0;
  }
  .markdown-body pre code {
    background: none;
    padding: 0;
    color: #d6deeb;
    font-size: 12px;
    line-height: 1.6;
  }
  /* ── Mermaid Diagrams ────────────────── */
  .mermaid-container {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    padding: 20px;
    padding-top: 44px;
    margin: 12px 0;
    text-align: center;
    overflow: hidden;
    position: relative;
    cursor: grab;
  }
  .mermaid-container.dragging {
    cursor: grabbing;
    user-select: none;
  }
  .mermaid-container svg {
    max-width: 100%;
    height: auto;
    transition: transform 0.2s ease;
    transform-origin: 0 0;
  }
  .mermaid-container.dragging svg {
    transition: none;
  }

  .mermaid-toolbar {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    z-index: 10;
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  .mermaid-container:hover .mermaid-toolbar {
    opacity: 1;
  }
  .mermaid-toolbar button {
    background: var(--surface2);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    width: 30px;
    height: 28px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }
  .mermaid-toolbar button:hover {
    background: var(--accent);
    color: var(--text);
    border-color: var(--accent);
  }
  .mermaid-toolbar button svg.tb-icon {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mermaid-fullscreen-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 12, 16, 0.92);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  }
  .mermaid-fullscreen-overlay .fs-toolbar {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 6px;
    z-index: 10001;
  }
  .mermaid-fullscreen-overlay .fs-toolbar button {
    background: var(--surface2);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    width: 36px;
    height: 34px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }
  .mermaid-fullscreen-overlay .fs-toolbar button:hover {
    background: var(--accent);
    color: var(--text);
    border-color: var(--accent);
  }
  .mermaid-fullscreen-overlay .fs-toolbar button svg.tb-icon {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mermaid-fullscreen-overlay .fs-content {
    max-width: 95vw;
    max-height: 90vh;
    overflow: hidden;
    padding: 20px;
    cursor: grab;
    position: relative;
  }
  .mermaid-fullscreen-overlay .fs-content.dragging {
    cursor: grabbing;
    user-select: none;
  }
  .mermaid-fullscreen-overlay .fs-content svg {
    display: block;
    margin: auto;
    transition: width 0.2s ease, height 0.2s ease, transform 0.2s ease;
    transform-origin: 0 0;
  }
  .mermaid-fullscreen-overlay .fs-content.dragging svg {
    transition: none;
  }
  .markdown-body blockquote {
    border-left: 4px solid var(--accent);
    background: var(--surface2);
    padding: 14px 18px;
    margin: 12px 0;
    color: var(--text-muted);
    font-size: 14px;
    font-style: italic;
  }
  .markdown-body table {
    border-collapse: collapse;
    margin: 12px 0;
    width: 100%;
    font-size: 14px;
    box-shadow: 0 0 0 1px var(--border-subtle);
  }
  .markdown-body th, .markdown-body td {
    padding: 10px 16px;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle);
  }
  .markdown-body th {
    background: var(--surface2);
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .markdown-body td { color: var(--text); }
  .markdown-body hr {
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 28px 0;
  }
  .markdown-body a { color: var(--accent); text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body strong { color: var(--text); font-weight: 700; }
  .markdown-body em { color: var(--text-muted); }

  /* ── Commentable sections ────────────── */
  .commentable {
    position: relative;
    border-left: 2px solid transparent;
    padding-left: 12px;
    margin-left: -14px;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
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
    border: 1px solid var(--border-subtle);
    border-left: 2px solid var(--comment-accent);
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
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.15s;
  }
  .comment-card:hover .comment-delete { opacity: 1; }
  .comment-card .comment-delete:hover { color: var(--error); background: rgba(231, 76, 60, 0.1); }

  /* ── Comment Input (inline popup) ────── */
  .comment-input-popup {
    position: fixed;
    z-index: 150;
    background: var(--surface);
    border: 1px solid var(--comment-accent);
    padding: 12px;
    width: 320px;
    box-shadow: var(--shadow-lg);
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
    border: 1px solid var(--border-subtle);
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
    border: 1px solid var(--border-subtle);
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
    box-shadow: var(--shadow-lg);
  }
  .lightbox-close {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 36px;
    height: 36px;
    background: var(--surface);
    border: 1px solid var(--border);
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
    background: #011627;
    border: 1px solid var(--border-subtle);
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
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.2);
  }
  .footer .spacer { flex: 1; }
  .btn {
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--text-muted);
    transition: all 0.15s;
    font-family: var(--font);
  }
  .btn:hover { background: var(--border); color: var(--text); box-shadow: var(--shadow-sm); }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    font-weight: 600;
  }
  .btn-primary:hover { background: #1a5276; border-color: #1a5276; color: #fff; box-shadow: var(--shadow-md); }
  .btn-success {
    background: var(--success);
    color: #fff;
    border-color: var(--success);
    font-weight: 600;
  }
  .btn-success:hover { background: #27ae60; border-color: #27ae60; box-shadow: var(--shadow-md); }
  .btn-warning {
    background: var(--warning);
    color: #000;
    border-color: var(--warning);
    font-weight: 600;
  }
  .btn-warning:hover { background: #d4ac0d; border-color: #d4ac0d; box-shadow: var(--shadow-md); }
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
    background: var(--surface2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 8px 20px;
    font-size: 13px;
    font-family: var(--mono);
    font-weight: 500;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 200;
    box-shadow: var(--shadow-lg);
  }
  .toast.show { opacity: 1; }

  /* ── Approved State ──────────────────── */
  .approved-banner {
    background: var(--surface);
    border: 1px solid rgba(46, 204, 113, 0.3);
    border-left: 2px solid var(--success);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    z-index: 100;
    box-shadow: var(--shadow-sm);
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
  .icon-btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .icon-btn:hover {
    background: var(--surface2);
    color: var(--text);
    border-color: var(--text-dim);
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
  body.approved-state .commentable:hover {
    background: transparent;
    border-left-color: transparent;
    cursor: default;
  }
  body.approved-state .view-toggle { display: none; }
  body.approved-state .footer-wrapper { display: none; }
  body.approved-state .header .modified-badge { display: none !important; }
  body.approved-state .content { padding-bottom: 24px; }
  body.approved-state .comment-input-popup { display: none !important; }
  body.approved-state .comment-sidebar { display: none !important; }
  body.approved-state .step-item { cursor: default; pointer-events: none; }
  body.approved-state .step-item.active { cursor: default; }
  body.approved-state .visual-card { cursor: default; }

  /* ── Responsive ──────────────────────── */
  @media (max-width: 700px) {
    .content { padding: 12px 12px 100px; max-width: 100%; }
    .header { padding: 12px 16px; }
    .step-bar { padding: 8px 16px; }
    .comment-sidebar { display: none !important; }
    .footer { padding: 12px 16px; }
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
<!-- mermaid.js (diagram renderer) -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"><\/script>

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

  // ── Mermaid config ────────────────────────────
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#252530',
        primaryBorderColor: '#2980b9',
        primaryTextColor: '#f0f0f5',
        secondaryColor: '#2d2d3a',
        tertiaryColor: '#363645',
        lineColor: '#5dade2',
        mainBkg: '#252530',
        nodeBorder: '#454558',
        clusterBkg: '#2d2d3a',
        clusterBorder: '#454558',
        titleColor: '#f0f0f5',
        edgeLabelBackground: '#252530',
        fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: '14px',
      },
      flowchart: { curve: 'basis', padding: 20 },
      securityLevel: 'loose',
    });
  }

  ${getMermaidNormalizationBrowserScript()}

  // ── SVG icon helpers for toolbar ──────────────
  var TB_ICONS = {
    zoomIn: '<svg class="tb-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut: '<svg class="tb-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    reset: '<svg class="tb-icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    fullscreen: '<svg class="tb-icon" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    download: '<svg class="tb-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    close: '<svg class="tb-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  // ── Drag-to-pan helper for any container with an SVG ──
  function setupDragToPan(container, getZoom, getPan, setPan) {
    var isDragging = false;
    var startX = 0, startY = 0;
    var startPanX = 0, startPanY = 0;

    container.addEventListener('mousedown', function(e) {
      if (e.target.closest('.mermaid-toolbar') || e.target.closest('.fs-toolbar')) return;
      if (getZoom() <= 1) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var pan = getPan();
      startPanX = pan.x;
      startPanY = pan.y;
      container.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      setPan(startPanX + dx, startPanY + dy);
      e.preventDefault();
    });

    window.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove('dragging');
    });
  }

  // ── Mermaid toolbar injection ──────────────────
  function createMermaidToolbar(wrapper, idx) {
    var currentZoom = 1;
    var panX = 0, panY = 0;
    var toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';

    function makeBtn(iconHtml, title, onClick) {
      var btn = document.createElement('button');
      btn.innerHTML = iconHtml;
      btn.title = title;
      btn.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
      return btn;
    }

    function applyTransform() {
      var svg = wrapper.querySelector('svg');
      if (svg) svg.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + currentZoom + ')';
    }

    function applyZoom(z) {
      currentZoom = Math.max(0.25, Math.min(4, z));
      if (currentZoom <= 1) { panX = 0; panY = 0; }
      applyTransform();
    }

    setupDragToPan(
      wrapper,
      function() { return currentZoom; },
      function() { return { x: panX, y: panY }; },
      function(x, y) { panX = x; panY = y; applyTransform(); }
    );

    toolbar.appendChild(makeBtn(TB_ICONS.zoomIn, 'Zoom in', function() { applyZoom(currentZoom + 0.25); }));
    toolbar.appendChild(makeBtn(TB_ICONS.zoomOut, 'Zoom out', function() { applyZoom(currentZoom - 0.25); }));
    toolbar.appendChild(makeBtn(TB_ICONS.reset, 'Reset zoom', function() { panX = 0; panY = 0; applyZoom(1); }));
    toolbar.appendChild(makeBtn(TB_ICONS.fullscreen, 'Fullscreen', function() { openMermaidFullscreen(wrapper); }));
    toolbar.appendChild(makeBtn(TB_ICONS.download, 'Download SVG', function() { downloadMermaidSVG(wrapper, idx); }));
    wrapper.appendChild(toolbar);
  }

  // ── Fullscreen overlay ────────────────────────
  function openMermaidFullscreen(wrapper) {
    var svg = wrapper.querySelector('svg');
    if (!svg) return;
    var overlay = document.createElement('div');
    overlay.className = 'mermaid-fullscreen-overlay';
    var fsZoom = 1;
    var fsPanX = 0, fsPanY = 0;

    var fsToolbar = document.createElement('div');
    fsToolbar.className = 'fs-toolbar';

    function makeFsBtn(iconHtml, title, onClick) {
      var btn = document.createElement('button');
      btn.innerHTML = iconHtml;
      btn.title = title;
      btn.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
      return btn;
    }

    var origWidth = 0;
    var origHeight = 0;

    function applyFsTransform() {
      var fsSvg = overlay.querySelector('.fs-content svg');
      if (fsSvg && origWidth && origHeight) {
        fsSvg.style.width = (origWidth * fsZoom) + 'px';
        fsSvg.style.height = (origHeight * fsZoom) + 'px';
        fsSvg.style.minWidth = (origWidth * fsZoom) + 'px';
        fsSvg.style.minHeight = (origHeight * fsZoom) + 'px';
        fsSvg.style.transform = 'translate(' + fsPanX + 'px, ' + fsPanY + 'px)';
      }
    }

    function applyFsZoom(z) {
      fsZoom = Math.max(0.25, Math.min(6, z));
      if (fsZoom <= 1) { fsPanX = 0; fsPanY = 0; }
      applyFsTransform();
    }

    fsToolbar.appendChild(makeFsBtn(TB_ICONS.zoomIn, 'Zoom in', function() { applyFsZoom(fsZoom + 0.25); }));
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.zoomOut, 'Zoom out', function() { applyFsZoom(fsZoom - 0.25); }));
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.reset, 'Reset zoom', function() { fsPanX = 0; fsPanY = 0; applyFsZoom(1); }));
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.close, 'Close', function() { overlay.remove(); }));
    overlay.appendChild(fsToolbar);

    var content = document.createElement('div');
    content.className = 'fs-content';
    content.innerHTML = svg.outerHTML;
    overlay.appendChild(content);

    setupDragToPan(
      content,
      function() { return fsZoom; },
      function() { return { x: fsPanX, y: fsPanY }; },
      function(x, y) { fsPanX = x; fsPanY = y; applyFsTransform(); }
    );

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
    document.body.appendChild(overlay);

    // Capture original SVG dimensions after overlay is in the DOM
    var fsSvg = content.querySelector('svg');
    if (fsSvg) {
      fsSvg.style.maxWidth = 'none';
      var rect = fsSvg.getBoundingClientRect();
      origWidth = rect.width || fsSvg.viewBox.baseVal.width || 800;
      origHeight = rect.height || fsSvg.viewBox.baseVal.height || 600;
    }
  }

  // ── Download SVG ──────────────────────────────
  function downloadMermaidSVG(wrapper, idx) {
    var svg = wrapper.querySelector('svg');
    if (!svg) return;
    var serializer = new XMLSerializer();
    var svgStr = serializer.serializeToString(svg);
    var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'diagram-' + idx + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Render Mermaid diagrams ───────────────────
  function renderMermaidDiagrams(container) {
    if (typeof mermaid === 'undefined') return;
    var codeBlocks = container.querySelectorAll('pre code.language-mermaid');
    if (codeBlocks.length === 0) return;
    var blocks = Array.from(codeBlocks);
    blocks.forEach(function(codeEl, idx) {
      var preEl = codeEl.parentElement;
      var source = normalizeMermaidSource(codeEl.textContent || '');
      var wrapper = document.createElement('div');
      wrapper.className = 'mermaid-container';
      var id = 'mermaid-diagram-' + idx + '-' + Date.now();
      try {
        mermaid.render(id, source).then(function(result) {
          wrapper.innerHTML = result.svg;
          createMermaidToolbar(wrapper, idx);
          preEl.parentNode.replaceChild(wrapper, preEl);
        }).catch(function(err) {
          console.warn('Mermaid render error for diagram ' + idx + ':', err);
        });
      } catch(e) {
        console.warn('Mermaid render error:', e);
      }
    });
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
    renderMermaidDiagrams(renderedView);

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
        // Show approved banner + read-only content (matches plan viewer pattern)
        var label = 'Spec Approved';
        var sub = 'The agent will now proceed with implementation.';

        // Insert approved banner after header
        var banner = document.createElement('div');
        banner.className = 'approved-banner';
        banner.innerHTML = '<div class="approved-icon">&#10003;</div>' +
          '<div class="approved-content"><div class="approved-text">' + label + '</div>' +
          '<div class="approved-sub">' + sub + '</div></div>' +
          '<div class="approved-actions">' +
          '<button class="icon-btn" onclick="copyToClipboard()" title="Copy to clipboard"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
          '<button class="icon-btn" onclick="downloadStandalone()" title="Download standalone read-only HTML"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg></button>' +
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
      } else if (action === 'changes_requested') {
        // Show full-screen overlay for changes requested
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;';
        var msg = document.createElement('div');
        msg.style.cssText = 'text-align:center;font-family:var(--font,monospace);';
        msg.innerHTML = '<p style="color:var(--warning);font-size:24px;margin-bottom:8px;">Changes Requested</p>' +
          '<p style="color:#888;font-size:14px;">Returning to terminal&#8230;</p>';
        overlay.appendChild(msg);
        document.body.appendChild(overlay);
      } else {
        // Closed/declined — show simple close message
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-muted);font-family:var(--font);">' +
          '<div style="text-align:center"><p style="font-size:20px;margin-bottom:8px;">Closed</p>' +
          '<p style="color:var(--text-dim);">You can close this tab.</p></div></div>';
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
