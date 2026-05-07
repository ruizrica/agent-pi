// ABOUTME: Tests final agent output normalization for CLI/widget rendering.

import { describe, expect, it } from "vitest";
import { meaningfulAgentText, normalizeAgentFinalOutput } from "../lib/agent-output.ts";

describe("agent output normalization", () => {
	it("treats a bare Response wrapper as empty placeholder output", () => {
		const result = normalizeAgentFinalOutput({ result: "<Response>", source: "claude" });
		expect(result.isEmpty).toBe(true);
		expect(result.displayText).toContain("without meaningful assistant output");
	});

	it("filters hook-only JSON from meaningful text", () => {
		const hook = JSON.stringify({ type: "system", subtype: "hook_started", hook_event: "SessionStart" });
		expect(meaningfulAgentText(hook)).toBe("");
	});

	it("extracts assistant text from JSON assistant events", () => {
		const event = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Real answer" }] } });
		expect(meaningfulAgentText(event)).toBe("Real answer");
	});

	it("preserves real plain text", () => {
		const result = normalizeAgentFinalOutput({ result: "Here is the answer.", source: "worker" });
		expect(result.isEmpty).toBe(false);
		expect(result.displayText).toBe("Here is the answer.");
		expect(result.status).toBe("ok");
	});
});
