import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("agents/models.json openai-codex overrides", () => {
	it("overrides gpt-5.4 contextWindow to 1,000,000", () => {
		const config = JSON.parse(readFileSync(new URL("../../agents/models.json", import.meta.url), "utf8"));
		expect(config.providers?.["openai-codex"]?.modelOverrides?.["gpt-5.4"]?.contextWindow).toBe(1000000);
	});
});
