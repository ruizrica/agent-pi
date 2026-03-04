// ABOUTME: Web testing extension using Cloudflare Browser Rendering for screenshots, content extraction, and a11y.
// ABOUTME: Registers /web-test command and web_test tool backed by a deployed Cloudflare Worker.
/**
 * Web Test -- Cloudflare Browser Rendering powered web testing
 *
 * Uses a deployed Cloudflare Worker (pi-web-test) with Browser Rendering
 * binding to provide headless browser capabilities:
 *
 *   - Screenshot any URL at custom viewport sizes
 *   - Extract page text/HTML content (with optional CSS selector)
 *   - Run accessibility audits via axe-core
 *   - Capture responsive screenshots at mobile/tablet/desktop breakpoints
 *
 * Screenshots are saved to .pi/web-test-captures/ and paths are returned
 * so the agent can Read them to visually inspect pages.
 *
 * Commands:
 *   /web-test screenshot <url>          -- capture a screenshot
 *   /web-test content <url> [selector]  -- extract page content
 *   /web-test a11y <url>                -- accessibility audit
 *   /web-test responsive <url>          -- multi-viewport screenshots
 *
 * Tool:
 *   web_test                            -- programmatic access (agent can call)
 *
 * Prerequisites:
 *   - Cloudflare Worker deployed (auto-deployed on first use)
 *   - wrangler CLI authenticated
 *   - API key in agent/extensions/web-test-worker/.env
 *
 * Usage: pi -e extensions/web-test.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { type AutocompleteItem } from "@mariozechner/pi-tui";
import { Text } from "@mariozechner/pi-tui";
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Constants ────────────────────────────────────

const CAPTURE_DIR_NAME = "web-test-captures";
const WORKER_NAME = "pi-web-test";

// ── Types ────────────────────────────────────────

type Action = "screenshot" | "content" | "a11y" | "responsive";

interface WorkerConfig {
	workerUrl: string;
	apiKey: string;
}

interface WebTestResult {
	action: Action;
	url: string;
	success: boolean;
	screenshots?: string[];
	data?: any;
	error?: string;
	elapsed: number;
}

// ── Config Loading ───────────────────────────────

function loadWorkerConfig(): WorkerConfig | null {
	const extDir = dirname(fileURLToPath(import.meta.url));
	const envPath = join(extDir, "web-test-worker", ".env");

	if (!existsSync(envPath)) {
		return null;
	}

	const content = readFileSync(envPath, "utf-8");
	const vars: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq > 0) {
			vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
		}
	}

	if (!vars.WORKER_URL || !vars.API_KEY) {
		return null;
	}

	return { workerUrl: vars.WORKER_URL, apiKey: vars.API_KEY };
}

// ── Capture Directory ────────────────────────────

function ensureCaptureDir(cwd: string): string {
	const captureDir = join(cwd, ".pi", CAPTURE_DIR_NAME);
	if (!existsSync(captureDir)) {
		mkdirSync(captureDir, { recursive: true });
	}
	return captureDir;
}

function timestamp(): string {
	const now = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, "0");
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ── Worker Deployment ────────────────────────────

function checkWorkerHealth(config: WorkerConfig): boolean {
	try {
		const result = execSync(
			`curl -sf --max-time 5 "${config.workerUrl}/ping"`,
			{ encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const parsed = JSON.parse(result);
		return parsed.status === "ok";
	} catch {
		return false;
	}
}

function deployWorker(): { success: boolean; url?: string; error?: string } {
	const extDir = dirname(fileURLToPath(import.meta.url));
	const workerDir = join(extDir, "web-test-worker");

	if (!existsSync(join(workerDir, "node_modules"))) {
		try {
			execSync("npm install", { cwd: workerDir, stdio: "ignore", timeout: 60000 });
		} catch (e: any) {
			return { success: false, error: `npm install failed: ${e.message}` };
		}
	}

	try {
		const output = execSync("npx wrangler deploy 2>&1", {
			cwd: workerDir,
			encoding: "utf-8",
			timeout: 60000,
		});

		// Extract URL from deploy output
		const urlMatch = output.match(/https:\/\/[\w-]+\.[\w-]+\.workers\.dev/);
		if (urlMatch) {
			return { success: true, url: urlMatch[0] };
		}

		return { success: true, url: undefined };
	} catch (e: any) {
		return { success: false, error: `wrangler deploy failed: ${e.stdout || e.message}` };
	}
}

// ── Worker API Calls ─────────────────────────────

async function callWorker(
	config: WorkerConfig,
	endpoint: string,
	body: Record<string, any>,
): Promise<Response> {
	const resp = await fetch(`${config.workerUrl}${endpoint}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Api-Key": config.apiKey,
		},
		body: JSON.stringify(body),
	});
	return resp;
}

// ── Action Handlers ──────────────────────────────

async function doScreenshot(
	config: WorkerConfig,
	url: string,
	cwd: string,
	opts: { width?: number; height?: number; fullPage?: boolean },
): Promise<WebTestResult> {
	const start = Date.now();

	const resp = await callWorker(config, "/screenshot", {
		url,
		width: opts.width ?? 1280,
		height: opts.height ?? 720,
		fullPage: opts.fullPage ?? false,
	});

	if (!resp.ok) {
		const err = await resp.json().catch(() => ({ error: resp.statusText })) as any;
		return { action: "screenshot", url, success: false, error: err.error || resp.statusText, elapsed: Date.now() - start };
	}

	const captureDir = ensureCaptureDir(cwd);
	const ts = timestamp();
	const filename = `screenshot-${ts}.png`;
	const filePath = join(captureDir, filename);

	const buffer = Buffer.from(await resp.arrayBuffer());
	writeFileSync(filePath, buffer);

	const title = decodeURIComponent(resp.headers.get("X-Page-Title") || "untitled");

	return {
		action: "screenshot",
		url,
		success: true,
		screenshots: [filePath],
		data: { title, width: opts.width ?? 1280, height: opts.height ?? 720, sizeBytes: buffer.length },
		elapsed: Date.now() - start,
	};
}

async function doContent(
	config: WorkerConfig,
	url: string,
	opts: { selector?: string },
): Promise<WebTestResult> {
	const start = Date.now();

	const resp = await callWorker(config, "/content", { url, selector: opts.selector });

	if (!resp.ok) {
		const err = await resp.json().catch(() => ({ error: resp.statusText })) as any;
		return { action: "content", url, success: false, error: err.error || resp.statusText, elapsed: Date.now() - start };
	}

	const data = await resp.json();

	return {
		action: "content",
		url,
		success: true,
		data,
		elapsed: Date.now() - start,
	};
}

async function doA11y(
	config: WorkerConfig,
	url: string,
): Promise<WebTestResult> {
	const start = Date.now();

	const resp = await callWorker(config, "/a11y", { url });

	if (!resp.ok) {
		const err = await resp.json().catch(() => ({ error: resp.statusText })) as any;
		return { action: "a11y", url, success: false, error: err.error || resp.statusText, elapsed: Date.now() - start };
	}

	const data = await resp.json();

	return {
		action: "a11y",
		url,
		success: true,
		data,
		elapsed: Date.now() - start,
	};
}

async function doResponsive(
	config: WorkerConfig,
	url: string,
	cwd: string,
	opts: { viewports?: Array<{ name: string; width: number; height: number }> },
): Promise<WebTestResult> {
	const start = Date.now();

	const resp = await callWorker(config, "/responsive", {
		url,
		viewports: opts.viewports,
	});

	if (!resp.ok) {
		const err = await resp.json().catch(() => ({ error: resp.statusText })) as any;
		return { action: "responsive", url, success: false, error: err.error || resp.statusText, elapsed: Date.now() - start };
	}

	const data = await resp.json() as any;

	// Save each screenshot as a separate PNG
	const captureDir = ensureCaptureDir(cwd);
	const ts = timestamp();
	const savedPaths: string[] = [];

	if (data.screenshots && Array.isArray(data.screenshots)) {
		for (const shot of data.screenshots) {
			const filename = `responsive-${shot.name}-${ts}.png`;
			const filePath = join(captureDir, filename);
			const buffer = Buffer.from(shot.base64, "base64");
			writeFileSync(filePath, buffer);
			savedPaths.push(filePath);
		}
	}

	return {
		action: "responsive",
		url,
		success: true,
		screenshots: savedPaths,
		data: {
			title: data.title,
			viewports: data.viewports,
		},
		elapsed: Date.now() - start,
	};
}

// ── Result Formatting ────────────────────────────

function formatResult(result: WebTestResult): string {
	const lines: string[] = [];

	if (!result.success) {
		lines.push(`Error: ${result.error}`);
		lines.push(`URL: ${result.url}`);
		lines.push(`Elapsed: ${Math.round(result.elapsed / 1000)}s`);
		return lines.join("\n");
	}

	lines.push(`Web test complete: ${result.action}`);
	lines.push(`URL: ${result.url}`);
	lines.push(`Elapsed: ${Math.round(result.elapsed / 1000)}s`);
	lines.push("");

	switch (result.action) {
		case "screenshot": {
			const d = result.data;
			lines.push(`Page title: ${d.title}`);
			lines.push(`Viewport: ${d.width}x${d.height}`);
			lines.push(`File size: ${(d.sizeBytes / 1024).toFixed(1)} KB`);
			lines.push("");
			if (result.screenshots?.length) {
				lines.push("Screenshot saved:");
				for (const p of result.screenshots) lines.push(`  ${p}`);
				lines.push("");
				lines.push("Use Read on the path above to view the captured page.");
			}
			break;
		}
		case "content": {
			const d = result.data as any;
			lines.push(`Page title: ${d.title}`);
			lines.push(`Text length: ${d.textLength} chars`);
			lines.push(`HTML length: ${d.htmlLength} chars`);
			lines.push("");
			lines.push("--- Page Text ---");
			// Truncate for display
			const text = d.text as string;
			lines.push(text.length > 2000 ? text.slice(0, 2000) + "\n...[truncated]" : text);
			break;
		}
		case "a11y": {
			const d = result.data as any;
			lines.push(`Page title: ${d.title}`);
			lines.push("");
			lines.push(`Summary:`);
			lines.push(`  Violations: ${d.summary.violations}`);
			lines.push(`  Passes: ${d.summary.passes}`);
			lines.push(`  Incomplete: ${d.summary.incomplete}`);
			lines.push(`  Inapplicable: ${d.summary.inapplicable}`);

			if (d.violations && d.violations.length > 0) {
				lines.push("");
				lines.push("Violations:");
				for (const v of d.violations) {
					lines.push(`  [${v.impact}] ${v.id}: ${v.description}`);
					lines.push(`    Help: ${v.help}`);
					lines.push(`    Affected nodes: ${v.nodes}`);
					lines.push(`    More info: ${v.helpUrl}`);
					lines.push("");
				}
			} else {
				lines.push("");
				lines.push("No accessibility violations found.");
			}
			break;
		}
		case "responsive": {
			const d = result.data as any;
			lines.push(`Page title: ${d.title}`);
			lines.push("");

			if (d.viewports && d.viewports.length > 0) {
				lines.push("Viewports captured:");
				for (const vp of d.viewports) {
					lines.push(`  ${vp.name}: ${vp.width}x${vp.height}`);
				}
			}

			if (result.screenshots?.length) {
				lines.push("");
				lines.push("Screenshots saved:");
				for (const p of result.screenshots) lines.push(`  ${p}`);
				lines.push("");
				lines.push("Use Read on any path above to view the captured page.");
			}
			break;
		}
	}

	return lines.join("\n");
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {

	let config: WorkerConfig | null = null;

	function getConfig(): WorkerConfig | null {
		if (config) return config;
		config = loadWorkerConfig();
		return config;
	}

	function ensureWorker(): { config: WorkerConfig | null; error?: string } {
		const cfg = getConfig();
		if (!cfg) {
			return {
				config: null,
				error: "Worker not configured. Missing .env file at agent/extensions/web-test-worker/.env with WORKER_URL and API_KEY.",
			};
		}

		// Quick health check
		if (!checkWorkerHealth(cfg)) {
			// Try redeploying
			const result = deployWorker();
			if (!result.success) {
				return { config: null, error: `Worker health check failed and redeploy failed: ${result.error}` };
			}
			if (result.url && result.url !== cfg.workerUrl) {
				cfg.workerUrl = result.url;
			}
		}

		return { config: cfg };
	}

	// ── /web-test command ────────────────────────

	const ACTIONS = ["screenshot", "content", "a11y", "responsive"];

	pi.registerCommand("web-test", {
		description: "Test web pages using Cloudflare Browser Rendering (screenshot, content, a11y, responsive)",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = ACTIONS.map(a => ({
				value: a,
				label: a === "screenshot" ? "screenshot <url> -- capture a PNG screenshot"
					: a === "content" ? "content <url> [selector] -- extract page text/HTML"
					: a === "a11y" ? "a11y <url> -- accessibility audit via axe-core"
					: "responsive <url> -- multi-viewport screenshots",
			}));
			const filtered = items.filter(i => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const action = parts[0]?.toLowerCase();
			const url = parts[1];

			if (!action || !ACTIONS.includes(action)) {
				ctx.ui.notify(
					"Usage: /web-test <action> <url>\n" +
					"Actions: screenshot, content, a11y, responsive",
					"warning",
				);
				return;
			}

			if (!url) {
				ctx.ui.notify(`Usage: /web-test ${action} <url>`, "warning");
				return;
			}

			const { config: cfg, error } = ensureWorker();
			if (!cfg) {
				ctx.ui.notify(error!, "error");
				return;
			}

			ctx.ui.notify(`Running ${action} on ${url}...`, "info");

			let result: WebTestResult;

			switch (action) {
				case "screenshot":
					result = await doScreenshot(cfg, url, ctx.cwd, {});
					break;
				case "content":
					result = await doContent(cfg, url, { selector: parts[2] });
					break;
				case "a11y":
					result = await doA11y(cfg, url);
					break;
				case "responsive":
					result = await doResponsive(cfg, url, ctx.cwd, {});
					break;
				default:
					return;
			}

			if (result.success) {
				const msg = result.screenshots?.length
					? `${action} complete (${Math.round(result.elapsed / 1000)}s). ${result.screenshots.length} file(s) saved.`
					: `${action} complete (${Math.round(result.elapsed / 1000)}s).`;
				ctx.ui.notify(msg, "success");
			} else {
				ctx.ui.notify(`${action} failed: ${result.error}`, "error");
			}

			return formatResult(result);
		},
	});

	// ── web_test tool ────────────────────────────

	pi.registerTool({
		name: "web_test",
		label: "Web Test",
		description: [
			"Test web pages using Cloudflare Browser Rendering.",
			"Captures screenshots, extracts content, runs accessibility audits,",
			"and tests responsive layouts via a headless Chromium browser.",
			"",
			"Actions:",
			"  screenshot  -- capture a PNG screenshot (returns file path for Read tool)",
			"  content     -- extract page text and HTML (with optional CSS selector)",
			"  a11y        -- run axe-core accessibility audit",
			"  responsive  -- capture at mobile (375px), tablet (768px), desktop (1440px)",
			"",
			"Screenshot paths can be passed to the Read tool to visually inspect pages.",
		].join("\n"),
		parameters: Type.Object({
			action: Type.String({
				description: "Action to perform: screenshot, content, a11y, responsive",
			}),
			url: Type.String({
				description: "URL to test (must be http: or https:)",
			}),
			width: Type.Optional(Type.Number({ description: "Viewport width in pixels (default: 1280, screenshot only)" })),
			height: Type.Optional(Type.Number({ description: "Viewport height in pixels (default: 720, screenshot only)" })),
			fullPage: Type.Optional(Type.Boolean({ description: "Capture full page scroll (default: false, screenshot only)" })),
			selector: Type.Optional(Type.String({ description: "CSS selector to extract (content action only)" })),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { action, url, width, height, fullPage, selector } =
				params as { action: string; url: string; width?: number; height?: number; fullPage?: boolean; selector?: string };

			// Validate action
			if (!ACTIONS.includes(action)) {
				return {
					content: [{ type: "text" as const, text: `Unknown action: ${action}. Available: ${ACTIONS.join(", ")}` }],
					details: { error: `Unknown action: ${action}` },
				};
			}

			// Validate URL
			try {
				const parsed = new URL(url);
				if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
					return {
						content: [{ type: "text" as const, text: "Only http: and https: URLs are allowed." }],
						details: { error: "Invalid protocol" },
					};
				}
			} catch {
				return {
					content: [{ type: "text" as const, text: `Invalid URL: ${url}` }],
					details: { error: "Invalid URL" },
				};
			}

			const { config: cfg, error } = ensureWorker();
			if (!cfg) {
				return {
					content: [{ type: "text" as const, text: error! }],
					details: { error },
				};
			}

			if (onUpdate) {
				onUpdate({
					content: [{ type: "text" as const, text: `Running ${action} on ${url}...` }],
					details: { action, url, status: "running" },
				});
			}

			let result: WebTestResult;

			switch (action) {
				case "screenshot":
					result = await doScreenshot(cfg, url, ctx.cwd, { width, height, fullPage });
					break;
				case "content":
					result = await doContent(cfg, url, { selector });
					break;
				case "a11y":
					result = await doA11y(cfg, url);
					break;
				case "responsive":
					result = await doResponsive(cfg, url, ctx.cwd, {});
					break;
				default:
					result = { action: action as Action, url, success: false, error: "Unknown action", elapsed: 0 };
			}

			const output = formatResult(result);

			return {
				content: [{ type: "text" as const, text: output }],
				details: {
					action,
					url,
					status: result.success ? "done" : "error",
					screenshots: result.screenshots,
					data: result.data,
					elapsed: result.elapsed,
				},
			};
		},

		renderCall(_params, _theme) {
			const p = _params as { action: string; url: string };
			const DIM = "\x1b[90m";
			const BRIGHT = "\x1b[1;97m";
			const RST = "\x1b[0m";
			return new Text(`${DIM}web-test:${RST} ${BRIGHT}${p.action}${RST} ${DIM}${p.url}${RST}`, 0, 0);
		},

		renderResult(result, _options, _theme) {
			const details = result.details as any;
			const DIM = "\x1b[90m";
			const GREEN = "\x1b[32m";
			const RED = "\x1b[91m";
			const BRIGHT = "\x1b[1;97m";
			const YELLOW = "\x1b[33m";
			const RST = "\x1b[0m";

			if (details?.status === "error") {
				return new Text(`${RED}failed${RST} ${DIM}${details?.action || ""}${RST}`, 0, 0);
			}

			const elapsed = details?.elapsed ? Math.round(details.elapsed / 1000) : 0;
			const action = details?.action || "";

			switch (action) {
				case "screenshot": {
					const count = details?.screenshots?.length ?? 0;
					return new Text(
						`${GREEN}captured${RST} ${BRIGHT}${count}${RST} ${DIM}screenshot in ${elapsed}s${RST}`,
						0, 0,
					);
				}
				case "content": {
					const len = details?.data?.textLength ?? 0;
					return new Text(
						`${GREEN}extracted${RST} ${BRIGHT}${len}${RST} ${DIM}chars in ${elapsed}s${RST}`,
						0, 0,
					);
				}
				case "a11y": {
					const violations = details?.data?.summary?.violations ?? 0;
					const passes = details?.data?.summary?.passes ?? 0;
					const color = violations > 0 ? YELLOW : GREEN;
					return new Text(
						`${color}${violations} violations${RST} ${DIM}${passes} passes in ${elapsed}s${RST}`,
						0, 0,
					);
				}
				case "responsive": {
					const count = details?.screenshots?.length ?? 0;
					return new Text(
						`${GREEN}captured${RST} ${BRIGHT}${count}${RST} ${DIM}viewports in ${elapsed}s${RST}`,
						0, 0,
					);
				}
				default:
					return new Text(`${GREEN}done${RST} ${DIM}in ${elapsed}s${RST}`, 0, 0);
			}
		},
	});

	// ── Session start ────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		ensureCaptureDir(ctx.cwd);
	});
}
