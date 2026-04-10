// ABOUTME: OpenCode CLI headless worker argument builder.
// ABOUTME: Uses `opencode run` for non-interactive execution with optional cwd forwarding.

export function buildOpenCodeCliArgs(task: string, cwd?: string): string[] {
	return [
		"run",
		...(cwd ? ["--dir", cwd] : []),
		task,
	];
}
