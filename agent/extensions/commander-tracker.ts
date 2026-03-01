// ABOUTME: Extension that reconciles local tasks with Commander and retries failed sync ops.
// ABOUTME: Activates when Commander becomes available; runs reconcile (15s) and heartbeat (30s) intervals.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createTrackerState,
	popRetries,
	computeReconcileActions,
	type TrackerState,
} from "./lib/commander-tracker.ts";
import {
	parseCommanderTaskId,
	addMapping,
	updateMappingStatus,
	type SyncState,
} from "./lib/commander-sync.ts";

export default function (pi: ExtensionAPI) {
	const g = globalThis as any;
	let reconcileTimer: ReturnType<typeof setInterval> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let trackerState: TrackerState = createTrackerState();

	// Publish tracker on globalThis so tasks.ts can push retries
	const tracker = {
		active: false,
		reconcileNow,
		_state: trackerState,
	};
	g.__piCommanderTracker = tracker;

	function activate() {
		if (tracker.active) return;
		tracker.active = true;

		// Reconcile every 15s — find unmapped tasks and retry failed ops
		reconcileTimer = setInterval(() => reconcileNow(), 15_000);

		// Heartbeat every 30s — keep Commander aware agent is alive
		heartbeatTimer = setInterval(() => sendHeartbeat(), 30_000);

		// Immediate reconcile to catch stale state on startup/reconnect
		reconcileNow();
	}

	function deactivate() {
		if (!tracker.active) return;
		tracker.active = false;
		if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = undefined; }
		if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined; }
	}

	function reconcileNow() {
		const client = g.__piCommanderClient;
		if (!client) return;

		// Drain retry queue
		const { entries, state: newState } = popRetries(tracker._state);
		tracker._state = newState;
		trackerState = newState;
		for (const entry of entries) {
			entry.fn(client).catch(() => {});
		}

		// Find unmapped tasks and create them in Commander
		const taskList = g.__piTaskList;
		const syncState: SyncState | undefined = g.__piTaskList?.__syncState;
		if (!taskList?.tasks) return;

		// Get current sync mappings from tasks extension's published state
		// (tasks.ts publishes syncState inside details, but we read the globalThis snapshot)
		const mappings = syncState?.mappings || [];
		const actions = computeReconcileActions(taskList.tasks, mappings);

		for (const action of actions) {
			if (action.type === "create") {
				const groupId = syncState?.groupId;
				client.callTool("commander_task", {
					operation: "create",
					description: action.text,
					working_directory: process.cwd(),
					...(groupId !== undefined ? { group_id: groupId } : {}),
				}).then((res: any) => {
					const cid = parseCommanderTaskId(res);
					if (cid !== undefined && syncState) {
						// Mutate sync state to add mapping — tasks.ts will pick it up
						syncState.mappings.push({ localId: action.localId, commanderId: cid });
					}
				}).catch(() => {});
			} else if (action.type === "status-update") {
				client.callTool("commander_task", {
					operation: "update",
					task_id: action.commanderId,
					status: action.commanderStatus,
				}).then(() => {
					if (syncState) {
						// Mutate mapping's lastSyncedStatus so next reconcile sees it as synced
						const mapping = syncState.mappings.find(m => m.localId === action.localId);
						if (mapping) mapping.lastSyncedStatus = action.localStatus as any;
					}
				}).catch(() => {});
			}
		}
	}

	function sendHeartbeat() {
		const client = g.__piCommanderClient;
		const currentTask = g.__piCurrentTask;
		if (!client || !currentTask) return;

		client.callTool("commander_orchestration", {
			operation: "agent:heartbeat",
			agent_name: process.env.PI_AGENT_NAME || "pi",
		}).catch(() => {});
	}

	// ── Lifecycle ────────────────────────────────────────────────────

	pi.on("session_start", async () => {
		const gate = g.__piCommanderGate;
		if (!gate) return;

		if (gate.state === "available") {
			activate();
		} else if (gate.state === "pending") {
			// Push callback to fire when Commander probe succeeds
			const callbacks: Array<() => void> = g.__piCommanderOnReady || [];
			g.__piCommanderOnReady = callbacks;
			callbacks.push(() => activate());
		}
		// If unavailable, stay dormant
	});

	pi.on("session_shutdown", async () => {
		deactivate();
		g.__piCommanderTracker = null;
	});
}
