// ABOUTME: ReadyGate state machine for Commander availability.
// ABOUTME: Queues operations while pending, executes when available, discards when unavailable.

// ── Types ────────────────────────────────────────────────────────────

export type GateState = "pending" | "available" | "unavailable";

export interface QueuedOp {
	fn: (client: any) => Promise<void>;
	label: string;
}

export interface ReadyGate {
	state: GateState;
	queue: QueuedOp[];
}

// ── Factory ──────────────────────────────────────────────────────────

export function createReadyGate(): ReadyGate {
	return { state: "pending", queue: [] };
}

// ── Core operations ──────────────────────────────────────────────────

export function enqueueOrExecute(
	gate: ReadyGate,
	op: QueuedOp,
	client: any,
): "queued" | "executing" | "discarded" {
	switch (gate.state) {
		case "pending":
			gate.queue.push(op);
			return "queued";
		case "available":
			op.fn(client).catch(() => {});
			return "executing";
		case "unavailable":
			return "discarded";
	}
}

export function resolveGate(gate: ReadyGate, available: boolean): QueuedOp[] {
	const drained = gate.queue.splice(0);
	gate.state = available ? "available" : "unavailable";
	return drained;
}

export function resetGate(gate: ReadyGate): void {
	gate.state = "pending";
	gate.queue = [];
}
