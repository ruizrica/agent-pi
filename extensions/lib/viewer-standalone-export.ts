import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";

const BRAND_IMAGE_URL = "https://firebasestorage.googleapis.com/v0/b/ruizrica-io.firebasestorage.app/o/agent.png?alt=media&token=152539b8-8d0c-46e4-950f-190c317ed6c8";
const MARKED_CDN_URL = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
const MERMAID_CDN_URL = "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js";

function timestampForFileName(): string {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function ensureDesktop(): string {
	const desktop = join(homedir(), "Desktop");
	if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
	return desktop;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;");
}

function baseDocument(opts: { title: string; label: string; body: string; script: string }): string {
	const { title, label, body, script } = opts;
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Export</title>
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
    --accent-dim: rgba(41, 128, 185, 0.12);
    --success: #48d889;
    --warning: #f0b429;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); }
  body { padding: 24px; }
  .shell { max-width: 1080px; margin: 0 auto; }
  .header {
    display: flex; align-items: center; gap: 14px; padding: 16px 20px; margin-bottom: 18px;
    background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 8px;
  }
  .header img { width: auto; height: 24px; opacity: 0.9; }
  .badge {
    display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--accent); color: var(--accent);
    border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 700; letter-spacing: 1px; font-family: var(--mono); text-transform: uppercase;
  }
  .title { flex: 1; font-size: 16px; font-weight: 600; }
  .meta { font-size: 12px; color: var(--text-muted); font-family: var(--mono); }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; }
  .section + .section { margin-top: 24px; }
  .section-header { margin-bottom: 12px; }
  .section-label { color: var(--accent); font-size: 12px; letter-spacing: 0.8px; font-family: var(--mono); text-transform: uppercase; }
  .section-path { margin-top: 4px; color: var(--text-dim); font-size: 12px; font-family: var(--mono); }
  .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { color: var(--text); margin: 28px 0 12px; line-height: 1.3; }
  .markdown-body h1 { color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 10px; font-size: 24px; }
  .markdown-body h2 { color: var(--accent); font-size: 17px; text-transform: uppercase; letter-spacing: 0.8px; font-family: var(--mono); }
  .markdown-body p, .markdown-body li { color: var(--text-muted); font-size: 14px; line-height: 1.7; }
  .markdown-body ul, .markdown-body ol { padding-left: 24px; }
  .markdown-body code { background: var(--surface2); color: var(--accent); padding: 2px 6px; border-radius: 4px; font-family: var(--mono); font-size: 12px; }
  .markdown-body pre { background: #171a20; border: 1px solid var(--border); border-radius: 6px; padding: 16px; overflow: auto; }
  .markdown-body pre code { background: transparent; padding: 0; color: var(--text-muted); }
  .markdown-body blockquote { border-left: 3px solid var(--accent); background: var(--accent-dim); padding: 12px 16px; border-radius: 0 6px 6px 0; color: var(--text-muted); }
  .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
  .markdown-body th { color: var(--accent); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--mono); }
  .visual-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .visual-card { background: #171a20; border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .visual-card img { display: block; width: 100%; height: auto; border-radius: 6px; background: #0f1115; }
  .visual-card iframe { width: 100%; min-height: 420px; border: 1px solid var(--border); border-radius: 6px; background: white; }
  .visual-label { margin-bottom: 8px; color: var(--text-muted); font-size: 12px; font-family: var(--mono); word-break: break-all; }
  .mermaid-container { background: transparent; border: none; border-radius: 6px; padding: 20px; padding-top: 44px; margin: 12px 0; text-align: center; overflow: hidden; position: relative; }
  .mermaid-container svg { max-width: 100%; height: auto; transition: transform 0.2s ease; transform-origin: center center; }
  .mermaid-toolbar { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; z-index: 10; opacity: 0.6; transition: opacity 0.2s; }
  .mermaid-container:hover .mermaid-toolbar { opacity: 1; }
  .mermaid-toolbar button { background: var(--surface2); border: 1px solid var(--border); color: var(--text-muted); border-radius: 4px; width: 30px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background 0.15s, color 0.15s; padding: 0; }
  .mermaid-toolbar button:hover { background: var(--accent); color: var(--text); border-color: var(--accent); }
  .mermaid-toolbar button svg.tb-icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .mermaid-fullscreen-overlay { position: fixed; inset: 0; background: rgba(10, 12, 16, 0.92); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
  .mermaid-fullscreen-overlay .fs-toolbar { position: absolute; top: 16px; right: 16px; display: flex; gap: 6px; z-index: 10001; }
  .mermaid-fullscreen-overlay .fs-toolbar button { background: var(--surface2); border: 1px solid var(--border); color: var(--text-muted); border-radius: 6px; width: 36px; height: 34px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: background 0.15s, color 0.15s; padding: 0; }
  .mermaid-fullscreen-overlay .fs-toolbar button:hover { background: var(--accent); color: var(--text); border-color: var(--accent); }
  .mermaid-fullscreen-overlay .fs-toolbar button svg.tb-icon { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .mermaid-fullscreen-overlay .fs-content { max-width: 95vw; max-height: 90vh; overflow: auto; display: flex; align-items: center; justify-content: center; }
  .mermaid-fullscreen-overlay .fs-content svg { transition: transform 0.2s ease; transform-origin: center center; }
  .footer-note { margin-top: 18px; color: var(--text-dim); font-size: 12px; text-align: center; font-family: var(--mono); }
</style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <span class="badge">${escapeHtml(label)}</span>
      <div class="title">${escapeHtml(title)}</div>
      <div class="meta">Read-only standalone export</div>
      <img src="${BRAND_IMAGE_URL}" alt="agent">
    </div>
    <div class="panel">${body}</div>
    <div class="footer-note">This export is standalone and read-only. External assets are limited to approved CDNs and the provided brand image URL.</div>
  </div>
  <script src="${MARKED_CDN_URL}"><\/script>
  <script src="${MERMAID_CDN_URL}"><\/script>
  <script>
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        darkMode: true, background: 'transparent', primaryColor: '#6db3e8',
        primaryTextColor: '#1a1a1a', primaryBorderColor: '#5a9fd4',
        lineColor: '#8892a0', secondaryColor: '#8ec8f0', tertiaryColor: '#a8d4f2',
        nodeTextColor: '#1a1a1a', nodeBorder: '#5a9fd4', mainBkg: '#6db3e8',
        clusterBkg: 'rgba(90, 159, 212, 0.12)', clusterBorder: '#5a9fd4',
        titleColor: '#e2e8f0', edgeLabelBackground: 'transparent',
        actorTextColor: '#1a1a1a', signalTextColor: '#1a1a1a',
        labelTextColor: '#1a1a1a', loopTextColor: '#1a1a1a',
        noteBkgColor: '#a8d4f2', noteTextColor: '#1a1a1a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '16px'
      },
      flowchart: { curve: 'basis', padding: 20 },
      securityLevel: 'loose'
    });
  }
  var TB_ICONS = {
    zoomIn: '<svg class="tb-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut: '<svg class="tb-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    reset: '<svg class="tb-icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    fullscreen: '<svg class="tb-icon" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    download: '<svg class="tb-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    close: '<svg class="tb-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };
  function createMermaidToolbar(wrapper, idx) {
    var currentZoom = 1;
    var toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';
    function makeBtn(iconHtml, title, onClick) {
      var btn = document.createElement('button');
      btn.innerHTML = iconHtml;
      btn.title = title;
      btn.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
      return btn;
    }
    function applyZoom(z) {
      currentZoom = Math.max(0.25, Math.min(4, z));
      var svg = wrapper.querySelector('svg');
      if (svg) svg.style.transform = 'scale(' + currentZoom + ')';
    }
    toolbar.appendChild(makeBtn(TB_ICONS.zoomIn, 'Zoom in', function() { applyZoom(currentZoom + 0.25); }));
    toolbar.appendChild(makeBtn(TB_ICONS.zoomOut, 'Zoom out', function() { applyZoom(currentZoom - 0.25); }));
    toolbar.appendChild(makeBtn(TB_ICONS.reset, 'Reset zoom', function() { applyZoom(1); }));
    toolbar.appendChild(makeBtn(TB_ICONS.fullscreen, 'Fullscreen', function() { openMermaidFullscreen(wrapper); }));
    toolbar.appendChild(makeBtn(TB_ICONS.download, 'Download SVG', function() { downloadMermaidSVG(wrapper, idx); }));
    wrapper.appendChild(toolbar);
  }
  function openMermaidFullscreen(wrapper) {
    var svg = wrapper.querySelector('svg');
    if (!svg) return;
    var overlay = document.createElement('div');
    overlay.className = 'mermaid-fullscreen-overlay';
    var fsZoom = 1;
    var fsToolbar = document.createElement('div');
    fsToolbar.className = 'fs-toolbar';
    function makeFsBtn(iconHtml, title, onClick) {
      var btn = document.createElement('button');
      btn.innerHTML = iconHtml;
      btn.title = title;
      btn.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
      return btn;
    }
    function applyFsZoom(z) {
      fsZoom = Math.max(0.25, Math.min(6, z));
      var fsSvg = overlay.querySelector('.fs-content svg');
      if (fsSvg) fsSvg.style.transform = 'scale(' + fsZoom + ')';
    }
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.zoomIn, 'Zoom in', function() { applyFsZoom(fsZoom + 0.25); }));
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.zoomOut, 'Zoom out', function() { applyFsZoom(fsZoom - 0.25); }));
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.reset, 'Reset zoom', function() { applyFsZoom(1); }));
    fsToolbar.appendChild(makeFsBtn(TB_ICONS.close, 'Close', function() { overlay.remove(); }));
    overlay.appendChild(fsToolbar);
    var content = document.createElement('div');
    content.className = 'fs-content';
    content.innerHTML = svg.outerHTML;
    overlay.appendChild(content);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); } });
    document.body.appendChild(overlay);
  }
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
  function renderMermaidDiagrams(container) {
    if (typeof mermaid === 'undefined') return;
    var codeBlocks = container.querySelectorAll('pre code.language-mermaid');
    if (codeBlocks.length === 0) return;
    var blocks = Array.from(codeBlocks);
    blocks.forEach(function(codeEl, idx) {
      var preEl = codeEl.parentElement;
      var source = codeEl.textContent || '';
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
  <\/script>
  <script>${script}</script>
</body>
</html>`;
}

export function createPlanStandaloneExport(opts: { title: string; markdown: string; mode: "plan" | "questions" }): string {
	// Escape </ sequences to prevent </script> from breaking out of the script block
	const state = JSON.stringify({ markdown: opts.markdown, mode: opts.mode }).replace(/<\//g, '<\\/');
	const body = `<div class="section"><div class="markdown-body" id="content"></div></div>`;
	const script = `
const state = ${state};
marked.setOptions({ gfm: true, breaks: true });
document.getElementById('content').innerHTML = marked.parse(state.markdown || '');
renderMermaidDiagrams(document.getElementById('content'));
document.querySelectorAll('#content input, #content textarea, #content button, #content [contenteditable="true"]').forEach(function(el) {
  el.disabled = true;
  el.setAttribute('readonly', 'readonly');
  el.setAttribute('contenteditable', 'false');
});
`;
	return baseDocument({ title: opts.title, label: opts.mode === "questions" ? "Questions" : "Plan", body, script });
}

export interface CompletionReportExportData {
	title: string;
	summary: string;
	baseRef: string;
	totalAdditions: number;
	totalDeletions: number;
	taskMarkdown?: string;
	files: Array<{
		path: string;
		status: string;
		additions: number;
		deletions: number;
		diff: string;
		oldPath?: string;
	}>;
}

export function createCompletionReportStandaloneExport(report: CompletionReportExportData): string {
	// Escape </ sequences to prevent </script> from breaking out of the script block
	const state = JSON.stringify(report).replace(/<\//g, '<\\/');
	const body = `
<div class="section">
  <div id="overview"></div>
</div>
<div class="section" id="summarySection" style="display:none;">
  <div class="section-header"><div class="section-label">Summary</div></div>
  <div class="markdown-body" id="summaryContent"></div>
</div>
<div class="section" id="tasksSection" style="display:none;">
  <div class="section-header"><div class="section-label">Tasks Completed</div></div>
  <div class="markdown-body" id="taskContent"></div>
</div>
<div class="section">
  <div class="section-header"><div class="section-label">Files Changed</div><div class="section-path" id="filesMeta"></div></div>
  <div id="filesContent"></div>
</div>`;
	const script = `
const report = ${state};
marked.setOptions({ gfm: true, breaks: true });
document.getElementById('overview').innerHTML =
  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">' +
  statCard(String(report.files.length), 'Files Changed') +
  statCard('+' + report.totalAdditions, 'Additions') +
  statCard('-' + report.totalDeletions, 'Deletions') +
  '</div>';
document.getElementById('filesMeta').textContent = 'Base ref: ' + (report.baseRef || 'HEAD');
if (report.summary && report.summary.trim()) {
  document.getElementById('summarySection').style.display = 'block';
  document.getElementById('summaryContent').innerHTML = renderMarkdownWithTables(report.summary);
  renderMermaidDiagrams(document.getElementById('summaryContent'));
}
if (report.taskMarkdown && report.taskMarkdown.trim()) {
  document.getElementById('tasksSection').style.display = 'block';
  document.getElementById('taskContent').innerHTML = renderTasks(report.taskMarkdown);
}
document.getElementById('filesContent').innerHTML = report.files.map(function(file) {
  const diff = renderDiff(file.diff || '');
  return '<section class="section" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
    '<div class="section-header">' +
      '<div class="section-label">' + escapeHtml(file.status) + '</div>' +
      '<div class="section-path">' + escapeHtml(file.path) + ' (+' + file.additions + ' / -' + file.deletions + ')</div>' +
    '</div>' + diff +
  '</section>';
}).join('');
function statCard(value, label) {
  return '<div style="background:#171a20;border:1px solid var(--border);border-radius:8px;padding:16px;">' +
    '<div style="font-size:24px;font-weight:700;color:var(--text);">' + escapeHtml(value) + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.6px;">' + escapeHtml(label) + '</div>' +
  '</div>';
}
function preprocessCheckboxMarkdown(md) {
  return String(md || '').replace(/^(\\s*- \\[[ xX]\\] )(\\d+)\\./gm, '$1$2\\\\.');
}
function renderMarkdownWithTables(md) {
  const html = marked.parse(md || '');
  return html.split('<table>').join('<div class="table-wrap"><table class="ui-table">').split('</table>').join('</table></div>');
}
function renderTasks(taskMd) {
  let html = renderMarkdownWithTables(preprocessCheckboxMarkdown(taskMd));
  html = html.replace(/<li>\\s*(?:<p>)?\\s*<input([^>]*)>\\s*([\\s\\S]*?)\\s*(?:<\\/p>)?\\s*<\\/li>/gi, function(match, attrs, text) {
    if (!/type=(?:\"|')checkbox(?:\"|')/i.test(attrs)) return match;
    text = text.replace(/^\\s+|\\s+$/g, '');
    return /checked/i.test(attrs) ? '<li>✓ ' + text + '</li>' : '<li>☐ ' + text + '</li>';
  });
  html = html.replace(/<li>\\s*(?:<p>)?\\s*\\[( |x|X)\\]\\s*([\\s\\S]*?)\\s*(?:<\\/p>)?\\s*<\\/li>/gi, function(match, check, text) {
    text = text.replace(/^\\s+|\\s+$/g, '');
    return check.toLowerCase() === 'x' ? '<li>✓ ' + text + '</li>' : '<li>☐ ' + text + '</li>';
  });
  return html;
}
function renderDiff(diff) {
  if (!diff || !diff.trim()) {
    return '<div style="padding:16px;color:var(--text-dim);font-family:var(--mono);font-size:12px;border:1px solid var(--border);border-radius:6px;">(binary file or no diff available)</div>';
  }
  const lines = diff.split('\\n');
  let html = '<table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px;border:1px solid var(--border);border-radius:6px;overflow:hidden;">';
  let oldLine = 0;
  let newLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('old mode') || line.startsWith('new mode') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('similarity') || line.startsWith('rename') || line.startsWith('Binary files')) continue;
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\\d+)(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@(.*)/);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
      }
      html += '<tr><td colspan="3" style="padding:6px 10px;background:rgba(41,128,185,0.14);color:var(--accent);border-top:1px solid var(--border);">' + escapeHtml(line) + '</td></tr>';
      continue;
    }
    if (line.startsWith('+')) {
      html += row('', String(newLine++), line.substring(1), 'rgba(72,216,137,0.12)');
      continue;
    }
    if (line.startsWith('-')) {
      html += row(String(oldLine++), '', line.substring(1), 'rgba(232,88,88,0.12)');
      continue;
    }
    if (line.startsWith(' ') || line === '') {
      html += row(String(oldLine++), String(newLine++), line.substring(1) || '', 'transparent');
      continue;
    }
    if (line.startsWith('\\\\')) {
      html += '<tr><td></td><td></td><td style="padding:4px 8px;color:var(--text-dim);font-style:italic;">' + escapeHtml(line) + '</td></tr>';
    }
  }
  return html + '</table>';
}
function row(oldNum, newNum, content, bg) {
  return '<tr style="background:' + bg + ';">' +
    '<td style="width:56px;padding:4px 8px;border-top:1px solid var(--border);color:var(--text-dim);text-align:right;">' + escapeHtml(oldNum) + '</td>' +
    '<td style="width:56px;padding:4px 8px;border-top:1px solid var(--border);color:var(--text-dim);text-align:right;">' + escapeHtml(newNum) + '</td>' +
    '<td style="padding:4px 8px;border-top:1px solid var(--border);white-space:pre-wrap;word-break:break-word;">' + escapeHtml(content) + '</td>' +
  '</tr>';
}
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }
`;
	return baseDocument({ title: report.title, label: "Report", body, script });
}

export interface SpecExportDocument {
	label: string;
	filePath: string;
	markdown?: string;
	isVisuals?: boolean;
	visuals?: Array<{ filePath: string; mimeType: string; content: string }>;
}

export function createSpecStandaloneExport(opts: { title: string; documents: SpecExportDocument[] }): string {
	// Escape </ sequences to prevent </script> from breaking out of the script block
	const docs = JSON.stringify(opts.documents).replace(/<\//g, '<\\/');
	const body = `<div id="specContent"></div>`;
	const script = `
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
const docs = ${docs};
marked.setOptions({ gfm: true, breaks: true });
const root = document.getElementById('specContent');
root.innerHTML = docs.map(function(doc) {
  if (doc.isVisuals) {
    const visuals = (doc.visuals || []).map(function(visual) {
      if ((visual.mimeType || '').includes('html')) {
        return '<div class="visual-card"><div class="visual-label">' + escapeHtml(visual.filePath) + '</div><iframe sandbox srcdoc="' + escapeAttr(visual.content) + '"></iframe></div>';
      }
      return '<div class="visual-card"><div class="visual-label">' + escapeHtml(visual.filePath) + '</div><img src="data:' + visual.mimeType + ';base64,' + visual.content + '" alt="' + escapeAttr(visual.filePath) + '"></div>';
    }).join('');
    return '<section class="section"><div class="section-header"><div class="section-label">' + escapeHtml(doc.label) + '</div><div class="section-path">' + escapeHtml(doc.filePath) + '</div></div><div class="visual-grid">' + visuals + '</div></section>';
  }
  return '<section class="section"><div class="section-header"><div class="section-label">' + escapeHtml(doc.label) + '</div><div class="section-path">' + escapeHtml(doc.filePath) + '</div></div><div class="markdown-body">' + marked.parse(doc.markdown || '') + '</div></section>';
}).join('');
renderMermaidDiagrams(root);
`;
	return baseDocument({ title: opts.title, label: "Spec", body, script });
}

export function saveStandaloneExport(opts: { filePrefix: string; html: string }): { filePath: string; fileName: string } {
	const desktop = ensureDesktop();
	const fileName = `${opts.filePrefix}-${timestampForFileName()}.html`;
	const filePath = join(desktop, fileName);
	writeFileSync(filePath, opts.html, "utf-8");
	return { filePath, fileName };
}

export function loadVisualAsExportAsset(baseFolder: string, relPath: string): { filePath: string; mimeType: string; content: string } {
	const absPath = resolve(baseFolder, relPath);
	const data = readFileSync(absPath);
	const ext = basename(relPath).toLowerCase();
	let mimeType = "application/octet-stream";
	if (ext.endsWith('.png')) mimeType = 'image/png';
	else if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
	else if (ext.endsWith('.gif')) mimeType = 'image/gif';
	else if (ext.endsWith('.webp')) mimeType = 'image/webp';
	else if (ext.endsWith('.svg')) mimeType = 'image/svg+xml';
	else if (ext.endsWith('.html') || ext.endsWith('.htm')) mimeType = 'text/html';
	return {
		filePath: relPath,
		mimeType,
		content: mimeType === 'text/html' ? data.toString('utf-8') : data.toString('base64'),
	};
}
