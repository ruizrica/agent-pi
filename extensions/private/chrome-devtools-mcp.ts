// ABOUTME: Thin convenience layer over the native Chrome DevTools MCP server.
// ABOUTME: Provides health-check (connect), setup diagnostics, and access-verification tools.
// ABOUTME: The actual 29 browser tools are exposed natively via ~/.claude/mcp.json — this extension
// ABOUTME: adds higher-level helpers that compose those native tools.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { outputLine } from "../lib/output-box.ts";
import { applyExtensionDefaults } from "../lib/themeMap.ts";

// ── Login-detection heuristics ──────────────────────────────────────

const LOGIN_INDICATORS = [
	"log in",
	"sign in",
	"sign-in",
	"authenticate",
	"session expired",
	"repository not found",
	"page not found",
	"choose an account",
];

function detectLoginRequired(text: string): boolean {
	const lower = text.toLowerCase();
	return LOGIN_INDICATORS.some((indicator) => lower.includes(indicator));
}

// ── Setup diagnostics ───────────────────────────────────────────────

interface SetupCheckResult {
	chromeRunning: boolean;
	chromeVersion: string | null;
	mcpConfigured: boolean;
	autoConnectEnabled: boolean;
	allOk: boolean;
	issues: string[];
	setupInstructions: string[];
}

function runSetupCheck(): SetupCheckResult {
	const issues: string[] = [];
	const setupInstructions: string[] = [];

	// Check Chrome running
	let chromeRunning = false;
	try {
		const result = execSync('pgrep -f "Google Chrome" 2>/dev/null', { encoding: "utf8", timeout: 5000 });
		chromeRunning = result.trim().length > 0;
	} catch {
		chromeRunning = false;
	}
	if (!chromeRunning) {
		issues.push("Chrome is not running");
		setupInstructions.push("Open Google Chrome");
	}

	// Check Chrome version
	let chromeVersion: string | null = null;
	const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
	try {
		if (existsSync(chromePath)) {
			const version = execSync(`"${chromePath}" --version 2>/dev/null`, { encoding: "utf8", timeout: 5000 });
			chromeVersion = version.trim();
			const majorVersion = parseInt(version.match(/(\d+)/)?.[1] || "0", 10);
			if (majorVersion < 136) {
				issues.push(`Chrome version ${majorVersion} is too old (need 136+)`);
				setupInstructions.push("Update Chrome to version 136 or later");
			}
		}
	} catch {}

	// Check MCP config
	let mcpConfigured = false;
	let autoConnectEnabled = false;
	const mcpConfigPath = join(process.env.HOME || "~", ".claude", "mcp.json");
	try {
		if (existsSync(mcpConfigPath)) {
			const config = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
			mcpConfigured = !!config?.mcpServers?.["chrome-devtools"];
			autoConnectEnabled = JSON.stringify(config?.mcpServers?.["chrome-devtools"]?.args || []).includes("autoConnect");
		}
	} catch {}
	if (!mcpConfigured) {
		issues.push("Chrome DevTools MCP server not registered in ~/.claude/mcp.json");
		setupInstructions.push(
			'Add to ~/.claude/mcp.json mcpServers: "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest", "--autoConnect"] }',
		);
	}
	if (mcpConfigured && !autoConnectEnabled) {
		issues.push("--autoConnect flag not found in MCP config");
		setupInstructions.push("Add --autoConnect to the chrome-devtools MCP server args");
	}

	if (chromeRunning && mcpConfigured) {
		setupInstructions.push(
			"If tools still fail: quit Chrome (the MCP server will launch it), then restart this CLI session",
		);
	}

	const allOk = issues.length === 0;

	return { chromeRunning, chromeVersion, mcpConfigured, autoConnectEnabled, allOk, issues, setupInstructions };
}

// ── Tool parameters ─────────────────────────────────────────────────

const ConnectParams = Type.Object({
	timeout_ms: Type.Optional(Type.Number({ description: "Timeout for health check in milliseconds (default: 10000)" })),
});

const AccessParams = Type.Object({
	url: Type.String({ description: "URL whose access/auth state should be verified" }),
});

