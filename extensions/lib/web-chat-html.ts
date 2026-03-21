// ABOUTME: Self-contained HTML template for the web chat interface.
// ABOUTME: Mobile-first responsive design with SSE streaming, PIN auth, dark blue theme, full-width.

export function generateWebChatHTML(opts: { port: number; logoDataUri?: string }): string {
	const logo = opts.logoDataUri || "";
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1a1d23">
<title>Pi Agent</title>
<style>
  :root {
    --bg: #1a1d23;
    --surface: #1e2228;
    --surface2: #252a32;
    --surface3: #2e343e;
    --border: #2e343e;
    --border-light: #3a424e;
    --text: #e2e8f0;
    --text-muted: #8892a0;
    --text-dim: #555d6e;
    --accent: #2980b9;
    --accent-hover: #3a9ad5;
    --accent-glow: rgba(41, 128, 185, 0.15);
    --accent-dim: rgba(41, 128, 185, 0.12);
    --accent-dark: #1c4f73;
    --accent-border: #2674a8;
    --success: #48d889;
    --success-bg: rgba(72, 216, 137, 0.08);
    --warning: #f0b429;
    --warning-bg: rgba(240, 180, 41, 0.08);
    --error: #e85858;
    --error-bg: rgba(232, 88, 88, 0.08);
    --tool-bg: rgba(41, 128, 185, 0.06);
    --tool-border: rgba(41, 128, 185, 0.18);
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
    --radius: 6px;
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-top: env(safe-area-inset-top, 0px);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    height: 100%; background: var(--bg); color: var(--text);
    font-family: var(--font); font-size: 15px; line-height: 1.65;
    -webkit-font-smoothing: antialiased; overscroll-behavior: none;
  }

  /* ── App Layout ───────────────────────────────────── */
  #app {
    display: flex; flex-direction: column;
    height: 100%; height: 100dvh;
    width: 100%;
  }

  /* ── PIN Screen ───────────────────────────────────── */
  #pin-screen {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100%; gap: 24px; padding: 24px;
  }
  #pin-screen.hidden { display: none; }
  .pin-logo { height: 48px; opacity: 0.9; }
  .pin-title { font-size: 18px; font-weight: 600; color: var(--text); }
  .pin-subtitle { font-size: 14px; color: var(--text-muted); text-align: center; }
  .pin-input-row { display: flex; gap: 8px; }
  .pin-digit {
    width: 44px; height: 54px; border-radius: var(--radius);
    background: var(--surface2); border: 2px solid var(--border);
    color: var(--text); font-size: 22px; font-weight: 600;
    text-align: center; outline: none; font-family: var(--mono);
    transition: border-color 0.2s;
    -webkit-appearance: none;
  }
  .pin-digit:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
  .pin-error {
    font-size: 13px; color: var(--error); min-height: 20px;
    transition: opacity 0.2s;
  }

  /* ── Chat Screen ──────────────────────────────────── */
  #chat-screen { display: none; flex-direction: column; height: 100%; width: 100%; }
  #chat-screen.visible { display: flex; }

  /* ── Header ───────────────────────────────────────── */
  #header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; padding-top: calc(14px + var(--safe-top));
    background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--accent); border-radius: var(--radius);
    margin: 12px 16px 0; flex-shrink: 0; z-index: 10; gap: 14px;
  }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header-logo { height: 20px; opacity: 0.6; image-rendering: pixelated; }
  .header-right { display: flex; align-items: center; gap: 8px; }

  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--success); transition: background 0.3s;
  }
  .status-dot.disconnected { background: var(--error); }
  .status-dot.busy { background: var(--warning); animation: pulse 1.2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .header-btn {
    background: var(--surface2); border: 1px solid var(--border);
    color: var(--text-muted); font-size: 13px; font-weight: 500;
    padding: 7px 18px; border-radius: 4px; cursor: pointer;
    transition: all 0.15s; font-family: var(--font);
  }
  .header-btn:hover { background: var(--border); color: var(--text); }
  .header-btn:active { transform: scale(0.97); }
  .header-btn-shutdown { color: var(--error); border-color: rgba(232,88,88,0.3); padding: 7px 10px; }
  .header-btn-shutdown:hover { background: var(--error-bg); color: var(--error); border-color: var(--error); }

  .relay-badge {
    padding: 3px 10px; border-radius: 6px;
    background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3);
    color: var(--blue-bright); font-size: 11px; font-weight: 600;
    font-family: var(--mono); letter-spacing: 0.5px;
  }

  /* ── Messages ─────────────────────────────────────── */
  #messages {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    padding: 16px; scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch; width: 100%;
  }
  #messages::-webkit-scrollbar { width: 4px; }
  #messages::-webkit-scrollbar-track { background: transparent; }
  #messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .message { margin-bottom: 16px; animation: fadeIn 0.2s ease; width: 100%; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  .message-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; margin-bottom: 4px; padding-left: 2px;
  }
  .message-label.user-label { color: var(--accent-hover); }
  .message-label.assistant-label { color: var(--success); }

  .message-bubble {
    padding: 12px 16px; border-radius: var(--radius);
    border: 1px solid; word-wrap: break-word; overflow-wrap: anywhere;
    width: 100%;
  }
  .user-bubble { background: var(--accent-dim); border-color: var(--accent-border); }
  .assistant-bubble { background: var(--surface); border-color: var(--border); }

  .message-time {
    font-size: 11px; color: var(--text-dim); margin-top: 4px; padding-left: 2px;
  }

  /* ── Tool indicator ───────────────────────────────── */
  .tool-indicator {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; margin: 4px 0;
    background: var(--tool-bg); border: 1px solid var(--tool-border);
    border-radius: 4px; font-size: 12px; color: var(--accent);
    font-family: var(--mono);
  }
  .tool-spinner {
    width: 12px; height: 12px;
    border: 2px solid var(--tool-border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Thinking dots ────────────────────────────────── */
  .thinking {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px; color: var(--text-muted); font-size: 14px;
    animation: fadeIn 0.2s ease;
  }
  .thinking-dots { display: flex; gap: 4px; }
  .thinking-dots span {
    width: 6px; height: 6px; background: var(--text-muted);
    border-radius: 50%; animation: bounce 1.4s infinite;
  }
  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }

  /* ── Welcome ──────────────────────────────────────── */
  .welcome {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100%; gap: 16px;
    color: var(--text-muted); text-align: center; padding: 20px;
  }
  .welcome-logo { height: 56px; opacity: 0.2; margin-bottom: 8px; }
  .welcome h2 { color: var(--text); font-size: 20px; font-weight: 600; }
  .welcome p { font-size: 14px; max-width: 320px; line-height: 1.6; }
  .welcome-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
  .suggestion {
    padding: 8px 14px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 4px;
    font-size: 13px; color: var(--text-muted); cursor: pointer;
    transition: all 0.15s;
  }
  .suggestion:hover { background: var(--surface2); color: var(--text); border-color: var(--accent); }
  .suggestion:active { transform: scale(0.97); }

  /* ── Input ────────────────────────────────────────── */
  #input-area {
    padding: 12px 16px; padding-bottom: calc(12px + var(--safe-bottom));
    background: var(--bg); border-top: 1px solid var(--border);
    flex-shrink: 0; width: 100%; position: relative;
  }
  #input-wrapper {
    display: flex; align-items: flex-end; gap: 8px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 4px; transition: border-color 0.2s;
    width: 100%;
  }
  #input-wrapper:focus-within { border-color: var(--accent); }
  #message-input {
    flex: 1; background: transparent; border: none; color: var(--text);
    font-family: var(--font); font-size: 16px; line-height: 1.5;
    padding: 8px 12px; resize: none; outline: none;
    max-height: 120px; min-height: 24px;
  }
  #message-input::placeholder { color: var(--text-dim); }
  #send-btn {
    width: 36px; height: 36px; border-radius: 4px;
    background: transparent; border: 1px solid var(--accent);
    color: var(--accent); font-size: 18px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0; font-weight: 600;
  }
  #send-btn:hover { background: var(--accent-dim); color: var(--accent-hover); }
  #send-btn:active { transform: scale(0.93); }
  #send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  /* ── Markdown in assistant bubbles ────────────────── */
  .assistant-bubble p { margin: 0.4em 0; }
  .assistant-bubble p:first-child { margin-top: 0; }
  .assistant-bubble p:last-child { margin-bottom: 0; }
  .assistant-bubble strong { color: #fff; font-weight: 600; }
  .assistant-bubble em { color: var(--text-muted); }
  .assistant-bubble code {
    background: rgba(255,255,255,0.06); padding: 2px 6px;
    border-radius: 3px; font-family: var(--mono); font-size: 0.88em;
    color: var(--accent-hover);
  }
  .assistant-bubble pre {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px; margin: 8px 0;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
  }
  .assistant-bubble pre code {
    background: none; padding: 0; color: var(--text); font-size: 13px; line-height: 1.5;
  }
  .assistant-bubble ul, .assistant-bubble ol { padding-left: 1.5em; margin: 0.4em 0; }
  .assistant-bubble li { margin: 0.2em 0; }
  .assistant-bubble blockquote {
    border-left: 3px solid var(--accent); padding-left: 12px;
    margin: 8px 0; color: var(--text-muted);
  }
  .assistant-bubble h1, .assistant-bubble h2, .assistant-bubble h3,
  .assistant-bubble h4, .assistant-bubble h5, .assistant-bubble h6 {
    color: #fff; margin: 0.8em 0 0.4em; font-weight: 600;
  }
  .assistant-bubble h1 { font-size: 1.3em; }
  .assistant-bubble h2 { font-size: 1.15em; }
  .assistant-bubble h3 { font-size: 1.05em; }
  .assistant-bubble a { color: var(--accent-hover); text-decoration: none; }
  .assistant-bubble a:hover { text-decoration: underline; }
  .assistant-bubble hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
  .assistant-bubble table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 14px; }
  .assistant-bubble th, .assistant-bubble td {
    border: 1px solid var(--border); padding: 6px 10px; text-align: left;
  }
  .assistant-bubble th { background: var(--surface3); color: #fff; font-weight: 600; }

  .cursor {
    display: inline-block; width: 2px; height: 1em;
    background: var(--accent); margin-left: 2px; vertical-align: text-bottom;
    animation: blink 1s step-end infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }

  .connection-banner {
    padding: 8px 16px; background: var(--error-bg);
    border: 1px solid rgba(232,88,88,0.2); border-radius: var(--radius);
    margin: 8px 16px 0;
    color: var(--error); font-size: 13px; text-align: center; display: none;
  }
  .connection-banner.visible { display: block; }

  /* Directory picker removed — relay mode uses main session's cwd */

  /* ── Slash Command Menu ───────────────────────────── */
  #slash-menu {
    display: none; position: absolute; bottom: 100%; left: 0; right: 0;
    max-height: 260px; overflow-y: auto; background: var(--surface);
    border: 1px solid var(--border); border-bottom: none;
    border-radius: 6px 6px 0 0;
    z-index: 50; margin-bottom: 0;
    -webkit-overflow-scrolling: touch;
  }
  #slash-menu.visible { display: block; }
  #slash-menu::-webkit-scrollbar { width: 4px; }
  #slash-menu::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  .slash-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; cursor: pointer; transition: background 0.1s;
  }
  .slash-item:hover, .slash-item.selected { background: var(--surface2); }
  .slash-item-name {
    font-family: var(--mono); font-size: 13px; font-weight: 600;
    color: var(--accent); white-space: nowrap;
  }
  .slash-item-desc {
    font-size: 13px; color: var(--text-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Mode Bar ─────────────────────────────────────── */
  /* ── View Tabs ─────────────────────────────────────── */
  #view-tabs {
    display: flex; gap: 0; flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .view-tab {
    flex: 1; padding: 8px 0; border: none; background: none;
    color: var(--text-muted); font-size: 13px; font-weight: 600;
    font-family: var(--font); cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .view-tab:hover { color: var(--text); }
  .view-tab.active { color: var(--blue-bright); border-bottom-color: var(--blue); }

  /* ── Terminal View ────────────────────────────────── */
  #terminal-view {
    display: none; flex: 1; overflow-y: auto;
    padding: 12px 16px; background: #050810;
  }
  #terminal-view.visible { display: block; }
  #terminal-output {
    font-family: var(--mono); font-size: 12px; line-height: 1.6;
    color: var(--text-muted); white-space: pre-wrap; word-break: break-all;
    margin: 0;
  }
  #terminal-output .t-tool { color: var(--blue-bright); }
  #terminal-output .t-done { color: var(--success); }
  #terminal-output .t-error { color: var(--error); }
  #terminal-output .t-event { color: var(--text-dim); }
  #terminal-output .t-input { color: var(--accent); }
  #terminal-output .t-think { color: var(--text-muted); font-style: italic; }
  #terminal-output:empty::before {
    content: 'Activity feed — shows tool calls, thinking, and session events';
    color: var(--text-dim); font-style: italic; opacity: 0.6;
  }

  #mode-bar {
    display: none; padding: 4px 16px;
    margin: 8px 16px 0; border-radius: var(--radius);
    background: var(--accent-dim); border: 1px solid var(--accent);
    color: var(--accent-hover); font-size: 11px; font-weight: 700;
    letter-spacing: 1px; text-transform: uppercase;
    text-align: left; flex-shrink: 0; font-family: var(--mono);
    transition: opacity 0.15s;
  }
  #mode-bar.visible { display: block; }
  .mode-hint {
    font-weight: 400; opacity: 0.7; font-size: 11px; margin-left: 8px;
  }
