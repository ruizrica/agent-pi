// ABOUTME: Tests for Mission Complete widget rendering.
// ABOUTME: Verifies rich completion summaries, completed task rows, and split footer stats.

import { describe, expect, it } from "vitest";
import { renderMissionComplete, type MissionCompleteTheme } from "../lib/mission-complete-render.ts";

const theme: MissionCompleteTheme = {
	fg: (_color, text) => text,
	bold: (text) => text,
};

describe("renderMissionComplete", () => {
	it("renders a completed summary followed by task rows with Commander numbers", () => {
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
		expect(joined).toContain("Revise copy");
		expect(joined).toContain("#1");
		expect(joined).toContain("CMD #123");
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

	it("word-wraps long completed summaries and leaves a blank line before task rows", () => {
		const result = renderMissionComplete({
			listTitle: "Tasks",
			summary: "This is a deliberately long completion summary that should wrap across multiple lines before the completed task rows are shown in the terminal widget.",
			tasks: [{ id: 1, text: "Finish work" }],
			allSynced: true,
			syncedCount: 0,
			completedAt: Date.now(),
		}, 60, theme);

		const summaryIndex = result.lines.findIndex((line) => line.includes("Completed Summary:"));
		const taskIndex = result.lines.findIndex((line) => line.includes("Finish work"));
		expect(summaryIndex).toBeGreaterThan(-1);
		expect(taskIndex).toBeGreaterThan(summaryIndex + 1);
		expect(result.lines[taskIndex - 1]).toBe("");
		expect(result.lines.slice(summaryIndex, taskIndex).join("\n")).not.toContain("...");
		for (const line of result.lines.slice(summaryIndex, taskIndex).filter(Boolean)) {
			expect(line.length).toBeLessThanOrEqual(60);
		}
	});

	it("leaves a blank line after the final task before footer metadata", () => {
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

		const lastTaskIndex = result.lines.findIndex((line) => line.includes("Execute"));
		const completionLineIndex = result.lines.findIndex((line) => line.includes("2 tasks completed"));
		expect(lastTaskIndex).toBeGreaterThan(-1);
		expect(completionLineIndex).toBe(lastTaskIndex + 2);
		expect(result.lines[lastTaskIndex + 1]).toBe("");
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
