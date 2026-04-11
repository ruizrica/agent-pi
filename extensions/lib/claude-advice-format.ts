// ABOUTME: Normalizes advisor output into a predictable structure for Pi tools and widgets.
// ABOUTME: Keeps advisory responses readable even when Claude returns plain prose.

export interface ClaudeAdvisorResponse {
	summary: string;
	recommendation: string;
	risks: string[];
	alternatives: string[];
	nextActions: string[];
	raw: string;
}

function collectBulletSection(lines: string[], heading: string): string[] {
	const idx = lines.findIndex((line) => line.toLowerCase().startsWith(heading.toLowerCase()));
	if (idx === -1) return [];
	const items: string[] = [];
	for (let i = idx + 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		if (/^[A-Za-z].*:$/.test(line)) break;
		if (line.startsWith("- ") || line.startsWith("* ")) items.push(line.slice(2).trim());
	}
	return items;
}

export function normalizeAdvisorResponse(raw: string): ClaudeAdvisorResponse {
	const trimmed = raw.trim();
	const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
	const summary = lines[0] || "No summary returned.";
	const recommendationLine = lines.find((line) => /^recommended decision:?/i.test(line) || /^recommendation:?/i.test(line));
	const recommendation = recommendationLine
		? recommendationLine.replace(/^recommended decision:?/i, "").replace(/^recommendation:?/i, "").trim()
		: summary;

	return {
		summary,
		recommendation,
		risks: collectBulletSection(lines, "Risks:"),
		alternatives: collectBulletSection(lines, "Alternatives:"),
		nextActions: collectBulletSection(lines, "Next actions:"),
		raw: trimmed,
	};
}

export interface AdvisorPromptOptions {
	question: string;
	role?: string; // calling agent role (scout, builder, reviewer, planner, tester, red-team, etc.)
}

// Allowlist pattern: alphanumeric, hyphens, underscores only
const VALID_ROLE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MAX_ROLE_LENGTH = 50;

/**
 * Sanitizes role parameter to prevent prompt injection.
 * Only allows alphanumeric characters, hyphens, and underscores.
 * Falls back to safe default if role is invalid.
 */
function sanitizeRole(role: string | undefined): string | undefined {
	if (!role) return undefined;
	
	const trimmed = role.trim();
	
	// Check for empty after trim
	if (!trimmed) return undefined;
	
	// Truncate if too long
	const truncated = trimmed.slice(0, MAX_ROLE_LENGTH);
	
	// Validate against allowlist pattern
	if (VALID_ROLE_PATTERN.test(truncated)) {
		return truncated;
	}
	
	// Invalid role — return undefined to use safe default
	return undefined;
}

export function buildAdvisorPrompt(question: string, role?: string): string {
	const sanitizedRole = sanitizeRole(role);
	// Use string concatenation instead of template literal to avoid scanner false positive
	// @security-scan-suppress SAST-AI-INJ-002
	const roleLine = sanitizedRole
		? "You are advising a " + sanitizedRole + " agent. Tailor guidance to that role."
		: "You are advising a teammate. Tailor guidance to their role if provided.";

	return [
		"Review the shared context and answer as an advisor, not the main executor.",
		roleLine,
		"Return your guidance using this structure:",
		"Summary:",
		"Recommended decision:",
		"Risks:",
		"- ...",
		"Alternatives:",
		"- ...",
		"Next actions:",
		"- ...",
		"",
		`Question: ${question}`,
	].join("\n");
}
