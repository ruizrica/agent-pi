import { describe, expect, it, vi } from "vitest";
import {
	buildCommanderTaskGroupPayload,
	extractMarkdownCheckboxTasks,
	materializeApprovedTasksToCommander,
} from "../lib/approval-task-materialization.ts";

describe("approval task materialization", () => {
	it("extracts unchecked markdown checkbox tasks", () => {
		const tasks = extractMarkdownCheckboxTasks(`# Plan
- [ ] 1. Build the feature
  - [x] Already done
- [ ] Add tests`);
		expect(tasks).toEqual([
			expect.objectContaining({ description: "Build the feature", checked: false, level: 0 }),
			expect.objectContaining({ description: "Already done", checked: true, level: 1 }),
			expect.objectContaining({ description: "Add tests", checked: false, level: 0 }),
		]);
	});

	it("can limit extraction to remediation/next steps section", () => {
		const tasks = extractMarkdownCheckboxTasks(`# Investigation Report
## Findings
- [ ] Do not use this as implementation
## Remediation / Next Steps
- [ ] Fix root cause
- [ ] Add regression test
## Evidence
- [ ] Not this either`, { sectionHint: /^##\s+Remediation \/ Next Steps/i });
		expect(tasks.map((task) => task.description)).toEqual(["Fix root cause", "Add regression test"]);
	});

	it("builds investigation Commander tasks only from remediation/next steps", () => {
		const payload = buildCommanderTaskGroupPayload({
			title: "Login Outage Investigation",
			sourceKind: "investigation",
			sourcePath: ".context/todo.md",
			cwd: "/repo",
			markdown: `# Investigation Report
## Findings
- [ ] Finding checkbox should not become implementation work
## Remediation / Next Steps
- [ ] Fix session refresh handling
- [x] Already mitigated
- [ ] Add outage regression test
## Evidence
- [ ] Evidence checkbox should not become work`,
			sectionHint: /^##\s+(Remediation|Next Steps|Remediation \/ Next Steps)/i,
		});

		expect(payload).toMatchObject({
			operation: "group:create",
			group_name: "Investigation: Login Outage Investigation",
		});
		expect(payload.labels).toContain("approved-investigation");
		expect(String(payload.initiative_summary)).toContain("Investigation approved for IMPLEMENT mode");
		expect((payload.tasks as any[]).map((task) => task.description)).toEqual([
			"Fix session refresh handling",
			"Add outage regression test",
		]);
		expect((payload.tasks as any[])[0].labels).toContain("approved-investigation");
	});

	it("builds a Commander group:create payload with source metadata", () => {
		const payload = buildCommanderTaskGroupPayload({
			title: "Approved Plan",
			sourceKind: "plan",
			sourcePath: ".context/todo.md",
			cwd: "/repo",
			markdown: "- [ ] Implement A\n- [x] Done B\n- [ ] Test C",
		});
		expect(payload).toMatchObject({
			operation: "group:create",
			group_name: "Plan: Approved Plan",
		});
		expect(String(payload.initiative_summary)).toContain("Commander tasks are the source of truth");
		expect(payload.tasks).toHaveLength(2);
		expect((payload.tasks as any[])[0]).toMatchObject({ description: "Implement A" });
		expect((payload.tasks as any[])[0].body).toContain(".context/todo.md");
	});

	it("returns no-task warning when no unchecked tasks exist", async () => {
		const result = await materializeApprovedTasksToCommander({
			title: "Empty",
			sourceKind: "plan",
			sourcePath: ".context/todo.md",
			cwd: "/repo",
			markdown: "- [x] Done",
		}, { callTool: vi.fn() });
		expect(result.ok).toBe(false);
		expect(result.warning).toContain("No unchecked implementation tasks");
	});
});
