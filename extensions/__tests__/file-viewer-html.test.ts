import { describe, expect, it } from "vitest";
import { generateFileViewerHTML } from "../lib/file-viewer-html.ts";

describe("generateFileViewerHTML", () => {
	it("renders hamburger menu with editor actions", () => {
		const html = generateFileViewerHTML({
			title: "README.md",
			filePath: "/tmp/README.md",
			content: "# Hello\n\nWorld",
			port: 3210,
			editable: true,
			language: "markdown",
		});

		expect(html).toContain('id="menuBtn"');
		expect(html).toContain('id="editorMenu"');
		expect(html).toContain('data-editor="cursor"');
		expect(html).toContain('data-editor="windsurf"');
		expect(html).toContain('data-editor="vscode"');
		expect(html).toContain('id="menuToggleBtn"');
		expect(html).toContain('id="menuSaveBtn"');
		expect(html).toContain('id="menuDoneBtn"');
	});

	it("renders markdown controls and marked.js support for markdown files", () => {
		const html = generateFileViewerHTML({
			title: "README.md",
			filePath: "/tmp/README.md",
			content: "# Heading\n\n- [ ] task",
			port: 3210,
			editable: true,
			language: "markdown",
		});

		expect(html).toContain('id="markdownToggle"');
		expect(html).toContain('id="btnRendered"');
		expect(html).toContain('id="btnRaw"');
		expect(html).toContain('id="markdownRenderedWrap"');
		expect(html).toContain("marked.min.js");
		expect(html).toContain("var IS_MARKDOWN = true;");
		expect(html).toContain('<img src="/logo.png" alt="agent" class="header-logo">');
	});

	it("keeps non-markdown files on the code-view path", () => {
		const html = generateFileViewerHTML({
			title: "index.ts",
			filePath: "/tmp/index.ts",
			content: "export const hi = 1;",
			port: 3210,
			editable: false,
			language: "typescript",
		});

		expect(html).toContain("var IS_MARKDOWN = false;");
		expect(html).toContain('id="viewerWrap"');
		expect(html).toContain('id="codeBlock"');
		expect(html).toContain('id="markdownRenderedWrap"');
		expect(html).toContain('id="copyBtn" class="icon-btn secondary-muted"');
	});

	it("escapes embedded script terminators in content", () => {
		const html = generateFileViewerHTML({
			title: "README.md",
			filePath: "/tmp/README.md",
			content: "hello </script> world",
			port: 3210,
			editable: false,
			language: "markdown",
		});

		expect(html).toContain("<\\/script>");
	});
});
