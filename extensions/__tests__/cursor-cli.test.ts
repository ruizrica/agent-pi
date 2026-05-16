// ABOUTME: Tests Cursor CLI worker argument construction.

import { describe, it, expect } from "vitest";
import { buildCursorCliArgs } from "../lib/cursor-cli.ts";

describe("buildCursorCliArgs", () => {
	it("uses print mode with explicit text output", () => {
		expect(buildCursorCliArgs("analyze repo")).toEqual([
			"--print",
			"--output-format", "text",
			"analyze repo",
		]);
	});

	it("passes workspace when cwd is provided", () => {
		expect(buildCursorCliArgs("analyze repo", "/tmp/project")).toEqual([
			"--print",
			"--output-format", "text",
			"--workspace", "/tmp/project",
			"analyze repo",
		]);
	});
});
