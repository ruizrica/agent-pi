// ABOUTME: Builds shared context packets for Claude worker and advisor profiles.
// ABOUTME: Encodes cwd, plan, git status, and optional summaries into a stable prompt prefix.

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export interface ClaudeContextOptions {
	cwd: string;
	task: string;
	recentSummary?: string;
	fileHints?: string[];
	conversationSummary?: string;
}

function getTopLevelSummary(cwd: string): string {
	try {
		const entries = readdirSync(cwd, { withFileTypes: true });
		const dirs = entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
			.map((entry) => entry.name + "/");
		const files = entries
			.filter((entry) => entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".json") || entry.name.endsWith(".ts") || entry.name === ".env"))
			.map((entry) => entry.name);
		return [...dirs.slice(0, 10), ...files.slice(0, 5)].join(" ");
	} catch {
		return "";
	}
}

function getGitSummary(cwd: string): string {
	try {
		const status = execSync("git status --short 2>/dev/null", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
		if (!status) return "clean";
		const lines = status.split("\n");
		const modified = lines.filter((line) => line.startsWith(" M") || line.startsWith("M ")).length;
		const added = lines.filter((line) => line.startsWith("A ")).length;
		const untracked = lines.filter((line) => line.startsWith("??")).length;
		const parts: string[] = [];
		if (modified) parts.push(`${modified} modified`);
		if (added) parts.push(`${added} added`);
		if (untracked) parts.push(`${untracked} untracked`);
		return parts.join(", ") || "changes present";
	} catch {
		return "unknown";
	}
}

function getActivePlanTitle(cwd: string): string {
	try {
		const todoPath = join(cwd, ".context", "todo.md");
		if (!existsSync(todoPath)) return "";
		const content = readFileSync(todoPath, "utf-8");
		return content.split("\n").find((line) => line.startsWith("# "))?.replace(/^# /, "").trim() || "";
	} catch {
		return "";
	}
}

export function buildClaudeContextPacket(options: ClaudeContextOptions): string {
	const lines: string[] = ["## Working Context"];
	lines.push(`Working directory: ${options.cwd}`);
	lines.push("IMPORTANT: Work inside this directory first. Do not search or modify other projects unless explicitly asked.");

	const topLevel = getTopLevelSummary(options.cwd);
	if (topLevel) lines.push(`Top-level: ${topLevel}`);

	const gitStatus = getGitSummary(options.cwd);
	if (gitStatus) lines.push(`Git status: ${gitStatus}`);

	const planTitle = getActivePlanTitle(options.cwd);
	if (planTitle) lines.push(`Active plan: ${planTitle}`);

	if (options.recentSummary?.trim()) {
		lines.push("Recent summary:");
		lines.push(options.recentSummary.trim());
	}

	if (options.conversationSummary?.trim()) {
		lines.push("Conversation summary:");
		lines.push(options.conversationSummary.trim());
	}

	if (options.fileHints && options.fileHints.length > 0) {
		lines.push(`Relevant files: ${options.fileHints.join(", ")}`);
	}

	lines.push("");
	lines.push("## Task");
	lines.push(options.task);
	return lines.join("\n");
}
