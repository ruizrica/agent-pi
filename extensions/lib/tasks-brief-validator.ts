// ABOUTME: Pure validator for the mission brief (description) on `tasks new-list`.
// ABOUTME: Pi-side enforcement of CLAUDE.md's "--mission-brief 1-3 sentence what & why" contract.

export type BriefValidationResult =
	| { ok: true }
	| { ok: false; reason: string };

const MIN_BRIEF_CHARS = 60;

const CONTRACT_HINT =
	"Pass a 1-3 sentence mission brief explaining the what & why "
	+ "(see CLAUDE.md cmd section: `--mission-brief` is required for root tasks).";

/**
 * Validate a `tasks new-list --description` value. Pi-side gate that mirrors
 * cmd's root-task `--mission-brief` requirement so we never push a thin brief
 * (or no brief) to the Commander parent task.
 */
export function validateNewListBrief(description: string | undefined): BriefValidationResult {
	if (description === undefined) {
		return { ok: false, reason: `description is required. ${CONTRACT_HINT}` };
	}
	const trimmed = description.trim();
	if (trimmed.length === 0) {
		return { ok: false, reason: `description is required. ${CONTRACT_HINT}` };
	}
	if (trimmed.length < MIN_BRIEF_CHARS) {
		return {
			ok: false,
			reason: `description is too short (${trimmed.length} chars, need at least ${MIN_BRIEF_CHARS}). ${CONTRACT_HINT}`,
		};
	}
	return { ok: true };
}
