// ABOUTME: Pure logic for Commander task tracker — retry queue and reconciliation.
// ABOUTME: No side effects — fully testable state management for failed op retries and unmapped task detection.

import { localToCommander, type LocalStatus } from "./commander-sync.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface RetryEntry {
	label: string;
	fn: (client: any) => Promise<void>;
	attempts: number;
}

export interface TrackerState {
	retries: RetryEntry[];
}

export interface CreateAction {
	type: "create";
	localId: number;
	text: string;
}

export interface StatusUpdateAction {
	type: "status-update";
	localId: number;
	commanderId: number;
	localStatus: string;
	commanderStatus: string;
}

export type ReconcileAction = CreateAction | StatusUpdateAction;

// ── Factory ──────────────────────────────────────────────────────────

export function createTrackerState(): TrackerState {
	return { retries: [] };
}

// ── Retry queue ──────────────────────────────────────────────────────

export function addRetry(
	state: TrackerState,
	label: string,
	fn: (client: any) => Promise<void>,
	maxRetries = 3,
): TrackerState {
	const existing = state.retries.find(r => r.label === label);
	if (existing) {
		const newAttempts = existing.attempts + 1;
		if (newAttempts >= maxRetries) {
			// Cap reached — drop the entry
			return { ...state, retries: state.retries.filter(r => r.label !== label) };
		}
		return {
			...state,
			retries: state.retries.map(r =>
				r.label === label ? { ...r, fn, attempts: newAttempts } : r,
			),
		};
	}
	return { ...state, retries: [...state.retries, { label, fn, attempts: 1 }] };
}

export function popRetries(state: TrackerState): { entries: RetryEntry[]; state: TrackerState } {
	return { entries: state.retries, state: { ...state, retries: [] } };
}

// ── Reconciliation ──────────────────────────────────────────────────

export function computeReconcileActions(
	localTasks: { id: number; text: string; status: string }[],
	mappings: { localId: number; commanderId: number; lastSyncedStatus?: LocalStatus }[],
): ReconcileAction[] {
	const mappingByLocalId = new Map(mappings.map(m => [m.localId, m]));
	const actions: ReconcileAction[] = [];

	for (const task of localTasks) {
		const mapping = mappingByLocalId.get(task.id);
		if (!mapping) {
			// Unmapped and not done → create in Commander
			if (task.status !== "done") {
				actions.push({ type: "create", localId: task.id, text: task.text });
			}
		} else {
			// Mapped → check for status drift
			const currentCommander = localToCommander(task.status as LocalStatus);
			const lastSyncedCommander = localToCommander(mapping.lastSyncedStatus ?? "idle");
			if (currentCommander !== lastSyncedCommander) {
				actions.push({
					type: "status-update",
					localId: task.id,
					commanderId: mapping.commanderId,
					localStatus: task.status,
					commanderStatus: currentCommander,
				});
			}
		}
	}

	return actions;
}

// ── Full-sync check ────────────────────────────────────────────────

export function isFullySynced(
	localTasks: { id: number; text: string; status: string }[],
	mappings: { localId: number; commanderId: number; lastSyncedStatus?: LocalStatus }[],
): boolean {
	return computeReconcileActions(localTasks, mappings).length === 0;
}
