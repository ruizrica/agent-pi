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
		expect(source).toContain('await launchFileInEditor({ editor: String(data.editor || ""), filePath: opts.filePath })');
	});

	it("uses the shared editor launcher", () => {
		expect(source).toContain('import { launchFileInEditor } from "./lib/editor-launcher.ts"');
		expect(source).not.toContain('spawn("open", ["-a"');
	});

	it("delegates shared HTTP boilerplate to launchViewer from viewer-framework", () => {
		expect(source).toContain("launchViewer({");
		expect(source).toContain("Uses the deep viewer framework module for server lifecycle, session, and browser wiring");
	});

	it("passes language metadata into generateFileViewerHTML", () => {
		expect(source).toContain("language: opts.language");
	});

	it("supports an approval mode in the tool schema and description", () => {
		expect(source).toContain('mode: Type.Optional(Type.String({ description: "Viewer mode: \'view\' (default) for simple viewing, or \'approve\' for approve/reject/cancel review flow" }))');
		expect(source).toContain("approval mode with approve/reject/cancel actions");
	});

	it("steers ordinary open-file requests to open_file", () => {
		expect(source).toContain("Open an explicit browser-based local file viewer/editor without Commander");
		expect(source).toContain("Use `open_file` for ordinary requests to open a file directly in Cursor");
	});

	it("returns explicit approval actions instead of only done", () => {
		expect(source).toContain('action: "done" | "approved" | "rejected" | "cancelled"');
		expect(source).toContain('data?.action === "approved" || data?.action === "rejected" || data?.action === "cancelled"');
	});

	it("emits a follow-up message when a file is approved", () => {
		expect(source).toContain('customType: "file-approved"');
		expect(source).toContain('content: `File approved!${result.modified ? " (file was edited)" : ""}`');
	});

	it("returns structured details with the final action", () => {
		expect(source).toContain("details: {");
		expect(source).toContain("action: result.action");
		expect(source).toContain("filePath: p.file_path");
	});
});
