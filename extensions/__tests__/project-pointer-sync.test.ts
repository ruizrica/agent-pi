// ABOUTME: Tests the project-pointer alignment helper that prevents the cwd-vs-dashboard drift
// ABOUTME: documented in docs/adr/0001-cmd-contract.md (cost Ricardo a full day on 2026-05-19).

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	resolveProjectPointerMismatch,
	type PointerProbeResult,
} from "../lib/commander/project-pointer-sync.ts";

describe("project-pointer sync — resolveProjectPointerMismatch", () => {
	function probe(opts: Partial<PointerProbeResult>): PointerProbeResult {
		return {
			cwdProjectId: opts.cwdProjectId ?? null,
			cwdProjectName: opts.cwdProjectName ?? null,
			currentProjectId: opts.currentProjectId ?? null,
		};
	}

	it("returns no-op when cwd and dashboard already agree", () => {
		const action = resolveProjectPointerMismatch(
			probe({ cwdProjectId: 809, currentProjectId: 809, cwdProjectName: "agent-pi" }),
		);
		expect(action.kind).toBe("aligned");
	});

	it("returns a switch action when dashboard points elsewhere", () => {
		const action = resolveProjectPointerMismatch(
			probe({ cwdProjectId: 809, currentProjectId: 751, cwdProjectName: "agent-pi" }),
		);
		expect(action.kind).toBe("switch");
		if (action.kind !== "switch") return; // type narrow
		expect(action.targetProjectId).toBe(809);
		expect(action.targetProjectName).toBe("agent-pi");
		expect(action.previousProjectId).toBe(751);
	});

	it("returns a switch action when dashboard has no current project (cold state)", () => {
		const action = resolveProjectPointerMismatch(
			probe({ cwdProjectId: 809, currentProjectId: null, cwdProjectName: "agent-pi" }),
		);
		expect(action.kind).toBe("switch");
	});

	it("returns no-op when cwd cannot be resolved to a project (no .beads, not yet bootstrapped)", () => {
		// We never silently switch the dashboard without a verified cwd target.
		const action = resolveProjectPointerMismatch(
			probe({ cwdProjectId: null, currentProjectId: 751 }),
		);
		expect(action.kind).toBe("skip");
	});
});

describe("project-pointer sync — alignPointerOnSessionStart", () => {
	const { execFileMock } = vi.hoisted(() => ({
		execFileMock: vi.fn(),
	}));

	beforeEach(() => {
		execFileMock.mockReset();
		vi.resetModules();
	});

	it("invokes cmd project switch <id> when the helper says to switch", async () => {
		vi.doMock("node:child_process", () => ({ execFile: execFileMock }));
		execFileMock.mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
			// First call: cmd whoami --json → returns project.id 809
			// Second call: cmd project switch 809 --json → returns ok
			if (args[0] === "whoami") {
				cb(null, JSON.stringify({ project: { id: 809, name: "agent-pi" } }), "");
				return;
			}
			if (args[0] === "project" && args[1] === "switch") {
				cb(null, JSON.stringify({ id: Number(args[2]), status: "switched" }), "");
				return;
			}
			cb(new Error(`unexpected argv: ${args.join(" ")}`), "", "");
		});

		const { alignPointerOnSessionStart } = await import(
			"../lib/commander/project-pointer-sync.ts"
		);

		const result = await alignPointerOnSessionStart({
			readMockStateCurrentProjectId: () => 751,
			cmdBin: "cmd-test",
		});

		expect(result.kind).toBe("switch");
		// First call: whoami; second call: project switch <id>
		const argvs = execFileMock.mock.calls.map((c) => c[1] as string[]);
		expect(argvs.some((a) => a[0] === "whoami")).toBe(true);
		const switchCall = argvs.find((a) => a[0] === "project" && a[1] === "switch");
		expect(switchCall).toBeTruthy();
		expect(switchCall?.[2]).toBe("809");
	});

	it("does nothing when cwd and dashboard already agree", async () => {
		vi.doMock("node:child_process", () => ({ execFile: execFileMock }));
		execFileMock.mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
			if (args[0] === "whoami") {
				cb(null, JSON.stringify({ project: { id: 809, name: "agent-pi" } }), "");
				return;
			}
			cb(new Error(`unexpected argv: ${args.join(" ")}`), "", "");
		});

		const { alignPointerOnSessionStart } = await import(
			"../lib/commander/project-pointer-sync.ts"
		);

		const result = await alignPointerOnSessionStart({
			readMockStateCurrentProjectId: () => 809,
			cmdBin: "cmd-test",
		});

		expect(result.kind).toBe("aligned");
		const switchCall = execFileMock.mock.calls.find((c) =>
			(c[1] as string[])[0] === "project" && (c[1] as string[])[1] === "switch",
		);
		expect(switchCall).toBeUndefined();
	});
});
