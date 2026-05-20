// ABOUTME: Conservative heuristic for whether `tasks new-list` looks like a
// ABOUTME: validation/test scaffold instead of real shipping work. Used to
// ABOUTME: surface a soft warning so agents pause before over-creating dummy
// ABOUTME: cards. Tuned via the 2026-05-19 audit (5 cards where 2 would do).

/**
 * Strong signals: a single match in the title or description is enough to
 * conclude the list is test/validation work. These are words that don't
 * legitimately appear in real shipping work descriptions.
 */
const STRONG_TEST_PATTERNS: readonly RegExp[] = [
	/\bdummy\b/i,
	/\bplaceholder\b/i,
	/\bharmless\b/i,
	/\bsmoke test\b/i,
	/\btest artifact\b/i,
	/\btest[- ]only\b/i,
	/\bauditable\b/i,
];

/**
 * Moderate signals: each individually appears in real work too, so we require
 * 2+ different patterns to match before concluding test-list. Each pattern
 * contributes at most 1 to the count regardless of how many times it appears.
 */
const MODERATE_TEST_PATTERNS: readonly RegExp[] = [
	/\bvalidat\w*\b/i,
	/\bverif\w+\b/i,
	/\bhierarchy\b/i,
	/\bexercise\b/i,
	/\bschema enforcement\b/i,
	/\bboard.{0,30}(test|display|behavior)\b/i,
];

/**
 * Returns true when the brief reads like a validation/test scaffold rather than
 * real shipping work. False-positive friendly by design — the consumer only
 * emits a soft warning, never blocks.
 */
export function looksLikeTestList(title: string | undefined, description: string | undefined): boolean {
	const text = `${title ?? ""}\n${description ?? ""}`;
	if (STRONG_TEST_PATTERNS.some((p) => p.test(text))) return true;
	const matchCount = MODERATE_TEST_PATTERNS.reduce(
		(n, p) => n + (p.test(text) ? 1 : 0),
		0,
	);
	return matchCount >= 2;
}
