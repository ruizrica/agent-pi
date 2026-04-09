import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("file-viewer implementation", () => {
	const source = readFileSync(new URL("../file-viewer.ts", import.meta.url), "utf8");

	it("supports markdown language detection", () => {
		expect(source).toContain('md: "markdown"');
		expect(source).toContain('mdx: "markdown"');
	});

	it("keeps the open-editor endpoint for menu-triggered launches", () => {
		expect(source).toContain('path: "/open-editor"');
		expect(source).toContain("launchEditor(String(data.editor || \"\"), opts.filePath)");
	});

	it("delegates shared HTTP boilerplate to createViewerServer", () => {
		expect(source).toContain("createViewerServer({");
		expect(source).toContain("Uses shared viewer server factory for HTTP server boilerplate");
	});

	it("passes language metadata into generateFileViewerHTML", () => {
		expect(source).toContain("language: opts.language");
	});
});
