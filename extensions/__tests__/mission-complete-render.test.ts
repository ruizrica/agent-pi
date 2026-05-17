// ABOUTME: Regression test for removal of the task completion summary renderer.
// ABOUTME: Ensures the former renderer stays as an inert compatibility stub.

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const rendererSource = readFileSync(join(__dirname, "..", "lib", "mission-complete-render.ts"), "utf-8");

describe("removed completion summary renderer", () => {
	it("does not export or render the old completion widget", () => {
		expect(rendererSource).not.toContain("renderMissionComplete");
		expect(rendererSource).not.toContain("MissionCompleteState");
		expect(rendererSource).not.toContain("MISSION_COMPLETE_BG");
		expect(rendererSource).toContain("export {};");
	});
});
