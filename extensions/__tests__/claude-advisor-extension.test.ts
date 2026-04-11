// ABOUTME: Smoke test for the Claude advisor extension module.

import { describe, expect, it } from "vitest";
import extension from "../claude-advisor.ts";

describe("claude-advisor extension", () => {
	it("exports an extension factory", () => {
		expect(typeof extension).toBe("function");
	});
});
