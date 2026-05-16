// ABOUTME: Pacifico advisor prompt/context helpers for async consultation.
// ABOUTME: Builds self-contained packets because Pacifico has no local filesystem access.

import { existsSync, readFileSync } from "fs";
import { isAbsolute, relative, resolve } from "path";
import { buildAdvisorPrompt, normalizeAdvisorResponse, type ClaudeAdvisorResponse } from "./claude/claude-advice-format.ts";
import type { PacificoComplexity } from "./pacifico-result-html.ts";

export interface PacificoAdvisorArgs {
	question: string;
	task_context?: string;
	files?: string[];
	model?: string;
	mode?: "sync" | "async" | "auto";
	agent_role?: string;
	complexity?: PacificoComplexity;
	max_output_tokens?: number;
	max_file_bytes?: number;
	max_context_bytes?: number;
}

export interface PacificoAdvisorContext {
	cwd: string;
}

export interface PacificoContextDiagnostic {
	path: string;
	status: "included" | "missing" | "unreadable" | "truncated" | "omitted";
	bytes?: number;
	message?: string;
}

export interface PacificoAdvisorPacket {
	prompt: string;
	diagnostics: PacificoContextDiagnostic[];
	includedFiles: number;
	promptBytes: number;
}

const DEFAULT_MAX_FILE_BYTES = 12_000;
const DEFAULT_MAX_CONTEXT_BYTES = 60_000;
const PROJECT_HINT_FILES = ["CLAUDE.md", ".context/todo.md"];

function safeRole(role: string | undefined): string {
	const trimmed = role?.trim() ?? "";
	return /^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(trimmed) ? trimmed : "advisor";
}

function bytes(text: string): number {
	return Buffer.byteLength(text, "utf-8");
}

function truncateText(text: string, maxBytes: number): { text: string; truncated: boolean } {
	if (bytes(text) <= maxBytes) return { text, truncated: false };
	let out = text.slice(0, maxBytes);
	while (bytes(out) > maxBytes && out.length > 0) out = out.slice(0, -1);
	return { text: `${out}\n\n[TRUNCATED to ${maxBytes} bytes]`, truncated: true };
}

function resolveRequestedFile(cwd: string, file: string): string {
	return isAbsolute(file) ? resolve(file) : resolve(cwd, file);
}

function labelPath(cwd: string, filePath: string): string {
	const rel = relative(cwd, filePath);
	return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : filePath;
}

function readContextFile(cwd: string, file: string, maxFileBytes: number): { heading: string; body: string; diagnostic: PacificoContextDiagnostic } {
	const resolved = resolveRequestedFile(cwd, file);
	const label = labelPath(cwd, resolved);
	if (!existsSync(resolved)) {
		return { heading: label, body: "", diagnostic: { path: label, status: "missing", message: "File does not exist." } };
	}
	try {
		const raw = readFileSync(resolved, "utf-8");
		const truncated = truncateText(raw, maxFileBytes);
		return {
			heading: label,
			body: truncated.text,
			diagnostic: { path: label, status: truncated.truncated ? "truncated" : "included", bytes: bytes(raw) },
		};
	} catch (err) {
		return { heading: label, body: "", diagnostic: { path: label, status: "unreadable", message: err instanceof Error ? err.message : String(err) } };
	}
}

