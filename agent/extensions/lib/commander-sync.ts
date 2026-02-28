// ABOUTME: Pure sync functions for mapping between local task states and Commander MCP states.
// ABOUTME: No side effects — fully testable state mapping, ID parsing, and type definitions.

// ── Types ────────────────────────────────────────────────────────────

export type LocalStatus = "idle" | "inprogress" | "done";
export type CommanderStatus = "pending" | "working" | "completed" | "failed" | "cancelled";

export interface CommanderTaskMapping {
	localId: number;
	commanderId: number;
}

export interface SyncState {
	available: boolean;
	groupId: number | undefined;
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
	return { available: false, groupId: undefined, mappings: [] };
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
	return { ...state, mappings: [], groupId: undefined };
}
