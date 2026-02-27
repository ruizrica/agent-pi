// ABOUTME: Tests for toolkit-commands slash command registration.
// ABOUTME: Verifies subdirectory prefix logic and TOOL_MAP legacy entry resolution.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Helpers ─────────────────────────────────────────────────────────

function writeMdFile(dir: string, filename: string, frontmatter: Record<string, string>, body: string) {
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	const content = `---\n${lines.join("\n")}\n---\n${body}`;
	writeFileSync(join(dir, filename), content, "utf-8");
}

// ── Tests ───────────────────────────────────────────────────────────

describe("scanCommandDirs", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "toolkit-cmd-test-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should not prefix commands in the root dir", async () => {
		writeMdFile(tmpDir, "review.md", { description: "Run a code review" }, "Review body");

		const { scanCommandDirs } = await import("../toolkit-commands.ts");
		const cmds = scanCommandDirs(tmpDir);

		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("review");
	});

	it("should prefix commands in a subdirectory with the dir name", async () => {
		const subDir = join(tmpDir, "commander");
		mkdirSync(subDir);
		writeMdFile(subDir, "task.md", { description: "Plan and execute a task" }, "Task body");

		const { scanCommandDirs } = await import("../toolkit-commands.ts");
		const cmds = scanCommandDirs(tmpDir);

		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("commander-task");
	});

	it("should not prefix when frontmatter has an explicit name field", async () => {
		const subDir = join(tmpDir, "commander");
		mkdirSync(subDir);
		writeMdFile(subDir, "task.md", {
			description: "A custom command",
			name: "my-custom-name",
		}, "Body");

		const { scanCommandDirs } = await import("../toolkit-commands.ts");
		const cmds = scanCommandDirs(tmpDir);

		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("my-custom-name");
	});

	it("should handle nested subdirectories with joined prefix", async () => {
		const nested = join(tmpDir, "foo", "bar");
		mkdirSync(nested, { recursive: true });
		writeMdFile(nested, "baz.md", { description: "Nested cmd" }, "Nested body");

		const { scanCommandDirs } = await import("../toolkit-commands.ts");
		const cmds = scanCommandDirs(tmpDir);

		expect(cmds).toHaveLength(1);
		expect(cmds[0].name).toBe("foo-bar-baz");
	});
});

describe("mapTools — legacy commander entries", () => {
	it("should map pre-unification commander tool names to commander_task", async () => {
		const { mapTools } = await import("../toolkit-commands.ts");

		const legacyNames = [
			"mcp__commander__commander_task_lifecycle",
			"mcp__commander__commander_task_group",
			"mcp__commander__commander_comment",
			"mcp__commander__commander_log",
		];

		const result = mapTools(legacyNames);
		expect(result).toEqual(["commander_task"]);
	});

	it("should map SlashCommand to skill", async () => {
		const { mapTools } = await import("../toolkit-commands.ts");
		const result = mapTools(["SlashCommand"]);
		expect(result).toEqual(["skill"]);
	});
});
