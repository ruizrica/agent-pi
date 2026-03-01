// ABOUTME: Tests for Commander sync pure functions — state mapping, ID parsing, types.
// ABOUTME: Covers localToCommander, commanderToLocal, parseCommanderTaskId, parseGroupId.

import { describe, it, expect } from "vitest";
import {
	localToCommander,
	commanderToLocal,
	parseCommanderTaskId,
	parseGroupId,
	emptySyncState,
	lookupMapping,
	addMapping,
	removeMapping,
	clearMappings,
	shouldCreateGroup,
	isExternalSyncActive,
	markGroupCreationInFlight,
	parseGroupCreateResult,
	buildGroupCreatePayload,
	applyGroupCreateResult,
	updateMappingStatus,
	type CommanderTaskMapping,
	type SyncState,
} from "../lib/commander-sync.ts";

describe("localToCommander", () => {
	it("should map idle to pending", () => {
		expect(localToCommander("idle")).toBe("pending");
	});

	it("should map inprogress to working", () => {
		expect(localToCommander("inprogress")).toBe("working");
	});

	it("should map done to completed", () => {
		expect(localToCommander("done")).toBe("completed");
	});
});

describe("commanderToLocal", () => {
	it("should map pending to idle", () => {
		expect(commanderToLocal("pending")).toBe("idle");
	});

	it("should map working to inprogress", () => {
		expect(commanderToLocal("working")).toBe("inprogress");
	});

	it("should map completed to done", () => {
		expect(commanderToLocal("completed")).toBe("done");
	});

	it("should map cancelled to done (removed tasks)", () => {
		expect(commanderToLocal("cancelled")).toBe("done");
	});

	it("should map failed to done (terminal state)", () => {
		expect(commanderToLocal("failed")).toBe("done");
	});

	it("should return idle for unknown statuses", () => {
		expect(commanderToLocal("unknown-status")).toBe("idle");
	});
});

describe("parseCommanderTaskId", () => {
	it("should extract task_id from a successful create result", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ task_id: 42, status: "pending" }) }],
		};
		expect(parseCommanderTaskId(result)).toBe(42);
	});

	it("should return undefined when content is missing", () => {
		expect(parseCommanderTaskId({})).toBeUndefined();
		expect(parseCommanderTaskId({ content: [] })).toBeUndefined();
	});

	it("should return undefined when text is not valid JSON", () => {
		const result = {
			content: [{ type: "text", text: "not json" }],
		};
		expect(parseCommanderTaskId(result)).toBeUndefined();
	});

	it("should return undefined when task_id is missing from parsed object", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ status: "pending" }) }],
		};
		expect(parseCommanderTaskId(result)).toBeUndefined();
	});

	it("should handle task_id as string number", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ task_id: "99" }) }],
		};
		expect(parseCommanderTaskId(result)).toBe(99);
	});
});

describe("parseGroupId", () => {
	it("should extract group_id from a successful group:create result", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 7, group_name: "Test" }) }],
		};
		expect(parseGroupId(result)).toBe(7);
	});

	it("should return undefined when content is missing", () => {
		expect(parseGroupId({})).toBeUndefined();
		expect(parseGroupId({ content: [] })).toBeUndefined();
	});

	it("should return undefined when text is not valid JSON", () => {
		const result = {
			content: [{ type: "text", text: "Commander error: Connection refused" }],
		};
		expect(parseGroupId(result)).toBeUndefined();
	});

	it("should return undefined when group_id is missing", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ group_name: "Test" }) }],
		};
		expect(parseGroupId(result)).toBeUndefined();
	});
});

describe("CommanderTaskMapping type", () => {
	it("should represent a mapping between local and commander task IDs", () => {
		const mapping: CommanderTaskMapping = {
			localId: 1,
			commanderId: 42,
		};
		expect(mapping.localId).toBe(1);
		expect(mapping.commanderId).toBe(42);
	});
});