</style>
</head>
<body>

<div id="app">
  <!-- PIN Auth Screen -->
  <div id="pin-screen">
    ${logo ? '<img src="' + logo + '" class="pin-logo" alt="Pi">' : ''}
    <div class="pin-title">Enter PIN</div>
    <div class="pin-subtitle">Check your terminal for the 6-digit PIN</div>
    <div class="pin-input-row">
      <input type="tel" class="pin-digit" id="p1" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="tel" class="pin-digit" id="p2" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="tel" class="pin-digit" id="p3" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="tel" class="pin-digit" id="p4" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="tel" class="pin-digit" id="p5" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="tel" class="pin-digit" id="p6" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
    </div>
    <div class="pin-error" id="pin-error"></div>
  </div>

  <!-- Chat Screen (hidden until auth) -->
  <div id="chat-screen">
    <div id="header">
      <div class="header-left">
        ${logo ? '<img src="' + logo + '" class="header-logo" alt="Pi">' : '<span style="font-size:20px;font-weight:700">π</span>'}
      </div>
      <div class="header-right">
        <span class="relay-badge" title="Connected to main Pi session">⚡ relay</span>
        <div class="status-dot" id="status-dot" title="Connected"></div>
        <button class="header-btn" onclick="resetChat()" title="New conversation">New</button>
        <button class="header-btn header-btn-shutdown" onclick="shutdownChat()" title="Stop server &amp; disconnect">✕</button>
      </div>
    </div>

    <div id="view-tabs">
      <button class="view-tab active" id="tab-chat" onclick="switchView('chat')">Chat</button>
      <button class="view-tab" id="tab-terminal" onclick="switchView('terminal')">Terminal</button>
    </div>

    <div id="mode-bar"></div>
    <div class="connection-banner" id="conn-banner">Connection lost. Reconnecting...</div>

    <div id="terminal-view">
      <pre id="terminal-output"></pre>
    </div>

    <div id="messages">
      <div class="welcome" id="welcome">
        ${logo ? '<img src="' + logo + '" class="welcome-logo" alt="Pi">' : ''}
        <div class="welcome-suggestions">
          <div class="suggestion" onclick="sendSuggestion('What files are in the current directory?')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>List files</div>
          <div class="suggestion" onclick="sendSuggestion('What is the current git status?')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>Git status</div>
          <div class="suggestion" onclick="sendSuggestion('Give me a summary of this project')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Summary</div>
        </div>
      </div>
    </div>

    <div id="input-area">
      <div id="slash-menu"></div>
      <div id="input-wrapper">
        <textarea id="message-input" placeholder="Message Pi agent..." rows="1"
          autocomplete="off" autocorrect="on" spellcheck="true"></textarea>
        <button id="send-btn" onclick="sendMessage()" title="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
      </div>
    </div>
  </div>
