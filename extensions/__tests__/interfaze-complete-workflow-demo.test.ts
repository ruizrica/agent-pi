import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("interfaze complete workflow demo", () => {
	it("exists and references the complete workflow commands", () => {
		const scriptPath = "scripts/demo-interfaze-complete-workflow.mjs";
		expect(existsSync(scriptPath)).toBe(true);

		const script = readFileSync(scriptPath, "utf8");
		expect(script).toContain("scripts/check-interfaze-provider-loaded.mjs");
		expect(script).toContain("scripts/demo-interfaze-provider.mjs");
		expect(script).toContain("INTERFAZE_API_KEY");
		expect(script).toContain("interfaze-beta");
		expect(script).toContain("--live");

		const docPath = ".context/interfaze-complete-workflow-demo.md";
		expect(existsSync(docPath)).toBe(true);
		const doc = readFileSync(docPath, "utf8");
		expect(doc).toContain("Installation / Preparation");
		expect(doc).toContain("Provider-Loaded Check");
		expect(doc).toContain("Dry-Run Request Preview");
		expect(doc).toContain("Live Execution");
	});
});
