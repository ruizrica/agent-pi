// ABOUTME: Pure helper that derives a real mission brief for a subagent batch.
// ABOUTME: Replaces the old hardcoded "Batch subagent group: <name>" placeholder
// ABOUTME: so the Commander dashboard surfaces meaningful content for the parent
// ABOUTME: initiative task created by the group:create flow.

/**
 * Build a mission brief for a subagent batch.
 *
 * Preference order for the headline:
 *   1. First agent's `summary`
 *   2. First agent's `task`
 *   3. Generic "parallel subagent batch" fallback
 *
 * The brief always carries the group name + a roster of agent role names so
 * the dashboard's MissionBriefModal can show who is on the run.
 */
export function buildSubagentBatchBrief(
	groupName: string,
	defs: ReadonlyArray<{ name?: string; summary?: string; task?: string }>,
): string {
	const trimGroup = String(groupName || "").trim();
	const headerName = trimGroup || `subagent-batch-${defs.length}`;
	const first = defs[0] || {};
	const firstSummary = String(first.summary || "").trim();
	const firstTask = String(first.task || "").trim();
	const headline = firstSummary || firstTask;
	const roleList = defs
		.map((d) => String(d.name || "").trim())
		.filter(Boolean)
		.slice(0, 8);
	const rosterPart = roleList.length > 0 ? ` Roles: ${roleList.join(", ")}.` : "";
	const sizePart = defs.length > 1 ? ` Coordinating ${defs.length} subagents in parallel.` : "";
	if (headline) {
		const trimmed = headline.length > 240 ? `${headline.slice(0, 237)}…` : headline;
		return `${headerName}: ${trimmed}${sizePart}${rosterPart}`.trim();
	}
	return `${headerName}: parallel subagent batch.${sizePart}${rosterPart}`.trim();
}
