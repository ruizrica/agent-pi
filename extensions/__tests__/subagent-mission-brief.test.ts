// ABOUTME: Tests for buildSubagentBatchBrief — the helper that produces a real
// ABOUTME: mission brief for subagent batches instead of the old placeholder string.

import { describe, it, expect } from "vitest";
import { buildSubagentBatchBrief } from "../lib/commander/subagent-mission-brief.ts";

describe("buildSubagentBatchBrief", () => {
	it("does NOT return the old 'Batch subagent group: …' placeholder", () => {
		const brief = buildSubagentBatchBrief("my-batch", [
			{ name: "scout", summary: "Find auth callsites", task: "List files touching JWT" },
		]);
		expect(brief.toLowerCase()).not.toMatch(/^batch subagent group:/);
		expect(brief).not.toBe("Batch subagent group: my-batch");
	});

	it("prefers the first agent's summary as the headline", () => {
		const brief = buildSubagentBatchBrief("oauth-recon", [
			{ name: "scout", summary: "Map every JWT callsite in the renderer.", task: "list files" },
			{ name: "builder", summary: "Implement OAuth provider.", task: "wire it" },
		]);
		expect(brief).toContain("Map every JWT callsite in the renderer.");
		expect(brief).toContain("oauth-recon");
	});

	it("falls back to the first agent's task when no summary is set", () => {
		const brief = buildSubagentBatchBrief("recon", [
			{ name: "scout", task: "Find every place we read process.env.JWT_SECRET" },
		]);
		expect(brief).toContain("Find every place we read process.env.JWT_SECRET");
	});

	it("lists agent role names so the dashboard shows the roster", () => {
		const brief = buildSubagentBatchBrief("plan", [
			{ name: "scout", task: "scan repo" },
			{ name: "planner", task: "draft plan" },
			{ name: "builder", task: "implement" },
		]);
		expect(brief).toMatch(/scout/);
		expect(brief).toMatch(/planner/);
		expect(brief).toMatch(/builder/);
	});

	it("mentions parallel coordination when there are 2+ agents", () => {
		const brief = buildSubagentBatchBrief("wave-1", [
			{ name: "a", task: "do x" },
			{ name: "b", task: "do y" },
		]);
		expect(brief).toMatch(/2 subagents/);
	});

	it("gracefully handles an empty defs list without throwing", () => {
		const brief = buildSubagentBatchBrief("empty", []);
		expect(typeof brief).toBe("string");
		expect(brief.length).toBeGreaterThan(0);
	});

	it("truncates very long headlines to keep the brief readable", () => {
		const longText = "x".repeat(600);
		const brief = buildSubagentBatchBrief("long", [{ name: "scout", summary: longText }]);
		// Ellipsis appears when truncated
		expect(brief).toMatch(/…/);
		expect(brief.length).toBeLessThan(longText.length);
	});
});
