// ABOUTME: Tests for escape-cancel extension — double-tap ESC detection and cancel-all logic.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import escapeCancelExtension from "../escape-cancel.ts";

// ── Double-tap detection logic (extracted for testability) ────────

const DOUBLE_TAP_WINDOW = 400;

interface DoubleTapState {
	lastEscTime: number;
}

function detectDoubleTap(state: DoubleTapState, now: number): boolean {
	if (now - state.lastEscTime < DOUBLE_TAP_WINDOW) {
		state.lastEscTime = 0;
		return true;
	}
	state.lastEscTime = now;
	return false;
}

// ── Tests ────────────────────────────────────────────────────────

describe("escape-cancel", () => {
	describe("double-tap ESC detection", () => {
		let state: DoubleTapState;

		beforeEach(() => {
			state = { lastEscTime: 0 };
		});

		it("detects double-tap within window", () => {
			const first = detectDoubleTap(state, 1000);
			expect(first).toBe(false);

			const second = detectDoubleTap(state, 1200); // 200ms later
			expect(second).toBe(true);
		});

		it("rejects presses outside window", () => {
			const first = detectDoubleTap(state, 1000);
			expect(first).toBe(false);

			const second = detectDoubleTap(state, 1500); // 500ms later - outside window
			expect(second).toBe(false);
		});

		it("resets after successful double-tap", () => {
			detectDoubleTap(state, 1000);
			const doubleTap = detectDoubleTap(state, 1200);
			expect(doubleTap).toBe(true);

			// After reset, next single press should not be a double-tap
			const afterReset = detectDoubleTap(state, 1300);
			expect(afterReset).toBe(false);
		});

		it("handles exact window boundary", () => {
			detectDoubleTap(state, 1000);
			// Exactly at 400ms boundary - should NOT trigger (< not <=)
			const atBoundary = detectDoubleTap(state, 1400);
			expect(atBoundary).toBe(false);
		});

		it("handles rapid triple-tap (detects on second press)", () => {
			detectDoubleTap(state, 1000);
			const second = detectDoubleTap(state, 1100);
			expect(second).toBe(true);

			// Third press after reset should start fresh
			const third = detectDoubleTap(state, 1200);
			expect(third).toBe(false);
		});
	});

	describe("cancel-all logic", () => {
		let g: any;

		beforeEach(() => {
			g = globalThis as any;
			// Clean up any stale globals
			delete g.__piKillAllSubagents;
			delete g.__piHasRunningSubagents;
			delete g.__piKillChainProc;
			delete g.__piHasRunningChain;
			delete g.__piKillPipelineProc;
			delete g.__piHasRunningPipeline;
			delete g.__piKillTeamProcs;
			delete g.__piHasRunningTeam;
		});

		afterEach(() => {
			delete g.__piKillAllSubagents;
			delete g.__piHasRunningSubagents;
			delete g.__piKillChainProc;
			delete g.__piHasRunningChain;
			delete g.__piKillPipelineProc;
			delete g.__piHasRunningPipeline;
			delete g.__piKillTeamProcs;
			delete g.__piHasRunningTeam;
		});

		it("hasRunningOperations returns false when nothing is registered", () => {
			expect(hasRunningOperations()).toBe(false);
		});

		it("hasRunningOperations detects running subagents", () => {
			g.__piHasRunningSubagents = () => true;
			expect(hasRunningOperations()).toBe(true);
		});

		it("hasRunningOperations detects running chain", () => {
			g.__piActiveChain = "test-chain";
			g.__piHasRunningChain = () => true;
			expect(hasRunningOperations()).toBe(true);
		});

		it("hasRunningOperations detects running pipeline", () => {
			g.__piActivePipeline = "test-pipeline";
			g.__piHasRunningPipeline = () => true;
			expect(hasRunningOperations()).toBe(true);
		});

		it("hasRunningOperations detects running team", () => {
			g.__piHasRunningTeam = () => true;
			expect(hasRunningOperations()).toBe(true);
		});

		it("cancelAll calls abort + kills subagents", () => {
			const abort = vi.fn();
			const killSubagents = vi.fn(() => 2);
			g.__piKillAllSubagents = killSubagents;

			const ctx = {
				isIdle: () => false,
				abort,
				ui: { notify: vi.fn() },
			};

			cancelAll(ctx);
			expect(abort).toHaveBeenCalled();
			expect(killSubagents).toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("cancelled"),
				"warning",
			);
		});

		it("cancelAll calls kill chain proc", () => {
			const killChain = vi.fn(() => true);
			g.__piKillChainProc = killChain;

			const ctx = {
				isIdle: () => true,
				abort: vi.fn(),
				ui: { notify: vi.fn() },
			};

			cancelAll(ctx);
			expect(killChain).toHaveBeenCalled();
			expect(ctx.ui.notify).toHaveBeenCalled();
		});

		it("cancelAll calls kill pipeline proc", () => {
			const killPipeline = vi.fn(() => true);
			g.__piKillPipelineProc = killPipeline;

			const ctx = {
				isIdle: () => true,
				abort: vi.fn(),
				ui: { notify: vi.fn() },
			};

			cancelAll(ctx);
			expect(killPipeline).toHaveBeenCalled();
		});

		it("cancelAll calls kill team procs", () => {
			const killTeam = vi.fn(() => 3);
			g.__piKillTeamProcs = killTeam;

			const ctx = {
				isIdle: () => true,
				abort: vi.fn(),
				ui: { notify: vi.fn() },
			};

			cancelAll(ctx);
			expect(killTeam).toHaveBeenCalled();
		});

		it("cancelAll does not notify when nothing was running", () => {
			const ctx = {
				isIdle: () => true,
				abort: vi.fn(),
				ui: { notify: vi.fn() },
			};

			cancelAll(ctx);
			expect(ctx.ui.notify).not.toHaveBeenCalled();
		});
	});

	describe("terminal input listener lifecycle", () => {
		it("rebinds ESC handling to the active session context after session switch", async () => {
			const handlers: Record<string, Array<(event: any, ctx: any) => Promise<void>>> = {};
			const pi = {
				on: vi.fn((event: string, handler: (event: any, ctx: any) => Promise<void>) => {
					(handlers[event] ??= []).push(handler);
				}),
			} as any;
			escapeCancelExtension(pi);

			const ctx1Unsub = vi.fn();
			const ctx1 = {
				hasUI: true,
				isIdle: () => false,
				abort: vi.fn(),
				ui: {
					onTerminalInput: vi.fn(() => ctx1Unsub),
					setStatus: vi.fn(),
					setTheme: vi.fn(() => ({ success: true })),
					notify: vi.fn(),
				},
			};
			const ctx2InputHandlers: Array<(data: string) => any> = [];
			const ctx2 = {
				hasUI: true,
				isIdle: () => false,
				abort: vi.fn(),
				ui: {
					onTerminalInput: vi.fn((handler: (data: string) => any) => {
						ctx2InputHandlers.push(handler);
						return vi.fn();
					}),
					setStatus: vi.fn(),
					setTheme: vi.fn(() => ({ success: true })),
					notify: vi.fn(),
				},
			};

			await handlers.session_start[0]({}, ctx1);
			expect(ctx1.ui.onTerminalInput).toHaveBeenCalledTimes(1);

			await handlers.session_switch[0]({}, ctx2);
			expect(ctx1Unsub).toHaveBeenCalledTimes(1);
			expect(ctx2.ui.onTerminalInput).toHaveBeenCalledTimes(1);

			ctx2InputHandlers[0]("\x1b");
			const result = ctx2InputHandlers[0]("\x1b");
			expect(result).toEqual({ consume: true });
			expect(ctx2.abort).toHaveBeenCalledTimes(1);
			expect(ctx1.abort).not.toHaveBeenCalled();
		});
	});
});