describe("SyncState type", () => {
	it("should hold sync state with mappings, groupId, availability, and groupCreationInFlight", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			groupCreationInFlight: false,
			mappings: [
				{ localId: 1, commanderId: 42 },
				{ localId: 2, commanderId: 43 },
			],
		};
		expect(state.available).toBe(true);
		expect(state.groupId).toBe(7);
		expect(state.groupCreationInFlight).toBe(false);
		expect(state.mappings).toHaveLength(2);
	});

	it("should allow undefined groupId when no group created", () => {
		const state: SyncState = {
			available: false,
			groupId: undefined,
			groupCreationInFlight: false,
			mappings: [],
		};
		expect(state.groupId).toBeUndefined();
	});
});

describe("emptySyncState", () => {
	it("should return a clean initial state", () => {
		const state = emptySyncState();
		expect(state.available).toBe(false);
		expect(state.groupId).toBeUndefined();
		expect(state.groupCreationInFlight).toBe(false);
		expect(state.mappings).toEqual([]);
	});
});

describe("lookupMapping", () => {
	it("should return commanderId for a known localId", () => {
		const state: SyncState = {
			available: true,
			groupId: 1,
			mappings: [{ localId: 1, commanderId: 42 }, { localId: 2, commanderId: 43 }],
		};
		expect(lookupMapping(state, 1)).toBe(42);
		expect(lookupMapping(state, 2)).toBe(43);
	});

	it("should return undefined for an unknown localId", () => {
		const state: SyncState = {
			available: true,
			groupId: 1,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		expect(lookupMapping(state, 99)).toBeUndefined();
	});

	it("should return undefined for empty mappings", () => {
		expect(lookupMapping(emptySyncState(), 1)).toBeUndefined();
	});
});

describe("addMapping", () => {
	it("should append a new mapping without mutating the original", () => {
		const original = emptySyncState();
		const updated = addMapping(original, 1, 42);
		expect(updated.mappings).toEqual([{ localId: 1, commanderId: 42 }]);
		expect(original.mappings).toEqual([]); // immutable
	});

	it("should preserve existing mappings", () => {
		const state: SyncState = {
			available: true,
			groupId: 5,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		const updated = addMapping(state, 2, 43);
		expect(updated.mappings).toHaveLength(2);
		expect(updated.groupId).toBe(5);
	});
});

describe("removeMapping", () => {
	it("should remove a mapping by localId", () => {
		const state: SyncState = {
			available: true,
			groupId: 1,
			mappings: [{ localId: 1, commanderId: 42 }, { localId: 2, commanderId: 43 }],
		};
		const updated = removeMapping(state, 1);
		expect(updated.mappings).toEqual([{ localId: 2, commanderId: 43 }]);
	});

	it("should be a no-op for unknown localId", () => {
		const state: SyncState = {
			available: true,
			groupId: 1,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		const updated = removeMapping(state, 99);
		expect(updated.mappings).toEqual([{ localId: 1, commanderId: 42 }]);
	});

	it("should not mutate the original", () => {
		const state: SyncState = {
			available: true,
			groupId: 1,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		removeMapping(state, 1);
		expect(state.mappings).toHaveLength(1);
	});
});

describe("clearMappings", () => {
	it("should clear all mappings, groupId, and groupCreationInFlight", () => {
		const state: SyncState = {
			available: true,
			groupId: 5,
			groupCreationInFlight: true,
			mappings: [{ localId: 1, commanderId: 42 }, { localId: 2, commanderId: 43 }],
		};
		const updated = clearMappings(state);
		expect(updated.mappings).toEqual([]);
		expect(updated.groupId).toBeUndefined();
		expect(updated.groupCreationInFlight).toBe(false);
		expect(updated.available).toBe(true); // preserves availability
	});

	it("should not mutate the original", () => {
		const state: SyncState = {
			available: true,
			groupId: 5,
			groupCreationInFlight: true,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		clearMappings(state);
		expect(state.mappings).toHaveLength(1);
		expect(state.groupId).toBe(5);
		expect(state.groupCreationInFlight).toBe(true);
	});
});

describe("shouldCreateGroup", () => {
	it("should return true when groupId is undefined and not in flight", () => {
		const state = emptySyncState();
		expect(shouldCreateGroup(state)).toBe(true);
	});

	it("should return false when groupId is already set", () => {
		const state: SyncState = { available: true, groupId: 7, groupCreationInFlight: false, mappings: [] };
		expect(shouldCreateGroup(state)).toBe(false);
	});

	it("should return false when groupCreationInFlight is true", () => {
		const state: SyncState = { available: true, groupId: undefined, groupCreationInFlight: true, mappings: [] };
		expect(shouldCreateGroup(state)).toBe(false);
	});
});

describe("isExternalSyncActive", () => {
	it("should return false by default", () => {
		delete (globalThis as any).__piCommanderPlanGroupId;
		expect(isExternalSyncActive()).toBe(false);
	});

	it("should return true when __piCommanderPlanGroupId is set", () => {
		(globalThis as any).__piCommanderPlanGroupId = 42;
		expect(isExternalSyncActive()).toBe(true);
		delete (globalThis as any).__piCommanderPlanGroupId;
	});
});

describe("markGroupCreationInFlight", () => {
	it("should set groupCreationInFlight to true", () => {
		const state = emptySyncState();
		const updated = markGroupCreationInFlight(state);
		expect(updated.groupCreationInFlight).toBe(true);
	});

	it("should not mutate the original state", () => {
		const state = emptySyncState();
		markGroupCreationInFlight(state);
		expect(state.groupCreationInFlight).toBe(false);
	});

	it("should preserve other fields", () => {
		const state: SyncState = { available: true, groupId: undefined, groupCreationInFlight: false, mappings: [{ localId: 1, commanderId: 42 }] };
		const updated = markGroupCreationInFlight(state);
		expect(updated.available).toBe(true);
		expect(updated.mappings).toEqual([{ localId: 1, commanderId: 42 }]);
	});
});

describe("parseGroupCreateResult", () => {
	it("should extract group_id and task_ids from well-formed result", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 7, task_ids: [101, 102, 103] }) }],
		};
		const parsed = parseGroupCreateResult(result);
		expect(parsed).toEqual({ groupId: 7, taskIds: [101, 102, 103] });
	});

	it("should return undefined when content is missing", () => {
		expect(parseGroupCreateResult({})).toBeUndefined();
		expect(parseGroupCreateResult({ content: [] })).toBeUndefined();
	});

	it("should return undefined for bad JSON", () => {
		const result = { content: [{ type: "text", text: "not json" }] };
		expect(parseGroupCreateResult(result)).toBeUndefined();
	});

	it("should return undefined when group_id is missing", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ task_ids: [1, 2] }) }],
		};
		expect(parseGroupCreateResult(result)).toBeUndefined();
	});

	it("should return undefined when task_ids is missing", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 7 }) }],
		};
		expect(parseGroupCreateResult(result)).toBeUndefined();
	});

	it("should handle string-coerced group_id", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ group_id: "7", task_ids: [101] }) }],
		};
		const parsed = parseGroupCreateResult(result);
		expect(parsed).toEqual({ groupId: 7, taskIds: [101] });
	});

	it("should return undefined when task_ids is not an array", () => {
		const result = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 7, task_ids: "not-array" }) }],
		};
		expect(parseGroupCreateResult(result)).toBeUndefined();
	});
});

