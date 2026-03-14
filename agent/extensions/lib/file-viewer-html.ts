// ABOUTME: Self-contained HTML template for a lightweight local file viewer/editor.
// ABOUTME: Features syntax highlighting (highlight.js), line numbers, edit/save flow, and keyboard shortcuts.

export function generateFileViewerHTML(opts: {
	title: string;
	filePath: string;
	content: string;
	port: number;
	lineRange?: string;
	editable: boolean;
	language?: string;
}): string {
	// Escape </ sequences to prevent </script> in file content from breaking the script block
	const esc = (v: unknown) => JSON.stringify(v).replace(/<\//g, '<\\/');
	const escapedTitle = esc(opts.title);
	const escapedFilePath = esc(opts.filePath);
	const escapedContent = esc(opts.content);
	const escapedLineRange = esc(opts.lineRange || "");
	const escapedEditable = esc(opts.editable);
	const escapedLanguage = esc(opts.language || "");
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
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    margin: 12px 16px 0;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
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
  }
  .title-wrap { flex: 1; min-width: 0; }
  .title {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  button {
    background: var(--surface2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 14px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  .icon-btn {
    width: 38px;
    height: 38px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn svg {
    width: 18px;
    height: 18px;
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
  button.primary { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
  button.primary:hover { background: rgba(41, 128, 185, 0.22); }
  button.success { background: rgba(72, 216, 137, 0.1); border-color: var(--success); color: var(--success); }
  button.success:hover { background: rgba(72, 216, 137, 0.2); }
  button:disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }
  .save-hint {
    font-size: 10px;
    color: var(--text-dim);
    font-family: var(--mono);
  }

  /* ── Meta bar ── */
  .meta {
    margin: 8px 16px 0;
    padding: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
    flex-shrink: 0;
  }

  /* ── Content area ── */
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

  /* ── Notice bar ── */
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

  /* ── Code viewer (highlight.js) ── */
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

  /* Line number gutter — table cell, always aligned with code */
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
  /* Override hljs background to match our theme */
  .hljs { background: transparent !important; }

  /* ── Editor (enhanced textarea) ── */
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

  /* ── Unsaved dot indicator ── */
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

  /* ── Done state overlay ── */
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
    <div class="toolbar">
      <button id="cursorBtn" class="icon-btn" title="Open in Cursor" aria-label="Open in Cursor">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path class="fill" d="M6 4l10 8-4.2 1.1 2.7 5-2.3 1.2-2.7-5L7 18 6 4z"/>
        </svg>
      </button>
      <button id="windsurfBtn" class="icon-btn" title="Open in Windsurf" aria-label="Open in Windsurf">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 15c2.2-2.6 4.4-3.9 6.6-3.9 2.1 0 3.7 1.2 5.1 2.3 1.3 1 2.4 1.8 3.8 1.8 1 0 1.9-.3 2.8-.9"/>
          <path d="M3 19c2.1-1.8 4.1-2.7 6-2.7 1.8 0 3.2.8 4.6 1.6 1.4.8 2.8 1.6 4.7 1.6 1.1 0 2.1-.2 3.2-.8"/>
          <path d="M4 10c1.3-2.9 3.3-4.5 5.8-4.5 3.2 0 4.6 2.8 6.9 2.8 1.1 0 2.1-.4 3.3-1.5"/>
        </svg>
      </button>
      <button id="vscodeBtn" class="icon-btn" title="Open in VS Code" aria-label="Open in VS Code">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path class="fill" d="M16.8 3.8l-7.2 6.9-3.2-2.4-2.2 1.9 3.1 2.8-3.1 2.8 2.2 1.9 3.2-2.4 7.2 6.9 3.2-1.5V5.3l-3.2-1.5zM17 8.2v7.6l-4.6-3.8L17 8.2z"/>
        </svg>
      </button>
      <button id="copyBtn" title="Copy file contents">Copy</button>
      <button id="toggleBtn"></button>
      <button id="saveBtn" class="primary" title="Save file">Save</button>
      <span id="saveHint" class="save-hint"></span>
      <button id="doneBtn" class="success">Done</button>
    </div>
  </div>

  <div class="meta">
    <span id="metaPath"></span>
    <span id="metaLines"></span>
    <span id="metaMode"></span>
    <span id="metaSize"></span>
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
<script>
  var PORT = ${opts.port};
  var TITLE = ${escapedTitle};
  var FILE_PATH = ${escapedFilePath};
  var ORIGINAL = ${escapedContent};
  var LINE_RANGE = ${escapedLineRange};
  var EDITABLE = ${escapedEditable};
  var LANGUAGE = ${escapedLanguage};

  var currentContent = ORIGINAL;
  var savedContent = ORIGINAL;
  var modified = false;
  var mode = 'view';
  var isDone = false;

  /* ── DOM refs ── */
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

  var gutter = document.getElementById('gutter');
  var codeBlock = document.getElementById('codeBlock');
  var editorWrap = document.getElementById('editorWrap');
  var editorLines = document.getElementById('editorLines');
  var editor = document.getElementById('editor');
  var cursorBtn = document.getElementById('cursorBtn');
  var windsurfBtn = document.getElementById('windsurfBtn');
  var vscodeBtn = document.getElementById('vscodeBtn');
  var copyBtn = document.getElementById('copyBtn');
  var toggleBtn = document.getElementById('toggleBtn');
  var saveBtn = document.getElementById('saveBtn');
  var saveHint = document.getElementById('saveHint');
  var doneBtn = document.getElementById('doneBtn');

  /* ── Language detection ── */
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
    md: 'markdown', mdx: 'markdown',
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

  /* ── Helpers ── */
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
    for (var i = 1; i <= count; i++) {
      html += '<span>' + i + '</span>';
    }
    return html;
  }

  function generateLineNums(content, container) {
    var html = renderLineNumberHtml(getLineCount(content));
    if (container.innerHTML !== html) container.innerHTML = html;
  }

  /* ── Highlight code ── */
  function updateGutter(content) {
    var html = renderLineNumberHtml(getLineCount(content));
    if (gutter.innerHTML !== html) gutter.innerHTML = html;
  }

  var lastHighlightedContent = null;

  function highlightCode() {
    /* Skip re-highlight if content unchanged */
    if (currentContent === lastHighlightedContent) {
      return;
    }
    /* Highlight with hljs — use .highlight() for synchronous result */
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

  /* ── Sync editor line numbers on scroll ── */
  function syncEditorScroll() {
    editorLines.style.transform = 'translateY(-' + editor.scrollTop + 'px)';
  }

  /* ── Refresh meta bar ── */
  function refreshMeta() {
    metaPath.textContent = 'Path: ' + FILE_PATH;
    var lineCount = getLineCount(currentContent);
    metaLines.textContent = 'Lines: ' + lineCount + (LINE_RANGE ? ' (range ' + LINE_RANGE + ')' : '');
    metaMode.textContent = isDone ? 'Mode: Read-only (done)' : ('Mode: ' + (mode === 'view' ? 'Read' : 'Edit') + (EDITABLE ? '' : ' (read-only)'));
    metaSize.textContent = 'Size: ' + formatBytes(new Blob([currentContent]).size);
  }

  /* ── Main UI refresh ── */
  function refreshUI() {
    titleText.textContent = TITLE;
    subtitleText.textContent = FILE_PATH;
    unsavedDot.classList.toggle('visible', modified);

    if (detectedLang) {
      langBadge.textContent = detectedLang;
      langBadge.style.display = '';
    } else {
      langBadge.style.display = 'none';
    }

    var isEdit = mode === 'edit' && EDITABLE && !isDone;

    /* Toggle viewer/editor visibility */
    viewerWrap.classList.toggle('hidden', isEdit);
    editorWrap.classList.toggle('visible', isEdit);

    if (!isEdit) {
      highlightCode();
    } else {
      if (editor.value !== currentContent) editor.value = currentContent;
      generateLineNums(currentContent, editorLines);
    }

    /* Button states */
    if (isDone) {
      toggleBtn.textContent = 'Read Only';
      toggleBtn.disabled = true;
      saveBtn.disabled = true;
      doneBtn.disabled = true;
      doneBtn.textContent = 'Done';
    } else {
      toggleBtn.textContent = isEdit ? 'Preview' : (EDITABLE ? 'Edit' : 'Read Only');
      toggleBtn.disabled = !EDITABLE;
      saveBtn.disabled = !EDITABLE || !modified;
      doneBtn.disabled = false;
    }

    saveHint.textContent = (EDITABLE && !isDone) ? (navigator.platform.indexOf('Mac') > -1 ? '\\u2318S' : 'Ctrl+S') : '';
    refreshMeta();
  }

  function openInEditor(editorName) {
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

  cursorBtn.addEventListener('click', function() { openInEditor('cursor'); });
  windsurfBtn.addEventListener('click', function() { openInEditor('windsurf'); });
  vscodeBtn.addEventListener('click', function() { openInEditor('vscode'); });

  /* ── Copy ── */
  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(mode === 'edit' ? editor.value : currentContent).then(function() {
      setNotice('Copied to clipboard', 'success');
      setTimeout(function() { setNotice('', ''); }, 2000);
    }, function() {
      setNotice('Failed to copy', 'error');
    });
  });

  /* ── Toggle view/edit ── */
  toggleBtn.addEventListener('click', function() {
    if (!EDITABLE || isDone) return;
    if (mode === 'view') {
      mode = 'edit';
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

  /* ── Editor input tracking ── */
  editor.addEventListener('input', function() {
    currentContent = editor.value;
    modified = currentContent !== savedContent;
    generateLineNums(currentContent, editorLines);
    updateGutter(currentContent);
    unsavedDot.classList.toggle('visible', modified);
    saveBtn.disabled = !modified;
  });

  editor.addEventListener('scroll', syncEditorScroll);

  /* ── Tab key support in editor ── */
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

  /* ── Save ── */
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
      setNotice('Saved', 'success');
      setTimeout(function() { if (!modified) setNotice('', ''); }, 2000);
      refreshUI();
    }).catch(function(err) {
      setNotice(err && err.message ? err.message : 'Save failed', 'error');
    });
  }

  saveBtn.addEventListener('click', doSave);

  /* ── Done — signal CLI but keep page open as read-only ── */
  doneBtn.addEventListener('click', function() {
    if (isDone) return;
    if (mode === 'edit') {
      currentContent = editor.value;
      modified = currentContent !== savedContent;
    }
    if (modified) {
      var proceed = window.confirm('You have unsaved changes. Close the viewer and return to CLI anyway?');
      if (!proceed) return;
    }

    /* Switch to done/read-only state immediately */
    isDone = true;
    mode = 'view';
    doneBanner.classList.add('visible');
    setNotice('', '');
    refreshUI();

    /* Signal the CLI server — fire and forget, server may close before response */
    fetch('http://127.0.0.1:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'done', modified: modified, content: currentContent })
    }).catch(function() { /* expected — server closes after receiving result */ });
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (mode === 'edit' && !isDone) doSave();
    }
  });

  /* ── Init ── */
  refreshUI();
  /* Retry after CDN scripts load in case hljs wasn't ready on first call */
  window.addEventListener('load', function() {
    lastHighlightedContent = null;
    refreshUI();
  });
<\/script>
</body>
</html>`;
}
