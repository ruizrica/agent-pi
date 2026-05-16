// ABOUTME: Codex CLI non-interactive worker argument builder.
// ABOUTME: Encapsulates exec/cwd flags used by toolkit worker dispatch.

export function buildCodexCliArgs(task: string, cwd?: string): string[] {
	return [
		"exec",
		"--skip-git-repo-check",
		...(cwd ? ["--cd", cwd] : []),
		task,
	];
}
