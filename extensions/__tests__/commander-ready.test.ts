// ABOUTME: Tests for ReadyGate state machine (commander-ready.ts).
// ABOUTME: Verifies pending→queue, available→execute, unavailable→discard, resolveGate drain order.

import { describe, it, expect, vi } from "vitest";
import {
	createReadyGate,
	enqueueOrExecute,
	resolveGate,
	resetGate,
	type ReadyGate,
	type QueuedOp,
} from "../lib/commander/commander-ready.ts";

describe("createReadyGate", () => {
	it("starts in pending state with empty queue", () => {
		const gate = createReadyGate();
		expect(gate.state).toBe("pending");
		expect(gate.queue).toEqual([]);
	});
});

describe("enqueueOrExecute", () => {
	it("queues ops when gate is pending", () => {
		const gate = createReadyGate();
		const fn = vi.fn();
		const result = enqueueOrExecute(gate, { fn, label: "test" }, null);
		expect(result).toBe("queued");
		expect(gate.queue).toHaveLength(1);
		expect(gate.queue[0].label).toBe("test");
		expect(fn).not.toHaveBeenCalled();
	});

	it("executes immediately when gate is available", () => {
		const gate = createReadyGate();
		resolveGate(gate, true);

		const fn = vi.fn().mockResolvedValue(undefined);
		const client = { callTool: vi.fn() };
		const result = enqueueOrExecute(gate, { fn, label: "exec" }, client);
		expect(result).toBe("executing");
		expect(fn).toHaveBeenCalledWith(client);
		expect(gate.queue).toHaveLength(0);
	});

	it("discards ops when gate is unavailable", () => {
		const gate = createReadyGate();
		resolveGate(gate, false);

		const fn = vi.fn();
		const result = enqueueOrExecute(gate, { fn, label: "discard" }, null);
		expect(result).toBe("discarded");
		expect(fn).not.toHaveBeenCalled();
		expect(gate.queue).toHaveLength(0);
	});

	it("queues multiple ops in order when pending", () => {
		const gate = createReadyGate();
		enqueueOrExecute(gate, { fn: vi.fn(), label: "first" }, null);
		enqueueOrExecute(gate, { fn: vi.fn(), label: "second" }, null);
		enqueueOrExecute(gate, { fn: vi.fn(), label: "third" }, null);
		expect(gate.queue.map(op => op.label)).toEqual(["first", "second", "third"]);
	});
});

describe("resolveGate", () => {
	it("returns queued ops when resolved as available", () => {
		const gate = createReadyGate();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		enqueueOrExecute(gate, { fn: fn1, label: "a" }, null);
		enqueueOrExecute(gate, { fn: fn2, label: "b" }, null);

		const drained = resolveGate(gate, true);
		expect(gate.state).toBe("available");
		expect(gate.queue).toHaveLength(0);
		expect(drained).toHaveLength(2);
		expect(drained[0].label).toBe("a");
		expect(drained[1].label).toBe("b");
	});

	it("returns queued ops when resolved as unavailable (caller discards)", () => {
		const gate = createReadyGate();
		enqueueOrExecute(gate, { fn: vi.fn(), label: "lost" }, null);

		const drained = resolveGate(gate, false);
		expect(gate.state).toBe("unavailable");
		expect(gate.queue).toHaveLength(0);
		expect(drained).toHaveLength(1);
		expect(drained[0].label).toBe("lost");
	});

	it("returns empty array when no ops were queued", () => {
		const gate = createReadyGate();
		const drained = resolveGate(gate, true);
		expect(drained).toEqual([]);
	});

	it("is idempotent — second resolve returns empty", () => {
		const gate = createReadyGate();
		enqueueOrExecute(gate, { fn: vi.fn(), label: "x" }, null);
		resolveGate(gate, true);
		const second = resolveGate(gate, true);
		expect(second).toEqual([]);
	});
});

describe("resetGate", () => {
	it("resets available gate back to pending", () => {
		const gate = createReadyGate();
		resolveGate(gate, true);
		expect(gate.state).toBe("available");

		resetGate(gate);
		expect(gate.state).toBe("pending");
		expect(gate.queue).toEqual([]);
	});

	it("resets unavailable gate back to pending", () => {
		const gate = createReadyGate();
		resolveGate(gate, false);
		resetGate(gate);
		expect(gate.state).toBe("pending");
	});

	it("queues ops again after reset", () => {
		const gate = createReadyGate();
		resolveGate(gate, false);
		resetGate(gate);

		const fn = vi.fn();
		const result = enqueueOrExecute(gate, { fn, label: "after-reset" }, null);
		expect(result).toBe("queued");
		expect(gate.queue).toHaveLength(1);
	});
});

describe("error handling", () => {
	it("does not throw when executed fn rejects", () => {
		const gate = createReadyGate();
		resolveGate(gate, true);

		const fn = vi.fn().mockRejectedValue(new Error("boom"));
		// enqueueOrExecute should not throw — fire-and-forget
		expect(() => enqueueOrExecute(gate, { fn, label: "err" }, {})).not.toThrow();
	});
});
