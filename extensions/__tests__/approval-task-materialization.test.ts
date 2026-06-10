import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	buildCommanderTaskGroupPayload,
	extractMarkdownCheckboxTasks,
	materializeApprovedTasksToCommander,
	summarizeMaterialization,
} from "../lib/approval-task-materialization.ts";

vi.mock("../lib/commander/commander-cli-client.ts", () => ({
	getCommanderCliClient: () => ({ callTool: vi.fn() }),
	isCommanderAvailable: () => true,
}));

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
		expect((payload.tasks as any[])[0]).toMatchObject({
			primary_file: ".context/todo.md",
			lifecycle_owner: "self",
			confirm_wrapper: true,
		});
		expect((payload.tasks as any[])[0].body).toContain("## Steps");
		expect((payload.tasks as any[])[0].body).toContain("## Tests");
		expect((payload.tasks as any[])[0].body).toContain("## References");
	});

	it("builds debug Commander tasks only from remediation/next steps", () => {
		const payload = buildCommanderTaskGroupPayload({
			title: "Debug Report & Remediation Plan",
			sourceKind: "debug",
			sourcePath: ".context/todo.md",
			cwd: "/repo",
			labels: ["debug-remediation"],
			markdown: `# Debug Report
## Runtime Feedback Loop
- [ ] Log visibility note should not become implementation work
## Recommendation
Use the safer runtime path.
## Remediation / Next Steps
- [ ] Fix dev-server route handling
- [ ] Add browser regression coverage`,
			sectionHint: /^##\s+(Remediation|Next Steps|Remediation \/ Next Steps)/i,
		});

		expect(payload).toMatchObject({
			operation: "group:create",
			group_name: "Debug: Debug Report & Remediation Plan",
		});
		expect(payload.labels).toContain("approved-debug");
		expect(payload.labels).toContain("debug-remediation");
		expect(String(payload.initiative_summary)).toContain("Debug approved for IMPLEMENT mode");
		expect((payload.tasks as any[]).map((task) => task.description)).toEqual([
			"Fix dev-server route handling",
			"Add browser regression coverage",
		]);
		expect((payload.tasks as any[])[0].labels).toContain("approved-debug");
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
		expect(payload).toMatchObject({
			primary_file: ".context/todo.md",
			lifecycle_owner: "self",
			confirm_wrapper: true,
		});
		expect(String(payload.body)).toContain("## Steps");
		expect(String(payload.body)).toContain("## Tests");
		expect(String(payload.body)).toContain("## References");
		expect(payload.tasks).toHaveLength(2);
		expect((payload.tasks as any[])[0]).toMatchObject({
			description: "Implement A",
			title: "Implement A",
			primary_file: ".context/todo.md",
			lifecycle_owner: "self",
			confirm_wrapper: true,
		});
		expect((payload.tasks as any[])[0].body).toContain(".context/todo.md");
		expect((payload.tasks as any[])[0].body).toContain("## Steps");
		expect((payload.tasks as any[])[0].body).toContain("## Tests");
		expect((payload.tasks as any[])[0].body).toContain("## References");
	});

	it("extracts implementation checkboxes from structured implementation task sections", () => {
		const payload = buildCommanderTaskGroupPayload({
			title: "Structured Plan",
			sourceKind: "plan",
			sourcePath: ".context/todo.md",
			cwd: "/repo",
			markdown: `# Plan: Example

## Phase 1: Context
Narrative only.

## Implementation Tasks for Commander Materialization

- [ ] Add board/list pagination regression tests
- [ ] Patch Commander list retrieval
- [x] Already completed
`,
		});
		expect((payload.tasks as any[]).map((task) => task.description)).toEqual([
			"Add board/list pagination regression tests",
			"Patch Commander list retrieval",
		]);
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

	describe("dedupe across repeated materialization", () => {
		const groupCreateResponse = {
			content: [{ text: JSON.stringify({ group_id: 77, task_ids: [101, 102] }) }],
		};

		function input(cwd: string, markdown = "- [ ] Build it\n- [ ] Test it") {
			return {
				title: "Dedup Plan",
				sourceKind: "plan" as const,
				sourcePath: ".context/todo.md",
				cwd,
				markdown,
			};
		}

		it("skips group:create when the same approval was already materialized", async () => {
			const cwd = mkdtempSync(join(tmpdir(), "approval-dedupe-"));
			try {
				const first = vi.fn().mockResolvedValue(groupCreateResponse);
				const r1 = await materializeApprovedTasksToCommander(input(cwd), { callTool: first });
				expect(r1.ok).toBe(true);
				expect(r1.groupId).toBe(77);
				expect(first).toHaveBeenCalledTimes(1);

				const second = vi.fn().mockResolvedValue(groupCreateResponse);
				const r2 = await materializeApprovedTasksToCommander(input(cwd), { callTool: second });
				expect(second).not.toHaveBeenCalled();
				expect(r2.ok).toBe(true);
				expect(r2.deduped).toBe(true);
				expect(r2.groupId).toBe(77);
				expect(summarizeMaterialization(r2)).toContain("already");
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		});

		it("re-materializes when the task set changed", async () => {
			const cwd = mkdtempSync(join(tmpdir(), "approval-dedupe-"));
			try {
				const first = vi.fn().mockResolvedValue(groupCreateResponse);
				await materializeApprovedTasksToCommander(input(cwd), { callTool: first });

				const second = vi.fn().mockResolvedValue(groupCreateResponse);
				const r2 = await materializeApprovedTasksToCommander(
					input(cwd, "- [ ] Build it\n- [ ] Test it\n- [ ] Ship it"),
					{ callTool: second },
				);
				expect(second).toHaveBeenCalledTimes(1);
				expect(r2.deduped).toBeUndefined();
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		});

		it("does not record a failed materialization (retry still creates)", async () => {
			const cwd = mkdtempSync(join(tmpdir(), "approval-dedupe-"));
			try {
				const failing = vi.fn().mockRejectedValue(new Error("cmd exploded"));
				const r1 = await materializeApprovedTasksToCommander(input(cwd), { callTool: failing });
				expect(r1.ok).toBe(false);

				const retry = vi.fn().mockResolvedValue(groupCreateResponse);
				const r2 = await materializeApprovedTasksToCommander(input(cwd), { callTool: retry });
				expect(retry).toHaveBeenCalledTimes(1);
				expect(r2.ok).toBe(true);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		});
	});
});
