// ABOUTME: Tests for memory-cycle helper functions — file ops extraction, daily log writing,
// ABOUTME: session state persistence, compaction context extraction, and memory restoration.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

// Mock fs operations to avoid writing to real disk
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

import {
	getProjectName,
	getTimestamp,
	extractFileOps,
	writeDailyLog,
	writeSessionState,
	readRecentLogs,
	readSessionState,
	extractCompactionContext,
	buildRestorationContent,
	buildCycleMemoryInjection,
	DAILY_LOG_DIR,
} from "../lib/memory-cycle-helpers.ts";

// ── Tests ────────────────────────────────────────────────────────

describe("memory-cycle helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(existsSync).mockReturnValue(false);
		vi.mocked(readFileSync).mockReturnValue("");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getProjectName", () => {
		it("extracts basename from path", () => {
			expect(getProjectName("/Users/ricardo/projects/my-app")).toBe("my-app");
		});

		it("handles root-level paths", () => {
			expect(getProjectName("/project")).toBe("project");
		});
	});

	describe("getTimestamp", () => {
		it("returns date, time, and iso fields", () => {
			const ts = getTimestamp();
			expect(ts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(ts.time).toMatch(/^\d{2}:\d{2}$/);
			expect(ts.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});
	});

	describe("extractFileOps", () => {
		it("extracts read file paths from toolResult entries", () => {
			const entries = [
				{
					type: "message",
					message: { role: "toolResult", toolName: "read", details: { path: "src/index.ts" } },
				},
				{
					type: "message",
					message: { role: "toolResult", toolName: "read", details: { path: "README.md" } },
				},
			];

			const result = extractFileOps(entries);
			expect(result.read).toContain("src/index.ts");
			expect(result.read).toContain("README.md");
			expect(result.modified).toHaveLength(0);
		});

		it("extracts modified file paths from write and edit entries", () => {
			const entries = [
				{
					type: "message",
					message: { role: "toolResult", toolName: "write", details: { path: "src/new.ts" } },
				},
				{
					type: "message",
					message: { role: "toolResult", toolName: "edit", details: { path: "src/utils.ts" } },
				},
			];

			const result = extractFileOps(entries);
			expect(result.modified).toContain("src/new.ts");
			expect(result.modified).toContain("src/utils.ts");
			expect(result.read).toHaveLength(0);
		});

		it("deduplicates file paths", () => {
			const entries = [
				{
					type: "message",
					message: { role: "toolResult", toolName: "read", details: { path: "src/index.ts" } },
				},
				{
					type: "message",
					message: { role: "toolResult", toolName: "read", details: { path: "src/index.ts" } },
				},
			];

			const result = extractFileOps(entries);
			expect(result.read).toHaveLength(1);
		});

		it("ignores non-message entries", () => {
			const entries = [
				{ type: "compaction", summary: "old" },
				{ type: "system", content: "init" },
			];

			const result = extractFileOps(entries);
			expect(result.read).toHaveLength(0);
			expect(result.modified).toHaveLength(0);
		});

		it("ignores non-toolResult messages", () => {
			const entries = [
				{ type: "message", message: { role: "user", content: "hello" } },
				{ type: "message", message: { role: "assistant", content: "hi" } },
			];

			const result = extractFileOps(entries);
			expect(result.read).toHaveLength(0);
			expect(result.modified).toHaveLength(0);
		});

		it("ignores toolResults without details or path", () => {
			const entries = [
				{ type: "message", message: { role: "toolResult", toolName: "bash", details: { command: "ls" } } },
				{ type: "message", message: { role: "toolResult", toolName: "read" } },
			];

			const result = extractFileOps(entries);
			expect(result.read).toHaveLength(0);
		});

		it("limits to 10 files per category", () => {
			const entries = Array.from({ length: 15 }, (_, i) => ({
				type: "message",
				message: { role: "toolResult", toolName: "read", details: { path: `file-${i}.ts` } },
			}));

			const result = extractFileOps(entries);
			expect(result.read).toHaveLength(10);
		});
	});

	describe("writeDailyLog", () => {
		it("creates directory and appends log entry", () => {
			const logPath = writeDailyLog({
				project: "my-app",
				summary: "Fixed auth bug",
				date: "2026-03-03",
				time: "14:30",
				keyFiles: ["src/auth.ts", "src/login.ts"],
				continuePrompt: "Continue with rate limiting",
			});

			expect(mkdirSync).toHaveBeenCalled();
			expect(appendFileSync).toHaveBeenCalled();

			const content = vi.mocked(appendFileSync).mock.calls[0][1] as string;
			expect(content).toContain("## 14:30 - my-app");
			expect(content).toContain("**Summary:** Fixed auth bug");
			expect(content).toContain("src/auth.ts, src/login.ts");
			expect(content).toContain("**Continue:** Continue with rate limiting");
			expect(logPath).toContain("2026-03-03.md");
		});

		it("shows 'none' when no key files", () => {
			writeDailyLog({
				project: "my-app",
				summary: "Setup",
				date: "2026-03-03",
				time: "10:00",
				keyFiles: [],
				continuePrompt: "Start working",
			});

			const content = vi.mocked(appendFileSync).mock.calls[0][1] as string;
			expect(content).toContain("**Files:** none");
		});
	});

	describe("writeSessionState", () => {
		it("writes JSON with correct schema and fields", () => {
			const path = writeSessionState("/test/project", {
				project: "project",
				iso: "2026-03-03T14:30:00.000Z",
				continuePrompt: "Working on auth",
				currentTask: "Fix login bug",
				filesEdited: ["src/auth.ts"],
				filesRead: ["src/config.ts"],
			});

			expect(writeFileSync).toHaveBeenCalled();
			const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);

			expect(written.$schema).toBe("session-state-v2");
			expect(written.project).toBe("project");
			expect(written.cwd).toBe("/test/project");
			expect(written.continue).toBe("Working on auth");
			expect(written.task).toBe("Fix login bug");
			expect(written.files).toContain("src/auth.ts");
			expect(written.files_read).toContain("src/config.ts");
			expect(path).toContain("session-state.json");
		});

		it("creates .context directory if needed", () => {
			writeSessionState("/test/project", {
				project: "project",
				iso: "2026-03-03T14:30:00.000Z",
				continuePrompt: "",
				currentTask: "",
				filesEdited: [],
				filesRead: [],
			});

			expect(mkdirSync).toHaveBeenCalled();
		});
	});

	describe("readSessionState", () => {
		it("returns null when file does not exist", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			expect(readSessionState("/test/project")).toBeNull();
		});

		it("parses JSON when file exists", () => {
			const state = { $schema: "session-state-v2", task: "Fix bug" };
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

			const result = readSessionState("/test/project");
			expect(result).toEqual(state);
		});

		it("returns null on parse error", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("not json{{{");

			expect(readSessionState("/test/project")).toBeNull();
		});
	});

	describe("readRecentLogs", () => {
		it("returns empty string when no logs exist", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			expect(readRecentLogs()).toBe("");
		});

		it("includes today's log when available", () => {
			const today = new Date().toISOString().split("T")[0];

			vi.mocked(existsSync).mockImplementation((p: any) => {
				return String(p).includes(today);
			});
			vi.mocked(readFileSync).mockReturnValue("## 14:30 - project\n**Summary:** Fixed auth\n---");

			const result = readRecentLogs();
			expect(result).toContain("Today");
			expect(result).toContain("Fixed auth");
			expect(result).toContain("Recent Session Logs");
		});

		it("includes yesterday's log when available", () => {
			const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

			vi.mocked(existsSync).mockImplementation((p: any) => {
				return String(p).includes(yesterday);
			});
			vi.mocked(readFileSync).mockReturnValue("## 10:00 - project\n**Summary:** Started feature\n---");

			const result = readRecentLogs();
			expect(result).toContain("Yesterday");
			expect(result).toContain("Started feature");
		});

		it("ignores empty log files", () => {
			const today = new Date().toISOString().split("T")[0];

			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("   \n  ");

			expect(readRecentLogs()).toBe("");
		});
	});

	describe("extractCompactionContext", () => {
		it("extracts first user message as summary (string content)", () => {
			const messages = [
				{ role: "user", content: "Fix the authentication bug in login.ts" },
				{ role: "assistant", content: [{ type: "text", text: "Done." }] },
			];

			const result = extractCompactionContext(messages, null);
			expect(result.summaryText).toBe("Fix the authentication bug in login.ts");
		});

		it("extracts first user message as summary (array content)", () => {
			const messages = [
				{ role: "user", content: [{ type: "text", text: "Refactor the database layer" }] },
			];

			const result = extractCompactionContext(messages, null);
			expect(result.summaryText).toBe("Refactor the database layer");
		});

		it("truncates summary to 200 chars", () => {
			const longMessage = "A".repeat(300);
			const messages = [{ role: "user", content: longMessage }];

			const result = extractCompactionContext(messages, null);
			expect(result.summaryText).toHaveLength(200);
		});

		it("extracts last assistant message as continuation", () => {
			const messages = [
				{ role: "user", content: "Fix auth" },
				{ role: "assistant", content: [{ type: "text", text: "Started fixing auth." }] },
				{ role: "user", content: "Now add rate limiting" },
				{ role: "assistant", content: [{ type: "text", text: "Working on rate limiting now." }] },
			];

			const result = extractCompactionContext(messages, null);
			expect(result.continueText).toBe("Working on rate limiting now.");
		});

		it("truncates continuation to 300 chars", () => {
			const longText = "B".repeat(500);
			const messages = [
				{ role: "user", content: "task" },
				{ role: "assistant", content: [{ type: "text", text: longText }] },
			];

			const result = extractCompactionContext(messages, null);
			expect(result.continueText).toHaveLength(300);
		});

		it("uses previousSummary over assistant message when available", () => {
			const messages = [
				{ role: "user", content: "task" },
				{ role: "assistant", content: [{ type: "text", text: "Some work" }] },
			];

			const result = extractCompactionContext(messages, "Previously refactored auth module.");
			expect(result.continueText).toBe("Previously refactored auth module.");
		});

		it("returns defaults when no messages provided", () => {
			const result = extractCompactionContext([], null);
			expect(result.summaryText).toBe("Session compacted (auto)");
			expect(result.continueText).toBe("Continue working on the current task.");
		});

		it("skips non-user messages when finding summary", () => {
			const messages = [
				{ role: "assistant", content: [{ type: "text", text: "I started" }] },
				{ role: "user", content: "The actual task" },
			];

			const result = extractCompactionContext(messages, null);
			expect(result.summaryText).toBe("The actual task");
		});
	});

	describe("buildRestorationContent", () => {
		it("includes compaction notice when no session state", () => {
			const parts = buildRestorationContent(null);
			expect(parts).toHaveLength(1);
			expect(parts[0]).toContain("compacted to free up space");
		});

		it("includes continuation context from session state", () => {
			const parts = buildRestorationContent({
				continue: "Working on rate limiting",
				task: "Add rate limiting to API",
				files: ["src/rate-limiter.ts"],
			});

			expect(parts.join("\n")).toContain("Working on rate limiting");
			expect(parts.join("\n")).toContain("Add rate limiting to API");
			expect(parts.join("\n")).toContain("src/rate-limiter.ts");
		});

		it("omits missing fields gracefully", () => {
			const parts = buildRestorationContent({ $schema: "session-state-v2" });
			expect(parts).toHaveLength(1); // only the compaction notice
		});

		it("omits files section when files array is empty", () => {
			const parts = buildRestorationContent({ continue: "keep going", files: [] });
			const joined = parts.join("\n");
			expect(joined).toContain("keep going");
			expect(joined).not.toContain("Recently edited");
		});
	});

	describe("buildCycleMemoryInjection", () => {
		it("includes compaction summary", () => {
			const text = buildCycleMemoryInjection({
				compactionSummary: "Worked on auth module, added OAuth support.",
				sessionState: null,
				recentLogs: "",
			});

			expect(text).toContain("Session Memory Restored");
			expect(text).toContain("Compaction Summary");
			expect(text).toContain("Worked on auth module, added OAuth support.");
			expect(text).toContain("Continue where you left off");
		});

		it("includes session state when available", () => {
			const text = buildCycleMemoryInjection({
				compactionSummary: "Summary here",
				sessionState: {
					task: "Add OAuth",
					continue: "Working on Google provider",
					files: ["src/oauth.ts"],
					files_read: ["src/config.ts"],
				},
				recentLogs: "",
			});

			expect(text).toContain("Session State");
			expect(text).toContain("Add OAuth");
			expect(text).toContain("Working on Google provider");
			expect(text).toContain("src/oauth.ts");
			expect(text).toContain("src/config.ts");
		});

		it("includes recent logs when available", () => {
			const text = buildCycleMemoryInjection({
				compactionSummary: "Summary",
				sessionState: null,
				recentLogs: "## Recent Session Logs\n\n### Today\nFixed auth",
			});

			expect(text).toContain("Recent Session Logs");
			expect(text).toContain("Fixed auth");
		});

		it("omits session state section when null", () => {
			const text = buildCycleMemoryInjection({
				compactionSummary: "Summary",
				sessionState: null,
				recentLogs: "",
			});

			expect(text).not.toContain("Session State");
		});

		it("uses defaults for missing session state fields", () => {
			const text = buildCycleMemoryInjection({
				compactionSummary: "Summary",
				sessionState: {},
				recentLogs: "",
			});

			expect(text).toContain("Unknown"); // default task
			expect(text).toContain("Continue working"); // default continue
		});
	});
});
