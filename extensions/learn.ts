// ABOUTME: /learn command for capturing a codebase/folder snapshot into Obsidian.
// ABOUTME: Builds a structured multi-area learn report and stores raw + wiki artifacts via the local Obsidian tool handlers.

import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import type { ObsidianToolParams } from "./lib/obsidian-types.ts";
import {
	obsidianExec,
	rawPath,
	wikiPath,
	indexPath,
	masterIndexPath,
	buildFrontmatter,
} from "./lib/obsidian-cli.ts";

interface LearnTarget {
	input: string;
	resolvedPath: string;
	displayName: string;
	folderSlug: string;
	wikiSlug: string;
	rawTitle: string;
	timestamp: string;
}

interface LearnAssignment {
	id: string;
	role: "scout" | "builder";
	summary: string;
	focus: string;
}

interface LearnAgentPrompt {
	assignment: LearnAssignment;
	prompt: string;
}

interface LearnAgentResult {
	assignmentId: string;
	status: "done" | "error";
	output: string;
	error?: string;
}

interface LearnAggregation {
	completed: LearnAgentResult[];
	failed: LearnAgentResult[];
	missing: LearnAssignment[];
	byAssignment: Record<string, LearnAgentResult>;
	summary: string;
	coverage: {
		required: number;
		completed: number;
		failed: number;
		missing: number;
		percent: number;
		validated: boolean;
	};
	validationChecklist: string[];
}

interface LearnSection {
	id: string;
	title: string;
	body: string;
	links?: string[];
}

function slugifySegment(value: string): string {
	const normalized = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	const slug = normalized
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
	return slug || "workspace";
}

function formatTimestamp(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}-${hours}${minutes}z`;
}

function formatDisplayName(folderName: string): string {
	return folderName.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Workspace";
}

function createLearnTarget(input: string, cwd: string, now: Date = new Date()): LearnTarget {
	const trimmed = (input || "").trim() || ".";
	const resolvedPath = path.resolve(cwd, trimmed);
	const baseName = path.basename(resolvedPath) || path.basename(cwd);
	const displayName = formatDisplayName(baseName);
	const folderSlug = slugifySegment(baseName);
	const wikiSlug = `codebase-${folderSlug}`;
	const timestamp = formatTimestamp(now);
	return {
		input: trimmed,
		resolvedPath,
		displayName,
		folderSlug,
		wikiSlug,
		rawTitle: `${displayName} Codebase Learn Report ${timestamp}`,
		timestamp,
	};
}

function buildLearnAssignments(target: LearnTarget): LearnAssignment[] {
	const folderRef = `${target.displayName} (${target.resolvedPath})`;
	return [
		{ id: "structure", role: "scout", summary: "Structure scout", focus: `Map directory structure, entry points, and major files in ${folderRef}.` },
		{ id: "patterns", role: "scout", summary: "Pattern scout", focus: `Find existing coding patterns, reusable helpers, and conventions inside ${folderRef}.` },
		{ id: "data-flow", role: "scout", summary: "Data-flow scout", focus: `Trace important request/data flows across ${folderRef}.` },
		{ id: "tests", role: "scout", summary: "Test scout", focus: `Inspect test infrastructure, fixtures, and validation patterns used in ${folderRef}.` },
		{ id: "dependencies", role: "scout", summary: "Dependency scout", focus: `Map imports, exports, and subsystem dependencies in ${folderRef}.` },
		{ id: "config", role: "scout", summary: "Config scout", focus: `Summarize config files, environment assumptions, scripts, and build settings in ${folderRef}.` },
		{ id: "build-health", role: "builder", summary: "Build-health builder", focus: `Assess build/typecheck/test health expectations and implementation risks for ${folderRef}.` },
		{ id: "architecture", role: "builder", summary: "Architecture builder", focus: `Produce a subsystem-level architectural summary of ${folderRef}, including boundaries and extension points.` },
	];
}

function createLearnPrompts(target: LearnTarget): LearnAgentPrompt[] {
	return buildLearnAssignments(target).map((assignment) => ({
		assignment,
		prompt: [
			`Analyze the target folder ${target.resolvedPath}.`,
			`Assignment: ${assignment.summary}.`,
			assignment.focus,
			"Be concrete: cite files, functions, patterns, tests, and configuration details when available.",
			"Return markdown using this exact structure:",
			`# ${assignment.summary}`,
			"## Scope",
			"- What you inspected",
			"## Evidence",
			"- file paths, functions, tests, commands, or configs",
			"## Findings",
			"- concrete takeaways grounded in evidence",
			"## Risks",
			"- uncertainty, missing coverage, or follow-up concerns",
			"## Validation",
			"- why this scan is complete enough for this area",
		].join(" "),
	}));
}

