// ABOUTME: Pure helper functions for the memory-cycle extension.
// ABOUTME: Extracted for testability — no @sinclair/typebox or pi framework dependencies.

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

// ── Config ───────────────────────────────────────────────────────────

export const DAILY_LOG_DIR = join(process.env.HOME ?? "~", ".claude", "agent-memory", "daily-logs");
export const SESSION_STATE_FILE = ".context/session-state.json";

// ── Helpers ──────────────────────────────────────────────────────────

export function getProjectName(cwd: string): string {
	return basename(cwd);
}

export function getTimestamp(): { date: string; time: string; iso: string } {
	const now = new Date();
	const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
	const time = now.toTimeString().split(" ")[0].slice(0, 5); // HH:MM
	const iso = now.toISOString();
	return { date, time, iso };
}

export function ensureDir(dirPath: string): void {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
	}
}

/**
 * Extract file operations from branch entries for session state.
 * Uses duck-typing since SessionEntry types vary.
 */
export function extractFileOps(entries: any[]): { read: string[]; modified: string[] } {
	const readFiles = new Set<string>();
	const modifiedFiles = new Set<string>();

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!msg || msg.role !== "toolResult") continue;

		const toolName = msg.toolName;
		const details = msg.details;

		if (toolName === "read" && details?.path) {
			readFiles.add(details.path);
		} else if ((toolName === "write" || toolName === "edit") && details?.path) {
			modifiedFiles.add(details.path);
		}
	}

	return {
		read: [...readFiles].slice(-10),
		modified: [...modifiedFiles].slice(-10),
	};
}

/**
 * Write a daily log entry.
 */
export function writeDailyLog(opts: {
	project: string;
	summary: string;
	date: string;
	time: string;
	keyFiles: string[];
	continuePrompt: string;
}): string {
	ensureDir(DAILY_LOG_DIR);
	const logPath = join(DAILY_LOG_DIR, `${opts.date}.md`);

	const entry = [
		`## ${opts.time} - ${opts.project}`,
		`**Summary:** ${opts.summary}`,
		`**Files:** ${opts.keyFiles.join(", ") || "none"}`,
		`**Continue:** ${opts.continuePrompt}`,
		"---",
		"",
	].join("\n");

	appendFileSync(logPath, entry);
	return logPath;
}

/**
 * Write session state JSON.
 */
export function writeSessionState(cwd: string, opts: {
	project: string;
	iso: string;
	continuePrompt: string;
	currentTask: string;
	filesEdited: string[];
	filesRead: string[];
}): string {
	const stateDir = join(cwd, ".context");
	ensureDir(stateDir);
	const statePath = join(cwd, SESSION_STATE_FILE);

	const state = {
		$schema: "session-state-v2",
		project: opts.project,
		cwd,
		ts: opts.iso,
		continue: opts.continuePrompt,
		task: opts.currentTask,
		files: opts.filesEdited,
		files_read: opts.filesRead,
	};

	writeFileSync(statePath, JSON.stringify(state, null, 2));
	return statePath;
}

/**
 * Read recent daily logs for context restoration.
 */
export function readRecentLogs(): string {
	const now = new Date();
	const today = now.toISOString().split("T")[0];
	const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

	const parts: string[] = [];

	for (const date of [today, yesterday]) {
		const logPath = join(DAILY_LOG_DIR, `${date}.md`);
		if (existsSync(logPath)) {
			try {
				const content = readFileSync(logPath, "utf-8").trim();
				if (content) {
					parts.push(`### ${date === today ? "Today" : "Yesterday"} (${date})\n${content}`);
				}
			} catch {
				// Ignore read errors
			}
		}
	}

	return parts.length > 0
		? "## Recent Session Logs\n\n" + parts.join("\n\n")
		: "";
}

/**
 * Read session state if available.
 */
export function readSessionState(cwd: string): Record<string, any> | null {
	const statePath = join(cwd, SESSION_STATE_FILE);
	if (!existsSync(statePath)) return null;
	try {
		return JSON.parse(readFileSync(statePath, "utf-8"));
	} catch {
		return null;
	}
}

/**
 * Extract summary and continuation context from messages being compacted.
 */
export function extractCompactionContext(
	messagesToSummarize: any[],
	previousSummary: string | null,
): { summaryText: string; continueText: string } {
	let summaryText = "Session compacted (auto)";
	let continueText = "Continue working on the current task.";

	if (messagesToSummarize.length > 0) {
		// Extract first user message as task context
		for (const msg of messagesToSummarize) {
			if (msg.role === "user") {
				const content = (msg as any).content;
				if (typeof content === "string") {
					summaryText = content.slice(0, 200);
					break;
				} else if (Array.isArray(content)) {
					const textBlock = content.find((b: any) => b.type === "text");
					if (textBlock?.text) {
						summaryText = textBlock.text.slice(0, 200);
						break;
					}
				}
			}
		}

		// Use last assistant message for continuation context
		for (let i = messagesToSummarize.length - 1; i >= 0; i--) {
			const msg = messagesToSummarize[i];
			if (msg.role === "assistant") {
				const content = (msg as any).content;
				if (Array.isArray(content)) {
					const textBlock = content.find((b: any) => b.type === "text");
					if (textBlock?.text) {
						continueText = textBlock.text.slice(0, 300);
						break;
					}
				}
			}
		}
	}

	// Include previous summary for continuity
	if (previousSummary) {
		continueText = previousSummary.slice(0, 300);
	}

	return { summaryText, continueText };
}

/**
 * Build the memory restoration content shown after compaction.
 */
export function buildRestorationContent(
	sessionState: Record<string, any> | null,
): string[] {
	const parts: string[] = [
		"Context was automatically compacted to free up space.",
	];

	if (sessionState?.continue) {
		parts.push(`\n**Continue:** ${sessionState.continue}`);
	}
	if (sessionState?.task) {
		parts.push(`**Task:** ${sessionState.task}`);
	}
	if (sessionState?.files?.length > 0) {
		parts.push(`**Recently edited:** ${sessionState.files.join(", ")}`);
	}

	return parts;
}

/**
 * Build the full memory injection text for a new session after /cycle.
 */
export function buildCycleMemoryInjection(opts: {
	compactionSummary: string;
	sessionState: Record<string, any> | null;
	recentLogs: string;
}): string {
	const memoryParts = [
		"# Session Memory Restored",
		"",
		"Previous session was compacted. Here is your working memory:",
		"",
		"## Compaction Summary",
		"",
		opts.compactionSummary,
	];

	if (opts.sessionState) {
		memoryParts.push(
			"",
			"## Session State",
			"",
			`**Task:** ${opts.sessionState.task ?? "Unknown"}`,
			`**Continue:** ${opts.sessionState.continue ?? "Continue working"}`,
		);
		if (opts.sessionState.files?.length > 0) {
			memoryParts.push(`**Edited files:** ${opts.sessionState.files.join(", ")}`);
		}
		if (opts.sessionState.files_read?.length > 0) {
			memoryParts.push(`**Read files:** ${opts.sessionState.files_read.join(", ")}`);
		}
	}

	if (opts.recentLogs) {
		memoryParts.push("", opts.recentLogs);
	}

	memoryParts.push(
		"",
		"---",
		"",
		"Memory restored. Continue where you left off — do NOT ask what to do next, just resume working.",
	);

	return memoryParts.join("\n");
}
