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
	it("should hold sync state with mappings, groupId, and availability", () => {
		const state: SyncState = {
			available: true,
			groupId: 7,
			mappings: [
				{ localId: 1, commanderId: 42 },
				{ localId: 2, commanderId: 43 },
			],
		};
		expect(state.available).toBe(true);
		expect(state.groupId).toBe(7);
		expect(state.mappings).toHaveLength(2);
	});

	it("should allow undefined groupId when no group created", () => {
		const state: SyncState = {
			available: false,
			groupId: undefined,
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
	it("should clear all mappings and groupId", () => {
		const state: SyncState = {
			available: true,
			groupId: 5,
			mappings: [{ localId: 1, commanderId: 42 }, { localId: 2, commanderId: 43 }],
		};
		const updated = clearMappings(state);
		expect(updated.mappings).toEqual([]);
		expect(updated.groupId).toBeUndefined();
		expect(updated.available).toBe(true); // preserves availability
	});

	it("should not mutate the original", () => {
		const state: SyncState = {
			available: true,
			groupId: 5,
			mappings: [{ localId: 1, commanderId: 42 }],
		};
		clearMappings(state);
		expect(state.mappings).toHaveLength(1);
		expect(state.groupId).toBe(5);
	});
});