</div>

<!-- Directory picker removed — relay mode uses main session's cwd -->

<script>
(function() {
  // ── Auth state ──────────────────────────────────────
  let authToken = null;
  const pinScreen = document.getElementById('pin-screen');
  const chatScreen = document.getElementById('chat-screen');
  const pinError = document.getElementById('pin-error');
  const pinInputs = [document.getElementById('p1'), document.getElementById('p2'),
                     document.getElementById('p3'), document.getElementById('p4'),
                     document.getElementById('p5'), document.getElementById('p6')];

  // Check for saved token
  const saved = document.cookie.match(/pi_token=([^;]+)/);
  if (saved) {
    authToken = saved[1];
    showChat();
  } else {
    pinInputs[0].focus();
  }

  // PIN input auto-advance
  pinInputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (inp.value && i < 5) pinInputs[i + 1].focus();
      // Auto-submit when all 6 filled
      if (i === 5 && inp.value) {
        const pin = pinInputs.map(p => p.value).join('');
        if (pin.length === 6) submitPIN(pin);
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) {
        pinInputs[i - 1].focus();
        pinInputs[i - 1].value = '';
      }
    });
    // Handle paste
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      for (let j = 0; j < 4 && j < text.length; j++) {
        pinInputs[j].value = text[j];
      }
      if (text.length >= 4) submitPIN(text.slice(0, 4));
      else if (text.length > 0) pinInputs[Math.min(text.length, 3)].focus();
    });
  });

  async function submitPIN(pin) {
    try {
      const res = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        authToken = data.token;
        showChat();
      } else {
        pinError.textContent = 'Wrong PIN. Try again.';
        pinInputs.forEach(p => { p.value = ''; });
        pinInputs[0].focus();
        setTimeout(() => { pinError.textContent = ''; }, 3000);
      }
    } catch {
      pinError.textContent = 'Connection error.';
    }
  }

  function showChat() {
    pinScreen.classList.add('hidden');
    chatScreen.classList.add('visible');
    connectSSE();
    inputEl.focus();
  }

  // ── Fetch helper (adds auth token) ──────────────────
  function authedFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (authToken) {
      // Token is in cookie (HttpOnly), but also send as query param fallback
      const sep = url.includes('?') ? '&' : '?';
      url = url + sep + 'token=' + encodeURIComponent(authToken);
    }
    return fetch(url, opts);
  }

  // ── Chat state ──────────────────────────────────────
  let eventSource = null;
  let connected = false;
  let busy = false;
  let currentStreamBubble = null;
  let currentStreamText = '';
  let reconnectTimer = null;
  let reconnectDelay = 1000;

  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const statusDot = document.getElementById('status-dot');
  const connBanner = document.getElementById('conn-banner');
  const welcomeEl = document.getElementById('welcome');
  const terminalView = document.getElementById('terminal-view');
  const terminalOutput = document.getElementById('terminal-output');
  const tabChat = document.getElementById('tab-chat');
  const tabTerminal = document.getElementById('tab-terminal');
  const inputArea = document.getElementById('input-area');
  let currentView = 'chat';

  window.switchView = function(view) {
    currentView = view;
    tabChat.classList.toggle('active', view === 'chat');
    tabTerminal.classList.toggle('active', view === 'terminal');
    messagesEl.style.display = view === 'chat' ? '' : 'none';
    inputArea.style.display = view === 'chat' ? '' : 'none';
    terminalView.classList.toggle('visible', view === 'terminal');
    if (view === 'terminal') {
      terminalView.scrollTop = terminalView.scrollHeight;
    }
  };

  function appendTerminalLine(line) {
    const span = document.createElement('div');
    if (line.startsWith('[tool]')) span.className = 't-tool';
    else if (line.startsWith('[ok]')) span.className = 't-done';
    else if (line.startsWith('[err]')) span.className = 't-error';
    else if (line.startsWith('[phone]') || line.startsWith('[term]')) span.className = 't-input';
    else if (line.startsWith('[think]')) span.className = 't-think';
    else if (line.startsWith('[done]')) span.className = 't-done';
    else if (line.startsWith('[start]')) span.className = 't-event';
    else if (line.startsWith('[agent]')) span.className = 't-tool';
    else span.className = 't-event';
    span.textContent = line;
    terminalOutput.appendChild(span);
    if (currentView === 'terminal') {
      terminalView.scrollTop = terminalView.scrollHeight;
    }
  }

  // ── Slash Command Menu ───────────────────────────────
  const SLASH_COMMANDS = [
    { name: 'mode', desc: 'Set operational mode' },
    { name: 'thinking', desc: 'Set thinking level' },
    { name: 'plan', desc: 'Open plan viewer' },
    { name: 'report', desc: 'Show completion report' },
    { name: 'board', desc: 'Open task board' },
    { name: 'chat', desc: 'Manage web chat' },
    { name: 'cycle', desc: 'Cycle memory context' },
    { name: 'tasks', desc: 'Manage task list' },
    { name: 'research', desc: 'Browse research sessions' },
    { name: 'cleanup', desc: 'Disk cleanup viewer' },
    { name: 'sounds', desc: 'Sound configuration' },
    { name: 'theme', desc: 'Cycle color theme' },
    { name: 'secure', desc: 'Security status' },
    { name: 'agents-team', desc: 'Manage agent team' },
    { name: 'chain', desc: 'Run agent chain' },
    { name: 'pipeline', desc: 'Pipeline orchestration' },
    { name: 'spec', desc: 'Open spec viewer' },
    { name: 'reports', desc: 'Browse saved reports' },
    { name: 'replay', desc: 'Session replay' },
    { name: 'sub', desc: 'Spawn subagent' },
  ];
  const slashMenu = document.getElementById('slash-menu');
  let slashSelectedIdx = -1;
  let slashFiltered = [];

  function showSlashMenu(filter) {
    const q = filter.toLowerCase();
    slashFiltered = q ? SLASH_COMMANDS.filter(c => c.name.startsWith(q)) : SLASH_COMMANDS.slice();
    if (!slashFiltered.length) { hideSlashMenu(); return; }
    slashSelectedIdx = 0;
    slashMenu.innerHTML = slashFiltered.map((c, i) =>
      '<div class="slash-item' + (i === 0 ? ' selected' : '') + '" data-idx="' + i + '">' +
      '<span class="slash-item-name">/' + c.name + '</span>' +
      '<span class="slash-item-desc">' + c.desc + '</span></div>'
    ).join('');
    slashMenu.classList.add('visible');
    // Event delegation for clicks
    slashMenu.querySelectorAll('.slash-item').forEach(el => {
      el.addEventListener('click', () => { selectSlashItem(parseInt(el.dataset.idx)); });
    });
  }

  function hideSlashMenu() {
    slashMenu.classList.remove('visible');
    slashMenu.innerHTML = '';
    slashSelectedIdx = -1;
    slashFiltered = [];
  }

  function selectSlashItem(idx) {
    if (idx < 0 || idx >= slashFiltered.length) return;
    const cmd = slashFiltered[idx];
    inputEl.value = '/' + cmd.name + ' ';
    hideSlashMenu();
    inputEl.focus();
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  function moveSlashSelection(dir) {
    if (!slashFiltered.length) return;
    const items = slashMenu.querySelectorAll('.slash-item');
    if (items[slashSelectedIdx]) items[slashSelectedIdx].classList.remove('selected');
    slashSelectedIdx = (slashSelectedIdx + dir + slashFiltered.length) % slashFiltered.length;
    if (items[slashSelectedIdx]) {
      items[slashSelectedIdx].classList.add('selected');
      items[slashSelectedIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  // ── Mode Cycling ────────────────────────────────────
  const MODES = ['NORMAL','PLAN','SPEC','PIPELINE','TEAM','CHAIN'];
  let currentMode = 'NORMAL';
  const modeBar = document.getElementById('mode-bar');

  function cycleMode() {
    const idx = MODES.indexOf(currentMode);
    currentMode = MODES[(idx + 1) % MODES.length];
    updateModeUI();
  }

  function updateModeUI() {
    if (currentMode === 'NORMAL') {
      modeBar.classList.remove('visible');
      modeBar.textContent = '';
    } else {
      modeBar.textContent = '';
      const label = document.createTextNode(currentMode);
      modeBar.appendChild(label);
      const hint = document.createElement('span');
      hint.className = 'mode-hint';
      hint.textContent = 'Shift+Tab to cycle';
      modeBar.appendChild(hint);
      modeBar.classList.add('visible');
    }
  }

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    // Slash command detection
    const val = inputEl.value;
    if (val.startsWith('/') && !val.includes(' ') && val.length > 0) {
      showSlashMenu(val.slice(1));
    } else {
      hideSlashMenu();
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    // Shift+Tab: cycle mode
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      cycleMode();
      return;
    }
    // Slash menu navigation
    if (slashMenu.classList.contains('visible')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSlashSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSlashSelection(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); selectSlashItem(slashSelectedIdx); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideSlashMenu(); return; }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); selectSlashItem(slashSelectedIdx); return; }
    }
    // Normal enter to send
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Close slash menu on outside click
  document.addEventListener('click', (e) => {
    if (!slashMenu.contains(e.target) && e.target !== inputEl) hideSlashMenu();
  });

  // ── Markdown renderer ───────────────────────────────
  function renderMarkdown(text) {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/\\\`\\\`\\\`(\\w*)?\\n([\\s\\S]*?)\\\`\\\`\\\`/g, (_, lang, code) => {
      return '<pre><code>' + code.trim() + '</code></pre>';
    });
    html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
    html = html.replace(/^######\\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\\s+(.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
    html = html.replace(/^---+$/gm, '<hr>');
    html = html.replace(/^[\\s]*[-*]\\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\\/li>)/gs, '<ul>$1</ul>');
    html = html.replace(/<\\/ul>\\s*<ul>/g, '');
    html = html.replace(/^[\\s]*\\d+\\.\\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/^&gt;\\s*(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\\/blockquote>\\n<blockquote>/g, '<br>');
    html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^(?!<[hupbol]|<li|<blockquote|<pre|<hr)(.+)$/gm, '<p>$1</p>');
    html = html.replace(/<p><\\/p>/g, '');
    return html;
  }

  function scrollToBottom(force) {
    const el = messagesEl;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (force || nearBottom) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }

  function formatTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function addUserMessage(text, timestamp) {
    if (welcomeEl) welcomeEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = '<div class="message-label user-label">You</div>' +
      '<div class="message-bubble user-bubble">' + escapeHtml(text) + '</div>' +
      '<div class="message-time">' + formatTime(timestamp || new Date().toISOString()) + '</div>';
    messagesEl.appendChild(div);
    scrollToBottom(true);
  }

  function startAssistantMessage() {
    if (welcomeEl) welcomeEl.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'message';
    const label = document.createElement('div');
    label.className = 'message-label assistant-label';
    label.textContent = 'Pi';
    div.appendChild(label);
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble assistant-bubble';
    div.appendChild(bubble);
    messagesEl.appendChild(div);
    currentStreamBubble = bubble;
    currentStreamText = '';
    scrollToBottom(true);
    return div;
  }

  function appendToStream(text) {
    if (!currentStreamBubble) startAssistantMessage();
    currentStreamText += text;
    currentStreamBubble.innerHTML = renderMarkdown(currentStreamText) + '<span class="cursor"></span>';
    scrollToBottom(false);
  }

  function finalizeStream() {
    if (currentStreamBubble) {
      currentStreamBubble.innerHTML = renderMarkdown(currentStreamText);
      const timeDiv = document.createElement('div');
      timeDiv.className = 'message-time';
      timeDiv.textContent = formatTime(new Date().toISOString());
      currentStreamBubble.parentElement.appendChild(timeDiv);
      currentStreamBubble = null;
      currentStreamText = '';
      scrollToBottom(true);
    }
  }

  function addToolIndicator(name) {
    if (!currentStreamBubble) startAssistantMessage();
    const el = document.createElement('div');
    el.className = 'tool-indicator'; el.id = 'tool-active';
    el.innerHTML = '<div class="tool-spinner"></div> ' + escapeHtml(name);
    currentStreamBubble.appendChild(el);
    scrollToBottom(false);
  }
  function removeToolIndicator() { const el = document.getElementById('tool-active'); if (el) el.remove(); }

  function showThinking() {
    hideThinking();
    const div = document.createElement('div');
    div.className = 'thinking'; div.id = 'thinking-indicator';
    div.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>Pi is thinking...';
    messagesEl.appendChild(div);
    scrollToBottom(true);
  }
  function hideThinking() { const el = document.getElementById('thinking-indicator'); if (el) el.remove(); }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = '<div class="message-bubble" style="background:var(--error-bg);border-color:rgba(232,88,88,0.2);color:var(--error);font-size:14px;border-radius:var(--radius);">' + escapeHtml(text) + '</div>';
    messagesEl.appendChild(div);
    scrollToBottom(true);
  }

  window.sendMessage = async function() {
    const text = inputEl.value.trim();
    if (!text || busy) return;
    hideSlashMenu();
    inputEl.value = ''; inputEl.style.height = 'auto';
    setBusy(true); addUserMessage(text); showThinking();
    try {
      const payload = { message: text };
      if (currentMode !== 'NORMAL') payload.mode = currentMode;
      const res = await authedFetch('/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        hideThinking(); addSystemMessage('Error: ' + (data.error || 'Failed to send')); setBusy(false);
      }
    } catch (err) {
      hideThinking(); addSystemMessage('Network error: ' + err.message); setBusy(false);
    }
  };

  window.sendSuggestion = function(text) { inputEl.value = text; sendMessage(); };

  window.resetChat = async function() {
    try {
      await authedFetch('/reset', { method: 'POST' });
      messagesEl.innerHTML = '';
      if (welcomeEl) { messagesEl.appendChild(welcomeEl); welcomeEl.style.display = ''; }
      currentStreamBubble = null; currentStreamText = ''; setBusy(false);
    } catch (err) { addSystemMessage('Error resetting: ' + err.message); }
  };

  window.shutdownChat = async function() {
    if (!confirm('Stop the chat server? This will end the session and close the tunnel.')) return;
    try {
      await authedFetch('/shutdown', { method: 'POST' });
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:var(--font);color:#8892a0;background:#1a1d23;flex-direction:column;gap:12px"><div style="font-size:24px">Server stopped</div><div style="font-size:14px;color:#555d6e">You can close this tab.</div></div>';
    } catch (err) { addSystemMessage('Error shutting down: ' + err.message); }
  };

  function setBusy(b) {
    busy = b; sendBtn.disabled = b; inputEl.disabled = b;
    if (!b) inputEl.focus(); updateStatusDot();
  }
  function updateStatusDot() {
    statusDot.className = 'status-dot' + (!connected ? ' disconnected' : busy ? ' busy' : '');
    statusDot.title = !connected ? 'Disconnected' : busy ? 'Working...' : 'Connected';
  }

  // ── SSE ─────────────────────────────────────────────
  function connectSSE() {
    if (eventSource) { try { eventSource.close(); } catch {} }
    const tokenParam = authToken ? '?token=' + encodeURIComponent(authToken) : '';
    eventSource = new EventSource('/events' + tokenParam);

    eventSource.addEventListener('connected', (e) => {
      connected = true; reconnectDelay = 1000;
      connBanner.classList.remove('visible'); updateStatusDot();
      const data = JSON.parse(e.data);
      if (data.busy) setBusy(true);
    });
    eventSource.addEventListener('user_message', () => {});
    eventSource.addEventListener('assistant_message', (e) => {
      const data = JSON.parse(e.data);
      if (welcomeEl) welcomeEl.style.display = 'none';
      hideThinking();
      // If there's an active stream bubble, replace it with the final content
      if (currentStreamBubble) {
        currentStreamBubble.innerHTML = renderMarkdown(data.content);
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = formatTime(data.timestamp);
        currentStreamBubble.parentElement.appendChild(timeDiv);
        currentStreamBubble = null; currentStreamText = '';
      } else {
        // No stream was active — create a fresh message
        const div = document.createElement('div'); div.className = 'message';
        div.innerHTML = '<div class="message-label assistant-label">Pi</div>' +
          '<div class="message-bubble assistant-bubble">' + renderMarkdown(data.content) + '</div>' +
          '<div class="message-time">' + formatTime(data.timestamp) + '</div>';
        messagesEl.appendChild(div);
      }
      setBusy(false);
      scrollToBottom(true);
    });
    eventSource.addEventListener('text_delta', (e) => {
      hideThinking(); appendToStream(JSON.parse(e.data).text);
    });
    eventSource.addEventListener('tool_start', (e) => {
      hideThinking(); addToolIndicator(JSON.parse(e.data).name);
    });
    eventSource.addEventListener('tool_end', () => { removeToolIndicator(); });
    eventSource.addEventListener('done', () => { hideThinking(); finalizeStream(); setBusy(false); });
    eventSource.addEventListener('subagent_start', (e) => {
      const data = JSON.parse(e.data);
      addSystemMessage('Agents spawned: ' + data.names + ' (' + data.count + ')');
    });
    eventSource.addEventListener('error_event', (e) => {
      hideThinking(); addSystemMessage(JSON.parse(e.data).message); setBusy(false);
    });
    eventSource.addEventListener('status', (e) => { setBusy(JSON.parse(e.data).busy); });
    eventSource.addEventListener('terminal_output', (e) => {
      appendTerminalLine(JSON.parse(e.data).line);
    });
    eventSource.addEventListener('reset', () => {
      messagesEl.innerHTML = '';
      if (welcomeEl) { messagesEl.appendChild(welcomeEl); welcomeEl.style.display = ''; }
      currentStreamBubble = null; currentStreamText = ''; setBusy(false);
      terminalOutput.innerHTML = '';
    });
    eventSource.onerror = () => {
      connected = false; updateStatusDot(); connBanner.classList.add('visible');
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 10000); connectSSE();
      }, reconnectDelay);
    };
  }

  // ── Global Shift+Tab for mode cycling (works outside textarea) ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && e.shiftKey && document.activeElement !== inputEl) {
      e.preventDefault();
      cycleMode();
    }
  });

  // ── Prevent double-tap zoom (iOS) ───────────────────
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now(); if (now - lastTap < 300) e.preventDefault(); lastTap = now;
  }, { passive: false });
})();
</script>
</body>
</html>`;
}