export function collectPacificoAdvisorContext(args: PacificoAdvisorArgs, ctx: PacificoAdvisorContext): PacificoAdvisorPacket {
	const maxFileBytes = Math.max(1_000, args.max_file_bytes ?? DEFAULT_MAX_FILE_BYTES);
	const maxContextBytes = Math.max(8_000, args.max_context_bytes ?? DEFAULT_MAX_CONTEXT_BYTES);
	const diagnostics: PacificoContextDiagnostic[] = [];
	const sections: string[] = [];

	sections.push("## Pacifico Advisor Context Contract");
	sections.push("Pacifico has no access to the local filesystem, shell, tools, browser, git state, or hidden session context.");
	sections.push("Reason only from the context included in this prompt. If context is missing, say what is missing and avoid inventing file details.");
	sections.push("");
	sections.push("## Working Directory");
	sections.push(ctx.cwd);

	for (const hint of PROJECT_HINT_FILES) {
		const read = readContextFile(ctx.cwd, hint, Math.min(maxFileBytes, 8_000));
		if (read.diagnostic.status === "included" || read.diagnostic.status === "truncated") {
			sections.push("");
			sections.push(`## Project Context: ${read.heading}`);
			sections.push("```text");
			sections.push(read.body);
			sections.push("```");
		}
		diagnostics.push(read.diagnostic);
	}

	if (args.task_context?.trim()) {
		sections.push("");
		sections.push("## Supplied Task Context");
		sections.push(args.task_context.trim());
	}

	const uniqueFiles = [...new Set((args.files ?? []).map((f) => f.trim()).filter(Boolean))];
	for (const file of uniqueFiles) {
		const read = readContextFile(ctx.cwd, file, maxFileBytes);
		diagnostics.push(read.diagnostic);
		if (read.diagnostic.status === "included" || read.diagnostic.status === "truncated") {
			sections.push("");
			sections.push(`## File: ${read.heading}`);
			sections.push("```text");
			sections.push(read.body);
			sections.push("```");
		}
	}

	if (args.complexity) {
		sections.push("");
		sections.push("## Response Budget Tier");
		sections.push(`Caller-selected complexity: ${args.complexity}. Be complete within this tier; do not expand scope beyond the user's question.`);
	}
	if (args.max_output_tokens) {
		sections.push(`Caller-selected max output tokens: ${Math.trunc(args.max_output_tokens)}.`);
	}

	sections.push("");
	sections.push("## Advisor Task");
	sections.push(buildAdvisorPrompt(args.question.trim(), safeRole(args.agent_role)));
	sections.push("");
	sections.push("Optional presentation extension: if useful, append `Suggested follow-up questions:` with 1-3 concise bullets after Next actions. Keep the core Claude advisor sections unchanged.");

	let prompt = sections.join("\n");
	const beforeLimitBytes = bytes(prompt);
	if (beforeLimitBytes > maxContextBytes) {
		const truncated = truncateText(prompt, maxContextBytes);
		prompt = truncated.text;
		diagnostics.push({ path: "<entire-prompt>", status: "truncated", bytes: beforeLimitBytes, message: `Prompt truncated to ${maxContextBytes} bytes.` });
	}

	return {
		prompt,
		diagnostics,
		includedFiles: diagnostics.filter((d) => d.status === "included" || d.status === "truncated").length,
		promptBytes: bytes(prompt),
	};
}

export function buildPacificoAdvisorPrompt(args: PacificoAdvisorArgs, ctx: PacificoAdvisorContext): string {
	return collectPacificoAdvisorContext(args, ctx).prompt;
}

export function formatPacificoAdvisorResult(normalized: ClaudeAdvisorResponse, metadata: { diagnostics?: PacificoContextDiagnostic[]; jobId?: string; model?: string | null; route?: string | null } = {}): string {
	const diagnostics = metadata.diagnostics ?? [];
	const omitted = diagnostics.filter((d) => d.status !== "included").length;
	const contextLine = diagnostics.length ? `Context supplied: ${diagnostics.length - omitted}/${diagnostics.length} context item(s) included${omitted ? `, ${omitted} with diagnostics` : ""}.` : "";
	return [
		contextLine,
		metadata.jobId ? `Pacifico job: ${metadata.jobId}` : "",
		metadata.model ? `Model: ${metadata.model}` : "",
		`Summary: ${normalized.summary}`,
		`Recommended decision: ${normalized.recommendation}`,
		normalized.risks.length ? `Risks:\n- ${normalized.risks.join("\n- ")}` : "",
		normalized.alternatives.length ? `Alternatives:\n- ${normalized.alternatives.join("\n- ")}` : "",
		normalized.nextActions.length ? `Next actions:\n- ${normalized.nextActions.join("\n- ")}` : "",
	].filter(Boolean).join("\n\n");
}

export { normalizeAdvisorResponse };