describe("buildGroupCreatePayload", () => {
	it("should construct a valid group:create payload", () => {
		const payload = buildGroupCreatePayload("My Tasks", "Doing stuff", ["Task A", "Task B"], "/home/user");
		expect(payload.operation).toBe("group:create");
		expect(payload.group_name).toBe("My Tasks");
		expect(payload.initiative_summary).toBe("Doing stuff");
		expect(payload.total_waves).toBe(1);
		expect(payload.working_directory).toBe("/home/user");
		expect(payload.tasks).toHaveLength(2);
	});

	it("should map each task text into the expected shape", () => {
		const payload = buildGroupCreatePayload("List", "Desc", ["Fix bug"], "/cwd");
		const task = payload.tasks[0];
		expect(task.description).toBe("Fix bug");
		expect(task.task_prompt).toBe("Fix bug");
		expect(task.context).toBe("");
		expect(task.dependency_order).toBe(0);
	});

	it("should fall back to group name for initiative_summary when description is empty", () => {
		const payload = buildGroupCreatePayload("My Tasks", "", ["A"], "/cwd");
		expect(payload.initiative_summary).toBe("My Tasks");
	});
});

describe("applyGroupCreateResult", () => {
	it("should set groupId and create mappings from parallel arrays", () => {
		const state = emptySyncState();
		const localIds = [1, 2, 3];
		const result = { groupId: 7, taskIds: [101, 102, 103] };
		const updated = applyGroupCreateResult(state, localIds, result);
		expect(updated.groupId).toBe(7);
		expect(updated.groupCreationInFlight).toBe(false);
		expect(updated.mappings).toEqual([
			{ localId: 1, commanderId: 101 },
			{ localId: 2, commanderId: 102 },
			{ localId: 3, commanderId: 103 },
		]);
	});

	it("should not mutate the original state", () => {
		const state = markGroupCreationInFlight(emptySyncState());
		const result = { groupId: 7, taskIds: [101] };
		applyGroupCreateResult(state, [1], result);
		expect(state.groupId).toBeUndefined();
		expect(state.groupCreationInFlight).toBe(true);
		expect(state.mappings).toEqual([]);
	});

	it("should handle length mismatch by mapping only up to shorter array", () => {
		const state = emptySyncState();
		const localIds = [1, 2];
		const result = { groupId: 7, taskIds: [101] };
		const updated = applyGroupCreateResult(state, localIds, result);
		expect(updated.groupId).toBe(7);
		expect(updated.mappings).toEqual([{ localId: 1, commanderId: 101 }]);
	});

	it("should preserve existing mappings", () => {
		const state: SyncState = {
			available: true,
			groupId: undefined,
			groupCreationInFlight: true,
			mappings: [{ localId: 10, commanderId: 200 }],
		};
		const result = { groupId: 7, taskIds: [101] };
		const updated = applyGroupCreateResult(state, [1], result);
		expect(updated.mappings).toEqual([
			{ localId: 10, commanderId: 200 },
			{ localId: 1, commanderId: 101 },
		]);
	});
});

