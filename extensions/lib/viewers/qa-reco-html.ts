// ABOUTME: Self-contained HTML templates for the QA Reco viewer GUI window.
// ABOUTME: Two modes: "setup" for test configuration controls, "report" for QA results with screenshot galleries.

import { QA_RECO_PRERELEASE_SECTIONS, type QARecoPrereleaseSection } from "../qa-reco-prerelease.ts";
import { VIEWER_SCROLLBAR_STYLES } from "../viewer-scrollbar-styles.ts";
/**
 * Status values used by both legacy suite rows and the pre-release section/check report.
 */
export type QACheckStatus = "passed" | "failed" | "skipped" | "blocked" | "partial";

/**
 * Data structure for a single test result.
 */
export interface QATestResult {
	name: string;
	suite: string;
	status: QACheckStatus;
	duration?: number; // ms
	error?: string;
	screenshots?: string[]; // filenames relative to screenshot dir
}

/**
 * Data structure for a test suite result.
 */
export interface QASuiteResult {
	name: string;
	type: "unit" | "e2e";
	platform?: "ios" | "android";
	passed: number;
	failed: number;
	skipped: number;
	duration: number; // ms
	tests: QATestResult[];
	screenshotDir?: string; // absolute path to screenshot directory
}

export interface QAReportEvidence {
	label: string;
	value?: string;
	filename?: string;
	url?: string;
}

export interface QAReportCheckResult {
	id: string;
	name: string;
	status: QACheckStatus;
	duration?: number;
	message?: string;
	error?: string;
	requiredEvidence?: string[];
	evidence?: QAReportEvidence[];
	screenshots?: string[];
}

export interface QAReportSectionResult {
	id: string;
	name: string;
	priority?: string;
	risk?: string;
	status: QACheckStatus;
	summary?: string;
	platform?: "ios" | "android" | "both";
	acceptanceCriteria?: string[];
	checks: QAReportCheckResult[];
}

export interface QAReleaseGate {
	status: "ready" | "blocked" | "review";
	label?: string;
	reason?: string;
	blockingSections?: string[];
}

/**
 * Full QA report data. Existing suite/test-only reports remain valid; the
 * pre-release gate fields are optional and render when present.
 */
export interface QAReportData {
	title: string;
	generatedAt: string;
	config: {
		runUnit: boolean;
		runE2E: boolean;
		e2eSuites: string[];
		platform: "ios" | "android" | "both";
		captureScreenshots: boolean;
		generateCoverage: boolean;
	};
	suites: QASuiteResult[];
	totalPassed: number;
	totalFailed: number;
	totalSkipped: number;
	totalDuration: number; // ms
	coveragePercent?: number;
	releaseGate?: QAReleaseGate;
	sections?: QAReportSectionResult[];
	screenshots: Array<{
		filename: string;
		label: string;
		suite: string;
		step?: string;
	}>;
}

// ── Shared CSS Variables ─────────────────────────────────────────────

const CSS_VARS = `
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
    --success-dim: rgba(72, 216, 137, 0.15);
    --warning: #f0b429;
    --warning-bg: rgba(240, 180, 41, 0.08);
    --error: #e85858;
    --error-bg: rgba(232, 88, 88, 0.08);
    --error-dim: rgba(232, 88, 88, 0.15);
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  }
`;

const CSS_RESET = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

${VIEWER_SCROLLBAR_STYLES}
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
`;

const CSS_HEADER = `
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
  }
  .header-logo { height: 20px; width: auto; image-rendering: pixelated; opacity: 0.6; flex-shrink: 0; }
  .header .badge {
    background: transparent; color: var(--accent);
    font-size: 11px; font-weight: 700; padding: 3px 10px;
    border: 1px solid var(--accent); border-radius: 4px;
    text-transform: uppercase; letter-spacing: 1px; font-family: var(--mono);
  }
  .header .title { font-size: 15px; font-weight: 600; color: var(--text); flex: 1; }
  .header .header-meta { font-size: 12px; font-family: var(--mono); color: var(--text-muted); }
`;

const CSS_SECTION = `
  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 20px 24px 16px;
    margin: 20px 0;
    position: relative;
    animation: fadeIn 0.3s ease backwards;
  }
  .section:nth-child(1) { animation-delay: 0s; }
  .section:nth-child(2) { animation-delay: 0.05s; }
  .section:nth-child(3) { animation-delay: 0.1s; }
  .section:nth-child(4) { animation-delay: 0.15s; }
  .section:nth-child(5) { animation-delay: 0.2s; }
  .section .section-number {
    position: absolute; top: -12px; left: 16px;
    background: var(--accent); color: var(--bg);
    font-size: 11px; font-weight: 700; font-family: var(--mono);
    padding: 3px 12px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.8px;
  }
  .section h2 {
    font-size: 16px; color: var(--accent);
    text-transform: uppercase; letter-spacing: 0.8px;
    font-family: var(--mono); font-weight: 700;
    margin: 4px 0 12px;
  }
  .section p { color: var(--text-muted); font-size: 14px; margin: 8px 0; }
