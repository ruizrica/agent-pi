// ABOUTME: Shared WARDEN task-confirmation prompt section for operational modes.
// ABOUTME: Teaches TillDone-style task discipline using the existing tasks tool without changing tasklist UI.

export interface WardenPromptOptions {
	/** Mode-specific bullets that preserve the mode's own guardrails. */
	guardrails?: string[];
	/** Optional phrase describing what a WARDEN task represents in this mode. */
	sliceName?: string;
}

function bullets(items: string[]): string {
	return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Build prompt guidance for the WARDEN task-confirmation loop.
 *
 * WARDEN is deliberately prompt-only: it uses the existing `tasks` tool and
 * must not rename or rebrand the tasklist UI.
 */
export function buildWardenTaskConfirmationSection(
	modeName: string,
	options: WardenPromptOptions = {},
): string {
	const sliceName = options.sliceName || "focused work slice";
	const guardrails = options.guardrails?.length
		? `\n### ${modeName} Guardrails\n${bullets(options.guardrails)}\n`
		: "";

	return `## WARDEN — Task Confirmation
WARDEN is the task-confirmation loop for ${modeName} mode. It does **not** rename the existing \`tasks\` tool or tasklist UI; it tells you how to use that existing tool with TillDone-style discipline.

### Loop Contract
- Before non-trivial work, define the work with \`tasks new-list\` or \`tasks add\`.
- Before a ${sliceName}, toggle exactly one relevant task to \`inprogress\` with \`tasks toggle\`.
- Work the active task as a focused slice, then mark it \`done\` or update the list if the scope changed.
- If tasks remain incomplete, continue with the next task, ask a precise question, or revise the task list instead of stopping silently.
- If the user's new request changes the theme of the current list, start a fresh list through the existing \`tasks\` workflow.${guardrails}`;
}
