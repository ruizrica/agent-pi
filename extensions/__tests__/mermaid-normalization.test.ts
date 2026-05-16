import { describe, expect, it } from "vitest";
import { normalizeMermaidSource } from "../lib/mermaid-normalization.ts";

describe("normalizeMermaidSource", () => {
	it("adds the missing closing slash for malformed right-slanted node shorthand", () => {
		expect(normalizeMermaidSource("graph LR\nD --> E[/onboarding route]"))
			.toContain("E[/onboarding route/]");
	});

	it("leaves already-correct right-slanted shorthand unchanged", () => {
		const source = "graph LR\nD --> E[/onboarding route/]";
		expect(normalizeMermaidSource(source)).toBe(source);
	});

	it("leaves regular rectangular nodes unchanged", () => {
		const source = "graph LR\nA[StudioPage] --> B[StudioTabs]";
		expect(normalizeMermaidSource(source)).toBe(source);
	});
});
