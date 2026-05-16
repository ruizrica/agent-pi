// ABOUTME: Worktree helpers for post-approval pipeline execution.
// ABOUTME: Provisions deterministic per-task worktree metadata and shell commands for isolated execution.

export interface PipelineMicroTask {
	id: string;
	title: string;
	description: string;
	files: string[];
	line_ranges?: string[];
	symbols?: string[];
	depends_on?: string[];
	parallel_group?: string;
	verification?: string[];
	status?: string;
}

export interface WorktreeAssignment {
	taskId: string;
	branchName: string;
	worktreePath: string;
	parallelGroup: string;
	files: string[];
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48) || "task";
}

export function buildWorktreeBranchName(task: PipelineMicroTask, index: number): string {
	return `pipeline/${String(index + 1).padStart(2, "0")}-${slugify(task.id || task.title)}`;
}

export function buildWorktreePath(repoRoot: string, branchName: string): string {
	const cleaned = branchName.replace(/[\/]+/g, "-");
	return `${repoRoot}/.pi/worktrees/${cleaned}`;
}

export function assignWorktrees(repoRoot: string, tasks: PipelineMicroTask[]): WorktreeAssignment[] {
	return tasks.map((task, index) => {
		const branchName = buildWorktreeBranchName(task, index);
		return {
			taskId: task.id,
			branchName,
			worktreePath: buildWorktreePath(repoRoot, branchName),
			parallelGroup: task.parallel_group || "default",
			files: task.files || [],
		};
	});
}

export function buildProvisionCommands(assignment: WorktreeAssignment): string[] {
	return [
		`mkdir -p \"${assignment.worktreePath}\"`,
		`git worktree add \"${assignment.worktreePath}\" -b \"${assignment.branchName}\"`,
	];
}

export function buildMergeOrder(assignments: WorktreeAssignment[]): WorktreeAssignment[] {
	return [...assignments].sort((a, b) => a.parallelGroup.localeCompare(b.parallelGroup) || a.branchName.localeCompare(b.branchName));
}
