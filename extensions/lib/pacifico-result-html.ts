// ABOUTME: Pacifico Result data types and Markdown adapter for the Plan Viewer UI.
// ABOUTME: Pacifico results intentionally reuse the existing plan viewer styling/round-trip flow.

import type { ClaudeAdvisorResponse } from "./claude/claude-advice-format.ts";
import type { PacificoContextDiagnostic } from "./pacifico-advisor.ts";

export type PacificoComplexity = "simple" | "standard" | "complex" | "super_complex";

export interface PacificoResultData {
	title: string;
	question: string;
	generatedAt: string;
	advisor: ClaudeAdvisorResponse;
	formattedText: string;
	metadata?: {
		model?: string | null;
		provider?: string | null;
		route?: string | null;
		jobId?: string | null;
		requestId?: string | null;
		complexity?: PacificoComplexity | null;
		mode?: string | null;
	};
	diagnostics?: PacificoContextDiagnostic[];
	followUpAncestry?: Array<{ question: string; summary: string }>;
}

export interface PacificoResultAction {
	action: "closed" | "follow_up";
	question?: string;
}

function md(value: unknown): string {
	return String(value ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
}

function bulletList(items: string[] | undefined, fallback: string): string {
	if (!items?.length) return `- ${fallback}`;
	return items.map((item) => `- ${md(item).replace(/\n/g, "\n  ")}`).join("\n");
}

function metadataLines(data: PacificoResultData): string[] {
	const meta = data.metadata ?? {};
	return [
		["Generated", data.generatedAt],
		["Complexity", meta.complexity],
		["Model", meta.model],
		["Provider", meta.provider],
		["Route", meta.route],
		["Mode", meta.mode],
		["Job", meta.jobId],
		["Request", meta.requestId],
	].filter(([, value]) => value !== undefined && value !== null && value !== "")
		.map(([key, value]) => `- **${key}:** ${md(value)}`);
}

function diagnosticsMarkdown(diagnostics: PacificoContextDiagnostic[] | undefined): string {
	if (!diagnostics?.length) return "- No context diagnostics were recorded.";
	return diagnostics.map((d) => {
		const extras = [
			d.bytes ? `${d.bytes} bytes` : "",
			d.message ? md(d.message) : "",
		].filter(Boolean).join(" — ");
		return `- **${md(d.path)}** — ${md(d.status)}${extras ? ` — ${extras}` : ""}`;
	}).join("\n");
}

function ancestryMarkdown(data: PacificoResultData): string {
	if (!data.followUpAncestry?.length) return "";
	return [
		"## Follow-up Thread",
		"",
		...data.followUpAncestry.flatMap((item, index) => [
			`${index + 1}. **Question:** ${md(item.question)}`,
			`   - Summary: ${md(item.summary)}`,
		]),
		"",
	].join("\n");
}

export function pacificoResultToMarkdown(data: PacificoResultData): string {
	const metadata = metadataLines(data);
	return [
		`# ${md(data.title || "Pacifico Result")}`,
		"",
		"## Question",
		"",
		md(data.question),
		"",
		"## Metadata",
		"",
		metadata.length ? metadata.join("\n") : "- No metadata recorded.",
		"",
		"## Summary",
		"",
		md(data.advisor.summary || "No summary returned."),
		"",
		"## Recommended Decision",
		"",
		md(data.advisor.recommendation || "No recommendation returned."),
		"",
		"## Risks",
		"",
		bulletList(data.advisor.risks, "No risks were returned."),
		"",
		"## Alternatives",
		"",
		bulletList(data.advisor.alternatives, "No alternatives were returned."),
		"",
		"## Next Actions",
		"",
		bulletList(data.advisor.nextActions, "No next actions were returned."),
		"",
		ancestryMarkdown(data),
		"## Context Diagnostics",
		"",
		diagnosticsMarkdown(data.diagnostics),
		"",
		"## Raw Output",
		"",
		"```text",
		String(data.formattedText || data.advisor.raw || "").replace(/```/g, "`\u200b``"),
		"```",
		"",
	].join("\n");
}