// ── Extracted functions for testing ──────────────────────────────
// These mirror the logic from escape-cancel.ts but are standalone for test isolation.

function hasRunningOperations(): boolean {
	const g = globalThis as any;

	if (typeof g.__piHasRunningSubagents === "function" && g.__piHasRunningSubagents()) {
		return true;
	}

	if (g.__piActiveChain && typeof g.__piHasRunningChain === "function" && g.__piHasRunningChain()) {
		return true;
	}

	if (g.__piActivePipeline && typeof g.__piHasRunningPipeline === "function" && g.__piHasRunningPipeline()) {
		return true;
	}

	if (typeof g.__piHasRunningTeam === "function" && g.__piHasRunningTeam()) {
		return true;
	}

	return false;
}

function cancelAll(ctx: any) {
	const g = globalThis as any;
	let cancelled = false;

	if (!ctx.isIdle()) {
		ctx.abort();
		cancelled = true;
	}

	if (typeof g.__piKillAllSubagents === "function") {
		const killed = g.__piKillAllSubagents();
		if (killed > 0) cancelled = true;
	}

	if (typeof g.__piKillChainProc === "function") {
		if (g.__piKillChainProc()) cancelled = true;
	}

	if (typeof g.__piKillPipelineProc === "function") {
		if (g.__piKillPipelineProc()) cancelled = true;
	}

	if (typeof g.__piKillTeamProcs === "function") {
		const killed = g.__piKillTeamProcs();
		if (killed > 0) cancelled = true;
	}

	if (cancelled) {
		ctx.ui.notify("All operations cancelled (ESC ESC)", "warning");
	}
}
