// ABOUTME: Tests Codex CLI worker argument construction.

import { describe, it, expect } from "vitest";
import { buildCodexCliArgs } from "../lib/codex-cli.ts";

describe("buildCodexCliArgs", () => {
	it("uses exec mode with skip-git-repo-check", () => {
		expect(buildCodexCliArgs("analyze repo")).toEqual([
			"exec",
			"--skip-git-repo-check",
			"analyze repo",
		]);
	});

	it("passes cwd through --cd when provided", () => {
		expect(buildCodexCliArgs("analyze repo", "/tmp/project")).toEqual([
			"exec",
			"--skip-git-repo-check",
			"--cd", "/tmp/project",
			"analyze repo",
		]);
	});
});
