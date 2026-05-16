import { describe, expect, it } from "vitest";
import { assignWorktrees, buildMergeOrder, buildWorktreeBranchName } from "../lib/pipeline-worktrees.ts";

describe("pipeline-worktrees", () => {
	it("builds deterministic branch names", () => {
		const branch = buildWorktreeBranchName({ id: "task-1", title: "Edit viewer", description: "", files: ["a.ts"] }, 0);
		expect(branch).toBe("pipeline/01-task-1");
	});

	it("assigns worktrees for microtasks", () => {
		const assignments = assignWorktrees("/repo", [
			{ id: "task-1", title: "One", description: "", files: ["a.ts"], parallel_group: "b" },
			{ id: "task-2", title: "Two", description: "", files: ["b.ts"], parallel_group: "a" },
		]);
		expect(assignments).toHaveLength(2);
		expect(assignments[0].worktreePath).toContain("/repo/.pi/worktrees/");
		expect(assignments[1].branchName).toContain("pipeline/");
	});

	it("sorts merge order by parallel group then branch", () => {
		const ordered = buildMergeOrder([
			{ taskId: "2", branchName: "pipeline/02-b", worktreePath: "/b", parallelGroup: "z", files: [] },
			{ taskId: "1", branchName: "pipeline/01-a", worktreePath: "/a", parallelGroup: "a", files: [] },
		]);
		expect(ordered[0].taskId).toBe("1");
	});
});
