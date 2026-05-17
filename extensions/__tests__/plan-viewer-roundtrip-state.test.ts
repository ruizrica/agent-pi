// ABOUTME: Static regression coverage for live round-trip banner states in Plan Viewer.
// ABOUTME: Ensures Pacifico can piggyback queued/completed state on the existing plan UI.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "lib", "viewers", "plan-viewer-html.ts"), "utf8");

describe("plan viewer live round-trip state", () => {
	it("supports warning/queued and custom completion labels from updated-content", () => {
		expect(source).toContain("state.bannerTone === 'warning'");
		expect(source).toContain("state.bannerLabel");
		expect(source).toContain("state.badgeLabel");
		expect(source).toContain("state.locked");
		expect(source).toContain("startRoundTripPolling();");
	});
});
