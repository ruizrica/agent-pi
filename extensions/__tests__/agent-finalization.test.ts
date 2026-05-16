// ABOUTME: Tests shared agent finalization helpers.

import { describe, expect, it } from "vitest";
import { finalizeAgentOutput } from "../lib/orchestration/agent-finalization.ts";

describe("agent finalization", () => {
	it("maps successful real output to done", () => {
		const result = finalizeAgentOutput({ agentLabel: "Scout", result: "Done", exitCode: 0 });
		expect(result.status).toBe("done");
		expect(result.output).toBe("Done");
	});

	it("surfaces placeholder-only output as diagnostic", () => {
		const result = finalizeAgentOutput({ agentLabel: "Opus", result: "<Response>", exitCode: 0 });
		expect(result.output).toContain("without meaningful assistant output");
		expect(result.normalized.isEmpty).toBe(true);
	});

	it("maps nonzero exit to error", () => {
		const result = finalizeAgentOutput({ agentLabel: "Worker", result: "Failed", exitCode: 1 });
		expect(result.status).toBe("error");
	});
});
