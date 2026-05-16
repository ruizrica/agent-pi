// ABOUTME: Pure helpers for GOAL mode loop session markdown and paths.
// ABOUTME: Keeps objective-driven loop state in .context/goal-sessions without TUI side effects.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_GOAL_SESSION = "goal-loop";
const CURRENT_MARKER = ".current";

export interface GoalStartInput {
	goal: string;
	successCondition: string;
	successCriteria?: string[];
	constraints?: string[];
}

export interface GoalCompleteInput {
	goal: string;
	successCondition: string;
	summary?: string;
	evidence?: string[];
	nextSteps?: string[];
}

export function ensureDir(path: string): void {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function slugifyGoal(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60) || DEFAULT_GOAL_SESSION;
}

export function goalSessionsDir(cwd: string): string {
	return join(cwd, ".context", "goal-sessions");
}

export function currentGoalMarkerPath(cwd: string): string {
	return join(goalSessionsDir(cwd), CURRENT_MARKER);
}

export function setCurrentGoalSession(cwd: string, sessionName: string): void {
	const dir = goalSessionsDir(cwd);
	ensureDir(dir);
	writeFileSync(currentGoalMarkerPath(cwd), sessionName, "utf-8");
}

export function getCurrentGoalSession(cwd: string): string | undefined {
	const marker = currentGoalMarkerPath(cwd);
	if (!existsSync(marker)) return undefined;
	const value = readFileSync(marker, "utf-8").trim();
	return value || undefined;
}

export function resolveGoalSessionName(cwd: string, sessionName?: string, goal?: string): string {
	const explicit = sessionName?.trim();
	if (explicit) return slugifyGoal(explicit);
	if (goal?.trim()) return slugifyGoal(goal);
	return getCurrentGoalSession(cwd) || DEFAULT_GOAL_SESSION;
}

export function goalSessionPath(cwd: string, sessionName?: string, goal?: string): string {
	const dir = goalSessionsDir(cwd);
	ensureDir(dir);
	const base = resolveGoalSessionName(cwd, sessionName, goal);
	return join(dir, `${base}.md`);
}

export function bulletLines(items?: string[]): string {
	if (!items || items.length === 0) return "- None recorded";
	return items.map((item) => `- ${item}`).join("\n");
}

export function upsertGoalSection(markdown: string, title: string, content: string): string {
	const header = `## ${title}`;
	const pattern = new RegExp(`(^## ${title}\\n)([\\s\\S]*?)(?=\\n## [^\\n]+|$)`, "m");
	if (pattern.test(markdown)) {
		return markdown.replace(pattern, `${header}\n${content.trim()}\n`);
	}
	const trimmed = markdown.trimEnd();
	return `${trimmed}\n\n${header}\n${content.trim()}\n`;
}

export function goalInitialMarkdown(input: GoalStartInput): string {
	return `# GOAL Session\n\n## Goal\n${input.goal}\n\n## Success Condition\n${input.successCondition}\n\n## Success Criteria\n${bulletLines(input.successCriteria)}\n\n## Constraints\n${bulletLines(input.constraints)}\n\n## Current Progress\n- Session created\n\n## Evidence\n| Evidence | Source |\n|----------|--------|\n| Session initialized | tool: goal_loop_start |\n\n## Condition Status\n- Not met yet\n\n## Open Questions\n- None recorded\n\n## Risks\n- Unknown scope until the first loop slice\n\n## Last Slice\n- None yet\n\n## Next Slice\n- Choose the smallest useful action that moves the goal toward the success condition\n`;
}

export function appendGoalMetMarkdown(markdown: string, input: GoalCompleteInput): string {
	const content = [
		`- Completed at: ${new Date().toISOString()}`,
		`- Goal: ${input.goal}`,
		`- Success condition: ${input.successCondition}`,
		input.summary ? `- Summary: ${input.summary}` : undefined,
		"",
		"### Evidence",
		bulletLines(input.evidence),
		"",
		"### Next Steps",
		bulletLines(input.nextSteps),
	].filter((line) => line !== undefined).join("\n");
	let updated = upsertGoalSection(markdown, "Condition Status", "- Met");
	updated = upsertGoalSection(updated, "GOAL MET", content);
	return updated;
}
