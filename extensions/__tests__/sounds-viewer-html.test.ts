import { describe, expect, it } from "vitest";
import { generateSoundsViewerHTML } from "../lib/sounds-viewer-html.ts";

describe("sounds viewer html", () => {
	it("renders cached image urls when provided", () => {
		const html = generateSoundsViewerHTML({
			catalog: [{
				name: "click-8bit",
				title: "Click 8-Bit",
				description: "Retro click",
				categories: ["click"],
				cachedImageUrl: "/api/image/abc123",
				meta: {},
			}],
			config: { assignments: {}, volume: 0.5, enabled: true, customSounds: [] },
			port: 3210,
		});

		expect(html).toContain("/api/image/abc123");
		expect(html).toContain("card-image");
		expect(html).toContain("/api/image-by-sound/");
	});

	it("renders fallback markup when no image urls are present", () => {
		const html = generateSoundsViewerHTML({
			catalog: [{
				name: "click-soft",
				title: "Click Soft",
				description: "Soft click",
				categories: ["click"],
				meta: {},
			}],
			config: { assignments: {}, volume: 0.5, enabled: true, customSounds: [] },
			port: 3210,
		});

		expect(html).toContain("card-image-fallback");
	});
});
