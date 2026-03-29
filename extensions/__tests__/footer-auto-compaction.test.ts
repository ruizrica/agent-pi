// ABOUTME: Tests for footer behavior after proactive compaction moved to memory-cycle.
// ABOUTME: Verifies footer no longer has before_agent_start handler; no tool blocking.
// ABOUTME: Tests formatTokens helper for compact K/M token count formatting.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@mariozechner/pi-tui", () => ({
	truncateToWidth: (s: string) => s,
	visibleWidth: (s: string) => s.length,
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

function createExtension() {
	const handlers: Record<string, (event: unknown, ctx: any) => any> = {};
	const pi: any = {
		on: (event: string, handler: any) => {
			handlers[event] = handler;
		},
		getThinkingLevel: () => "off",
	};
	return { handlers, pi };
}

function createTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
}

function createCtx() {
	let footerFactory: ((tui: any, theme: any, footerData: any) => any) | undefined;
	return {
		model: { name: "Claude 4 Opus", contextWindow: 200000 },
		cwd: "/Users/ricardo/Workshop/GitHub/agent-pi",
		getContextUsage: () => ({ percent: 42 }),
		ui: {
			setFooter: (factory: any) => {
				footerFactory = factory;
			},
		},
		getFooterRenderer: () => {
			if (!footerFactory) throw new Error("Footer factory not registered");
			const instance = footerFactory({ requestRender() {} }, createTheme(), {
				onBranchChange: () => () => {},
			});
			return instance.render;
		},
	};
}

describe("footer (post-refactor)", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("does not register a before_agent_start handler (moved to memory-cycle)", async () => {
		const { handlers, pi } = createExtension();
		const extension = await import("../footer.ts");
		extension.default(pi);

		expect(handlers["before_agent_start"]).toBeUndefined();
	});

	it("does not register a tool_call handler (no blocking)", async () => {
		const { handlers, pi } = createExtension();
		const extension = await import("../footer.ts");
		extension.default(pi);

		expect(handlers["tool_call"]).toBeUndefined();
	});

	it("registers session_start and session_shutdown handlers", async () => {
		const { handlers, pi } = createExtension();
		const extension = await import("../footer.ts");
		extension.default(pi);

		expect(handlers["session_start"]).toBeDefined();
		expect(handlers["session_shutdown"]).toBeDefined();
	});
});

describe("footer rendering", () => {
	beforeEach(() => {
		vi.resetModules();
		(globalThis as any).__piRefreshFooter = undefined;
	});

	it("renders a single line footer", async () => {
		const { handlers, pi } = createExtension();
		const extension = await import("../footer.ts");
		extension.default(pi);
		const ctx = createCtx();
		await handlers["session_start"]({}, ctx);
		const render = ctx.getFooterRenderer();

		const lines = render(120);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("opus 4 | 42% / 200K | GitHub/agent-pi");
		expect(lines[0]).toContain("thinking: off");
	});
});

describe("formatTokens", () => {
	let formatTokens: (n: number) => string;

	beforeEach(async () => {
		vi.resetModules();
		const mod = await import("../footer.ts");
		formatTokens = mod.formatTokens;
	});

	it("formats numbers under 1000 as raw integers", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(500)).toBe("500");
		expect(formatTokens(999)).toBe("999");
	});

	it("formats thousands as K with decimal when needed", () => {
		expect(formatTokens(1000)).toBe("1K");
		expect(formatTokens(1500)).toBe("1.5K");
		expect(formatTokens(10000)).toBe("10K");
		expect(formatTokens(200000)).toBe("200K");
		expect(formatTokens(999000)).toBe("999K");
	});

	it("formats millions as M with decimal when needed", () => {
		expect(formatTokens(1000000)).toBe("1M");
		expect(formatTokens(1200000)).toBe("1.2M");
		expect(formatTokens(2500000)).toBe("2.5M");
		expect(formatTokens(10000000)).toBe("10M");
	});

	it("rounds fractional values cleanly", () => {
		expect(formatTokens(1550)).toBe("1.6K");
		expect(formatTokens(1050000)).toBe("1.1M");
	});
});
