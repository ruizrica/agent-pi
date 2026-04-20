import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("plan-viewer implementation", () => {
	const source = readFileSync(new URL("../plan-viewer.ts", import.meta.url), "utf8");

	it("waits for real Commander actions instead of auto-approving", () => {
		expect(source).toContain("openAndWaitInCommander(");
		expect(source).not.toContain('action: "approved", // Default to approved since Commander will handle it');
		expect(source).not.toContain("showReport({");
	});

	it("keeps the local browser viewer flow for fallback and questions mode", () => {
		expect(source).toContain("createViewerServer({");
		expect(source).toContain("Promise.race([waitForResult(), abortPromise])");
		expect(source).toContain('purpose === "questions"');
	});

	it("supports sending plans back with requested changes and feedback", () => {
		expect(source).toContain('action: "approved" | "changes_requested" | "declined" | "submitted"');
		expect(source).toContain('customType: "plan-changes-requested"');
		expect(source).toContain('feedback: rawResult?.feedback');
	});
});
