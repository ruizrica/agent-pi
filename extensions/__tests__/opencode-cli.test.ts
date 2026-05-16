// ABOUTME: Tests OpenCode CLI worker argument construction.

import { describe, it, expect } from "vitest";
import { buildOpenCodeCliArgs } from "../lib/opencode-cli.ts";

describe("buildOpenCodeCliArgs", () => {
	it("uses run mode for non-interactive execution", () => {
		expect(buildOpenCodeCliArgs("analyze repo")).toEqual([
			"run",
			"analyze repo",
		]);
	});

	it("passes cwd through --dir when provided", () => {
		expect(buildOpenCodeCliArgs("analyze repo", "/tmp/project")).toEqual([
			"run",
			"--dir", "/tmp/project",
			"analyze repo",
		]);
	});
});
