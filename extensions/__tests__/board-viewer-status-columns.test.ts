// ABOUTME: Verifies the kanban board renders dedicated cancelled and needs_review lanes
// ABOUTME: instead of letting those statuses fall through to the Pending column.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HTML_MIRRORS = [
	join(__dirname, "..", "lib", "board-viewer-html.ts"),
	join(__dirname, "..", "lib", "viewers", "board-viewer-html.ts"),
];

describe("board-viewer-html status columns", () => {
	for (const mirror of HTML_MIRRORS) {
		const label = mirror.replace(/^.*\/lib\//, "lib/");

		it(`${label} buckets declaration includes cancelled and needs_review`, () => {
			const source = readFileSync(mirror, "utf-8");
			const bucketsMatch = source.match(/const buckets\s*=\s*\{[^}]+\}/);
			expect(bucketsMatch).not.toBeNull();
			const decl = bucketsMatch![0];
			expect(decl).toMatch(/cancelled/);
			expect(decl).toMatch(/needs_review/);
		});

		it(`${label} renders dedicated column markup for cancelled and needs_review`, () => {
			const source = readFileSync(mirror, "utf-8");
			expect(source).toMatch(/col-cancelled|column-cancelled|"cancelled"/);
			expect(source).toMatch(/col-needs[_-]review|column-needs[_-]review|"needs_review"/);
		});
	}
});