describe("updateMappingStatus", () => {
	it("should set lastSyncedStatus on matching mapping", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			groupCreationInFlight: false,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		const updated = updateMappingStatus(state, 1, "inprogress");
		expect(updated.mappings[0].lastSyncedStatus).toBe("inprogress");
	});

	it("should not mutate the original state", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			groupCreationInFlight: false,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		const updated = updateMappingStatus(state, 1, "done");
		expect(state.mappings[0]).not.toHaveProperty("lastSyncedStatus");
		expect(updated.mappings[0].lastSyncedStatus).toBe("done");
	});

	it("should be a no-op for unknown localId", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			groupCreationInFlight: false,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		const updated = updateMappingStatus(state, 99, "done");
		expect(updated.mappings).toEqual(state.mappings);
	});

	it("should preserve other mappings unchanged", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			groupCreationInFlight: false,
			mappings: [
				{ localId: 1, commanderId: 42 },
				{ localId: 2, commanderId: 43, lastSyncedStatus: "idle" },
			],
		};
		const updated = updateMappingStatus(state, 1, "inprogress");
		expect(updated.mappings[0].lastSyncedStatus).toBe("inprogress");
		expect(updated.mappings[1].lastSyncedStatus).toBe("idle");
	});

	it("should overwrite existing lastSyncedStatus", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			groupCreationInFlight: false,
			mappings: [{ localId: 1, commanderId: 42, lastSyncedStatus: "idle" }],
		};
		const updated = updateMappingStatus(state, 1, "done");
		expect(updated.mappings[0].lastSyncedStatus).toBe("done");
	});
});
