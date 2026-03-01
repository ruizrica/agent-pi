// ABOUTME: Pure sync functions for mapping between local task states and Commander MCP states.
// ABOUTME: No side effects — fully testable state mapping, ID parsing, and type definitions.

// ── Types ────────────────────────────────────────────────────────────

export type LocalStatus = "idle" | "inprogress" | "done";
export type CommanderStatus = "pending" | "working" | "completed" | "failed" | "cancelled";

export interface CommanderTaskMapping {
	localId: number;
	commanderId: number;
	lastSyncedStatus?: LocalStatus;
}

export interface SyncState {
	available: boolean;
	groupId: number | undefined;
	groupCreationInFlight: boolean;
	mappings: CommanderTaskMapping[];
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
	return extractJsonField(result, "task_id");
}

export function parseGroupId(result: any): number | undefined {
	return extractJsonField(result, "group_id");
}

// ── SyncState helpers ───────────────────────────────────────────────

export function emptySyncState(): SyncState {
	return { available: false, groupId: undefined, groupCreationInFlight: false, mappings: [] };
}

export function lookupMapping(state: SyncState, localId: number): number | undefined {
	return state.mappings.find(m => m.localId === localId)?.commanderId;
}

export function addMapping(state: SyncState, localId: number, commanderId: number): SyncState {
	return {
		...state,
		mappings: [...state.mappings, { localId, commanderId }],
	};
}

export function removeMapping(state: SyncState, localId: number): SyncState {
	return {
		...state,
		mappings: state.mappings.filter(m => m.localId !== localId),
	};
}

export function clearMappings(state: SyncState): SyncState {
	return { ...state, mappings: [], groupId: undefined, groupCreationInFlight: false };
}

export function updateMappingStatus(state: SyncState, localId: number, status: LocalStatus): SyncState {
	return {
		...state,
		mappings: state.mappings.map(m =>
			m.localId === localId ? { ...m, lastSyncedStatus: status } : m,
		),
	};
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
) {
	return {
		operation: "group:create" as const,
		group_name: groupName,
		initiative_summary: description || groupName,
		total_waves: 1,
		working_directory: workingDir,
		tasks: taskTexts.map((text) => ({
			description: text,
			task_prompt: text,
			context: "",
			dependency_order: 0,
		})),
	};
}

export function applyGroupCreateResult(
	state: SyncState,
	localIds: number[],
	result: GroupCreateResult,
): SyncState {
	const len = Math.min(localIds.length, result.taskIds.length);
	const newMappings = Array.from({ length: len }, (_, i) => ({
		localId: localIds[i],
		commanderId: result.taskIds[i],
	}));
	return {
		...state,
		groupId: result.groupId,
		groupCreationInFlight: false,
		mappings: [...state.mappings, ...newMappings],
	};
}

export function isExternalSyncActive(): boolean {
	return (globalThis as any).__piCommanderPlanGroupId !== undefined;
}
