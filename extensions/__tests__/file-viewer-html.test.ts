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

		expect(html).toContain('id="renderToggle"');
		expect(html).toContain('id="btnRendered"');
		expect(html).toContain('id="btnRaw" type="button">Source</button>');
		expect(html).toContain('id="markdownRenderedWrap"');
		expect(html).toContain("marked.min.js");
		expect(html).toContain("var IS_MARKDOWN = true;");
		expect(html).toContain("var IS_RENDERABLE = true;");
		expect(html).toContain("var renderView = IS_RENDERABLE ? 'rendered' : 'raw';");
		expect(html).toContain('<img src="/logo.png" alt="agent" class="header-logo">');
	});

	it("renders html files by default with a sandboxed preview and source toggle", () => {
		const html = generateFileViewerHTML({
			title: "index.html",
			filePath: "/tmp/index.html",
			content: "<h1>Hello</h1>",
			port: 3210,
			editable: false,
			language: "html",
		});

		expect(html).toContain("var IS_HTML = true;");
		expect(html).toContain("var IS_RENDERABLE = true;");
		expect(html).toContain("var renderView = IS_RENDERABLE ? 'rendered' : 'raw';");
		expect(html).toContain('id="renderToggle"');
		expect(html).toContain('id="btnRaw" type="button">Source</button>');
		expect(html).toContain('id="htmlRenderedWrap"');
		expect(html).toContain('id="htmlRenderedFrame"');
		expect(html).toContain('sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox"');
		expect(html).toContain("data-file-viewer-scrollbar");
		expect(html).toContain("scrollbar-color:var(--file-viewer-thumb) var(--file-viewer-bg)");
		expect(html).toContain("htmlRenderedFrame.srcdoc = currentContent.replace");
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
		expect(html).toContain("var IS_HTML = false;");
		expect(html).toContain("var IS_RENDERABLE = false;");
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
