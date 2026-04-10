// ABOUTME: Droid CLI headless worker argument builder.
// ABOUTME: Uses exec mode with explicit output format and low-autonomy default.

export function buildDroidCliArgs(task: string, cwd?: string): string[] {
	return [
		"exec",
		"--output-format", "text",
		"--auto", "low",
		...(cwd ? ["--cwd", cwd] : []),
		task,
	];
}
