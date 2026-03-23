// ABOUTME: Self-contained HTML template for the PR Review Request viewer.
// ABOUTME: Multi-URL form with per-URL validation badges, access-check states, login-required flow, and retry.

export interface UrlStatusEntry {
	url: string;
	status: "pending" | "checking" | "accessible" | "login_required" | "needs_browser_verification" | "failed";
	title?: string;
	reason?: string;
}

export function generatePrReviewViewerHTML(opts: {
	title: string;
	initialUrls: string[];
	urlStatuses?: UrlStatusEntry[];
	port: number;
}): string {
	const escaped = JSON.stringify({
		title: opts.title,
		initialUrls: opts.initialUrls,
		urlStatuses: opts.urlStatuses || [],
		port: opts.port,
	}).replace(/<\//g, "<\\/");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title} — PR Review</title>
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
    --success: #48d889;
    --warning: #f0b429;
    --error: #e85858;
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
    justify-content: center;
    padding: 32px 16px;
  }

  .shell { max-width: 960px; width: 100%; }

  /* ── Header ──────────────────────────── */
  .header {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
  }
  .header .badge {
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
  .header .title { font-size: 16px; font-weight: 600; flex: 1; }

  /* ── Card ─────────────────────────────── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 16px;
  }
  .card h2 {
    font-size: 13px;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-family: var(--mono);
    font-weight: 700;
    margin-bottom: 12px;
  }
  .hint {
    color: var(--text-muted);
    font-size: 13px;
    margin-bottom: 12px;
  }

  /* ── Textarea ────────────────────────── */
  textarea {
    width: 100%;
    min-height: 140px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    font-family: var(--mono);
    font-size: 13px;
    resize: vertical;
    line-height: 1.7;
  }
  textarea:focus { outline: none; border-color: var(--accent); }

  /* ── URL Status List ─────────────────── */
  .url-list { margin-top: 16px; }
  .url-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 6px;
    font-family: var(--mono);
    font-size: 12px;
  }
  .url-row .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .url-row .status-dot.pending { background: var(--text-dim); }
  .url-row .status-dot.checking { background: var(--warning); animation: pulse 1s infinite; }
  .url-row .status-dot.accessible { background: var(--success); }
  .url-row .status-dot.login_required { background: var(--warning); }
  .url-row .status-dot.needs_browser_verification { background: var(--accent, #6c63ff); }
  .url-row .status-dot.failed { background: var(--error); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .url-row .url-text { flex: 1; word-break: break-all; color: var(--text-muted); }
  .url-row .status-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .url-row .status-label.pending { color: var(--text-dim); border: 1px solid var(--text-dim); }
  .url-row .status-label.checking { color: var(--warning); border: 1px solid var(--warning); }
  .url-row .status-label.accessible { color: var(--success); border: 1px solid var(--success); }
  .url-row .status-label.login_required { color: var(--warning); border: 1px solid var(--warning); }
  .url-row .status-label.needs_browser_verification { color: var(--accent, #6c63ff); border: 1px solid var(--accent, #6c63ff); }
  .url-row .status-label.failed { color: var(--error); border: 1px solid var(--error); }
  .url-row .page-title { color: var(--text-dim); font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Login Banner ────────────────────── */
  .login-banner {
    background: rgba(240, 180, 41, 0.08);
    border: 1px solid var(--warning);
    border-radius: 6px;
    padding: 14px 18px;
    margin-top: 16px;
    display: none;
  }
  .login-banner.visible { display: block; }
  .login-banner h3 { color: var(--warning); font-size: 14px; margin-bottom: 6px; }
  .login-banner p { color: var(--text-muted); font-size: 13px; }

  /* ── Buttons ─────────────────────────── */
  .actions { display: flex; gap: 10px; margin-top: 18px; }
  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    font-family: var(--font);
    transition: background 0.15s;
  }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-secondary { background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }
  .btn-secondary:hover { background: var(--border); }

  /* ── Stats row ───────────────────────── */
  .stats {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text-muted);
  }
  .stats .ok { color: var(--success); }
  .stats .warn { color: var(--warning); }
  .stats .err { color: var(--error); }
</style>
</head>
<body>
<div class="shell">
  <div class="header">
    <span class="badge">PR Review</span>
    <span class="title" id="headerTitle"></span>
  </div>

  <!-- Step 1: URL Entry -->
  <div class="card" id="entryCard">
    <h2>Pull Request URLs</h2>
    <p class="hint">Enter one or more Bitbucket PR URLs, one per line. They will be verified for access before review begins.</p>
    <textarea id="urlInput" placeholder="https://bitbucket.org/workspace/repo/pull-requests/123&#10;https://bitbucket.org/workspace/repo/pull-requests/456"></textarea>
    <div class="actions">
      <button class="btn btn-primary" id="verifyBtn">Verify Access</button>
    </div>
  </div>

  <!-- Step 2: Access Verification -->
  <div class="card" id="statusCard" style="display:none;">
    <h2>Access Verification</h2>
    <div class="url-list" id="urlList"></div>
    <div class="stats" id="statsRow"></div>
    <div class="login-banner" id="loginBanner">
      <h3>⚠ Login Required</h3>
      <p>One or more URLs need authentication. Please log in to Bitbucket in your browser, then click <strong>Re-check</strong>.</p>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" id="backBtn">← Edit URLs</button>
      <button class="btn btn-secondary" id="recheckBtn" style="display:none;">Re-check Access</button>
      <button class="btn btn-primary" id="startReviewBtn" disabled>Start Review</button>
    </div>
  </div>
</div>

<script>
const config = ${escaped};
const PORT = config.port;

// ── State ────────────────────────────────
let urls = [];
let statuses = {}; // url -> {status, title, reason}

document.getElementById('headerTitle').textContent = config.title;

// Pre-fill
if (config.initialUrls.length) {
  document.getElementById('urlInput').value = config.initialUrls.join('\\n');
}
if (config.urlStatuses.length) {
  config.urlStatuses.forEach(s => { statuses[s.url] = s; });
  urls = config.urlStatuses.map(s => s.url);
  showStatusCard();
}

// ── Parse URLs ───────────────────────────
function parseUrls() {
  return document.getElementById('urlInput').value
    .split(/\\n/)
    .map(u => u.trim())
    .filter(u => u.length > 0 && u.startsWith('http'));
}

// ── Render URL list ──────────────────────
function renderUrlList() {
  const list = document.getElementById('urlList');
  list.innerHTML = urls.map(u => {
    const s = statuses[u] || { status: 'pending' };
    const labels = { pending: 'Pending', checking: 'Checking…', accessible: 'Accessible', login_required: 'Login Required', needs_browser_verification: 'Verify in Browser', failed: 'Failed' };
    return '<div class="url-row">' +
      '<div class="status-dot ' + s.status + '"></div>' +
      '<span class="url-text">' + escapeHtml(u) + '</span>' +
      (s.title ? '<span class="page-title">' + escapeHtml(s.title) + '</span>' : '') +
      '<span class="status-label ' + s.status + '">' + (labels[s.status] || s.status) + '</span>' +
      '</div>';
  }).join('');

  // Stats
  const counts = { accessible: 0, login_required: 0, needs_browser_verification: 0, failed: 0, pending: 0, checking: 0 };
  urls.forEach(u => { const s = (statuses[u] || {}).status || 'pending'; counts[s] = (counts[s] || 0) + 1; });
  document.getElementById('statsRow').innerHTML =
    '<span class="ok">' + counts.accessible + ' accessible</span>' +
    (counts.needs_browser_verification > 0 ? '<span style="color:var(--accent,#6c63ff)">' + counts.needs_browser_verification + ' verify in browser</span>' : '') +
    '<span class="warn">' + counts.login_required + ' login required</span>' +
    '<span class="err">' + counts.failed + ' failed</span>' +
    '<span>' + counts.pending + ' pending</span>';

  // Login banner
  const needsLogin = counts.login_required > 0;
  document.getElementById('loginBanner').classList.toggle('visible', needsLogin);
  document.getElementById('recheckBtn').style.display = needsLogin ? 'inline-block' : 'none';

  // Enable start if at least one accessible or needs_browser_verification
  // (needs_browser_verification URLs will be verified via Chrome DevTools MCP during review)
  document.getElementById('startReviewBtn').disabled = (counts.accessible + counts.needs_browser_verification) === 0;
}

function showStatusCard() {
  document.getElementById('entryCard').style.display = 'none';
  document.getElementById('statusCard').style.display = 'block';
  renderUrlList();
}

function showEntryCard() {
  document.getElementById('statusCard').style.display = 'none';
  document.getElementById('entryCard').style.display = 'block';
}

// ── Verify button ────────────────────────
document.getElementById('verifyBtn').addEventListener('click', async () => {
  urls = parseUrls();
  if (!urls.length) return;
  urls.forEach(u => { statuses[u] = { url: u, status: 'checking' }; });
  showStatusCard();

  // Ask the backend to verify
  try {
    const resp = await fetch('http://127.0.0.1:' + PORT + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    const data = await resp.json();
    if (data.results) {
      data.results.forEach(r => { statuses[r.url] = r; });
    }
  } catch (e) {
    urls.forEach(u => { statuses[u] = { url: u, status: 'failed', reason: 'Verification request failed' }; });
  }
  renderUrlList();
});

// ── Re-check button ──────────────────────
document.getElementById('recheckBtn').addEventListener('click', async () => {
  const loginUrls = urls.filter(u => (statuses[u] || {}).status === 'login_required');
  loginUrls.forEach(u => { statuses[u] = { url: u, status: 'checking' }; });
  renderUrlList();
  try {
    const resp = await fetch('http://127.0.0.1:' + PORT + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: loginUrls }),
    });
    const data = await resp.json();
    if (data.results) {
      data.results.forEach(r => { statuses[r.url] = r; });
    }
  } catch (e) {
    loginUrls.forEach(u => { statuses[u] = { url: u, status: 'failed', reason: 'Re-check failed' }; });
  }
  renderUrlList();
});

// ── Back button ──────────────────────────
document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('urlInput').value = urls.join('\\n');
  showEntryCard();
});

// ── Start Review button ──────────────────
document.getElementById('startReviewBtn').addEventListener('click', async () => {
  // Include both accessible and needs_browser_verification URLs
  // (needs_browser_verification will be verified via Chrome DevTools MCP during actual review)
  const reviewableUrls = urls.filter(u => {
    const s = (statuses[u] || {}).status;
    return s === 'accessible' || s === 'needs_browser_verification';
  });
  const allStatuses = urls.map(u => statuses[u] || { url: u, status: 'pending' });
  await fetch('http://127.0.0.1:' + PORT + '/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start_review', urls: reviewableUrls, allStatuses }),
  });
});

function escapeHtml(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
<\/script>
</body>
</html>`;
}