`;

const CSS_FOOTER = `
  .footer-wrapper { position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; display: flex; flex-direction: column; }
  .footer {
    background: var(--surface); border-top: 1px solid var(--border);
    padding: 10px 20px; display: flex; align-items: center; gap: 8px;
  }
  .footer .spacer { flex: 1; }
  .footer .hint { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .footer .hint kbd {
    background: var(--surface2); border: 1px solid var(--border); border-radius: 3px;
    padding: 2px 6px; font-size: 11px; color: var(--text-muted); font-family: var(--mono);
  }
  .btn {
    padding: 7px 18px; border-radius: 4px; font-size: 13px; font-weight: 500;
    cursor: pointer; border: 1px solid var(--border); background: var(--surface2);
    color: var(--text-muted); transition: all 0.15s; font-family: var(--font);
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { background: var(--border); color: var(--text); }
  .btn-primary { background: transparent; color: var(--accent); border-color: var(--accent); font-weight: 600; }
  .btn-primary:hover { background: var(--accent-dim); color: var(--accent-hover); }
  .btn-success { background: transparent; color: var(--success); border-color: var(--success); font-weight: 600; }
  .btn-success:hover { background: var(--success-bg); }
  .btn-danger { background: transparent; color: var(--error); border-color: var(--error); font-weight: 600; }
  .btn-danger:hover { background: var(--error-bg); }
  .btn-ghost { background: transparent; border-color: transparent; color: var(--text-dim); font-size: 12px; }
  .btn-ghost:hover { color: var(--text-muted); background: var(--surface2); }
  .btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
`;

const CSS_ANIMATIONS = `
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

// ── SVG Icons ────────────────────────────────────────────────────────

const ICONS = {
	check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
	x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
	play: '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
	monitor: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
	smartphone: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
	camera: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
	code: '<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
	zap: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
	layers: '<svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
	clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
	image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
	download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
	copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
	apple: '<svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/><path d="M15.5 8.5c-.7-.8-1.7-1-2.5-.8-.6.1-1.1.5-1.5.5s-1-.4-1.7-.4c-1.3 0-2.6.8-3.3 2.1-1.4 2.5-.4 6.2 1 8.2.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.5-.6s1.5.6 2.5.6 1.7-1 2.4-2c.5-.7.9-1.4 1.1-2.1-1.3-.5-2.2-1.8-2.2-3.3 0-1.3.7-2.4 1.7-3"/></svg>',
	android: '<svg viewBox="0 0 24 24"><path d="M5 16V8h14v8"/><rect x="3" y="8" width="18" height="10" rx="2"/><path d="M7 4l2 4M17 4l-2 4"/><circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/></svg>',
	chevronDown: '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
	maximize: '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
};

// ── Setup HTML Generator ─────────────────────────────────────────────

/**
 * Generate the QA Reco Setup page HTML.
 */
export function generateQARecoSetupHTML(opts: {
	port: number;
	title?: string;
}): string {
	const { port, title } = opts;
	const displayTitle = title || "QA Reco";

	const iconForSection = (section: QARecoPrereleaseSection): string => {
		if (section.id === "basic-feed") return ICONS.play;
		if (section.id === "scrolling") return ICONS.layers;
		if (section.id === "liking") return ICONS.zap;
		if (section.id === "commenting") return ICONS.code;
		return ICONS.check;
	};
	const e2eSuites = QA_RECO_PRERELEASE_SECTIONS.map((section) => ({
		id: section.id,
		name: section.name,
		desc: `${section.priority} / ${section.risk} risk · ${section.checks.length} checks · ${section.description}`,
		icon: iconForSection(section),
	}));

	const suitesHTML = e2eSuites.map(s => `
      <label class="suite-item" data-suite="${s.id}">
        <input type="checkbox" checked data-suite="${s.id}">
        <div class="suite-icon-wrap">${s.icon}</div>
        <div class="suite-info">
          <div class="suite-name">${escapeHtml(s.name)}</div>
          <div class="suite-desc">${escapeHtml(s.desc)}</div>
        </div>
      </label>`).join("\n");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${displayTitle} — QA Setup</title>
<style>
${CSS_VARS}
${CSS_RESET}
${CSS_HEADER}
${CSS_SECTION}
${CSS_FOOTER}
${CSS_ANIMATIONS}

  .content {
    flex: 1; overflow-y: auto; padding: 16px 24px 120px;
    max-width: 720px; margin: 0 auto; width: 100%;
  }

  /* ── Test Type Toggle Cards ──────────── */
  .type-cards { display: flex; gap: 12px; margin: 16px 0; }
  .type-card {
    flex: 1; padding: 18px 16px;
    background: var(--surface2); border: 2px solid var(--border); border-radius: 8px;
    cursor: pointer; transition: all 0.2s; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .type-card:hover { border-color: var(--accent); }
  .type-card.selected { border-color: var(--success); background: var(--success-bg); }
  .type-card .type-icon {
    width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  }
  .type-card.selected .type-icon { border-color: var(--success); }
  .type-card .type-icon svg { width: 22px; height: 22px; stroke: var(--text-muted); fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .type-card.selected .type-icon svg { stroke: var(--success); }
  .type-card .type-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .type-card .type-desc { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .type-card.selected .type-name { color: var(--success); }

  /* ── Suite List ──────────────────────── */
  .suite-list { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
  .suite-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; background: var(--surface2);
    border: 1px solid var(--border); border-radius: 6px;
    cursor: pointer; transition: all 0.15s; border-left: 2px solid transparent;
  }
  .suite-item:hover { background: rgba(41, 128, 185, 0.06); border-left-color: var(--accent); }
  .suite-item.active { border-left-color: var(--success); }
  .suite-item input[type="checkbox"] {
    appearance: none; width: 16px; height: 16px;
    border: 1.5px solid var(--text-dim); border-radius: 3px;
    cursor: pointer; flex-shrink: 0; position: relative; transition: all 0.15s;
  }
  .suite-item input[type="checkbox"]:hover { border-color: var(--accent); }
  .suite-item input[type="checkbox"]:checked { background: var(--success); border-color: var(--success); }
  .suite-item input[type="checkbox"]:checked::after {
    content: ""; position: absolute; top: 1px; left: 4px;
    width: 5px; height: 8px;
    border: solid #1a1d23; border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .suite-icon-wrap {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px; flex-shrink: 0;
  }
  .suite-icon-wrap svg { width: 16px; height: 16px; stroke: var(--text-muted); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .suite-item.active .suite-icon-wrap { border-color: var(--success); }
  .suite-item.active .suite-icon-wrap svg { stroke: var(--success); }
  .suite-info { flex: 1; }
  .suite-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .suite-desc { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .suite-controls { display: flex; gap: 8px; margin: 8px 0; }
  .suite-controls button {
    background: none; border: none; color: var(--accent); font-size: 12px;
    font-family: var(--mono); cursor: pointer; padding: 2px 6px;
  }
  .suite-controls button:hover { text-decoration: underline; }

  /* ── Platform Selector ───────────────── */
  .platform-group { display: flex; gap: 10px; margin: 16px 0; }
  .platform-btn {
    flex: 1; padding: 14px 16px;
    background: var(--surface2); border: 2px solid var(--border); border-radius: 8px;
    color: var(--text-muted); font-family: var(--mono); font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .platform-btn:hover { border-color: var(--accent); color: var(--text); background: var(--accent-dim); }
  .platform-btn.selected { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .platform-btn .plat-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
  .platform-btn .plat-icon svg { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .platform-btn .plat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; }

  /* ── Toggle Options ──────────────────── */
  .option-toggles { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
  .option-toggle {
    display: flex; align-items: center; gap: 14px;
    background: var(--surface2); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 18px; cursor: pointer; transition: all 0.15s;
  }
  .option-toggle:hover { border-color: var(--accent); }
  .option-toggle.active { border-color: var(--success); background: var(--success-bg); }
  .option-toggle input[type="checkbox"] { display: none; }
  .toggle-switch {
    width: 44px; height: 24px; background: var(--border); border-radius: 12px;
    position: relative; transition: background 0.2s; flex-shrink: 0;
  }
  .toggle-switch::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 18px; height: 18px; background: var(--text-dim); border-radius: 50%;
    transition: all 0.2s;
  }
  .option-toggle.active .toggle-switch { background: var(--success); }
  .option-toggle.active .toggle-switch::after { left: 23px; background: white; }
  .toggle-info { flex: 1; }
  .toggle-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .toggle-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  /* ── Preview Box ─────────────────────── */
  .preview-box {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 16px; margin: 16px 0 0;
    font-family: var(--mono); font-size: 12px; color: var(--text-dim); line-height: 1.7;
  }
  .preview-box .pv-label { color: var(--accent); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-size: 11px; }
  .preview-box .pv-row { display: flex; justify-content: space-between; padding: 3px 0; }
  .preview-box .pv-key { color: var(--text-muted); }
  .preview-box .pv-val { color: var(--text); font-weight: 600; }
  .preview-box .pv-val.accent { color: var(--accent); }

  /* ── E2E section collapse ────────────── */
  .e2e-section { transition: opacity 0.3s, max-height 0.3s; overflow: hidden; }
  .e2e-section.hidden { opacity: 0.3; max-height: 0; pointer-events: none; overflow: hidden; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <img class="header-logo" src="/logo.png" alt="Pi" onerror="this.style.display='none'">
  <span class="badge">QA</span>
  <div class="title">${displayTitle}</div>
  <div class="header-meta" id="header-meta">Configure &amp; Run Tests</div>
</div>

<!-- Content -->
<div class="content">

  <!-- 1. Test Type -->
  <div class="section">
    <div class="section-number">1 — Test Type</div>
    <h2>What to Test</h2>
    <p>Choose which test types to run. Select one or both.</p>
    <div class="type-cards">
      <div class="type-card selected" data-type="unit" onclick="toggleTestType(this)">
        <div class="type-icon">${ICONS.code}</div>
        <div class="type-name">Unit Tests</div>
        <div class="type-desc">Jest · 14 test files · ~45% coverage</div>
      </div>
      <div class="type-card selected" data-type="e2e" onclick="toggleTestType(this)">
        <div class="type-icon">${ICONS.smartphone}</div>
        <div class="type-name">Pre-release Flows</div>
        <div class="type-desc">agent-device · ${e2eSuites.length} sections · screenshots</div>
      </div>
    </div>
  </div>

  <!-- 2. E2E Suites -->
  <div class="section e2e-section" id="e2e-section">
    <div class="section-number">2 — Critical Sections</div>
    <h2>Pre-release Flow Selection</h2>
    <p>Choose which organized QA Reco release sections to run on the simulator. Each section contains nested automation checks.</p>
    <div class="suite-controls">
      <button onclick="selectAllSuites()">Select All</button>
      <button onclick="selectNoneSuites()">Select None</button>
    </div>
    <div class="suite-list">
      ${suitesHTML}
    </div>
  </div>

  <!-- 3. Platform -->
  <div class="section e2e-section" id="platform-section">
    <div class="section-number">3 — Platform</div>
    <h2>Target Platform</h2>
    <p>Which simulator/emulator should E2E tests run on?</p>
    <div class="platform-group">
      <button class="platform-btn" data-platform="ios" onclick="selectPlatform(this)">
        <div class="plat-icon">${ICONS.apple}</div>
        <div class="plat-label">iOS</div>
      </button>
      <button class="platform-btn" data-platform="android" onclick="selectPlatform(this)">
        <div class="plat-icon">${ICONS.android}</div>
        <div class="plat-label">Android</div>
      </button>
      <button class="platform-btn selected" data-platform="both" onclick="selectPlatform(this)">
        <div class="plat-icon">${ICONS.layers}</div>
        <div class="plat-label">Both</div>
      </button>
    </div>
  </div>

  <!-- 4. Options -->
  <div class="section">
    <div class="section-number">4 — Options</div>
    <h2>Run Options</h2>
    <p>Additional configuration for the test run.</p>
    <div class="option-toggles">
      <div class="option-toggle active" onclick="toggleOption(this)" data-option="screenshots">
        <input type="checkbox" checked id="opt-screenshots">
        <div class="toggle-switch"></div>
        <div class="toggle-info">
          <div class="toggle-name">Capture Screenshots</div>
          <div class="toggle-desc">Take screenshots at each test step for the QA report gallery</div>
        </div>
      </div>
      <div class="option-toggle" onclick="toggleOption(this)" data-option="coverage">
        <input type="checkbox" id="opt-coverage">
        <div class="toggle-switch"></div>
        <div class="toggle-info">
          <div class="toggle-name">Generate Coverage Report</div>
          <div class="toggle-desc">Run Jest with --coverage flag (adds ~30s)</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Preview -->
  <div class="preview-box" id="preview">
    <div class="pv-label">Run Preview</div>
    <div class="pv-row"><span class="pv-key">Test Types</span><span class="pv-val accent" id="pv-types">Unit + E2E</span></div>
    <div class="pv-row"><span class="pv-key">Critical Sections</span><span class="pv-val" id="pv-suites">${e2eSuites.length} selected</span></div>
    <div class="pv-row"><span class="pv-key">Platform</span><span class="pv-val" id="pv-platform">Both</span></div>
    <div class="pv-row"><span class="pv-key">Screenshots</span><span class="pv-val" id="pv-screenshots">Yes</span></div>
    <div class="pv-row"><span class="pv-key">Coverage</span><span class="pv-val" id="pv-coverage">No</span></div>
  </div>
</div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <span class="hint"><kbd>Esc</kbd> to cancel</span>
    <div class="spacer"></div>
    <button class="btn" onclick="cancel()">Cancel</button>
    <button class="btn btn-success" onclick="runQA()">
      ${ICONS.play} Run QA
    </button>
  </div>
</div>

<script>
  const PORT = ${port};
  const state = {
    runUnit: true,
    runE2E: true,
    e2eSuites: ${JSON.stringify(e2eSuites.map(s => s.id))},
    platform: 'both',
    captureScreenshots: true,
    generateCoverage: false
  };

  function toggleTestType(el) {
    el.classList.toggle('selected');
    const type = el.dataset.type;
    if (type === 'unit') state.runUnit = el.classList.contains('selected');
    if (type === 'e2e') state.runE2E = el.classList.contains('selected');

    // Show/hide E2E sections
    document.querySelectorAll('.e2e-section').forEach(s => {
      s.classList.toggle('hidden', !state.runE2E);
    });
    updatePreview();
  }

  // Suite checkboxes
  document.querySelectorAll('.suite-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    item.addEventListener('click', (e) => {
      if (e.target === cb) return; // let checkbox handle itself
      cb.checked = !cb.checked;
      updateSuiteState();
    });
    cb.addEventListener('change', () => updateSuiteState());
  });

  function updateSuiteState() {
    state.e2eSuites = [];
    document.querySelectorAll('.suite-item').forEach(item => {
      const cb = item.querySelector('input[type="checkbox"]');
      const id = item.dataset.suite;
      if (cb.checked) {
        state.e2eSuites.push(id);
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    updatePreview();
  }

  function selectAllSuites() {
    document.querySelectorAll('.suite-item input[type="checkbox"]').forEach(cb => cb.checked = true);
    updateSuiteState();
  }
  function selectNoneSuites() {
    document.querySelectorAll('.suite-item input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateSuiteState();
  }

  function selectPlatform(el) {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    state.platform = el.dataset.platform;
    updatePreview();
  }

  function toggleOption(el) {
    el.classList.toggle('active');
    const cb = el.querySelector('input[type="checkbox"]');
    cb.checked = el.classList.contains('active');
    const opt = el.dataset.option;
    if (opt === 'screenshots') state.captureScreenshots = cb.checked;
    if (opt === 'coverage') state.generateCoverage = cb.checked;
    updatePreview();
  }

  function updatePreview() {
    const types = [];
    if (state.runUnit) types.push('Unit');
    if (state.runE2E) types.push('E2E');
    document.getElementById('pv-types').textContent = types.join(' + ') || 'None';
    document.getElementById('pv-suites').textContent = state.runE2E ? state.e2eSuites.length + ' selected' : 'N/A';
    document.getElementById('pv-platform').textContent = state.runE2E ? state.platform.charAt(0).toUpperCase() + state.platform.slice(1) : 'N/A';
    document.getElementById('pv-screenshots').textContent = state.captureScreenshots ? 'Yes' : 'No';
    document.getElementById('pv-coverage').textContent = state.generateCoverage ? 'Yes' : 'No';
  }

  // Initialize suite active states
  document.querySelectorAll('.suite-item').forEach(item => {
    if (item.querySelector('input[type="checkbox"]').checked) {
      item.classList.add('active');
    }
  });

  async function runQA() {
    if (!state.runUnit && !state.runE2E) {
      alert('Please select at least one test type.');
      return;
    }
    if (state.runE2E && state.e2eSuites.length === 0) {
      alert('Please select at least one E2E suite.');
      return;
    }
    try {
      await fetch('http://127.0.0.1:' + PORT + '/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', config: state })
      });
    } catch(e) { console.error(e); }
  }

  async function cancel() {
    try {
      await fetch('http://127.0.0.1:' + PORT + '/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancelled' })
      });
    } catch(e) { console.error(e); }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancel();
  });
</script>
</body>
</html>`;
}

// ── Report HTML Generator ────────────────────────────────────────────

/**
 * Generate the QA Reco Report page HTML.
 */
export function generateQARecoReportHTML(opts: {
	report: QAReportData;
	port: number;
}): string {
	const { report, port } = opts;
	const escapedReport = JSON.stringify(report).replace(/<\//g, '<\\/');
	const suites = Array.isArray(report.suites) ? report.suites : [];
	const screenshots = Array.isArray(report.screenshots) ? report.screenshots : [];
	const reportSections = (Array.isArray(report.sections) ? report.sections : []).map((section) => {
		const definition = QA_RECO_PRERELEASE_SECTIONS.find((candidate) => candidate.id === section.id);
		return {
			...section,
			name: section.name || definition?.name || section.id,
			priority: section.priority || definition?.priority || "P1",
			risk: section.risk || definition?.risk || "medium",
			acceptanceCriteria: section.acceptanceCriteria || definition?.acceptanceCriteria || [],
			checks: Array.isArray(section.checks) ? section.checks : [],
		};
	});
	const blockingSections = reportSections.filter((section) =>
		(section.priority || "P1") === "P1" && ["failed", "blocked"].includes(section.status),
	);
	const reviewSections = reportSections.filter((section) => ["partial", "skipped"].includes(section.status));
	const derivedGateStatus = report.releaseGate?.status
		?? (reportSections.length > 0
			? blockingSections.length > 0 ? "blocked" : reviewSections.length > 0 ? "review" : "ready"
			: undefined);
	const overallStatus = derivedGateStatus === "blocked"
		? "failed"
		: report.totalFailed === 0 ? "passed" : "failed";
	const statusColor = derivedGateStatus === "review"
		? 'var(--warning)'
		: overallStatus === 'passed' ? 'var(--success)' : 'var(--error)';
	const statusBg = derivedGateStatus === "review"
		? 'var(--warning-bg)'
		: overallStatus === 'passed' ? 'var(--success-bg)' : 'var(--error-bg)';
	const statusLabel = derivedGateStatus === "ready"
		? (report.releaseGate?.label || "READY FOR RELEASE")
		: derivedGateStatus === "blocked"
			? (report.releaseGate?.label || "RELEASE BLOCKED")
			: derivedGateStatus === "review"
				? (report.releaseGate?.label || "NEEDS REVIEW")
				: overallStatus === 'passed' ? 'ALL PASSED' : `${report.totalFailed} FAILED`;

	// Format timestamp as MM/DD/YYYY @ HH:MMAM
	function formatTimestamp(isoStr: string): string {
		try {
			const d = new Date(isoStr);
			if (isNaN(d.getTime())) return isoStr;
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const dd = String(d.getDate()).padStart(2, '0');
			const yyyy = d.getFullYear();
			let hours = d.getHours();
			const minutes = String(d.getMinutes()).padStart(2, '0');
			const ampm = hours >= 12 ? 'PM' : 'AM';
			hours = hours % 12 || 12;
			return `${mm}/${dd}/${yyyy} @ ${hours}:${minutes}${ampm}`;
		} catch { return isoStr; }
	}
	const formattedTimestamp = formatTimestamp(report.generatedAt);

	function formatDuration(ms: number): string {
		if (ms < 1000) return ms + 'ms';
		if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
		const min = Math.floor(ms / 60000);
		const sec = Math.round((ms % 60000) / 1000);
		return min + 'm ' + sec + 's';
	}

	function statusMeta(status: QACheckStatus): { icon: string; color: string; className: string; label: string } {
		if (status === "passed") return { icon: ICONS.check, color: "var(--success)", className: "passed", label: "Passed" };
		if (status === "failed") return { icon: ICONS.x, color: "var(--error)", className: "failed", label: "Failed" };
		if (status === "blocked") return { icon: ICONS.x, color: "var(--error)", className: "failed", label: "Blocked" };
		if (status === "partial") return { icon: ICONS.clock, color: "var(--warning)", className: "skipped", label: "Partial" };
		return { icon: ICONS.clock, color: "var(--warning)", className: "skipped", label: "Skipped" };
	}

	function countChecks(section: QAReportSectionResult): { passed: number; failed: number; blocked: number; skipped: number; partial: number; total: number } {
		const counts = { passed: 0, failed: 0, blocked: 0, skipped: 0, partial: 0, total: section.checks.length };
		for (const check of section.checks) {
			if (check.status === "passed") counts.passed++;
			else if (check.status === "failed") counts.failed++;
			else if (check.status === "blocked") counts.blocked++;
			else if (check.status === "partial") counts.partial++;
			else counts.skipped++;
		}
		return counts;
	}

	// Build sidebar items
	const sidebarItems = suites.map((suite, i) => {
		const sStatus = suite.failed === 0 ? 'passed' : 'failed';
		const icon = sStatus === 'passed' ? ICONS.check : ICONS.x;
		const color = sStatus === 'passed' ? 'var(--success)' : 'var(--error)';
		const platformBadge = suite.platform ? ` <span style="font-size:10px;color:var(--text-dim)">${suite.platform.toUpperCase()}</span>` : '';
		return `<div class="sidebar-item" data-suite="${i}" onclick="scrollToSuite(${i})" style="border-left-color: ${color}">
      <span class="sidebar-icon" style="color:${color}">${icon}</span>
      <span class="sidebar-label">${suite.name}${platformBadge}</span>
      <span class="sidebar-count" style="color:${color}">${suite.passed}/${suite.passed + suite.failed}</span>
    </div>`;
	}).join("\n");

	// Build suite sections
	const suiteSections = suites.map((suite, i) => {
		const sStatus = suite.failed === 0 ? 'passed' : 'failed';
		const badge = sStatus === 'passed'
			? `<span class="suite-badge passed">${ICONS.check} ALL PASSED</span>`
			: `<span class="suite-badge failed">${ICONS.x} ${suite.failed} FAILED</span>`;
		const typeLabel = suite.type === 'unit' ? 'UNIT' : 'E2E';
		const platformLabel = suite.platform ? ` · ${suite.platform.toUpperCase()}` : '';

		const testRows = suite.tests.map(t => {
			const tIcon = t.status === 'passed' ? ICONS.check : t.status === 'failed' ? ICONS.x : ICONS.clock;
			const tColor = t.status === 'passed' ? 'var(--success)' : t.status === 'failed' ? 'var(--error)' : 'var(--warning)';
			const dur = t.duration ? formatDuration(t.duration) : '';
			const errBlock = t.error ? `<div class="test-error">${escapeHtml(t.error)}</div>` : '';
			const screenshotBadge = t.screenshots && t.screenshots.length > 0
				? `<span class="screenshot-badge" onclick="event.stopPropagation(); openScreenshot('${t.screenshots[0]}')">${ICONS.camera} ${t.screenshots.length}</span>`
				: '';
			return `<div class="test-row" style="border-left-color: ${tColor}">
        <span class="test-icon" style="color:${tColor}">${tIcon}</span>
        <span class="test-name">${escapeHtml(t.name)}</span>
        ${screenshotBadge}
        <span class="test-duration">${dur}</span>
      </div>${errBlock}`;
		}).join("\n");

		// Suite screenshot gallery
		const suiteScreenshots = suite.tests
			.flatMap(t => (t.screenshots || []).map(s => ({ filename: s, testName: t.name })))
			.filter(s => s.filename);
		const galleryHTML = suiteScreenshots.length > 0 ? `
      <div class="suite-gallery">
        <h4 class="gallery-title">${ICONS.image} Screenshots (${suiteScreenshots.length})</h4>
        <div class="gallery-grid">
          ${suiteScreenshots.map(s => `
            <div class="gallery-thumb" onclick="openLightbox('/screenshots/${encodeURIComponent(s.filename)}', '${escapeHtml(s.testName)}')">
              <img src="/screenshots/${encodeURIComponent(s.filename)}" alt="${escapeHtml(s.testName)}" loading="lazy" onerror="this.parentElement.classList.add('error')">
              <div class="gallery-label">${escapeHtml(s.testName)}</div>
            </div>
          `).join("\n")}
        </div>
      </div>` : '';

		return `<div class="suite-section" id="suite-${i}">
      <div class="suite-header" onclick="toggleSuite(${i})">
        <span class="suite-type-badge">${typeLabel}${platformLabel}</span>
        <h3>${escapeHtml(suite.name)}</h3>
        ${badge}
        <span class="suite-meta">${suite.passed + suite.failed + suite.skipped} tests · ${formatDuration(suite.duration)}</span>
        <span class="suite-chevron">${ICONS.chevronDown}</span>
      </div>
      <div class="suite-body" id="suite-body-${i}">
        ${testRows}
        ${galleryHTML}
      </div>
    </div>`;
	}).join("\n");

	const sectionSidebarItems = reportSections.map((section, i) => {
		const meta = statusMeta(section.status);
		const counts = countChecks(section);
		return `<div class="sidebar-item" data-critical-section="${i}" onclick="scrollToCriticalSection(${i})" style="border-left-color: ${meta.color}">
      <span class="sidebar-icon" style="color:${meta.color}">${meta.icon}</span>
      <span class="sidebar-label">${escapeHtml(section.name)}</span>
      <span class="sidebar-count" style="color:${meta.color}">${counts.passed}/${counts.total}</span>
    </div>`;
	}).join("\n");

	const criticalFeatureCards = reportSections.map((section, i) => {
		const meta = statusMeta(section.status);
		const counts = countChecks(section);
		const blockedCount = counts.failed + counts.blocked;
		return `<button class="critical-card" onclick="scrollToCriticalSection(${i})" style="border-left-color:${meta.color}">
      <div class="critical-card-top">
        <span class="critical-icon" style="color:${meta.color}">${meta.icon}</span>
        <span class="critical-badge ${meta.className}">${escapeHtml(meta.label)}</span>
      </div>
      <div class="critical-name">${escapeHtml(section.name)}</div>
      <div class="critical-meta">${escapeHtml(section.priority || "P1")} · ${escapeHtml(section.risk || "medium")} risk · ${counts.total} checks</div>
      <div class="critical-desc">${escapeHtml(section.summary || "Catalog-backed pre-release automation section")}</div>
      <div class="critical-counts">${counts.passed} passed · ${blockedCount} blocked/failed · ${counts.skipped + counts.partial} review</div>
    </button>`;
	}).join("\n");

	const criticalSections = reportSections.map((section, i) => {
		const meta = statusMeta(section.status);
		const counts = countChecks(section);
		const criteria = (section.acceptanceCriteria || []).map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join("\n");
		const checkRows = section.checks.map((check) => {
			const checkMeta = statusMeta(check.status);
			const duration = check.duration ? formatDuration(check.duration) : "";
			const evidence = [
				...(check.requiredEvidence || []).map((item) => ({ label: "Required", value: item })),
				...(check.evidence || []),
			].map((item) => {
				if (item.filename) {
					return `<span class="evidence-pill evidence-link" onclick="event.stopPropagation(); openScreenshot('${escapeHtml(item.filename)}')">${ICONS.camera} ${escapeHtml(item.label)}</span>`;
				}
				if (item.url) {
					return `<a class="evidence-pill evidence-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a>`;
				}
				return `<span class="evidence-pill">${escapeHtml(item.label)}${item.value ? `: ${escapeHtml(item.value)}` : ""}</span>`;
			}).join(" ");
			const screenshots = (check.screenshots || []).map((filename) =>
				`<span class="evidence-pill evidence-link" onclick="event.stopPropagation(); openScreenshot('${escapeHtml(filename)}')">${ICONS.camera} ${escapeHtml(filename)}</span>`,
			).join(" ");
			const message = check.message || check.error;
			return `<div class="check-row" style="border-left-color:${checkMeta.color}">
          <span class="check-icon" style="color:${checkMeta.color}">${checkMeta.icon}</span>
          <div class="check-main">
            <div class="check-title"><span>${escapeHtml(check.name)}</span><span class="check-id">${escapeHtml(check.id)}</span></div>
            ${message ? `<div class="check-message">${escapeHtml(message)}</div>` : ""}
            ${evidence || screenshots ? `<div class="check-evidence">${evidence} ${screenshots}</div>` : ""}
          </div>
          <span class="critical-badge ${checkMeta.className}">${escapeHtml(checkMeta.label)}</span>
          <span class="test-duration">${duration}</span>
        </div>`;
		}).join("\n");

		return `<div class="critical-section" id="critical-section-${i}">
      <div class="critical-section-header" onclick="toggleCriticalSection(${i})">
        <span class="critical-icon" style="color:${meta.color}">${meta.icon}</span>
        <div class="critical-section-title">
          <h3>${escapeHtml(section.name)}</h3>
          <div>${escapeHtml(section.priority || "P1")} · ${escapeHtml(section.risk || "medium")} risk · ${counts.passed}/${counts.total} checks passed</div>
        </div>
        <span class="critical-badge ${meta.className}">${escapeHtml(meta.label)}</span>
        <span class="suite-chevron">${ICONS.chevronDown}</span>
      </div>
      <div class="critical-section-body" id="critical-section-body-${i}">
        ${criteria ? `<ul class="acceptance-list">${criteria}</ul>` : ""}
        ${checkRows}
      </div>
    </div>`;
	}).join("\n");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(report.title)} — QA Report</title>
