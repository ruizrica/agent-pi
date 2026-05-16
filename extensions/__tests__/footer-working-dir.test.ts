// ABOUTME: Regression test for the footer extension working-directory segment.
// ABOUTME: f61a0e1 removed the dir from leftContent while removing the git header; this guards the restored binding.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SOURCE = readFileSync(resolve(__dirname, "../footer.ts"), "utf-8");

describe("footer: working directory in left content", () => {
	it("computes a short working-dir string from ctx.cwd", () => {
		expect(SOURCE).toMatch(/shortDir\(\s*ctx\.cwd\s*\)/);
	});

	it("includes dir in the leftContent rendered to the footer", () => {
		const match = SOURCE.match(/const\s+leftContent\s*=\s*([^;]+);/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/\bdir\b/);
	});

	it("ABOUTME still describes the working directory", () => {
		const first200 = SOURCE.slice(0, 200);
		expect(first200).toMatch(/working directory/i);
	});
});
