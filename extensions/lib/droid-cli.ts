// ABOUTME: Droid CLI headless worker argument builder.
// ABOUTME: Uses exec mode with automation-friendly JSON output and low-autonomy default.

export const DROID_CLI_OUTPUT_FORMAT = "json";

export interface NormalizeDroidCliResultOptions {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	signal?: string | null;
}

export interface NormalizedDroidCliResult {
	exitCode: number;
	output: string;
	stderr: string;
}

export function buildDroidCliArgs(task: string, cwd?: string): string[] {
	return [
		"exec",
		"--output-format", DROID_CLI_OUTPUT_FORMAT,
		"--auto", "low",
		...(cwd ? ["--cwd", cwd] : []),
		task,
	];
}

function getTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function extractDroidCliOutput(stdout: string): string {
	const trimmedStdout = stdout.trim();
	if (!trimmedStdout) return "";

	try {
		const parsed = JSON.parse(trimmedStdout) as unknown;
		if (typeof parsed === "string") {
			return parsed.trim() || trimmedStdout;
		}
		if (parsed && typeof parsed === "object") {
			const record = parsed as Record<string, unknown>;
			const candidate = [
				record.result,
				record.output,
				record.message,
				record.error,
				record.details,
				record.error && typeof record.error === "object"
					? (record.error as Record<string, unknown>).message
					: undefined,
			]
				.map(getTrimmedString)
				.find(Boolean);
			if (candidate) {
				return candidate;
			}
		}
	} catch {
		// Keep raw stdout if Droid returns non-JSON or partial JSON.
	}

	return trimmedStdout;
}

export function normalizeDroidCliResult({
	exitCode,
	stdout,
	stderr,
	signal,
}: NormalizeDroidCliResultOptions): NormalizedDroidCliResult {
	const normalizedExitCode = exitCode ?? 1;
	const trimmedStdout = stdout.trim();
	const trimmedStderr = stderr.trim();
	const extractedOutput = extractDroidCliOutput(stdout);

	if (normalizedExitCode === 0 && extractedOutput) {
		return {
			exitCode: 0,
			output: extractedOutput,
			stderr: trimmedStderr,
		};
	}

	if (normalizedExitCode === 0) {
		const detailBlock = trimmedStderr
			? `\n\nStderr:\n${trimmedStderr}`
			: "";
		return {
			exitCode: 1,
			output: `Droid completed without producing any usable output.${detailBlock}`,
			stderr: trimmedStderr,
		};
	}

	const summary = signal
		? `Droid exec terminated by signal ${signal}.`
		: `Droid exec failed with exit code ${normalizedExitCode}.`;
	const detailSource = extractedOutput || trimmedStderr || trimmedStdout;
	const detailLabel = extractedOutput || trimmedStdout ? "Output" : "Stderr";
	const defaultModelHint = detailSource === "Exec failed"
		? "\n\nHint: Droid may be using an invalid or unavailable default model in Factory configuration. Verify Droid's current default model outside Pi."
		: "";

	return {
		exitCode: normalizedExitCode,
		output: detailSource
			? `${summary}\n\n${detailLabel}:\n${detailSource}${defaultModelHint}`
			: `${summary}${defaultModelHint}`,
		stderr: trimmedStderr,
	};
}
