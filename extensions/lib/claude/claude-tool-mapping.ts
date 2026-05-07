// ABOUTME: Maps Pi-style tool declarations to Claude Code CLI allowedTools values.
// ABOUTME: Keeps worker and advisor tool posture explicit and testable.

import type { ClaudeProfileName } from "./claude-config.ts";

const PI_TO_CLAUDE_TOOLS: Record<string, string[]> = {
	read: ["Read"],
	write: ["Write"],
	edit: ["Edit", "MultiEdit"],
	bash: ["Bash"],
	grep: ["Grep"],
	find: ["Glob"],
	ls: ["LS"],
};

const ADVISOR_SAFE_TOOLS = new Set(["Read", "Grep", "Glob", "LS", "Bash"]);

export function normalizePiToolList(tools: string | undefined | null): string[] {
	if (!tools) return [];
	return tools
		.split(",")
		.map((tool) => tool.trim().toLowerCase())
		.filter(Boolean);
}

export function mapPiToolsToClaudeTools(tools: string | undefined | null): string[] {
	const mapped: string[] = [];
	for (const tool of normalizePiToolList(tools)) {
		for (const claudeTool of PI_TO_CLAUDE_TOOLS[tool] || []) {
			if (!mapped.includes(claudeTool)) mapped.push(claudeTool);
		}
	}
	return mapped;
}

export function resolveClaudeAllowedTools(
	profile: ClaudeProfileName,
	tools: string | undefined | null,
	overrides?: string[],
): string[] {
	const base = overrides && overrides.length > 0
		? [...overrides]
		: mapPiToolsToClaudeTools(tools);

	if (base.length === 0) {
		return profile === "claude-advisor"
			? ["Read", "Grep", "Glob", "LS"]
			: ["Read", "Write", "Edit", "MultiEdit", "Bash", "Grep", "Glob", "LS"];
	}

	if (profile === "claude-advisor") {
		return base.filter((tool) => ADVISOR_SAFE_TOOLS.has(tool));
	}

	return base;
}
