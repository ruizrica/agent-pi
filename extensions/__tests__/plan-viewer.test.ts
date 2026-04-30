import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPlanTargetMode } from "../lib/plan-complexity.ts";

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

	it("can force the real show_plan tool through the local browser path", () => {
		expect(source).toContain("force_browser");
		expect(source).toContain("Bypass Commander and open the local browser viewer directly");
		expect(source).toContain("forceBrowser?: boolean");
		expect(source).toContain('purpose === "plan" && !options.forceBrowser');
		expect(source).toContain("{ forceBrowser: !!forceBrowser }");
	});

	it("supports sending plans back with requested changes and feedback", () => {
		expect(source).toContain('action: "approved" | "changes_requested" | "declined" | "submitted"');
		expect(source).toContain('if (result.action === "changes_requested")');
		expect(source).toContain('feedback: rawResult?.feedback');
		expect(source).toContain('feedback: feedbackText');
	});

	it("returns changes_requested through the main result path instead of a feedback side channel", () => {
		const htmlSource = readFileSync(new URL("../lib/plan-viewer-html.ts", import.meta.url), "utf8");
		expect(htmlSource).toContain("var endpoint = '/result';");
		expect(htmlSource).not.toContain("action === 'changes_requested') ? '/feedback' : '/result'");
		expect(source).toContain("show_plan call always unblocks");
		expect(source).not.toContain("waitForFeedback().then");
	});

	it("does not enqueue a duplicate plan-approved follow-up from the show_plan tool", () => {
		const toolSection = source.slice(
			source.indexOf("// ── show_plan tool"),
			source.indexOf("// ── /plan command"),
		);
		const commandSection = source.slice(source.indexOf("// ── /plan command"));

		expect(toolSection).toContain("the returned tool result is the continuation signal");
		expect(toolSection).toContain('text: `Plan approved by user.${modifiedNote} The updated plan has been saved to ${file_path}.`');
		expect(toolSection).not.toContain('customType: "plan-approved"');

		expect(commandSection).toContain('customType: "plan-approved"');
	});

	it("triggers auto mode switching on approval using plan-complexity module", () => {
		expect(source).toContain("getPlanTargetMode");
		expect(source).toContain("triggerApprovalModeSwitch");
		expect(source).toContain('result.action === "approved"');
	});

	it("calls global __piSetModeForApproval callback when approval happens", () => {
		expect(source).toContain("__piSetModeForApproval");
		expect(source).toContain("typeof setModeCallback === \"function\"");
	});

	it("notifies the user when mode switches on approval", () => {
		expect(source).toContain("ctx.ui.notify");
		expect(source).toContain("Mode switched to");
		expect(source).toContain("on plan approval");
	});

	it("never fails the tool due to mode switch errors", () => {
		expect(source).toContain("triggerApprovalModeSwitch");
		expect(source).toContain("try");
		expect(source).toContain("catch");
		expect(source).toContain("Never fail the tool because of an auto-mode switch");
	});
});
