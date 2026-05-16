// ABOUTME: Normalizes agent/CLI final output before widgets and follow-ups render it.
// ABOUTME: Prevents hook-only streams and placeholder wrappers from appearing as successful answers.

export interface AgentOutputInput {
	result?: string;
	output?: string;
	textChunks?: string[];
	stderr?: string;
	exitCode?: number | null;
	source?: string;
}

export interface NormalizedAgentOutput {
	displayText: string;
	summary: string;
	isEmpty: boolean;
	diagnostics: string;
	status: "ok" | "empty" | "error";
}

const PLACEHOLDER_PATTERNS = [
	/^<\/?response>$/i,
	/^<response>\s*<\/response>$/i,
	/^\[?response\]?$/i,
];

function cleanLine(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
	if (trimmed.startsWith("{")) {
		try {
			const event = JSON.parse(trimmed);
			if (event?.type === "system" || event?.type === "hook_started" || event?.hook_event) return null;
			if (event?.type === "result" && typeof event.result === "string") return event.result.trim() || null;
			if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
				const text = event.message.content
					.filter((block: any) => block?.type === "text" && typeof block.text === "string")
					.map((block: any) => block.text.trim())
					.filter(Boolean)
					.join("\n");
				return text || null;
			}
			return null;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}

export function meaningfulAgentText(value: string | undefined | null): string {
	if (!value) return "";
	return value
		.split("\n")
		.map(cleanLine)
		.filter((line): line is string => Boolean(line))
		.join("\n")
		.trim();
}

function summarize(text: string, fallback: string): string {
	return text.split("\n").map((line) => line.trim()).filter(Boolean).pop() || fallback;
}

export function normalizeAgentFinalOutput(input: AgentOutputInput): NormalizedAgentOutput {
	const candidates = [
		input.result,
		input.output,
		input.textChunks?.join(""),
	].map(meaningfulAgentText).filter(Boolean);

	const displayText = candidates[0] || "";
	const rawDiagnostics = [input.output, input.stderr, input.textChunks?.join("")]
		.filter((value): value is string => Boolean(value?.trim()))
		.join("\n")
		.trim();
	const source = input.source || "agent";
	const errored = typeof input.exitCode === "number" && input.exitCode !== 0;

	if (displayText) {
		return {
			displayText,
			summary: summarize(displayText, source),
			isEmpty: false,
			diagnostics: rawDiagnostics,
			status: errored ? "error" : "ok",
		};
	}

	const diagnostic = [
		`${source} completed without meaningful assistant output.`,
		errored ? `Exit code: ${input.exitCode}` : "The CLI stream contained only hooks/status events or placeholder wrappers.",
		rawDiagnostics ? `Diagnostics:\n${rawDiagnostics.slice(0, 4000)}` : "No raw output was captured.",
	].join("\n\n");

	return {
		displayText: diagnostic,
		summary: `${source} produced no meaningful output`,
		isEmpty: true,
		diagnostics: rawDiagnostics,
		status: errored ? "error" : "empty",
	};
}
