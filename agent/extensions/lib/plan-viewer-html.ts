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
	const escapedMarkdown = JSON.stringify(markdown);
	const escapedTitle = JSON.stringify(title);

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

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 15px;
    line-height: 1.65;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
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
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    padding: 24px 16px 100px;
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
    padding: 16px;
  }
  .raw-view textarea {
    width: 100%;
    min-height: 400px;
    background: transparent;
    color: var(--text-muted);
    border: none;
    outline: none;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.7;
    resize: vertical;
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

  /* ── Responsive ──────────────────────── */
  @media (max-width: 600px) {
    .content { padding: 16px 12px 130px; }
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
<div class="content">
  <div id="renderedView" class="markdown-body"></div>
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
  const MODE = ${JSON.stringify(mode)};
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

  function renderPlan() {
    const container = document.getElementById('renderedView');
    // Parse markdown and convert checkbox syntax to interactive elements
    let html = marked.parse(markdown);

    // Convert checkbox list items to interactive plan items
    html = html.replace(
      /<li>\\s*<input[^>]*type="checkbox"[^>]*(checked)?[^>]*>\\s*(.*?)<\\/li>/gi,
      function(match, checked, text) {
        const isChecked = checked ? 'checked' : '';
        const checkedClass = checked ? ' checked' : '';
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
      /<li>\\[( |x|X)\\]\\s*(.*?)<\\/li>/gi,
      function(match, check, text) {
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
    setupDragAndDrop();
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

    if (view === 'raw') {
      rendered.style.display = 'none';
      raw.style.display = 'block';
      btnR.classList.remove('active');
      btnM.classList.add('active');
      document.getElementById('rawEditor').value = markdown;
    } else {
      // Sync from raw editor if switching back
      markdown = document.getElementById('rawEditor').value;
      rendered.style.display = 'block';
      raw.style.display = 'none';
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
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-muted);font-family:var(--font);">' +
        '<div style="text-align:center"><p style="font-size:20px;margin-bottom:8px;">' +
        (action === 'approved' || action === 'submitted' ? (MODE === 'questions' ? 'Answers submitted' : 'Plan approved') : 'Closed') +
        '</p><p style="color:var(--text-dim);">You can close this tab.</p></div></div>';
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