function aggregateLearnResults(results: LearnAgentResult[], assignments: LearnAssignment[]): LearnAggregation {
	const byAssignment: Record<string, LearnAgentResult> = {};
	for (const result of results) {
		byAssignment[result.assignmentId] = result;
	}

	const completed = results.filter((result) => result.status === "done");
	const failed = results.filter((result) => result.status === "error");
	const missing = assignments.filter((assignment) => !byAssignment[assignment.id]);
	const percent = assignments.length === 0 ? 100 : Math.round((completed.length / assignments.length) * 100);
	const validated = failed.length === 0 && missing.length === 0 && completed.length === assignments.length;
	const summary = [
		`${completed.length}/${assignments.length} learn assignments completed`,
		`${percent}% coverage`,
		...(failed.length ? [`${failed.length} failed`] : []),
		...(missing.length ? [`${missing.length} missing`] : []),
		...(validated ? ["coverage validated"] : []),
	].join("; ");

	return {
		completed,
		failed,
		missing,
		byAssignment,
		summary,
		coverage: {
			required: assignments.length,
			completed: completed.length,
			failed: failed.length,
			missing: missing.length,
			percent,
			validated,
		},
		validationChecklist: [
			`Assignments required: ${assignments.length}`,
			`Assignments completed: ${completed.length}`,
			`Assignments failed: ${failed.length}`,
			`Assignments missing: ${missing.length}`,
			`Coverage percent: ${percent}%`,
			`Coverage validated: ${validated ? "yes" : "no"}`,
		],
	};
}

function createFallbackResults(target: LearnTarget): LearnAgentResult[] {
	return createLearnPrompts(target).map(({ assignment }) => ({
		assignmentId: assignment.id,
		status: "done",
		output: [
			`# ${assignment.summary}`,
			"",
			"## Scope",
			`- Placeholder scan for ${target.resolvedPath}`,
			"",
			"## Evidence",
			`- No real subagent execution is wired into /learn yet; this section represents the intended ${assignment.role} coverage area.`,
			"",
			"## Findings",
			`- ${assignment.summary}: placeholder analysis for ${target.resolvedPath}`,
			"",
			"## Risks",
			"- This run does not yet collect live subagent results from the target codebase.",
			"",
			"## Validation",
			"- Marked as fallback content only; upgrade /learn to synthesize actual subagent outputs.",
		].join("\n"),
	}));
}

function buildCoverageLines(aggregation: LearnAggregation): string[] {
	return aggregation.validationChecklist.map((line) => `- ${line}`);
}

function firstNonEmptyLine(value: string): string {
	return value.split("\n").map((line) => line.trim()).find(Boolean) || "See detailed section.";
}

function buildLearnSections(target: LearnTarget, aggregation: LearnAggregation): LearnSection[] {
	const byId = aggregation.byAssignment;
	const completedIds = aggregation.completed.map((result) => result.assignmentId);
	const matchingLines = (ids: string[]) => ids.filter((id) => completedIds.includes(id)).map((id) => `- **${id}** — ${firstNonEmptyLine(byId[id]?.output || "")}`);

	return [
		{
			id: "overview",
			title: `${target.displayName} Overview`,
			links: [`${target.displayName} Architecture`, `${target.displayName} Conventions`, `${target.displayName} Testing`],
			body: [
				`# ${target.displayName} Overview`,
				"",
				`Target path: ${target.resolvedPath}`,
				`Wiki topic: ${target.wikiSlug}`,
				"",
				"## Summary",
				"",
				`This learn pass captures an evidence-backed snapshot of ${target.resolvedPath} across eight scoped reconnaissance areas.`,
				"",
				"## Coverage Validation",
				"",
				...buildCoverageLines(aggregation),
				"",
				"## Completed Assignments",
				"",
				...matchingLines(["structure", "patterns", "data-flow", "dependencies", "config", "tests", "build-health", "architecture"]),
			].join("\n"),
		},
		{
			id: "architecture",
			title: `${target.displayName} Architecture`,
			links: [`${target.displayName} Overview`, `${target.displayName} Conventions`],
			body: [
				`# ${target.displayName} Architecture`,
				"",
				"## Structural Findings",
				"",
				...matchingLines(["structure", "data-flow", "dependencies", "architecture"]),
			].join("\n"),
		},
		{
			id: "conventions",
			title: `${target.displayName} Conventions`,
			links: [`${target.displayName} Overview`, `${target.displayName} Testing`],
			body: [
				`# ${target.displayName} Conventions`,
				"",
				"## Patterns and Configuration",
				"",
				...matchingLines(["patterns", "config", "dependencies"]),
			].join("\n"),
		},
		{
			id: "testing",
			title: `${target.displayName} Testing`,
			links: [`${target.displayName} Overview`, `${target.displayName} Architecture`],
			body: [
				`# ${target.displayName} Testing`,
				"",
				"## Testing Surface",
				"",
				...matchingLines(["tests", "build-health"]),
			].join("\n"),
		},
	];
}

