// ABOUTME: Verifies that a malformed cmd task add response (parse failure) does NOT silently orphan
// ABOUTME: the local task; instead it is queued in pendingCreates so reconciliation can retry.

import { describe, it, expect } from "vitest";
import {
	emptySyncState,
	addMapping,
	handleTaskCreateResponse,
	pendingCreateLocalIds,
	lookupMapping,
} from "../lib/commander/commander-sync.ts";

describe("handleTaskCreateResponse — orphan-task atomicity on parse failure", () => {
	it("adds a mapping when the response carries a parseable task_id", () => {
		const before = emptySyncState();
		const res = { content: [{ type: "text", text: JSON.stringify({ task_id: 777, id: 777 }) }] };
		const after = handleTaskCreateResponse(before, 42, "feature: do thing", res);

		expect(lookupMapping(after, 42)).toBe(777);
		expect(pendingCreateLocalIds(after)).not.toContain(42);
	});

	it("queues local task as pendingCreate when response cannot be parsed", () => {
		const before = emptySyncState();
		const res = { content: [{ type: "text", text: "<<not json>>" }] };
		const after = handleTaskCreateResponse(before, 99, "feature: parse hostile", res);

		expect(lookupMapping(after, 99)).toBeUndefined();
		expect(pendingCreateLocalIds(after)).toContain(99);
	});

	it("queues local task as pendingCreate when response is missing task_id", () => {
		const before = emptySyncState();
		const res = { content: [{ type: "text", text: JSON.stringify({ message: "ok", extra: 1 }) }] };
		const after = handleTaskCreateResponse(before, 55, "feature: no id", res);

		expect(lookupMapping(after, 55)).toBeUndefined();
		expect(pendingCreateLocalIds(after)).toContain(55);
	});

	it("is idempotent when called twice with same local id and pending state", () => {
		let s = emptySyncState();
		const res = { content: [{ type: "text", text: "garbage" }] };
		s = handleTaskCreateResponse(s, 7, "x", res);
		s = handleTaskCreateResponse(s, 7, "x", res);
		const pending = pendingCreateLocalIds(s);
		expect(pending.filter((id) => id === 7)).toHaveLength(1);
	});

	it("does not overwrite an existing mapping when called with parse failure", () => {
		let s = emptySyncState();
		s = addMapping(s, 100, 200);
		const res = { content: [{ type: "text", text: "garbage" }] };
		const after = handleTaskCreateResponse(s, 100, "x", res);
		expect(lookupMapping(after, 100)).toBe(200);
		// Local task already mapped — should not also be in pendingCreates
		expect(pendingCreateLocalIds(after)).not.toContain(100);
	});
});