<style>
${CSS_VARS}
${CSS_RESET}
${CSS_HEADER}
${CSS_FOOTER}
${CSS_ANIMATIONS}

  /* ── Layout ──────────────────────────── */
  .main { display: flex; flex: 1; overflow: hidden; }
  .sidebar {
    width: 240px; min-width: 200px; max-width: 280px;
    background: var(--surface); border-right: 1px solid var(--border);
    overflow-y: auto; padding: 12px 0; flex-shrink: 0;
  }
  .content { flex: 1; overflow-y: auto; padding: 16px 24px 120px; }

  /* ── Sidebar ─────────────────────────── */
  .sidebar-section { padding: 8px 16px; font-size: 11px; color: var(--text-dim); font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.8px; }
  .sidebar-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px; cursor: pointer; transition: all 0.15s;
    border-left: 2px solid transparent; font-size: 13px;
  }
  .sidebar-item:hover { background: var(--accent-dim); }
  .sidebar-item.active { background: var(--accent-dim); border-left-color: var(--accent); }
  .sidebar-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
  .sidebar-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .sidebar-label { flex: 1; color: var(--text); font-weight: 500; }
  .sidebar-count { font-family: var(--mono); font-size: 12px; font-weight: 600; }

  /* ── Summary Cards ───────────────────── */
  .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
  .summary-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; text-align: center;
  }
  .summary-card .card-value { font-size: 28px; font-weight: 700; font-family: var(--mono); line-height: 1.2; }
  .summary-card .card-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 4px; font-family: var(--mono); }
  .summary-card.passed .card-value { color: var(--success); }
  .summary-card.failed .card-value { color: var(--error); }
  .summary-card.skipped .card-value { color: var(--warning); }
  .summary-card.duration .card-value { color: var(--accent); }
  .summary-card.coverage .card-value { color: var(--accent); }

  /* ── Critical Feature Sections ───────── */
  .critical-heading {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin: 24px 0 12px;
  }
  .critical-heading h2 {
    font-size: 16px; color: var(--accent); font-family: var(--mono);
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
  }
  .critical-heading .critical-sub { font-size: 12px; color: var(--text-muted); font-family: var(--mono); }
  .critical-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 12px 0 20px; }
  .critical-card {
    background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent);
    border-radius: 8px; padding: 14px; text-align: left; color: inherit; cursor: pointer;
    transition: border-color 0.15s, transform 0.15s, background 0.15s;
  }
  .critical-card:hover { background: var(--surface2); transform: translateY(-1px); }
  .critical-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .critical-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; }
  .critical-icon svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .critical-name { font-size: 15px; font-weight: 700; color: var(--text); }
  .critical-meta, .critical-counts { font-size: 11px; color: var(--text-muted); font-family: var(--mono); margin-top: 4px; }
  .critical-desc { font-size: 12px; color: var(--text-dim); margin-top: 8px; line-height: 1.45; }
  .critical-badge {
    display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700;
    padding: 3px 8px; border-radius: 4px; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px;
  }
  .critical-badge.passed { background: var(--success-dim); color: var(--success); }
  .critical-badge.failed { background: var(--error-dim); color: var(--error); }
  .critical-badge.skipped { background: var(--warning-bg); color: var(--warning); }
  .critical-section {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    margin: 16px 0; overflow: hidden; animation: fadeIn 0.3s ease backwards;
  }
  .critical-section-header {
    display: flex; align-items: center; gap: 12px; padding: 14px 20px;
    cursor: pointer; transition: background 0.15s;
  }
  .critical-section-header:hover { background: var(--surface2); }
  .critical-section-title { flex: 1; min-width: 0; }
  .critical-section-title h3 { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
  .critical-section-title div { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .critical-section.collapsed .suite-chevron { transform: rotate(-90deg); }
  .critical-section.collapsed .critical-section-body { display: none; }
  .critical-section-body { border-top: 1px solid var(--border); padding: 8px 0 12px; }
  .acceptance-list { margin: 8px 20px 12px 44px; color: var(--text-muted); font-size: 12px; }
  .acceptance-list li { margin: 4px 0; }
  .check-row {
    display: flex; align-items: flex-start; gap: 10px; padding: 10px 20px;
    border-left: 2px solid transparent; transition: background 0.1s;
  }
  .check-row:hover { background: var(--surface2); }
  .check-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .check-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .check-main { flex: 1; min-width: 0; }
  .check-title { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13px; font-weight: 600; color: var(--text); }
  .check-id { font-size: 10px; color: var(--text-dim); font-family: var(--mono); font-weight: 500; }
  .check-message { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .check-evidence { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
  .evidence-pill { font-size: 10px; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border); border-radius: 999px; padding: 2px 7px; font-family: var(--mono); }
  .evidence-link { color: var(--accent); cursor: pointer; text-decoration: none; }
  .evidence-link:hover { border-color: var(--accent); }

  /* ── Overall Status Banner ───────────── */
  .status-banner {
    background: ${statusBg}; border: 1px solid ${statusColor}; border-radius: 8px;
    padding: 16px 20px; display: flex; align-items: center; gap: 14px;
    margin: 16px 0;
  }
  .status-banner .status-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: ${statusColor}; }
  .status-banner .status-icon svg { width: 28px; height: 28px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .status-banner .status-text { font-size: 16px; font-weight: 700; color: ${statusColor}; font-family: var(--mono); letter-spacing: 1px; }
  .status-banner .status-detail { font-size: 13px; color: var(--text-muted); margin-left: auto; font-family: var(--mono); }

  /* ── Suite Sections ──────────────────── */
  .suite-section {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    margin: 16px 0; overflow: hidden;
    animation: fadeIn 0.3s ease backwards;
  }
  .suite-header {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 20px; cursor: pointer; transition: background 0.15s;
  }
  .suite-header:hover { background: var(--surface2); }
  .suite-header h3 { font-size: 15px; font-weight: 600; color: var(--text); flex: 1; }
  .suite-type-badge {
    font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;
    font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px;
    background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent);
  }
  .suite-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 4px;
    font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px;
  }
  .suite-badge svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .suite-badge.passed { background: var(--success-dim); color: var(--success); }
  .suite-badge.failed { background: var(--error-dim); color: var(--error); }
  .suite-meta { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .suite-chevron { width: 18px; height: 18px; color: var(--text-dim); transition: transform 0.2s; }
  .suite-chevron svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .suite-section.collapsed .suite-chevron { transform: rotate(-90deg); }
  .suite-section.collapsed .suite-body { display: none; }
  .suite-body { border-top: 1px solid var(--border); padding: 8px 0; }

  /* ── Test Rows ───────────────────────── */
  .test-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 20px; border-left: 2px solid transparent;
    transition: background 0.1s;
  }
  .test-row:hover { background: var(--surface2); }
  .test-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .test-icon svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .test-name { flex: 1; font-size: 13px; color: var(--text); font-weight: 500; }
  .test-duration { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .test-error {
    margin: 0 20px 8px 46px; padding: 8px 12px;
    background: var(--error-bg); border-left: 2px solid var(--error); border-radius: 0 4px 4px 0;
    font-size: 12px; font-family: var(--mono); color: var(--error); white-space: pre-wrap; word-break: break-word;
  }
  .screenshot-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: var(--accent); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; background: var(--accent-dim);
    font-family: var(--mono); transition: background 0.15s;
  }
  .screenshot-badge:hover { background: rgba(41, 128, 185, 0.2); }
  .screenshot-badge svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* ── Gallery ─────────────────────────── */
  .suite-gallery { padding: 12px 20px 16px; border-top: 1px solid var(--border); }
  .gallery-title {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 12px;
    font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.5px;
  }
  .gallery-title svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .gallery-thumb {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    overflow: hidden; cursor: pointer; transition: all 0.15s; position: relative;
  }
  .gallery-thumb:hover { border-color: var(--accent); transform: translateY(-1px); }
  .gallery-thumb img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .gallery-thumb.error img { display: none; }
  .gallery-thumb.error::before {
    content: "📷 Not found"; display: flex; align-items: center; justify-content: center;
    height: 120px; color: var(--text-dim); font-size: 12px; font-family: var(--mono);
  }
  .gallery-label {
    padding: 6px 8px; font-size: 11px; color: var(--text-muted); font-family: var(--mono);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Lightbox ────────────────────────── */
  .lightbox {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.85); z-index: 1000;
    display: none; align-items: center; justify-content: center;
    flex-direction: column; gap: 12px; padding: 40px;
  }
  .lightbox.visible { display: flex; }
  .lightbox-img {
    max-width: 90vw; max-height: 80vh; object-fit: contain;
    border-radius: 8px; border: 1px solid var(--border);
  }
  .lightbox-caption { font-size: 14px; color: var(--text-muted); font-family: var(--mono); }
  .lightbox-close {
    position: absolute; top: 16px; right: 24px;
    background: none; border: none; color: var(--text); font-size: 28px;
    cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; transition: background 0.15s;
  }
  .lightbox-close:hover { background: rgba(255,255,255,0.1); }

  /* ── Completed State ──────────────────── */
  .completed-banner {
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
    animation: fadeIn 0.3s ease;
  }
  .completed-banner .completed-icon {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--success); color: var(--bg);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 700; flex-shrink: 0;
  }
  .completed-banner .completed-content { flex: 1; min-width: 0; }
  .completed-banner .completed-text {
    font-size: 15px; font-weight: 600; color: var(--success);
    font-family: var(--mono); letter-spacing: 0.5px; text-transform: uppercase;
  }
  .completed-banner .completed-sub {
    font-size: 12px; color: var(--text-dim); font-weight: 400;
    text-transform: none; letter-spacing: 0; margin-top: 2px;
  }
  .completed-banner .completed-actions {
    margin-left: auto; display: flex; align-items: center; gap: 8px;
  }
  body.completed-state .footer-wrapper { display: none; }
  body.completed-state .content { padding-bottom: 24px; }

  /* ── All Screenshots Section ─────────── */
  .all-screenshots { margin: 24px 0; }
  .all-screenshots h2 {
    font-size: 16px; color: var(--accent); font-family: var(--mono);
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .all-screenshots h2 svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <img class="header-logo" src="/logo.png" alt="Pi" onerror="this.style.display='none'">
  <span class="badge" style="border-color:${statusColor}; color:${statusColor}">QA</span>
  <div class="title">${escapeHtml(report.title)}</div>
  <div class="header-meta">${formattedTimestamp}</div>
</div>

<!-- Main -->
<div class="main">
  <!-- Sidebar -->
  <div class="sidebar">
    ${reportSections.length > 0 ? `
    <div class="sidebar-section">Critical Features</div>
    ${sectionSidebarItems}` : ''}
    ${suites.length > 0 ? `
    <div class="sidebar-section" style="margin-top:${reportSections.length > 0 ? '16px' : '0'}">Test Suites</div>
    ${sidebarItems}` : ''}
    ${screenshots.length > 0 ? `
    <div class="sidebar-section" style="margin-top:16px">Screenshots</div>
    <div class="sidebar-item" onclick="scrollToScreenshots()" style="border-left-color: var(--accent)">
      <span class="sidebar-icon" style="color:var(--accent)">${ICONS.image}</span>
      <span class="sidebar-label">All Screenshots</span>
      <span class="sidebar-count" style="color:var(--accent)">${screenshots.length}</span>
    </div>` : ''}
  </div>

  <!-- Content -->
  <div class="content" id="content">
    <!-- Status Banner -->
    <div class="status-banner">
      <div class="status-icon">${overallStatus === 'passed' ? ICONS.check : ICONS.x}</div>
      <div class="status-text">${statusLabel}</div>
      <div class="status-detail">${report.releaseGate?.reason ? escapeHtml(report.releaseGate.reason) + ' · ' : ''}${reportSections.length > 0 ? `${reportSections.length} critical sections · ` : ''}${suites.length} suites · ${formatDuration(report.totalDuration)}</div>
    </div>

    ${reportSections.length > 0 ? `
    <!-- Critical Feature Cards -->
    <div class="critical-heading" id="critical-features">
      <h2>Critical Features</h2>
      <div class="critical-sub">P1 release sections · catalog-backed checks</div>
    </div>
    <div class="critical-card-grid">
      ${criticalFeatureCards}
    </div>
    ${criticalSections}
    ` : ''}

    <!-- Summary Cards -->
    <div class="summary-cards">
      <div class="summary-card passed">
        <div class="card-value">${report.totalPassed}</div>
        <div class="card-label">Passed</div>
      </div>
      <div class="summary-card failed">
        <div class="card-value">${report.totalFailed}</div>
        <div class="card-label">Failed</div>
      </div>
      <div class="summary-card skipped">
        <div class="card-value">${report.totalSkipped}</div>
        <div class="card-label">Skipped</div>
      </div>
      <div class="summary-card duration">
        <div class="card-value">${formatDuration(report.totalDuration)}</div>
        <div class="card-label">Duration</div>
      </div>
      ${report.coveragePercent !== undefined ? `
      <div class="summary-card coverage">
        <div class="card-value">${report.coveragePercent}%</div>
        <div class="card-label">Coverage</div>
      </div>` : ''}
    </div>

    <!-- Suite Sections -->
    ${suiteSections}

    <!-- All Screenshots -->
    ${screenshots.length > 0 ? `
    <div class="all-screenshots" id="all-screenshots">
      <h2>${ICONS.image} All Screenshots (${screenshots.length})</h2>
      <div class="gallery-grid">
        ${screenshots.map(s => `
          <div class="gallery-thumb" onclick="openLightbox('/screenshots/${encodeURIComponent(s.filename)}', '${escapeHtml(s.label)}')">
            <img src="/screenshots/${encodeURIComponent(s.filename)}" alt="${escapeHtml(s.label)}" loading="lazy" onerror="this.parentElement.classList.add('error')">
            <div class="gallery-label">${escapeHtml(s.label)}</div>
          </div>
        `).join("\n")}
      </div>
    </div>` : ''}
  </div>
</div>

<!-- Lightbox -->
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <button class="lightbox-close" onclick="closeLightbox()">×</button>
  <img class="lightbox-img" id="lightbox-img" src="" alt="">
  <div class="lightbox-caption" id="lightbox-caption"></div>
</div>

<!-- Footer -->
<div class="footer-wrapper">
  <div class="footer">
    <span class="hint"><kbd>Esc</kbd> to close</span>
    <div class="spacer"></div>
    <button class="btn btn-ghost" onclick="copySummary()">
      ${ICONS.copy} Copy Summary
    </button>
    <button class="btn" onclick="saveToDesktop()">
      ${ICONS.download} Save
    </button>
    <button class="btn" onclick="exportStandalone()">
      ${ICONS.monitor} Export Standalone
    </button>
    <button class="btn btn-primary" onclick="done()">Done</button>
  </div>
</div>

<script>
  const PORT = ${port};
  const REPORT = ${escapedReport};

  // Critical section collapse
  function toggleCriticalSection(idx) {
    const el = document.getElementById('critical-section-' + idx);
    if (el) el.classList.toggle('collapsed');
  }

  // Suite collapse
  function toggleSuite(idx) {
    const el = document.getElementById('suite-' + idx);
    if (el) el.classList.toggle('collapsed');
  }

  // Sidebar scroll
  function scrollToCriticalSection(idx) {
    const el = document.getElementById('critical-section-' + idx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    const items = document.querySelectorAll('.sidebar-item[data-critical-section]');
    if (items[idx]) items[idx].classList.add('active');
  }

  function scrollToSuite(idx) {
    const el = document.getElementById('suite-' + idx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    const items = document.querySelectorAll('.sidebar-item[data-suite]');
    if (items[idx]) items[idx].classList.add('active');
  }

  function scrollToScreenshots() {
    const el = document.getElementById('all-screenshots');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Lightbox
  function openLightbox(src, caption) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-caption').textContent = caption;
    document.getElementById('lightbox').classList.add('visible');
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('visible');
  }
  function openScreenshot(filename) {
    openLightbox('/screenshots/' + encodeURIComponent(filename), filename);
  }

  // Actions
  async function done() {
    // Show completed state
    var now = new Date();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    var yyyy = now.getFullYear();
    var hrs = now.getHours();
    var mins = String(now.getMinutes()).padStart(2, '0');
    var ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12 || 12;
    var ts = mm + '/' + dd + '/' + yyyy + ' @ ' + hrs + ':' + mins + ampm;

    var banner = document.createElement('div');
    banner.className = 'completed-banner';
    banner.innerHTML = '<div class="completed-icon">✓</div>' +
      '<div class="completed-content">' +
        '<div class="completed-text">Completed</div>' +
        '<div class="completed-sub">QA report reviewed — ' + ts + '</div>' +
      '</div>' +
      '<div class="completed-actions">' +
        '<button class="btn btn-ghost" onclick="copySummary()" title="Copy summary">${ICONS.copy} Copy</button>' +
      '</div>';

    var header = document.querySelector('.header');
    header.parentNode.insertBefore(banner, header.nextSibling);
    document.body.classList.add('completed-state');

    // Update header badge
    var badge = document.querySelector('.badge');
    if (badge) {
      badge.textContent = 'COMPLETED';
      badge.style.color = 'var(--success)';
      badge.style.borderColor = 'var(--success)';
    }

    try {
      await fetch('http://127.0.0.1:' + PORT + '/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'done' })
      });
    } catch(e) { console.error(e); }
  }

  async function saveToDesktop() {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: REPORT })
      });
      const data = await res.json();
      if (data.ok) alert(data.message || 'Saved!');
      else alert('Error: ' + (data.error || 'Unknown'));
    } catch(e) { alert('Save failed: ' + e.message); }
  }

  async function exportStandalone() {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/export-standalone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: REPORT })
      });
      const data = await res.json();
      if (data.ok) alert(data.message || 'Exported!');
      else alert('Error: ' + (data.error || 'Unknown'));
    } catch(e) { alert('Export failed: ' + e.message); }
  }

  function copySummary() {
    const lines = [
      'QA Report: ' + REPORT.title,
      'Generated: ' + formatTimestampJS(REPORT.generatedAt),
      '',
      'Results:',
      '  Passed: ' + REPORT.totalPassed,
      '  Failed: ' + REPORT.totalFailed,
      '  Skipped: ' + REPORT.totalSkipped,
      '  Duration: ' + formatMs(REPORT.totalDuration)
    ];
    if (REPORT.releaseGate) {
      lines.push('', 'Release Gate: ' + (REPORT.releaseGate.label || REPORT.releaseGate.status || 'unknown'));
      if (REPORT.releaseGate.reason) lines.push('  Reason: ' + REPORT.releaseGate.reason);
    }
    if ((REPORT.sections || []).length > 0) {
      lines.push('', 'Critical Features:');
      (REPORT.sections || []).forEach(section => {
        const checks = section.checks || [];
        const passed = checks.filter(c => c.status === 'passed').length;
        const blocked = checks.filter(c => c.status === 'failed' || c.status === 'blocked').length;
        lines.push('  ' + section.name + ' — ' + section.status + ' — ' + passed + '/' + checks.length + ' checks passed' + (blocked ? ' · ' + blocked + ' blocked/failed' : ''));
      });
    }
    lines.push('', 'Suites:');
    (REPORT.suites || []).forEach(s => {
      const status = s.failed === 0 ? '✅' : '❌';
      lines.push('  ' + status + ' ' + s.name + ' — ' + s.passed + '/' + (s.passed + s.failed) + ' passed');
    });
    if (REPORT.coveragePercent !== undefined) {
      lines.push('', 'Coverage: ' + REPORT.coveragePercent + '%');
    }
    navigator.clipboard.writeText(lines.join('\\n')).then(() => {
      const btn = document.querySelector('.btn-ghost');
      if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => btn.innerHTML = '${ICONS.copy} Copy Summary', 2000); }
    });
  }

  function formatTimestampJS(isoStr) {
    try {
      var d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var yyyy = d.getFullYear();
      var hrs = d.getHours();
      var mins = String(d.getMinutes()).padStart(2, '0');
      var ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12 || 12;
      return mm + '/' + dd + '/' + yyyy + ' @ ' + hrs + ':' + mins + ampm;
    } catch(e) { return isoStr; }
  }

  function formatMs(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('lightbox').classList.contains('visible')) {
        closeLightbox();
      } else {
        done();
      }
    }
  });

  // Highlight first sidebar item
  const firstItem = document.querySelector('.sidebar-item[data-critical-section]') || document.querySelector('.sidebar-item[data-suite]');
  if (firstItem) firstItem.classList.add('active');

  // Content scroll spy
  const content = document.getElementById('content');
  if (content) {
    content.addEventListener('scroll', () => {
      const sections = document.querySelectorAll('.suite-section');
      let activeIdx = 0;
      sections.forEach((s, i) => {
        const rect = s.getBoundingClientRect();
        if (rect.top < 200) activeIdx = i;
      });
      document.querySelectorAll('.sidebar-item[data-suite]').forEach((item, i) => {
        item.classList.toggle('active', i === activeIdx);
      });
    });
  }
</script>
</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(str: string | null | undefined): string {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
