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
	const escapedTitle = JSON.stringify(opts.title);
	const escapedFilePath = JSON.stringify(opts.filePath);
	const escapedContent = JSON.stringify(opts.content);
	const escapedLineRange = JSON.stringify(opts.lineRange || "");
	const escapedEditable = JSON.stringify(opts.editable);
	const escapedLanguage = JSON.stringify(opts.language || "");

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
    --line-num-width: 50px;
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
  button.primary { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
  button.primary:hover { background: rgba(41, 128, 185, 0.22); }
  button.success { background: rgba(72, 216, 137, 0.1); border-color: var(--success); color: var(--success); }
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
    display: flex;
  }
  .viewer-wrap.hidden { display: none; }

  .line-numbers {
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
  .line-numbers span {
    display: block;
    padding: 0 10px 0 0;
  }

  .viewer-code {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
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
    overflow-x: auto;
  }

  /* ── Unsaved dot indicator ── */
  .unsaved-dot {
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning);
    margin-left: 4px;
  }
  .unsaved-dot.visible { display: inline-block; }
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
    <div id="notice" class="notice"></div>

    <div id="viewerWrap" class="viewer-wrap">
      <div id="lineNumbers" class="line-numbers"></div>
      <div id="viewerCode" class="viewer-code">
        <pre><code id="codeBlock"></code></pre>
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
<script>
  const PORT = ${opts.port};
  const TITLE = ${escapedTitle};
  const FILE_PATH = ${escapedFilePath};
  const ORIGINAL = ${escapedContent};
  const LINE_RANGE = ${escapedLineRange};
  const EDITABLE = ${escapedEditable};
  const LANGUAGE = ${escapedLanguage};

  let currentContent = ORIGINAL;
  let savedContent = ORIGINAL;
  let modified = false;
  let mode = 'view';

  /* ── DOM refs ── */
  const titleText = document.getElementById('titleText');
  const subtitleText = document.getElementById('subtitleText');
  const unsavedDot = document.getElementById('unsavedDot');
  const langBadge = document.getElementById('langBadge');
  const metaPath = document.getElementById('metaPath');
  const metaLines = document.getElementById('metaLines');
  const metaMode = document.getElementById('metaMode');
  const metaSize = document.getElementById('metaSize');
  const notice = document.getElementById('notice');
  const viewerWrap = document.getElementById('viewerWrap');
  const lineNumbers = document.getElementById('lineNumbers');
  const codeBlock = document.getElementById('codeBlock');
  const editorWrap = document.getElementById('editorWrap');
  const editorLines = document.getElementById('editorLines');
  const editor = document.getElementById('editor');
  const copyBtn = document.getElementById('copyBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const saveBtn = document.getElementById('saveBtn');
  const saveHint = document.getElementById('saveHint');
  const doneBtn = document.getElementById('doneBtn');

  /* ── Language detection ── */
  const EXT_MAP = {
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
    toml: 'toml', ini: 'ini', conf: 'ini',
    makefile: 'makefile',
    r: 'r', R: 'r',
    php: 'php', lua: 'lua', perl: 'perl', pl: 'perl',
    graphql: 'graphql', gql: 'graphql',
    proto: 'protobuf',
    tf: 'hcl', hcl: 'hcl',
    env: 'bash', gitignore: 'bash',
  };

  function detectLanguage() {
    if (LANGUAGE) return LANGUAGE;
    var parts = FILE_PATH.split('/');
    var filename = parts[parts.length - 1] || '';
    var lower = filename.toLowerCase();

    /* Handle dotfiles and special filenames */
    if (lower === 'dockerfile') return 'dockerfile';
    if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile';
    if (lower === '.env' || lower.startsWith('.env.')) return 'bash';

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

  function generateLineNums(content, container) {
    var lines = content.split('\\n');
    var count = lines.length;
    /* Remove trailing empty line from final newline */
    if (lines.length > 1 && lines[lines.length - 1] === '') count--;
    var html = '';
    for (var i = 1; i <= count; i++) {
      html += '<span>' + i + '<\\/span>';
    }
    container.innerHTML = html;
  }

  /* ── Highlight code ── */
  function highlightCode() {
    codeBlock.textContent = currentContent;
    if (typeof hljs !== 'undefined') {
      if (detectedLang && hljs.getLanguage(detectedLang)) {
        codeBlock.className = 'language-' + detectedLang;
      } else {
        codeBlock.className = '';
      }
      hljs.highlightElement(codeBlock);
    }
    generateLineNums(currentContent, lineNumbers);
  }

  /* ── Sync editor line numbers on scroll ── */
  function syncEditorScroll() {
    editorLines.style.transform = 'translateY(-' + editor.scrollTop + 'px)';
  }

  /* ── Refresh meta bar ── */
  function refreshMeta() {
    metaPath.textContent = 'Path: ' + FILE_PATH;
    var lineCount = currentContent.split('\\n').length;
    if (currentContent.endsWith('\\n') && lineCount > 1) lineCount--;
    metaLines.textContent = 'Lines: ' + lineCount + (LINE_RANGE ? ' (range ' + LINE_RANGE + ')' : '');
    metaMode.textContent = 'Mode: ' + (mode === 'view' ? 'Read' : 'Edit') + (EDITABLE ? '' : ' (read-only)');
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

    var isEdit = mode === 'edit' && EDITABLE;

    /* Toggle viewer/editor visibility */
    viewerWrap.classList.toggle('hidden', isEdit);
    editorWrap.classList.toggle('visible', isEdit);

    if (!isEdit) {
      highlightCode();
    } else {
      if (editor.value !== currentContent) editor.value = currentContent;
      generateLineNums(currentContent, editorLines);
    }

    toggleBtn.textContent = isEdit ? 'Preview' : (EDITABLE ? 'Edit' : 'Read Only');
    toggleBtn.disabled = !EDITABLE;
    saveBtn.disabled = !EDITABLE || !modified;
    saveHint.textContent = EDITABLE ? (navigator.platform.indexOf('Mac') > -1 ? '\\u2318S' : 'Ctrl+S') : '';
    refreshMeta();
  }

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
    if (!EDITABLE) return;
    if (mode === 'view') {
      mode = 'edit';
      setNotice('Edit mode — changes are local until you Save', 'warning');
      refreshUI();
      setTimeout(function() { editor.focus(); }, 0);
    } else {
      currentContent = editor.value;
      modified = currentContent !== savedContent;
      mode = 'view';
      setNotice(modified ? 'Unsaved changes' : '', modified ? 'warning' : '');
      refreshUI();
    }
  });

  /* ── Editor input tracking ── */
  editor.addEventListener('input', function() {
    currentContent = editor.value;
    modified = currentContent !== savedContent;
    generateLineNums(currentContent, editorLines);
    unsavedDot.classList.toggle('visible', modified);
    saveBtn.disabled = !modified;
  });

  editor.addEventListener('scroll', syncEditorScroll);

  /* ── Tab key support in editor ── */
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var start = editor.selectionStart;
      var end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      editor.dispatchEvent(new Event('input'));
    }
  });

  /* ── Save ── */
  function doSave() {
    if (!EDITABLE || !modified) return;
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
      setNotice('Saved', 'success');
      setTimeout(function() { if (!modified) setNotice('', ''); }, 2000);
      refreshUI();
    }).catch(function(err) {
      setNotice(err && err.message ? err.message : 'Save failed', 'error');
    });
  }

  saveBtn.addEventListener('click', doSave);

  /* ── Done ── */
  doneBtn.addEventListener('click', function() {
    if (mode === 'edit') {
      currentContent = editor.value;
      modified = currentContent !== savedContent;
    }
    fetch('http://127.0.0.1:' + PORT + '/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'done', modified: modified, content: currentContent })
    });
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', function(e) {
    /* Cmd/Ctrl+S = Save */
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (mode === 'edit') doSave();
    }
  });

  /* ── Sync viewer scroll with line numbers ── */
  var viewerCode = document.getElementById('viewerCode');
  viewerCode.addEventListener('scroll', function() {
    lineNumbers.style.transform = 'translateY(-' + viewerCode.scrollTop + 'px)';
  });

  /* ── Init ── */
  refreshUI();
<\/script>
</body>
</html>`;
}
