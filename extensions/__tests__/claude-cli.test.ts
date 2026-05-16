// ABOUTME: Tests Claude CLI arg building and tool mapping for worker/advisor profiles.

import { describe, expect, it } from "vitest";
import { buildClaudeCliArgs, dedupePreserveOrder, isClaudeDisplayNoise } from "../lib/claude/claude-cli.ts";
import { mapPiToolsToClaudeTools, resolveClaudeAllowedTools } from "../lib/claude/claude-tool-mapping.ts";

describe("Claude tool mapping", () => {
	it("maps Pi tools to Claude tool names", () => {
		expect(mapPiToolsToClaudeTools("read,write,edit,bash,grep,find,ls"))
			.toEqual(["Read", "Write", "Edit", "MultiEdit", "Bash", "Grep", "Glob", "LS"]);
	});

	it("restricts advisor tools to read-oriented defaults", () => {
		expect(resolveClaudeAllowedTools("claude-advisor", "read,write,edit,bash,grep,find,ls"))
			.toEqual(["Read", "Bash", "Grep", "Glob", "LS"]);
	});
});

describe("Claude output normalization", () => {
	it("flags tool chatter and mailbox noise as hidden display lines", () => {
		expect(isClaudeDisplayNoise("[tool] mcp__commander__commander_mailbox")).toBe(true);
		expect(isClaudeDisplayNoise("[tool:mcp__commander__commander_mailbox] done")).toBe(true);
		expect(isClaudeDisplayNoise("hello from worker 1")).toBe(false);
	});

	it("dedupes consecutive visible output lines", () => {
		expect(dedupePreserveOrder([
			"hello from worker 1",
			"hello from worker 1",
			"hello from worker 2",
			"hello from worker 2",
		])).toEqual([
			"hello from worker 1",
			"hello from worker 2",
		]);
	});
});

describe("buildClaudeCliArgs", () => {
	it("builds worker args with model, tools, and no-session persistence", () => {
		const args = buildClaudeCliArgs({
			profile: "claude-worker",
			task: "Analyze the repo",
			cwd: "/tmp/project",
			model: "anthropic/claude-sonnet-4-6",
			tools: "read,write,edit,bash,grep,find,ls",
			systemPrompt: "You are a worker.",
			contextPacket: "## Working Context\nTask",
		});

		expect(args).toContain("-p");
		expect(args).toContain("--verbose");
		expect(args).toContain("--output-format");
		expect(args).toContain("stream-json");
		expect(args).toContain("--model");
		expect(args).toContain("claude-sonnet-4-6");
		expect(args).toContain("--allowedTools");
		expect(args).toContain("Read,Write,Edit,MultiEdit,Bash,Grep,Glob,LS");
		expect(args).toContain("--no-session-persistence");
	});

	it("builds advisor args with plan mode and read-only tool posture", () => {
		const args = buildClaudeCliArgs({
			profile: "claude-advisor",
			task: "Advise on architecture",
			cwd: "/tmp/project",
			model: "anthropic/claude-opus-4-6",
			tools: "read,write,edit,bash,grep,find,ls",
		});

		expect(args).toContain("--permission-mode");
		expect(args).toContain("plan");
		expect(args).toContain("claude-opus-4-6");
		expect(args).toContain("Read,Bash,Grep,Glob,LS");
	});

	it("handles tool deduplication with repeats", () => {
		const args = buildClaudeCliArgs({
			profile: "claude-worker",
			task: "Test dedup",
			tools: "read,bash,read,grep,bash",
		});

		const toolsIndex = args.indexOf("--allowedTools");
		const toolsValue = args[toolsIndex + 1];
		const toolsList = toolsValue.split(",");

		expect(args[args.length - 2]).toBe("--");
		expect(args[args.length - 1]).toContain("Test dedup");
		expect(toolsList).toEqual(["Read", "Bash", "Grep"]);
		expect(toolsList.filter((t) => t === "Read")).toHaveLength(1);
		expect(toolsList.filter((t) => t === "Bash")).toHaveLength(1);
	});

	it("omits model flag when no model provided", () => {
		const args = buildClaudeCliArgs({
			profile: "claude-worker",
			task: "Test no model",
		});

		const modelIndex = args.indexOf("--model");
		expect(modelIndex).toBe(-1);
		expect(args[args.length - 2]).toBe("--");
		expect(args[args.length - 1]).toContain("Test no model");
	});

	it("applies advisor profile tool filtering to mixed tool list", () => {
		const args = buildClaudeCliArgs({
			profile: "claude-advisor",
			task: "Test filtering",
			tools: "read,write,edit,bash,grep,find,ls",
		});

		const toolsIndex = args.indexOf("--allowedTools");
		const toolsValue = args[toolsIndex + 1];

		expect(toolsValue).not.toContain("Write");
		expect(toolsValue).not.toContain("Edit");
		expect(toolsValue).not.toContain("MultiEdit");
		expect(toolsValue).toContain("Read");
		expect(toolsValue).toContain("Bash");
		expect(toolsValue).toContain("Grep");
	});

	it("terminates variadic options before appending the prompt argument", () => {
		const args = buildClaudeCliArgs({
			profile: "claude-worker",
			task: "Prompt must not be consumed by --add-dir",
			cwd: "/tmp/project",
		});

		expect(args).toContain("--add-dir");
		expect(args[args.length - 2]).toBe("--");
		expect(args[args.length - 1]).toContain("Prompt must not be consumed by --add-dir");
	});
});
