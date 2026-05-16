import { describe, it, expect, beforeEach, vi } from "vitest";
import * as os from "node:os";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
}));

import {
	DEFAULT_DREAM_STATE,
	formatNextDream,
	formatTimeSince,
	getDreamRoot,
	getDreamStatePath,
	getHoursSinceLastDream,
} from "../lib/dream-state.ts";

describe("dream-state helpers", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("uses a global dream root under the home directory", () => {
		expect(getDreamRoot()).toBe(`${os.homedir()}/.pi/dream`);
		expect(getDreamStatePath()).toBe(`${os.homedir()}/.pi/dream/dream-state.json`);
	});

	it("returns null hours since last dream when none recorded", () => {
		expect(getHoursSinceLastDream(DEFAULT_DREAM_STATE)).toBeNull();
	});

	it("formats time since in minutes, hours, and days", () => {
		expect(formatTimeSince(0.5)).toContain("minute");
		expect(formatTimeSince(3)).toContain("hour");
		expect(formatTimeSince(50)).toContain("day");
	});

	it("formats next dream for missing and overdue states", () => {
		expect(formatNextDream(DEFAULT_DREAM_STATE)).toContain("No previous dream");
		const overdue = {
			...DEFAULT_DREAM_STATE,
			lastDream: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
			intervalHours: 24,
		};
		expect(formatNextDream(overdue)).toContain("Now");
	});
});