// ── Extension ───────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "chrome_devtools_mcp_connect",
		label: "Chrome DevTools MCP Status",
		description:
			"Check if the Chrome DevTools MCP server is connected and the browser is reachable.\n" +
			"Returns a structured action plan: call mcp__chrome-devtools__list_pages to verify connection.\n" +
			"If not connected, returns diagnostic results and step-by-step setup instructions.\n" +
			"This does NOT start the MCP server — it's started automatically by Claude CLI via ~/.claude/mcp.json.",
		parameters: ConnectParams,
		async execute(_toolCallId, _params) {
			const diagnostics = runSetupCheck();

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								action_plan: {
									step1: "Call the native MCP tool mcp__chrome-devtools__list_pages",
									step2_success: "If it returns a list of tabs → Chrome DevTools MCP is connected. Proceed with the workflow.",
									step2_failure:
										"If it fails (error, timeout, tool not found) → Chrome DevTools MCP is NOT available. " +
										"Show the user the setup instructions below and STOP the workflow. " +
										"Do NOT fall back to agent-browser for private/authenticated pages.",
								},
								diagnostics,
								setup_instructions_for_user: diagnostics.allOk
									? [
											"Chrome and MCP config look good. If mcp__chrome-devtools__list_pages still fails:",
											"1. Quit Chrome",
											"2. Relaunch Chrome with: --profile-directory=<PROFILE> --remote-debugging-port=9222",
											"3. Restart this CLI session so the MCP server can reconnect",
											"Note: Always ask the user which Chrome profile to use before launching.",
										]
									: [
											"Chrome DevTools MCP is not fully set up. Fix these issues:",
											...diagnostics.issues.map((issue, i) => `${i + 1}. ${issue}`),
											"",
											"Steps to fix:",
											...diagnostics.setupInstructions.map((step, i) => `${i + 1}. ${step}`),
											"",
											"After fixing, restart this CLI session and try again.",
										],
							},
							null,
							2,
						),
					},
				],
			};
		},
		renderCall(_args, theme) {
			const text =
				theme.fg("toolTitle", theme.bold("chrome_devtools_mcp_connect ")) + theme.fg("accent", "health check");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},
	});

	pi.registerTool({
		name: "chrome_devtools_mcp_setup_check",
		label: "Chrome DevTools Setup Check",
		description:
			"Run local diagnostics to check Chrome DevTools MCP prerequisites.\n" +
			"Checks: Chrome running, Chrome version, MCP config in ~/.claude/mcp.json, autoConnect flag.\n" +
			"Returns actionable setup instructions for any missing prerequisites.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params) {
			const diagnostics = runSetupCheck();
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(diagnostics, null, 2),
					},
				],
			};
		},
		renderCall(_args, theme) {
			const text =
				theme.fg("toolTitle", theme.bold("chrome_devtools_mcp_setup_check ")) + theme.fg("accent", "diagnostics");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},
	});

	pi.registerTool({
		name: "chrome_devtools_mcp_verify_access",
		label: "Chrome DevTools Verify Access",
		description:
			"Verify whether a page is accessible or requires login using Chrome DevTools MCP.\n" +
			"Returns the exact sequence of native MCP tool calls to make.\n" +
			"The LLM MUST call the native tools — this tool only provides the instructions.",
		parameters: AccessParams,
		async execute(_toolCallId, params) {
			const p = params as { url: string };
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								instruction:
									"Execute these native Chrome DevTools MCP tool calls in sequence:",
								steps: [
									{
										step: 1,
										tool: "mcp__chrome-devtools__navigate_page",
										args: { url: p.url },
										description: "Navigate to the target URL",
									},
									{
										step: 2,
										tool: "mcp__chrome-devtools__take_snapshot",
										args: {},
										description: "Take accessibility snapshot of the page",
									},
									{
										step: 3,
										action: "analyze_snapshot",
										description:
											"Check the snapshot text for login indicators. " +
											"If ANY of these appear, the user needs to log in in Chrome: " +
											LOGIN_INDICATORS.join(", "),
									},
									{
										step: 4,
										action: "if_login_required",
										description:
											"Ask the user to log in to the site in their Chrome browser, " +
											"then repeat steps 1-3 to verify access.",
									},
									{
										step: 5,
										action: "if_accessible",
										description: "Page is accessible — proceed with content extraction.",
									},
								],
								login_indicators: LOGIN_INDICATORS,
								url: p.url,
							},
							null,
							2,
						),
					},
				],
			};
		},
		renderCall(args, theme) {
			const text =
				theme.fg("toolTitle", theme.bold("chrome_devtools_mcp_verify_access ")) +
				theme.fg("accent", String((args as any).url || ""));
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},
	});

	// ── Lifecycle ────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		try {
			applyExtensionDefaults(import.meta.url as any, ctx as any);
		} catch {}
	});
}
