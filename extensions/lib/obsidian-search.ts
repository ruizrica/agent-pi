// ABOUTME: Pure search helpers for Obsidian memory search ranking and formatting.
// ABOUTME: Normalizes natural-language queries, dedupes CLI rows, ranks files, and formats concise results.

export interface ParsedSearchMatch {
	file: string;
	line: number;
	text: string;
	duplicateCount?: number;
}

export interface RankedSearchLine extends ParsedSearchMatch {
	score: number;
	matchedTerms: string[];
	duplicateCount: number;
}

export interface RankedSearchFile {
	file: string;
	score: number;
	coverage: number;
	matchedTerms: string[];
	uniqueMatchCount: number;
	rawMatchCount: number;
	matches: RankedSearchLine[];
}

export interface SearchPathParams {
	path?: string;
	wiki?: string;
	scope?: string;
}

export interface RankSearchOptions {
	perFileLimit?: number;
}

export interface FormatSearchOptions {
	path?: string;
	limit?: number;
	perFileLimit?: number;
	fallbackUsed?: boolean;
	fallbackQueries?: string[];
	rawMatchCount?: number;
	uniqueMatchCount?: number;
}

const STOP_WORDS = new Set([
	"a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "has", "have", "how", "in",
	"is", "it", "of", "on", "or", "should", "that", "the", "this", "to", "was", "what", "when", "where",
	"which", "who", "why", "with",
]);

