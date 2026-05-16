// ABOUTME: Tests Gemini CLI worker argument construction.

import { describe, it, expect } from "vitest";
import { buildGeminiCliArgs } from "../lib/gemini-cli.ts";

describe("buildGeminiCliArgs", () => {
	it("uses prompt mode with explicit text output", () => {
		expect(buildGeminiCliArgs("analyze repo")).toEqual([
			"-p", "analyze repo",
			"--output-format", "text",
		]);
	});
});
