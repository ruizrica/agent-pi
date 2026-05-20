// ABOUTME: Pure sync functions for mapping between local task states and Commander task states.
// ABOUTME: No side effects — fully testable state mapping, ID parsing, and type definitions.

// ── Types ────────────────────────────────────────────────────────────

export type LocalStatus = "idle" | "inprogress" | "done";
export type CommanderStatus = "pending" | "working" | "completed" | "failed" | "cancelled";

export interface CommanderTaskMapping {
	localId: number;
	commanderId: number;
	lastSyncedStatus?: LocalStatus;
}

export interface PendingCommanderCreate {
	localId: number;
	text: string;
	desiredStatus: LocalStatus;
	requestedAt: number;
	mode: "group" | "single";
}

export interface SyncState {
	available: boolean;
	groupId: number | undefined;
	groupCreationInFlight: boolean;
	mappings: CommanderTaskMapping[];
	pendingCreates?: PendingCommanderCreate[];
	parentClosedAt?: number;
}

// ── State mapping ────────────────────────────────────────────────────

const LOCAL_TO_COMMANDER: Record<LocalStatus, CommanderStatus> = {
	idle: "pending",
	inprogress: "working",
	done: "completed",
};

const COMMANDER_TO_LOCAL: Record<string, LocalStatus> = {
	pending: "idle",
	working: "inprogress",
	completed: "done",
	cancelled: "done",
	failed: "done",
};

export function localToCommander(status: LocalStatus): CommanderStatus {
	return LOCAL_TO_COMMANDER[status];
}

export function commanderToLocal(status: string): LocalStatus {
	return COMMANDER_TO_LOCAL[status] ?? "idle";
}

// ── ID parsing ───────────────────────────────────────────────────────

function extractJsonField(result: any, field: string): number | undefined {
	const content = result?.content;
	if (!Array.isArray(content) || content.length === 0) return undefined;

	const text = content[0]?.text;
	if (typeof text !== "string") return undefined;

	try {
		const parsed = JSON.parse(text);
		const value = parsed[field];
		if (value === undefined || value === null) return undefined;
		const num = Number(value);
		return Number.isFinite(num) ? num : undefined;
	} catch {
		return undefined;
	}
}

export function parseCommanderTaskId(result: any): number | undefined {
	return extractJsonField(result, "task_id") ?? extractJsonField(result, "id");
}

export function parseGroupId(result: any): number | undefined {
	return extractJsonField(result, "group_id") ?? extractJsonField(result, "id");
}

// ── SyncState helpers ───────────────────────────────────────────────

export function emptySyncState(): SyncState {
	return { available: false, groupId: undefined, groupCreationInFlight: false, mappings: [], pendingCreates: [] };
}

export function lookupMapping(state: SyncState, localId: number): number | undefined {
	return state.mappings.find(m => m.localId === localId)?.commanderId;
}

export function addMapping(state: SyncState, localId: number, commanderId: number): SyncState {
	return {
		...state,
		mappings: [...state.mappings, { localId, commanderId }],
		pendingCreates: (state.pendingCreates || []).filter(p => p.localId !== localId),
	};
}

export function removeMapping(state: SyncState, localId: number): SyncState {
	return {
		...state,
		mappings: state.mappings.filter(m => m.localId !== localId),
	};
}

export function clearMappings(state: SyncState): SyncState {
	return { ...state, mappings: [], pendingCreates: [], groupId: undefined, groupCreationInFlight: false };
}

export function updateMappingStatus(state: SyncState, localId: number, status: LocalStatus): SyncState {
	return {
		...state,
		mappings: state.mappings.map(m =>
			m.localId === localId ? { ...m, lastSyncedStatus: status } : m,
		),
		pendingCreates: (state.pendingCreates || []).map(p =>
			p.localId === localId ? { ...p, desiredStatus: status } : p,
		),
	};
}

export function addPendingCreate(
	state: SyncState,
	task: { id: number; text: string; status: LocalStatus },
	mode: "group" | "single",
	now = Date.now(),
): SyncState {
	if (lookupMapping(state, task.id) !== undefined) return state;
	const pending = state.pendingCreates || [];
	const entry: PendingCommanderCreate = {
		localId: task.id,
		text: task.text,
		desiredStatus: task.status,
		requestedAt: now,
		mode,
	};
	return {
		...state,
		pendingCreates: pending.some(p => p.localId === task.id)
			? pending.map(p => p.localId === task.id ? { ...p, text: task.text, desiredStatus: task.status, mode } : p)
			: [...pending, entry],
	};
}

export function addPendingCreates(
	state: SyncState,
	tasks: { id: number; text: string; status: LocalStatus }[],
	mode: "group" | "single",
	now = Date.now(),
): SyncState {
	return tasks.reduce((next, task) => addPendingCreate(next, task, mode, now), state);
}

export function removePendingCreate(state: SyncState, localId: number): SyncState {
	return {
		...state,
		pendingCreates: (state.pendingCreates || []).filter(p => p.localId !== localId),
	};
}

