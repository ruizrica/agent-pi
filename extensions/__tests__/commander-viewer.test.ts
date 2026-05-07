import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAndWaitInCommander } from "../lib/commander/commander-viewer.ts";

function toolResult(payload: any) {
	return {
		content: [{ type: "text", text: JSON.stringify(payload) }],
	} as any;
}

function invalidToolResult() {
	return {
		content: [{ type: "text", text: "not-json" }],
	} as any;
}

function makeCtx() {
	return {
		hasUI: true,
		ui: { notify: vi.fn() },
	} as any;
}

const g = globalThis as any;
const OPTIONS = {
	content: "# Plan",
	title: "Implementation Plan",
	reportType: "plan" as const,
	mode: "approve" as const,
	format: "markdown" as const,
};

let savedAvailability: any;
let savedClient: any;

describe("openAndWaitInCommander", () => {
	beforeEach(() => {
		savedAvailability = g.__piCommanderAvailable;
		savedClient = g.__piCommanderClient;
		delete g.__piCommanderAvailable;
		delete g.__piCommanderClient;
	});

	afterEach(() => {
		g.__piCommanderAvailable = savedAvailability;
		g.__piCommanderClient = savedClient;
		vi.restoreAllMocks();
	});

	it("returns unavailable when Commander is not connected", async () => {
		g.__piCommanderAvailable = false;
		const ctx = makeCtx();

		await expect(openAndWaitInCommander(OPTIONS, ctx, { openTimeoutMs: 5, pollIntervalMs: 1 }))
			.resolves.toEqual({ inCommander: false, reason: "unavailable" });
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});

	it("waits for a real approved action after the Commander viewer opens", async () => {
		const statuses = [
			{ isOpen: false, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: null },
			{ isOpen: true, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: null },
			{ isOpen: false, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: "approved", content: "# Revised Plan" },
		];

		g.__piCommanderAvailable = true;
		g.__piCommanderClient = {
			isConnected: () => true,
			callTool: vi.fn(async (_name: string, params: Record<string, unknown>) => {
				if (params.operation === "open") return toolResult({ success: true });
				return toolResult(statuses.shift() || statuses[statuses.length - 1]);
			}),
		};

		const ctx = makeCtx();
		const result = await openAndWaitInCommander(OPTIONS, ctx, {
			openTimeoutMs: 25,
			pollIntervalMs: 1,
			includeContent: true,
		});

		expect(result).toEqual({ inCommander: true, action: "approved", content: "# Revised Plan" });
		expect(ctx.ui.notify).toHaveBeenCalledWith("Report opened in Commander: Implementation Plan", "info");
	});

	it("maps Commander closed/declined actions to a non-approval result", async () => {
		const statuses = [
			{ isOpen: true, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: null },
			{ isOpen: false, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: "closed" },
		];

		g.__piCommanderAvailable = true;
		g.__piCommanderClient = {
			isConnected: () => true,
			callTool: vi.fn(async (_name: string, params: Record<string, unknown>) => {
				if (params.operation === "open") return toolResult({ success: true });
				return toolResult(statuses.shift() || statuses[statuses.length - 1]);
			}),
		};

		const result = await openAndWaitInCommander(OPTIONS, makeCtx(), {
			openTimeoutMs: 25,
			pollIntervalMs: 1,
		});

		expect(result).toEqual({ inCommander: true, action: "declined", content: undefined });
	});

	it("falls back when Commander accepts the open request but never reports an open viewer", async () => {
		g.__piCommanderAvailable = true;
		g.__piCommanderClient = {
			isConnected: () => true,
			callTool: vi.fn(async (_name: string, params: Record<string, unknown>) => {
				if (params.operation === "open") return toolResult({ success: true });
				return toolResult({ isOpen: false, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: null });
			}),
		};

		const ctx = makeCtx();
		const result = await openAndWaitInCommander(OPTIONS, ctx, {
			openTimeoutMs: 5,
			pollIntervalMs: 1,
		});

		expect(result).toEqual({ inCommander: false, reason: "open_timeout" });
		expect(ctx.ui.notify).toHaveBeenCalledWith("Commander did not open the viewer, falling back to browser", "warning");
	});

	it("falls back when Commander disconnects after the viewer opened", async () => {
		let statusCalls = 0;
		g.__piCommanderAvailable = true;
		g.__piCommanderClient = {
			isConnected: () => true,
			callTool: vi.fn(async (_name: string, params: Record<string, unknown>) => {
				if (params.operation === "open") return toolResult({ success: true });
				statusCalls += 1;
				if (statusCalls === 1) {
					return toolResult({ isOpen: true, title: "Implementation Plan", reportType: "plan", mode: "approve", userAction: null });
				}
				return invalidToolResult();
			}),
		};

		const ctx = makeCtx();
		const result = await openAndWaitInCommander(OPTIONS, ctx, {
			openTimeoutMs: 25,
			pollIntervalMs: 1,
		});

		expect(result).toEqual({ inCommander: false, reason: "disconnected" });
		expect(ctx.ui.notify).toHaveBeenCalledWith("Commander disconnected, falling back to browser", "warning");
	});
});
