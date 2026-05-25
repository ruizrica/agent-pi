// ABOUTME: Converts approved plan/spec/investigation/debug markdown tasks into Commander task groups.
// ABOUTME: Keeps Commander board tasks as the source of truth before IMPLEMENT mode starts.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getCommanderCliClient, isCommanderAvailable } from "./commander/commander-cli-client.ts";

export interface ApprovalTask {
	description: string;
	checked: boolean;
	level: number;
}

export interface ReadSpecTaskMarkdownResult {
	path: string;
	markdown: string;
}

export interface CommanderTaskMaterializationInput {
	title: string;
	sourceKind: "plan" | "spec" | "investigation" | "debug";
	sourcePath: string;
	markdown: string;
	cwd: string;
	labels?: string[];
	sectionHint?: RegExp;
}

export interface CommanderTaskMaterializationResult {
	ok: boolean;
	taskCount: number;
	source: string;
	groupId?: number;
	taskIds?: number[];
	warning?: string;
}

export interface CommanderTaskClient {
	callTool(toolName: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<any>;
}

function normalizeTaskText(text: string): string {
	return text
		.replace(/^\d+\.\s+/, "")
		.replace(/\s+/g, " ")
		.trim();
}

function sourceLabel(kind: CommanderTaskMaterializationInput["sourceKind"]): string {
	if (kind === "plan") return "approved-plan";
	if (kind === "spec") return "approved-spec";
	if (kind === "debug") return "approved-debug";
	return "approved-investigation";
}

function sectionStartIndex(lines: string[], sectionHint?: RegExp): number {
	if (!sectionHint) return 0;
	const idx = lines.findIndex((line) => sectionHint.test(line));
	return idx >= 0 ? idx + 1 : 0;
}

function nextHeadingIndex(lines: string[], start: number): number {
	for (let i = start; i < lines.length; i++) {
		if (/^#{1,3}\s+/.test(lines[i])) return i;
	}
	return lines.length;
}

export function extractMarkdownCheckboxTasks(markdown: string, options: { sectionHint?: RegExp } = {}): ApprovalTask[] {
	const allLines = markdown.split("\n");
	const start = sectionStartIndex(allLines, options.sectionHint);
	const end = options.sectionHint ? nextHeadingIndex(allLines, start) : allLines.length;
	const lines = allLines.slice(start, end);
	const tasks: ApprovalTask[] = [];

	for (const line of lines) {
		const match = line.match(/^(\s*)- \[([ xX])\]\s+(.+)$/);
		if (!match) continue;
		const description = normalizeTaskText(match[3]);
		if (!description) continue;
		tasks.push({
			description,
			checked: match[2].toLowerCase() === "x",
			level: Math.floor(match[1].length / 2),
		});
	}

	return tasks;
}

export function readSpecTaskMarkdown(folderPath: string): ReadSpecTaskMarkdownResult | null {
	const candidates = [join(folderPath, "tasks.md"), join(folderPath, "planning", "tasks.md")];
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		return { path, markdown: readFileSync(path, "utf-8") };
	}
	return null;
}

function buildCmdPlanBody(options: { description: string; sourcePath: string; cwd: string; kindLabel: string }): string {
	return `## Steps\n1. Complete the approved ${options.kindLabel.toLowerCase()} task: ${options.description}\n\n## Tests\n- Verify the task acceptance criteria from the approved source are satisfied.\n- Keep Commander status and comments current before finishing.\n\n## References\n- Source: ${options.sourcePath}\n- Working directory: ${options.cwd}`;
}

export function buildCommanderTaskGroupPayload(input: CommanderTaskMaterializationInput): Record<string, unknown> {
	const kindLabel = input.sourceKind === "debug" ? "Debug" : input.sourceKind === "investigation" ? "Investigation" : input.sourceKind === "spec" ? "Spec" : "Plan";
	const labels = [sourceLabel(input.sourceKind), "implement-source", ...(input.labels ?? [])];
	const initiativeSummary = `${kindLabel} approved for IMPLEMENT mode. Commander tasks are the source of truth. Source: ${input.sourcePath}. Working directory: ${input.cwd}.`;
	const tasks = extractMarkdownCheckboxTasks(input.markdown, { sectionHint: input.sectionHint })
		.filter((task) => !task.checked)
		.map((task) => ({
			description: task.description,
			title: task.description,
			primary_file: input.sourcePath,
			body: buildCmdPlanBody({ description: task.description, sourcePath: input.sourcePath, cwd: input.cwd, kindLabel }),
			labels,
			lifecycle_owner: "self",
			confirm_wrapper: true,
		}));
	return {
		operation: "group:create",
		group_name: `${kindLabel}: ${input.title}`,
		initiative_summary: initiativeSummary,
		primary_file: input.sourcePath,
		body: buildCmdPlanBody({ description: initiativeSummary, sourcePath: input.sourcePath, cwd: input.cwd, kindLabel }),
		labels,
		lifecycle_owner: "self",
		confirm_wrapper: true,
		tasks,
	};
}

export async function materializeApprovedTasksToCommander(
	input: CommanderTaskMaterializationInput,
	client: CommanderTaskClient = getCommanderCliClient(),
): Promise<CommanderTaskMaterializationResult> {
	const payload = buildCommanderTaskGroupPayload(input);
	const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
	if (tasks.length === 0) {
		return {
			ok: false,
			taskCount: 0,
			source: input.sourcePath,
			warning: "No unchecked implementation tasks were found to record in Commander.",
		};
	}

	if (!isCommanderAvailable()) {
		return {
			ok: false,
			taskCount: tasks.length,
			source: input.sourcePath,
			warning: "Commander task materialization was unreachable or cmd is missing; approved tasks were not recorded as source-of-truth board tasks.",
		};
	}

	try {
		const result = await client.callTool("commander_task", payload, 30_000);
		const text = result?.content?.[0]?.text;
		const parsed = typeof text === "string" ? JSON.parse(text) : result;
		const groupId = Number(parsed?.group_id ?? parsed?.id);
		const taskIds = Array.isArray(parsed?.task_ids) ? parsed.task_ids.map((id: unknown) => Number(id)).filter(Number.isFinite) : [];
		return {
			ok: true,
			taskCount: tasks.length,
			source: input.sourcePath,
			...(Number.isFinite(groupId) ? { groupId } : {}),
			...(taskIds.length > 0 ? { taskIds } : {}),
		};
	} catch (err: any) {
		return {
			ok: false,
			taskCount: tasks.length,
			source: input.sourcePath,
			warning: `Commander task creation failed: ${err?.message || err}`,
		};
	}
}

export function summarizeMaterialization(result: CommanderTaskMaterializationResult): string {
	if (result.ok) {
		const group = result.groupId ? ` in Commander group #${result.groupId}` : "";
		return ` Commander tasks are now the source of truth: ${result.taskCount} task(s) recorded${group}.`;
	}
	return ` Commander source-of-truth task creation needs attention: ${result.warning}`;
}
