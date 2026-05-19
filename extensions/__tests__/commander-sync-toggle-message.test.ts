// ABOUTME: Tests describeToggleCommanderState — the helper the tasks tool uses to
// ABOUTME: pick between "mapped", "sync pending", and "no mapping" status hints
// ABOUTME: when toggling a local task. The race between new-list (async group:create)
// ABOUTME: and a fast toggle made the old single-branch "no mapping" message read as
// ABOUTME: "broken" when sync was actually still in flight.

import { describe, it, expect } from "vitest";
import { describeToggleCommanderState, emptySyncState, addMapping, addPendingCreate } from "../lib/commander/commander-sync.ts";

describe("describeToggleCommanderState", () => {
	it("reports mapped when a Commander mapping exists", () => {
		let state = emptySyncState();
		state = addMapping(state, 1, 101);
		expect(describeToggleCommanderState(state, 1)).toEqual({ kind: "mapped", commanderId: 101 });
	});

	it("reports pending when the local task is queued in pendingCreates", () => {
		const state = addPendingCreate(emptySyncState(), { id: 2, text: "task two", status: "idle" }, "group");
		expect(describeToggleCommanderState(state, 2)).toEqual({ kind: "pending" });
	});

	it("reports missing when there is no mapping and no pending entry", () => {
		expect(describeToggleCommanderState(emptySyncState(), 3)).toEqual({ kind: "missing" });
	});

	it("prefers mapped over pending when both somehow coexist", () => {
		let state = addPendingCreate(emptySyncState(), { id: 4, text: "task four", status: "idle" }, "group");
		state = addMapping(state, 4, 404);
		expect(describeToggleCommanderState(state, 4)).toEqual({ kind: "mapped", commanderId: 404 });
	});
});