export function pendingCreateLocalIds(state: SyncState): number[] {
	return (state.pendingCreates || []).map(p => p.localId);
}

/**
 * Apply the result of a single `commander_task create` call. When the response
 * carries a parseable task_id, register the local→cmd mapping. When it does
 * not (malformed JSON, missing field, unexpected shape), queue the local task
 * in pendingCreates so reconciliation can retry the create — the local task
 * is never silently orphaned.
 *
 * If the local task is already mapped, returns state unchanged.
 */
export function handleTaskCreateResponse(
	state: SyncState,
	localId: number,
	text: string,
	result: any,
	desiredStatus: LocalStatus = "idle",
): SyncState {
	if (lookupMapping(state, localId) !== undefined) return state;
	const cid = parseCommanderTaskId(result);
	if (cid !== undefined) {
		const next = addMapping(state, localId, cid);
		return updateMappingStatus(next, localId, desiredStatus);
	}
	return addPendingCreate(state, { id: localId, text, status: desiredStatus }, "single");
}

/**
 * Classify the Commander-sync state for a single local task ID, used by the
 * tasks tool toggle message. Distinguishes a missing mapping (unexpected drop —
 * the agent or user should know something went wrong) from a pending create
 * (sync is still in flight after a recent new-list/add), so the toggle output
 * doesn't read as "broken" during the normal async window.
 */
export function describeToggleCommanderState(
	state: SyncState,
	localId: number,
):
	| { kind: "mapped"; commanderId: number }
	| { kind: "pending" }
	| { kind: "missing" } {
	const cid = lookupMapping(state, localId);
	if (cid !== undefined) return { kind: "mapped", commanderId: cid };
	const pending = (state.pendingCreates || []).some(p => p.localId === localId);
	if (pending) return { kind: "pending" };
	return { kind: "missing" };
}

export function unresolvedCommanderLocalIds(
	localTasks: { id: number; status: string }[],
	state: SyncState,
): number[] {
	const byLocalId = new Map(state.mappings.map(m => [m.localId, m]));
	const pendingIds = new Set(pendingCreateLocalIds(state));
	const unresolved = new Set<number>();
	for (const task of localTasks) {
		const mapping = byLocalId.get(task.id);
		if (!mapping && pendingIds.has(task.id)) unresolved.add(task.id);
		if (mapping && localToCommander(task.status as LocalStatus) !== localToCommander(mapping.lastSyncedStatus ?? "idle")) unresolved.add(task.id);
	}
	return [...unresolved].sort((a, b) => a - b);
}

// ── Idempotency guards ──────────────────────────────────────────────

export function shouldCreateGroup(state: SyncState): boolean {
	return state.groupId === undefined && !state.groupCreationInFlight;
}

// ── Group creation helpers ──────────────────────────────────────────

export function markGroupCreationInFlight(state: SyncState): SyncState {
	return { ...state, groupCreationInFlight: true };
}

export interface GroupCreateResult {
	groupId: number;
	taskIds: number[];
}

export function parseGroupCreateResult(result: any): GroupCreateResult | undefined {
	const content = result?.content;
	if (!Array.isArray(content) || content.length === 0) return undefined;

	const text = content[0]?.text;
	if (typeof text !== "string") return undefined;

	try {
		const parsed = JSON.parse(text);
		const groupId = Number(parsed.group_id);
		if (!Number.isFinite(groupId)) return undefined;

		const taskIds = parsed.task_ids;
		if (!Array.isArray(taskIds)) return undefined;

		return { groupId, taskIds: taskIds.map(Number) };
	} catch {
		return undefined;
	}
}

export function buildGroupCreatePayload(
	groupName: string,
	description: string,
	taskTexts: string[],
	workingDir: string,
	labels?: string[],
) {
	const hasLabels = labels !== undefined && labels.length > 0;
	return {
		operation: "group:create" as const,
		group_name: groupName,
		initiative_summary: description || groupName,
		total_waves: 1,
		working_directory: workingDir,
		...(hasLabels ? { labels } : {}),
		tasks: taskTexts.map((text) => ({
			description: text,
			task_prompt: text,
			context: "",
			dependency_order: 0,
			...(hasLabels ? { labels } : {}),
		})),
	};
}

export function applyGroupCreateResult(
	state: SyncState,
	localIds: number[],
	result: GroupCreateResult,
): SyncState {
	const len = Math.min(localIds.length, result.taskIds.length);
	const pendingByLocalId = new Map((state.pendingCreates || []).map(p => [p.localId, p]));
	const newMappings = Array.from({ length: len }, (_, i) => {
		const localId = localIds[i];
		const pending = pendingByLocalId.get(localId);
		// CORRECTION: cmd's `task add` always creates with status "pending" (local
		// equivalent: "idle"), independent of what pending.desiredStatus says. The
		// prior code optimistically wrote desiredStatus here, which is a LIE — it
		// claims we synced the user's latest toggle when in fact we only synced
		// "pending". Downstream drift detection then saw lastSyncedStatus === task.status
		// and never fired the actual catch-up update. Always recording "idle" (the
		// true sync state) restores Fix 1 / reconciler drift detection.
		return {
			localId,
			commanderId: result.taskIds[i],
			...(pending ? { lastSyncedStatus: "idle" as LocalStatus } : {}),
		};
	});
	const mappedLocalIds = new Set(newMappings.map(m => m.localId));
	return {
		...state,
		groupId: result.groupId,
		groupCreationInFlight: false,
		mappings: [...state.mappings, ...newMappings],
		pendingCreates: (state.pendingCreates || []).filter(p => !mappedLocalIds.has(p.localId)),
	};
}

