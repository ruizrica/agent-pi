// ABOUTME: Gemini CLI headless worker argument builder.
// ABOUTME: Uses prompt mode with explicit text output for stable widget streaming.

export function buildGeminiCliArgs(task: string): string[] {
	return [
		"-p", task,
		"--output-format", "text",
	];
}
