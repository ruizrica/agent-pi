import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("file-viewer implementation", () => {
	const source = readFileSync(new URL("../file-viewer.ts", import.meta.url), "utf8");

	it("supports markdown language detection", () => {
		expect(source).toContain('md: "markdown"');
		expect(source).toContain('mdx: "markdown"');
	});

	it("keeps the open-editor endpoint for menu-triggered launches", () => {
		expect(source).toContain('url.pathname === "/open-editor"');
		expect(source).toContain("launchEditor(String(data.editor || \"\"), opts.filePath)");
	});

	it("serves the shared logo asset route", () => {
		expect(source).toContain('url.pathname === "/logo.png"');
		expect(source).toContain('"assets", "agent-logo.png"');
	});

	it("passes language metadata into generateFileViewerHTML", () => {
		expect(source).toContain("language: opts.language");
	});
});
