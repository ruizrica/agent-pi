import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("interfaze load demo script", () => {
	it("exists and references the expected CLI load check", () => {
		const path = "scripts/check-interfaze-provider-loaded.mjs";
		expect(existsSync(path)).toBe(true);

		const content = readFileSync(path, "utf8");
		expect(content).toContain("pi");
		expect(content).toContain("--list-models");
		expect(content).toContain("interfaze");
		expect(content).toContain("interfaze-beta");
		expect(content).toContain("demo-interfaze-provider.mjs");
		expect(content).not.toContain("sk-");
	});
});
