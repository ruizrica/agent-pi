import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("viewer-framework module", () => {
	const source = readFileSync(new URL("../lib/viewer-framework.ts", import.meta.url), "utf8");

	it("exports the ViewerSpec interface with required fields", () => {
		expect(source).toContain("interface ViewerSpec");
		expect(source).toContain("kind:");
		expect(source).toContain("title:");
		expect(source).toContain("ctx:");
		expect(source).toContain("getHtml:");
	});

	it("exports the launchViewer function that wires server + session + browser", () => {
		expect(source).toContain("async function launchViewer(spec: ViewerSpec)");
		expect(source).toContain("createViewerServer(");
		expect(source).toContain("registerActiveViewer(session)");
		expect(source).toContain("openBrowser(url)");
		expect(source).toContain("notifyViewerOpen(spec.ctx, session)");
	});

	it("exports the launchOneShotViewer convenience wrapper", () => {
		expect(source).toContain("async function launchOneShotViewer");
	});

	it("returns a close function that cleans up server and session", () => {
		expect(source).toContain("clearActiveViewer(session)");
		expect(source).toContain("handle.server.close()");
	});

	it("re-exports viewer-server and viewer-session symbols for backward compatibility", () => {
		expect(source).toContain("export {");
		expect(source).toContain("createViewerServer");
		expect(source).toContain("registerActiveViewer");
		expect(source).toContain("closeActiveViewer");
		expect(source).toContain("VIEWER_SCROLLBAR_STYLES");
	});

	it("supports headless mode (no browser open)", () => {
		expect(source).toContain("headless?: boolean");
		expect(source).toContain("if (!spec.headless)");
	});

	it("supports custom routes, feedback, and round-trip state", () => {
		expect(source).toContain("routes?: ViewerRoute[]");
		expect(source).toContain("onFeedback?: (body: any)");
		expect(source).toContain("getRoundTripState?: () => ViewerRoundTripState");
	});
});