export function markGroupCreateSettled(state: SyncState): SyncState {
	return { ...state, groupCreationInFlight: false };
}

export function isExternalSyncActive(): boolean {
	return (globalThis as any).__piCommanderPlanGroupId !== undefined;
}

// ── Group:create orchestration ───────────────────────────────────────

// Phase 3.0.1 diagnostic: append-to-file logger so runtime diagnostics are
// inspectable even when stderr is redirected by the Pi TUI. Disable by deleting
// the file path; the helper no-ops on any fs error.
function debugLog(line: string): void {
	try {
		// Lazy require to avoid pulling node:fs into pure tests.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { appendFileSync } = require("node:fs");
		const ts = new Date().toISOString();
		appendFileSync(".commander/logs/pi-sync-debug.log", `${ts} ${line}\n`);
	} catch {
		// best-effort logging; never throw from the diagnostic itself
	}
}

export interface ExecuteGroupCreateOptions {
	client: { callTool: (name: string, params: any, timeoutMs?: number) => Promise<any> };
	payload: unknown;
	localIds: number[];
	getState: () => SyncState;
	onResolved: (next: SyncState) => void;
	onSuccess?: () => void;
	// Fix 1: catch up local status drift. group:create takes ~8s emulating N+1
	// subprocess calls; the user often toggles tasks during the in-flight window.
	// If provided, executeGroupCreate compares each newly mapped task's local
	// status against its lastSyncedStatus (the desiredStatus snapshot from
	// addPendingCreates time) and fires status-update calls for drifted entries
	// — eliminating the "Commander sync pending forever" symptom for the
	// race-condition path. Each catch-up update is fire-and-forget; the 15s
	// reconciler tick recovers any that fail.
	getCurrentStatuses?: () => Map<number, LocalStatus>;
}

// Drives one Commander group:create round-trip. Reads getState() AFTER the
// callTool await so concurrent state mutations during the in-flight subprocess
// are observed — preserves the closure-read semantics of the original lambdas.
export async function executeGroupCreate(opts: ExecuteGroupCreateOptions): Promise<void> {
	const { client, payload, localIds, getState, onResolved, onSuccess, getCurrentStatuses } = opts;
	debugLog(`executeGroupCreate ENTER localIds=[${localIds.join(",")}]`);
	try {
		const res = await client.callTool("commander_task", payload, 30_000);
		const parsed = parseGroupCreateResult(res);
		const current = getState();
		if (parsed) {
			debugLog(`executeGroupCreate SUCCESS groupId=${parsed.groupId} taskIds=[${parsed.taskIds.join(",")}] localIds=[${localIds.join(",")}]`);
			const nextState = applyGroupCreateResult(current, localIds, parsed);
			onResolved(nextState);
			onSuccess?.();
			// Fix 1: catch up status drift accumulated during the in-flight window.
			// Without this, the user toggling during group:create's ~8s wait would
			// see "Commander sync pending forever" because lookupMapping returned
			// undefined when the toggle path ran, and no later code updates the
			// child task's status until the 15s reconciler tick.
			if (getCurrentStatuses) {
				const statuses = getCurrentStatuses();
				const freshLocalIds = new Set(localIds);
				const drifted = nextState.mappings.filter((m) => {
					if (!freshLocalIds.has(m.localId)) return false;
					const current = statuses.get(m.localId);
					return current !== undefined && current !== m.lastSyncedStatus;
				});
				for (const mapping of drifted) {
					const status = statuses.get(mapping.localId)!;
					debugLog(`executeGroupCreate CATCH_UP localId=${mapping.localId} commanderId=${mapping.commanderId} status=${status}`);
					// Fire-and-forget; reconciler picks up failures on its 15s tick.
					client.callTool("commander_task", {
						operation: "update",
						task_id: mapping.commanderId,
						status: localToCommander(status),
					}).catch(() => { /* reconciler retry path handles this */ });
				}
			}
		} else {
			const previewText = (res as any)?.content?.[0]?.text;
			const preview = typeof previewText === "string" ? previewText.slice(0, 600) : JSON.stringify(res).slice(0, 600);
			debugLog(`executeGroupCreate PARSE_FAILURE cmd response preview: ${preview}`);
			onResolved(markGroupCreateSettled(current));
		}
	} catch (err: any) {
		debugLog(`executeGroupCreate THROW ${err?.message || String(err)}`);
		onResolved(markGroupCreateSettled(getState()));
		throw err;
	}
}
