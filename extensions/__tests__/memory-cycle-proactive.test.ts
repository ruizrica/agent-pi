// ABOUTME: Tests for proactive compaction in memory-cycle extension.
// ABOUTME: Verifies two-phase inject: prep at 70%, hard stop at 80%, flag reset on compact.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies that memory-cycle.ts imports
vi.mock("@earendil-works/pi-tui", () => ({
	Box: vi.fn(),
	Text: vi.fn(),
}));

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: vi.fn(() => ({})),
		Optional: vi.fn((x: any) => x),
		String: vi.fn(() => ({})),
	},
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

type Handler = (event: any, ctx: any) => Promise<any>;

interface MockPi {
	handlers: Map<string, Handler[]>;
	on: (event: string, handler: Handler) => void;
	registerCommand: ReturnType<typeof vi.fn>;
	registerTool: ReturnType<typeof vi.fn>;
	registerMessageRenderer: ReturnType<typeof vi.fn>;
	sendMessage: ReturnType<typeof vi.fn>;
}

function createMockPi(): MockPi {
	const handlers = new Map<string, Handler[]>();
	return {
		handlers,
		on: (event: string, handler: Handler) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerCommand: vi.fn(),
		registerTool: vi.fn(),
		registerMessageRenderer: vi.fn(),
		sendMessage: vi.fn(),
	};
}

function createMockCtx(percent: number | undefined) {
	return {
		cwd: "/test/project",
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
		},
		getContextUsage: () => percent != null ? { percent } : null,
		sessionManager: {
			getBranch: () => [],
			getSessionFile: () => "/test/session.json",
		},
		model: { name: "test" },
	};
}

async function fireEvent(pi: MockPi, event: string, ctx: any): Promise<any> {
	const handlers = pi.handlers.get(event) ?? [];
	let lastResult: any;
	for (const handler of handlers) {
		lastResult = await handler({ type: event }, ctx);
	}
	return lastResult;
}

describe("memory-cycle proactive compaction", () => {
	let pi: MockPi;

	beforeEach(async () => {
		vi.resetModules();
		pi = createMockPi();
		const extension = await import("../memory-cycle.ts");
		extension.default(pi as any);
	});

	it("registers a before_agent_start handler", () => {
		expect(pi.handlers.get("before_agent_start")).toBeDefined();
		expect(pi.handlers.get("before_agent_start")!.length).toBeGreaterThan(0);
	});

	it("returns empty object below 70%", async () => {
		const ctx = createMockCtx(50);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toEqual({});
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});

	it("returns prep message at 70%", async () => {
		const ctx = createMockCtx(70);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toHaveProperty("message");
		expect(result.message.content).toContain("70%");
		expect(result.message.content).toContain("wrapping up");
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("70%"),
			"info",
		);
	});

	it("returns prep message at 75%", async () => {
		const ctx = createMockCtx(75);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toHaveProperty("message");
		expect(result.message.content).toContain("75%");
		expect(result.message.content).toContain("wrapping up");
	});

	it("returns compact message at 80%", async () => {
		const ctx = createMockCtx(80);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toHaveProperty("message");
		expect(result.message.content).toContain("80%");
		expect(result.message.content).toContain("cycle_memory");
		expect(result.message.content).toContain("URGENT");
	});

	it("returns compact message at 95%", async () => {
		const ctx = createMockCtx(95);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toHaveProperty("message");
		expect(result.message.content).toContain("95%");
		expect(result.message.content).toContain("cycle_memory");
	});

	it("does not inject prep message twice (flag guard)", async () => {
		const ctx = createMockCtx(75);
		const result1 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result1).toHaveProperty("message");

		// Second call should return empty (already injected)
		const result2 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result2).toEqual({});
	});

	it("does not inject compact message twice (flag guard)", async () => {
		const ctx = createMockCtx(85);
		const result1 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result1).toHaveProperty("message");
		expect(result1.message.content).toContain("cycle_memory");

		// Second call should return empty
		const result2 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result2).toEqual({});
	});

	it("compact message supersedes prep message (skips prep if already at 80%+)", async () => {
		// First call at 80% — should go straight to compact, not prep
		const ctx = createMockCtx(85);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toHaveProperty("message");
		expect(result.message.content).toContain("cycle_memory");
		expect(result.message.content).toContain("URGENT");
	});

	it("resets flags after session_compact fires", async () => {
		// First: trigger prep
		const ctx = createMockCtx(75);
		const result1 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result1).toHaveProperty("message");

		// Verify it won't fire again
		const result2 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result2).toEqual({});

		// Fire session_compact to reset flags
		await fireEvent(pi, "session_compact", {
			...ctx,
			compactionEntry: {},
		});

		// Now it should fire again
		const result3 = await fireEvent(pi, "before_agent_start", ctx);
		expect(result3).toHaveProperty("message");
	});

	it("handles null context usage gracefully", async () => {
		const ctx = createMockCtx(undefined as any);
		ctx.getContextUsage = () => null;
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result).toEqual({});
	});

	it("messages are not displayed to user (display: false)", async () => {
		const ctx = createMockCtx(75);
		const result = await fireEvent(pi, "before_agent_start", ctx);
		expect(result.message.display).toBe(false);

		// Reset and test compact phase
		await fireEvent(pi, "session_compact", { ...ctx, compactionEntry: {} });
		const ctx2 = createMockCtx(85);
		const result2 = await fireEvent(pi, "before_agent_start", ctx2);
		expect(result2.message.display).toBe(false);
	});
});