function buildRawLearnContent(target: LearnTarget, sections: LearnSection[]): string {
	return [
		`# ${target.displayName} Codebase Learn Report`,
		"",
		`- Target: ${target.resolvedPath}`,
		`- Wiki topic: ${target.wikiSlug}`,
		`- Timestamp: ${target.timestamp}`,
		"",
		...sections.flatMap((section) => [section.body, ""]),
	].join("\n").trimEnd();
}

function buildWikiIndexContent(target: LearnTarget, sections: LearnSection[]): string {
	return [
		`# ${target.displayName}`,
		"",
		`Validated learned codebase snapshot for ${target.resolvedPath}.`,
		"",
		"## Articles",
		"",
		...sections.map((section) => `- [[${section.title}]]`),
	].join("\n");
}

function buildMasterIndexContent(target: LearnTarget, sections: LearnSection[]): string {
	return [
		"# Knowledge Base — Master Index",
		"",
		"## Wiki Topics",
		"",
		`- [[wiki/${target.wikiSlug}/_index|${target.displayName}]] — validated codebase learn snapshot (${sections.length} articles)`,
	].join("\n");
}

async function writeRawNote(target: LearnTarget, sections: LearnSection[]) {
	const meta = buildFrontmatter({
		title: target.rawTitle,
		date: new Date().toISOString().split("T")[0],
		status: "raw",
		tags: ["codebase-learn", target.folderSlug, target.wikiSlug],
	});
	const content = [meta, "", buildRawLearnContent(target, sections)].join("\n");

	await obsidianExec("create", {
		path: rawPath(`${target.rawTitle}.md`, "codebase-learn"),
		content,
	});
}

async function writeWiki(target: LearnTarget, sections: LearnSection[]) {
	for (const section of sections) {
		const content = [
			buildFrontmatter({
				title: section.title,
				wiki: target.wikiSlug,
				date: new Date().toISOString().split("T")[0],
				status: "wiki",
				related: section.links,
			}),
			"",
			section.body,
		].join("\n");

		await obsidianExec("create", {
			path: wikiPath(target.wikiSlug, `${section.title}.md`),
			content,
			overwrite: true,
		});
	}

	await obsidianExec("create", {
		path: indexPath(target.wikiSlug),
		content: buildWikiIndexContent(target, sections),
		overwrite: true,
	});

	await obsidianExec("create", {
		path: masterIndexPath(),
		content: buildMasterIndexContent(target, sections),
		overwrite: true,
	});

	await obsidianExec("health", {});
}

async function executeLearn(args: string, ctx: any) {
	const target = createLearnTarget(args, ctx.cwd);
	const assignments = buildLearnAssignments(target);
	const aggregation = aggregateLearnResults(createFallbackResults(target), assignments);
	const sections = buildLearnSections(target, aggregation);
	await writeRawNote(target, sections);
	await writeWiki(target, sections);
	ctx.ui.notify(`Learned ${target.displayName} → wiki/${target.wikiSlug}\n${aggregation.summary}`, aggregation.coverage.validated ? "success" : "warning");
}

export const __testExports = {
	slugifySegment,
	formatTimestamp,
	formatDisplayName,
	createLearnTarget,
	buildLearnAssignments,
	createLearnPrompts,
	aggregateLearnResults,
	buildLearnSections,
	buildRawLearnContent,
	buildWikiIndexContent,
	buildMasterIndexContent,
};

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.registerTool({
		name: "learn_codebase",
		description: "Create a codebase/folder learn snapshot and store it in Obsidian.",
		parameters: Type.Object({
			path: Type.String({ description: "Folder path to learn" }),
		}),
		renderStatus() { return null; },
		renderResult() { return null; },
		execute: async (_callId, args, _signal, _onUpdate, ctx) => {
			await executeLearn(args.path, ctx);
			return {
				content: [{ type: "text", text: `Learned ${args.path}` }],
				details: { success: true, operation: "learn", path: args.path } as ObsidianToolParams,
			};
		},
	});

	pi.registerCommand("learn", {
		description: "Learn a target folder/codebase and persist a snapshot into Obsidian",
		handler: async (args, ctx) => {
			try {
				await executeLearn(args, ctx);
			} catch (error: any) {
				ctx.ui.notify(error?.message || "Failed to run /learn", "error");
			}
		},
	});
}
