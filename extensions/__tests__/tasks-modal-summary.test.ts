import { describe, expect, it } from "vitest";
import { renderTaskModalWorkSummary } from "../lib/task-modal-render.ts";

const theme = {
	fg: (_color: string, text: string) => text,
} as any;

describe("renderTaskModalWorkSummary", () => {
	it("word-wraps long work summaries instead of truncating them", () => {
		const summary = "Prevent completed tasks from being editable in the task detail UI, including hiding or disabling edit affordances and adding targeted verification where appropriate.";
		const lines = renderTaskModalWorkSummary(summary, 64, theme);
		const joined = lines.join("\n");

		expect(lines.length).toBeGreaterThan(1);
		expect(joined).toContain("Work Summary:");
		expect(joined).toContain("Prevent completed tasks");
		expect(joined).toContain("adding targeted");
		expect(joined).toContain("verification where appropriate.");
		expect(lines.every(line => line.length <= 64)).toBe(true);
	});
});
