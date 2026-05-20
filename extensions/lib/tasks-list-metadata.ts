// ABOUTME: Pure helper that computes the Commander parent-task update payload
// ABOUTME: when the user edits the local list's title and/or description via
// ABOUTME: `tasks update-list`. Returns null when nothing meaningful changed.

export interface ParentMetadataDiffArgs {
	currentTitle?: string;
	currentDescription?: string;
	newTitle?: string;
	newDescription?: string;
}

export interface ParentMetadataUpdate {
	title?: string;
	description?: string;
	mission_brief?: string;
}

/**
 * Diff the proposed list metadata against the current state and return only the
 * fields that actually changed. When the description changes, both `description`
 * and `mission_brief` are emitted so the parent's two fields stay aligned with
 * how they were paired at group:create time (commander-cli-client.ts:272-284).
 *
 * Returns null when no meaningful change is present — the caller can skip the
 * Commander round-trip entirely.
 */
export function buildParentMetadataUpdate(args: ParentMetadataDiffArgs): ParentMetadataUpdate | null {
	const update: ParentMetadataUpdate = {};
	const newTitle = args.newTitle?.trim();
	const newDescription = args.newDescription?.trim();

	if (newTitle !== undefined && newTitle !== (args.currentTitle ?? "").trim()) {
		update.title = newTitle;
	}
	if (newDescription !== undefined && newDescription !== (args.currentDescription ?? "").trim()) {
		update.description = newDescription;
		update.mission_brief = newDescription;
	}

	return Object.keys(update).length === 0 ? null : update;
}
