import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("interfaze demo script", () => {
	it("exists and references the expected Interfaze configuration", () => {
		const path = "scripts/demo-interfaze-provider.mjs";
		expect(existsSync(path)).toBe(true);

		const content = readFileSync(path, "utf8");
		expect(content).toContain("INTERFAZE_API_KEY");
		expect(content).toContain("https://api.interfaze.ai/v1");
		expect(content).toContain("interfaze-beta");
		expect(content).toContain("--live");
		expect(content).not.toContain("sk-");
	});
});
