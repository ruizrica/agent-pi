import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../spec-viewer.ts", import.meta.url), "utf-8");

describe("spec-viewer Commander approval flow", () => {
	it("uses openAndWaitInCommander for Commander-backed spec review", () => {
		expect(source).toContain("openAndWaitInCommander");
		expect(source).not.toContain("const result = await showReport({");
	});

	it("does not auto-approve when Commander merely opens the spec viewer", () => {
		expect(source).not.toContain("// For now, return approved since Commander will handle it");
		expect(source).not.toContain('action: "approved",\n\t\t\t\t\tcomments: existingComments');
		expect(source).toContain('action: result.action === "approved" ? "approved" : "declined"');
	});

	it("keeps browser fallback when Commander cannot provide a final action", () => {
		expect(source).toContain("Fall through to browser if Commander is unavailable, times out, or disconnects");
	});

	it("supports freeform requested changes in addition to inline comments", () => {
		expect(source).toContain("function formatRequestedChanges(commentSummary: string, feedback?: string)");
		expect(source).toContain('content: `Changes requested on the spec. Here are the requested updates:');
		expect(source).toContain('feedback: result.feedback');
	});
});
