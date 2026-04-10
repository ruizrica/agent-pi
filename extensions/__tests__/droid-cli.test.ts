// ABOUTME: Tests Droid CLI worker argument construction.

import { describe, it, expect } from "vitest";
import { buildDroidCliArgs } from "../lib/droid-cli.ts";

describe("buildDroidCliArgs", () => {
	it("uses exec mode with explicit text output and low autonomy", () => {
		expect(buildDroidCliArgs("analyze repo")).toEqual([
			"exec",
			"--output-format", "text",
			"--auto", "low",
			"analyze repo",
		]);
	});

	it("passes cwd through --cwd when provided", () => {
		expect(buildDroidCliArgs("analyze repo", "/tmp/project")).toEqual([
			"exec",
			"--output-format", "text",
			"--auto", "low",
			"--cwd", "/tmp/project",
			"analyze repo",
		]);
	});
});
