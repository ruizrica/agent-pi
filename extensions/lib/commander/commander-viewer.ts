// ABOUTME: Helper module for routing reports to Commander instead of browser
// ABOUTME: Detects Commander availability and calls the commander_viewer tool

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Report types supported by the Commander viewer
export type CommanderReportType = "plan" | "spec" | "completion" | "security" | "test" | "qa" | "research" | "generic";
export type CommanderReportMode = "view" | "edit" | "approve";
export type CommanderReportFormat = "markdown" | "html" | "text";

export interface OpenReportOptions {
	content: string;
	title: string;
	reportType: CommanderReportType;
	mode?: CommanderReportMode;
	format?: CommanderReportFormat;
}

export type CommanderViewerFinalAction = "approved" | "declined";
export type CommanderViewerFallbackReason = "unavailable" | "open_failed" | "open_timeout" | "disconnected";

export interface WaitForCommanderOptions {
	openTimeoutMs?: number;
	pollIntervalMs?: number;
	includeContent?: boolean;
	signal?: AbortSignal;
}

export interface CommanderViewerWaitResult {
	inCommander: boolean;
	action?: CommanderViewerFinalAction;
	content?: string;
	reason?: CommanderViewerFallbackReason;
}

// Global state from commander-mcp extension
declare global {
	var __piCommanderAvailable: boolean | undefined;
	var __piCommanderClient: {
		callTool: (name: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<any>;
		isConnected: () => boolean;
	} | undefined;
}

function parseCommanderToolResponse(result: any): any | null {
	if (!result?.content?.[0]?.text) return null;
	try {
		return JSON.parse(result.content[0].text);
	} catch {
		return null;
	}
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return;
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);

		const onAbort = () => {
			cleanup();
			reject(new Error("Aborted"));
		};

		const cleanup = () => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", onAbort);
		};

		if (signal) {
			if (signal.aborted) {
				cleanup();
				reject(new Error("Aborted"));
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

/**
 * Check if Commander is available for routing reports
 */
export function isCommanderAvailable(): boolean {
	return typeof globalThis.__piCommanderAvailable !== "undefined" && globalThis.__piCommanderAvailable === true;
}

/**
 * Open a report in Commander's native viewer
 * @returns true if successfully routed to Commander, false otherwise
 */
export async function openInCommander(
	options: OpenReportOptions,
	ctx: ExtensionContext
): Promise<boolean> {
	if (!isCommanderAvailable()) {
		return false;
	}

	const client = globalThis.__piCommanderClient;
	if (!client || !client.isConnected()) {
		return false;
	}

	try {
		const result = await client.callTool(
			"commander_viewer",
			{
				operation: "open",
				content: options.content,
				title: options.title,
				reportType: options.reportType,
				mode: options.mode || "view",
				format: options.format || "markdown",
			},
			30000 // 30 second timeout for user interaction
		);

		const response = parseCommanderToolResponse(result);
		if (response?.success) {
			ctx.ui.notify(`Report opened in Commander: ${options.title}`, "info");
			return true;
		}
		return false;
	} catch (err: any) {
		// Commander failed, fall back to browser
		ctx.ui.notify(`Commander unavailable, falling back to browser`, "warning");
		return false;
	}
}

/**
 * Close the active report in Commander
 */
export async function closeInCommander(
	reportType?: string,
	saveContent?: boolean
): Promise<boolean> {
	if (!isCommanderAvailable()) {
		return false;
	}

	const client = globalThis.__piCommanderClient;
	if (!client || !client.isConnected()) {
		return false;
	}

	try {
		await client.callTool(
			"commander_viewer",
			{
				operation: "close",
				reportType,
				saveContent,
			},
			5000
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the status of the Commander report viewer
 */
export async function getCommanderViewerStatus(includeContent?: boolean): Promise<{
	isOpen: boolean;
	content?: string;
	title: string;
	reportType: string;
	mode: string;
	userAction?: "approved" | "declined" | "saved" | "closed" | null;
} | null> {
	if (!isCommanderAvailable()) {
		return null;
	}

	const client = globalThis.__piCommanderClient;
	if (!client || !client.isConnected()) {
		return null;
	}

	try {
		const result = await client.callTool(
			"commander_viewer",
			{
				operation: "status",
				includeContent,
			},
			5000
		);

		return parseCommanderToolResponse(result);
	} catch {
		return null;
	}
}

/**
 * Open a Commander viewer and wait for a real user action.
 * Falls back to the local browser viewer when Commander is unavailable,
 * fails to open the viewer, never reaches an open state, or disconnects.
 */
export async function openAndWaitInCommander(
	options: OpenReportOptions,
	ctx: ExtensionContext,
	waitOptions: WaitForCommanderOptions = {}
): Promise<CommanderViewerWaitResult> {
	const openTimeoutMs = waitOptions.openTimeoutMs ?? 4000;
	const pollIntervalMs = waitOptions.pollIntervalMs ?? 500;
	const includeContent = waitOptions.includeContent ?? false;
	const signal = waitOptions.signal;

	if (!isCommanderAvailable()) {
		return { inCommander: false, reason: "unavailable" };
	}

	const client = globalThis.__piCommanderClient;
	if (!client || !client.isConnected()) {
		return { inCommander: false, reason: "unavailable" };
	}

	try {
		const result = await client.callTool(
			"commander_viewer",
			{
				operation: "open",
				content: options.content,
				title: options.title,
				reportType: options.reportType,
				mode: options.mode || "view",
				format: options.format || "markdown",
			},
			30000
		);
		const response = parseCommanderToolResponse(result);
		if (!response?.success) {
			return { inCommander: false, reason: "open_failed" };
		}
	} catch {
		if (ctx.hasUI) ctx.ui.notify("Commander unavailable, falling back to browser", "warning");
		return { inCommander: false, reason: "open_failed" };
	}

	const startedAt = Date.now();
	let sawMatchingOpen = false;
	let disconnectCount = 0;

	while (true) {
		if (signal?.aborted) {
			throw new Error("Aborted");
		}

		const status = await getCommanderViewerStatus(includeContent);
		if (!status) {
			if (!sawMatchingOpen) {
				if (Date.now() - startedAt >= openTimeoutMs) {
					if (ctx.hasUI) ctx.ui.notify("Commander did not open the viewer, falling back to browser", "warning");
					return { inCommander: false, reason: "open_timeout" };
				}
			} else {
				disconnectCount += 1;
				if (disconnectCount >= 2) {
					if (ctx.hasUI) ctx.ui.notify("Commander disconnected, falling back to browser", "warning");
					return { inCommander: false, reason: "disconnected" };
				}
			}
			await sleep(pollIntervalMs, signal);
			continue;
		}

		disconnectCount = 0;
		const matchesViewer = status.reportType === options.reportType && status.title === options.title;

		if (matchesViewer && status.userAction === "approved") {
			return { inCommander: true, action: "approved", content: status.content };
		}
		if (matchesViewer && (status.userAction === "declined" || status.userAction === "closed")) {
			return { inCommander: true, action: "declined", content: status.content };
		}

		if (matchesViewer && status.isOpen) {
			if (!sawMatchingOpen && ctx.hasUI) {
				ctx.ui.notify(`Report opened in Commander: ${options.title}`, "info");
			}
			sawMatchingOpen = true;
		} else if (!sawMatchingOpen && Date.now() - startedAt >= openTimeoutMs) {
			if (ctx.hasUI) ctx.ui.notify("Commander did not open the viewer, falling back to browser", "warning");
			return { inCommander: false, reason: "open_timeout" };
		}

		await sleep(pollIntervalMs, signal);
	}
}

/**
 * Helper to determine report type from file path or name
 */
export function detectReportType(filePath: string): CommanderReportType {
	const lower = filePath.toLowerCase();
	if (lower.includes("plan") || lower.includes("todo")) return "plan";
	if (lower.includes("spec") || lower.includes("specification")) return "spec";
	if (lower.includes("completion") || lower.includes("report")) return "completion";
	if (lower.includes("security")) return "security";
	if (lower.includes("test")) return "test";
	if (lower.includes("qa")) return "qa";
	if (lower.includes("research")) return "research";
	return "generic";
}

/**
 * Unified function to display a report
 * Routes to Commander if available, otherwise returns false for browser fallback
 */
export async function showReport(
	options: OpenReportOptions,
	ctx: ExtensionContext
): Promise<{ inCommander: boolean }> {
	// Try Commander first
	if (isCommanderAvailable()) {
		const success = await openInCommander(options, ctx);
		if (success) {
			return { inCommander: true };
		}
	}

	// Fall back to browser
	return { inCommander: false };
}
