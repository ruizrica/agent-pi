// ABOUTME: Tests for pure Obsidian memory search ranking helpers.
// ABOUTME: Covers Reco-shaped duplicate CLI output, path scoping, and concise formatting.

import { describe, expect, it } from "vitest";
import {
	dedupeSearchMatches,
	formatRankedSearchResults,
	rankSearchMatches,
	resolveSearchPath,
	tokenizeSearchQuery,
} from "../lib/obsidian-search.js";

const RECO_MATCHES = [
	{ file: "wiki/codebase-reco/Reco Critical Files.md", line: 8, text: "- Reco Strapi Front Door" },
	{ file: "wiki/codebase-reco/Reco Critical Files.md", line: 8, text: "- Reco Strapi Front Door" },
	{ file: "wiki/codebase-reco/Reco Critical Files.md", line: 8, text: "- Reco Strapi Front Door" },
	{ file: "wiki/codebase-reco/Reco Critical Files.md", line: 9, text: "- Reco Feed Service" },
	{ file: "wiki/codebase-reco/Reco Critical Files.md", line: 29, text: "- ★ `src/utils/feedServiceClient.js` — feed proxy (X-Internal-Secret)" },
	{ file: "wiki/codebase-reco/Reco Strapi Front Door.md", line: 14, text: "# Reco — Strapi Front Door (`reco-content-service-strapi`)" },
	{ file: "wiki/codebase-reco/Reco Strapi Front Door.md", line: 16, text: "Serves content-type REST routes directly AND proxies feed/social/search to [[Reco Feed Service]]." },
	{ file: "wiki/codebase-reco/Reco Strapi Front Door.md", line: 36, text: "`src/utils/` share one axios singleton and forwards X-User-Id to the feed-service." },
	{ file: "wiki/codebase-reco/Reco Feed Service.md", line: 14, text: "# Reco — Feed Service (`reco-feed-service`)" },
	{ file: "wiki/codebase-reco/Reco Feed Service.md", line: 16, text: "Internal TypeScript service runs personalized feed/search/social ranking strictly behind Strapi." },
	{ file: "wiki/codebase-reco/Reco Cross-Repo Wiring.md", line: 16, text: "## Hop 2 — Strapi → feed-service (proxied reads)" },
	{ file: "wiki/codebase-reco/Reco Cross-Repo Wiring.md", line: 18, text: "Caller feedServiceClient.js sends X-Internal-Secret to RECO_FEED_SERVICE_URL." },
	{ file: "wiki/codebase-reco/Reco Mobile App.md", line: 20, text: "React Native app has a feed tab." },
];

describe("obsidian-search helpers", () => {
	it("tokenizes natural-language queries while preserving significant Reco terms", () => {
		expect(tokenizeSearchQuery("Strapi front door proxy feed service")).toEqual([
			"strapi",
			"front",
			"door",
			"proxy",
			"feed",
			"service",
		]);
		expect(tokenizeSearchQuery("feed-service feedServiceClient")).toEqual(["feed", "service", "client"]);
	});

	it("resolves explicit path before wiki and scope", () => {
		expect(resolveSearchPath({ path: "wiki/codebase-reco", wiki: "other", scope: "raw" })).toBe("wiki/codebase-reco");
		expect(resolveSearchPath({ wiki: "Codebase Reco" })).toBe("wiki/codebase-reco");
		expect(resolveSearchPath({ scope: "wiki" })).toBe("wiki");
		expect(resolveSearchPath({ scope: "all" })).toBeUndefined();
	});

	it("dedupes repeated CLI rows and tracks duplicate counts", () => {
		const deduped = dedupeSearchMatches(RECO_MATCHES);
		expect(deduped).toHaveLength(RECO_MATCHES.length - 2);
		expect(deduped[0]).toMatchObject({
			file: "wiki/codebase-reco/Reco Critical Files.md",
			line: 8,
			duplicateCount: 3,
		});
	});

	it("ranks focused multi-term Reco files above generic one-term matches", () => {
		const ranked = rankSearchMatches(
			dedupeSearchMatches(RECO_MATCHES),
			"Strapi front door proxy feed service",
		);

		expect(ranked[0].file).toBe("wiki/codebase-reco/Reco Strapi Front Door.md");
		expect(ranked[0].matchedTerms).toEqual(expect.arrayContaining(["strapi", "front", "door", "feed", "service"]));
		expect(ranked.find((file) => file.file.endsWith("Reco Mobile App.md"))?.coverage).toBeLessThan(ranked[0].coverage);
	});

	it("formats limited ranked results without duplicate snippets", () => {
		const ranked = rankSearchMatches(dedupeSearchMatches(RECO_MATCHES), "proxy feed", { perFileLimit: 2 });
		const output = formatRankedSearchResults("proxy feed", ranked, {
			path: "wiki/codebase-reco",
			limit: 3,
			rawMatchCount: RECO_MATCHES.length,
			uniqueMatchCount: dedupeSearchMatches(RECO_MATCHES).length,
		});

		expect(output.match(/^📄 /gm)).toHaveLength(3);
		expect(output).toContain("Search results for \"proxy feed\" in wiki/codebase-reco");
		expect(output.match(/L29: - ★ `src\/utils\/feedServiceClient\.js` — feed proxy/g) || []).toHaveLength(1);
	});

	it("reports fallback diagnostics when requested", () => {
		const ranked = rankSearchMatches(dedupeSearchMatches(RECO_MATCHES), "\"Strapi front door proxy feed service\"");
		const output = formatRankedSearchResults("\"Strapi front door proxy feed service\"", ranked, {
			path: "wiki/codebase-reco",
			limit: 2,
			fallbackUsed: true,
			fallbackQueries: ["strapi", "front", "door", "proxy", "feed", "service"],
		});
		expect(output).toContain("Fallback token search used (strapi, front, door, proxy, feed, service).");
	});
});
