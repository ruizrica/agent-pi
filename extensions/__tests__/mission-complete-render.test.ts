// ABOUTME: Tests for Mission Complete widget rendering.
// ABOUTME: Verifies rich completion summaries, completed task rows, and split footer stats.

import { describe, expect, it } from "vitest";
import { renderMissionComplete, type MissionCompleteTheme } from "../lib/mission-complete-render.ts";

const theme: MissionCompleteTheme = {
	fg: (_color, text) => text,
	bold: (text) => text,
};

describe("renderMissionComplete", () => {
	it("renders the completed summary and footer count, but no per-task rows", () => {
		const result = renderMissionComplete({
			listTitle: "Security page update",
			summary: "Update the security page with clearer copy, safer defaults, and verification coverage.",
			tasks: [{ id: 1, text: "Revise copy", commanderId: 123 }],
			allSynced: true,
			syncedCount: 1,
			completedAt: Date.now(),
		}, 100, theme);

		const joined = result.lines.join("\n");
		expect(joined).toContain("MISSION COMPLETE");
		expect(joined).toContain("Completed Summary:");
		expect(joined).toContain("Update the security page");
		// Per-task enumeration is intentionally suppressed — the full list lives
		// in the Ctrl+Alt+T overlay and on Commander.
		expect(joined).not.toContain("Revise copy");
		expect(joined).not.toContain("#1");
		expect(joined).not.toContain("CMD #123");
		// Footer count and sync indicator remain.
		expect(joined).toContain("1 task completed");
		expect(joined).toContain("1 synced ✓");
	});

	it("does not enumerate individual tasks even when many tasks are present", () => {
		const result = renderMissionComplete({
			listTitle: "Big refactor",
			summary: "Multi-phase refactor of the auth layer.",
			tasks: Array.from({ length: 12 }, (_, i) => ({
				id: i + 1,
				text: `Step ${i + 1}: do the thing`,
				commanderId: 1000 + i,
			})),
			allSynced: true,
			syncedCount: 12,
			completedAt: Date.now(),
		}, 100, theme);

		const joined = result.lines.join("\n");
		expect(joined).not.toMatch(/Step \d+: do the thing/);
		expect(joined).not.toContain("... +"); // no "... +N more" overflow line
		expect(joined).not.toContain("CMD #1000");
		expect(joined).toContain("12 tasks completed");
	});

	it("renders an interim completion header with up-next guidance", () => {
		const result = renderMissionComplete({
			listTitle: "Investigate blank rendered plan/spec viewer",
			summary: "Diagnose the rendered-mode failure and prepare a remediation handoff.",
			variant: "interim",
			nextStep: "Review the findings/plan and continue with the next approved implementation step.",
			tasks: [{ id: 1, text: "Document root cause" }],
			allSynced: true,
			syncedCount: 0,
			completedAt: Date.now(),
		}, 100, theme);

		const joined = result.lines.join("\n");
		expect(joined).toContain("TASK COMPLETE");
		expect(joined).toContain("UP NEXT:");
		expect(joined).toContain("Review the findings/plan");
		expect(joined).not.toContain("MISSION COMPLETE");
		// Per-task rows must not appear in the interim view either.
		expect(joined).not.toContain("Document root cause");
	});

	it("omits the completed summary line when no summary is supplied", () => {
		const result = renderMissionComplete({
			listTitle: "Tasks",
			tasks: [{ id: 1, text: "Finish work" }],
			allSynced: true,
			syncedCount: 0,
			completedAt: Date.now(),
		}, 100, theme);

		expect(result.lines.join("\n")).not.toContain("Completed Summary:");
	});

	it("word-wraps long completed summaries and leaves a blank line before the footer", () => {
		const result = renderMissionComplete({
			listTitle: "Tasks",
			summary: "This is a deliberately long completion summary that should wrap across multiple lines before the completion footer is shown in the terminal widget.",
			tasks: [{ id: 1, text: "Finish work" }],
			allSynced: true,
			syncedCount: 0,
			completedAt: Date.now(),
		}, 60, theme);

		const summaryIndex = result.lines.findIndex((line) => line.includes("Completed Summary:"));
		const footerIndex = result.lines.findIndex((line) => line.includes("1 task completed"));
		expect(summaryIndex).toBeGreaterThan(-1);
		expect(footerIndex).toBeGreaterThan(summaryIndex + 1);
		// The summary's trailing blank line should separate it from the footer.
		expect(result.lines[footerIndex - 1]).toBe("");
		expect(result.lines.slice(summaryIndex, footerIndex).join("\n")).not.toContain("...");
		for (const line of result.lines.slice(summaryIndex, footerIndex).filter(Boolean)) {
			expect(line.length).toBeLessThanOrEqual(60);
		}
	});

	it("places the footer directly after the summary block with one blank line", () => {
		const result = renderMissionComplete({
			listTitle: "Tasks",
			summary: "Finish the polish pass.",
			tasks: [
				{ id: 1, text: "Setup" },
				{ id: 2, text: "Execute" },
			],
			allSynced: true,
			syncedCount: 2,
			completedAt: Date.now(),
		}, 100, theme);

		const summaryBodyIndex = result.lines.findIndex((line) => line.includes("Finish the polish pass."));
		const completionLineIndex = result.lines.findIndex((line) => line.includes("2 tasks completed"));
		expect(summaryBodyIndex).toBeGreaterThan(-1);
		expect(completionLineIndex).toBe(summaryBodyIndex + 2);
		expect(result.lines[summaryBodyIndex + 1]).toBe("");
		// No per-task row should appear between summary and footer.
		expect(result.lines.slice(summaryBodyIndex, completionLineIndex).join("\n")).not.toContain("Setup");
		expect(result.lines.slice(summaryBodyIndex, completionLineIndex).join("\n")).not.toContain("Execute");
	});

	it("splits duration/tool calls and top tools into separate footer lines", () => {
		const result = renderMissionComplete({
			listTitle: "Tasks",
			summary: "Finish the polish pass.",
			tasks: [
				{ id: 1, text: "Setup" },
				{ id: 2, text: "Execute" },
				{ id: 3, text: "Verify" },
			],
			stats: {
				startedAt: Date.now() - 193_000,
				toolCounts: { tasks: 7, bash: 2, read: 1 },
				totalToolCalls: 10,
				recentFiles: [],
				recentAgents: [],
				status: "Working",
				updatedAt: Date.now(),
			},
			allSynced: true,
			syncedCount: 3,
			completedAt: Date.now(),
		}, 100, theme);

		const completionLine = result.lines.at(-3) ?? "";
		const activityLine = result.lines.at(-2) ?? "";
		const topToolsLine = result.lines.at(-1) ?? "";
		expect(completionLine).toContain("3 tasks completed");
		expect(completionLine).toContain("3 synced ✓");
		expect(completionLine).not.toContain("Tool Calls:");
		expect(activityLine).toContain("Duration:");
		expect(activityLine).toContain("Tool Calls: 10");
		expect(activityLine).not.toContain("Top tools:");
		expect(topToolsLine).toContain("Top tools: tasks 7x, bash 2x, read 1x");
		expect(topToolsLine).not.toContain("Tool Calls:");
	});
});