function cleanPathSegment(segment: string): string {
	return segment.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function sanitizeWikiTopic(topic: string): string {
	return topic
		.toLowerCase()
		.replace(/\.md$/, "")
		.replace(/[^a-z0-9\s_-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "") || "untitled";
}

export function normalizeSearchText(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[\u2010-\u2015]/g, "-")
		.toLowerCase()
		.replace(/[`~!@#$%^&*()+=[\]{};:'",.<>/?|\\]/g, " ")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function tokenizeSearchQuery(query: string): string[] {
	const normalized = normalizeSearchText(query);
	if (!normalized) return [];

	const rawTerms = normalized.split(" ").filter(Boolean);
	const significant = rawTerms.filter((term) => {
		if (term.length <= 1 && !/^\d+$/.test(term)) return false;
		return !STOP_WORDS.has(term);
	});

	const source = significant.length > 0 ? significant : rawTerms;
	return Array.from(new Set(source));
}

export function resolveSearchPath(params: SearchPathParams): string | undefined {
	const explicitPath = cleanPathSegment(params.path || "");
	if (explicitPath) {
		return explicitPath
			.split("/")
			.filter((part) => part && part !== "." && part !== "..")
			.join("/") || undefined;
	}

	const wiki = (params.wiki || "").trim();
	if (wiki) return `wiki/${sanitizeWikiTopic(wiki)}`;

	const scope = (params.scope || "").trim().toLowerCase();
	if (scope === "raw" || scope === "wiki") return scope;
	return undefined;
}

function normalizeSnippet(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function dedupeSearchMatches(matches: ParsedSearchMatch[]): ParsedSearchMatch[] {
	const byKey = new Map<string, ParsedSearchMatch>();

	for (const match of matches) {
		const file = match.file.trim();
		const text = normalizeSnippet(match.text);
		const key = `${file}\u0000${match.line}\u0000${text}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.duplicateCount = (existing.duplicateCount || 1) + (match.duplicateCount || 1);
			continue;
		}
		byKey.set(key, {
			file,
			line: match.line,
			text,
			duplicateCount: match.duplicateCount || 1,
		});
	}

	return Array.from(byKey.values());
}

function matchedTermsInText(text: string, terms: string[]): string[] {
	const normalized = normalizeSearchText(text);
	return terms.filter((term) => normalized.includes(term));
}

function scoreLine(match: ParsedSearchMatch, query: string, terms: string[]): RankedSearchLine {
	const lineText = normalizeSearchText(match.text);
	const phrase = normalizeSearchText(query);
	const matchedTerms = matchedTermsInText(match.text, terms);
	let score = 0;

	score += matchedTerms.length * 8;
	if (terms.length > 0) score += (matchedTerms.length / terms.length) * 12;
	if (phrase && phrase.includes(" ") && lineText.includes(phrase)) score += 30;
	if (/^\s*#/.test(match.text)) score += 6;
	if (/^\s*title\s*:/i.test(match.text)) score += 5;
	if ((match.duplicateCount || 1) > 1) score += Math.min((match.duplicateCount || 1) - 1, 5);

	return {
		...match,
		duplicateCount: match.duplicateCount || 1,
		matchedTerms,
		score,
	};
}

export function rankSearchMatches(matches: ParsedSearchMatch[], query: string, options: RankSearchOptions = {}): RankedSearchFile[] {
	const terms = tokenizeSearchQuery(query);
	const perFileLimit = Math.max(1, options.perFileLimit || 5);
	const byFile = new Map<string, ParsedSearchMatch[]>();

	for (const match of matches) {
		const existing = byFile.get(match.file) || [];
		existing.push(match);
		byFile.set(match.file, existing);
	}

	const ranked: RankedSearchFile[] = [];
	for (const [file, fileMatches] of byFile) {
		const fileTermHits = matchedTermsInText(file, terms);
		const lineScores = fileMatches
			.map((match) => scoreLine(match, query, terms))
			.sort((a, b) => b.score - a.score || a.line - b.line);

		const matchedTerms = Array.from(new Set([
			...fileTermHits,
			...lineScores.flatMap((line) => line.matchedTerms),
		]));
		const coverage = terms.length > 0 ? matchedTerms.length / terms.length : 0;
		const topLines = lineScores.slice(0, perFileLimit);
		const topLineScore = topLines.reduce((sum, line) => sum + line.score, 0);
		const rawMatchCount = fileMatches.reduce((sum, match) => sum + (match.duplicateCount || 1), 0);
		let score = topLineScore + coverage * 40 + fileTermHits.length * 6 + Math.min(fileMatches.length, 10);

		// Prevent broad one-term files from outranking focused multi-term files solely due to many generic hits.
		if (terms.length >= 3 && coverage < 0.34) score *= 0.6;

		ranked.push({
			file,
			score,
			coverage,
			matchedTerms,
			uniqueMatchCount: fileMatches.length,
			rawMatchCount,
			matches: topLines,
		});
	}

	return ranked.sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.file.localeCompare(b.file));
}

function formatScore(score: number): string {
	return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function formatRankedSearchResults(query: string, rankedFiles: RankedSearchFile[], options: FormatSearchOptions = {}): string {
	const limit = Math.max(1, options.limit || 20);
	const shown = rankedFiles.slice(0, limit);
	const pathLabel = options.path ? ` in ${options.path}` : "";
	const rawMatchCount = options.rawMatchCount ?? rankedFiles.reduce((sum, file) => sum + file.rawMatchCount, 0);
	const uniqueMatchCount = options.uniqueMatchCount ?? rankedFiles.reduce((sum, file) => sum + file.uniqueMatchCount, 0);

	if (shown.length === 0) {
		const lines = [`No results found for: "${query}"${pathLabel}.`];
		if (options.fallbackUsed) lines.push("Fallback token search was attempted but produced no matches.");
		return lines.join("\n");
	}

	const lines: string[] = [
		`Search results for "${query}"${pathLabel} (${shown.length}/${rankedFiles.length} files, ${uniqueMatchCount} unique matches, ${rawMatchCount} raw matches):`,
	];

	if (options.fallbackUsed) {
		const fallback = options.fallbackQueries?.length ? ` (${options.fallbackQueries.join(", ")})` : "";
		lines.push(`Fallback token search used${fallback}.`);
	}
	lines.push("");

	for (const file of shown) {
		const coverageCount = file.matchedTerms.length;
		const queryTerms = tokenizeSearchQuery(query).length;
		const termSummary = file.matchedTerms.length > 0 ? file.matchedTerms.join(", ") : "none";
		lines.push(`📄 ${file.file} — score ${formatScore(file.score)}; terms ${coverageCount}/${queryTerms}: ${termSummary}`);
		for (const match of file.matches) {
			lines.push(`  L${match.line}: ${match.text}`);
		}
		if (file.uniqueMatchCount > file.matches.length) {
			lines.push(`  ... and ${file.uniqueMatchCount - file.matches.length} more unique matches`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}
