// ABOUTME: Cursor CLI headless worker argument builder.
// ABOUTME: Keeps Cursor-specific flags out of the shared toolkit router.

export function buildCursorCliArgs(task: string, cwd?: string): string[] {
	return [
		"--print",
		"--output-format", "text",
		...(cwd ? ["--workspace", cwd] : []),
		task,
	];
}
