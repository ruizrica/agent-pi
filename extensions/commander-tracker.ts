// ABOUTME: Extension that reconciles local tasks with Commander and retries failed sync ops.
// ABOUTME: Activates when Commander CLI becomes available; runs reconcile (15s) and heartbeat (30s) intervals.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createTrackerState,
	popRetries,
	computeReconcileActions,
	type CreateAction,
	type TrackerState,
} from "./lib/commander/commander-tracker.ts";
import {
	parseCommanderTaskId,
	addMapping,
	updateMappingStatus,
	buildGroupCreatePayload,
	parseGroupCreateResult,
	type SyncState,
} from "./lib/commander/commander-sync.ts";
import {
	resolveAgentName,
	resolveAgentType,
	resolveAgentRole,
} from "./agent-identity.ts";
import { getCommanderCliClient, isCommanderAvailable } from "./lib/commander/commander-cli-client.ts";

export default function (pi: ExtensionAPI) {
	const g = globalThis as any;
	let reconcileTimer: ReturnType<typeof setInterval> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let trackerState: TrackerState = createTrackerState();
	const createInFlightLocalIds = new Set<number>();

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

		// Register the agent on Commander before first heartbeat
		registerAgent();

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
		if (!isCommanderAvailable()) return;
		const client = getCommanderCliClient();

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
		// Newer tasks.ts publishes an explicit false when local WARDEN boards must
		// stay local. Older/test snapshots may omit the flag; keep those compatible
		// so reconciliation behavior remains testable without weakening the explicit
		// local-board suppression path.
		if (taskList.__commanderSyncEnabled === false) return;

		// Get current sync mappings from tasks extension's published state
		// (tasks.ts publishes syncState inside details, but we read the globalThis snapshot)
		const mappings = syncState?.mappings || [];
		const suppressCreateActions = !!syncState?.groupCreationInFlight && syncState?.groupId === undefined;
		const actions = computeReconcileActions(taskList.tasks, mappings, syncState?.pendingCreates || [], {
			suppressCreateActions,
			skipCreateLocalIds: createInFlightLocalIds,
		});

		// When no Commander group exists yet, retry the original group:create with
		// every unmapped local task batched in. This preserves the parent/child
		// structure (one initiative-root parent, executable children with cmd-parent
		// labels) instead of producing one orphan initiative-root per task — every
		// child of that fallback path used to land with mission_brief set, which the
		// bd adapter auto-stamps with `initiative-root`, hiding it from the Kanban
		// board.
		if (syncState && syncState.groupId === undefined && !syncState.groupCreationInFlight) {
			const createActions = actions.filter((a): a is CreateAction => a.type === "create");
			if (createActions.length > 0) {
				for (const a of createActions) createInFlightLocalIds.add(a.localId);
				syncState.groupCreationInFlight = true;
				const localIds = createActions.map((a) => a.localId);
				const listDescription = String(taskList.description || "").trim();
				const listTitleStr = String(taskList.title || "").trim();
				const payload = buildGroupCreatePayload(
					listTitleStr || "Tasks",
					listDescription || listTitleStr || "Tasks",
					createActions.map((a) => a.text),
					process.cwd(),
				);
				const desiredStatusByLocalId = new Map(createActions.map((a) => [a.localId, a.localStatus]));
				client.callTool("commander_task", payload, 30_000).then((res: any) => {
					const parsed = parseGroupCreateResult(res);
					if (!parsed || !syncState) return;
					syncState.groupId = parsed.groupId;
					const len = Math.min(localIds.length, parsed.taskIds.length);
					const existingLocalIds = new Set(syncState.mappings.map(m => m.localId));
					for (let i = 0; i < len; i++) {
						const localId = localIds[i];
						if (existingLocalIds.has(localId)) continue;
						syncState.mappings.push({
							localId,
							commanderId: parsed.taskIds[i],
							lastSyncedStatus: (desiredStatusByLocalId.get(localId) as any) ?? "idle",
						});
					}
					const mappedLocalIds = new Set(syncState.mappings.map(m => m.localId));
					syncState.pendingCreates = (syncState.pendingCreates || []).filter(p => !mappedLocalIds.has(p.localId));
				}).catch(() => {
					// Parse/transport failure — leave pendingCreates untouched so the
					// next reconcile tick retries the batched group:create.
				}).finally(() => {
					if (syncState) syncState.groupCreationInFlight = false;
					for (const a of createActions) createInFlightLocalIds.delete(a.localId);
				});

				// Drain any status-update actions in the same tick; per-task creates
				// are intentionally skipped now that the batched group:create owns
				// the create path.
				for (const action of actions) {
					if (action.type !== "status-update") continue;
					client.callTool("commander_task", {
						operation: "update",
						task_id: action.commanderId,
						status: action.commanderStatus,
					}).then(() => {
						if (syncState) {
							const mapping = syncState.mappings.find(m => m.localId === action.localId);
							if (mapping) mapping.lastSyncedStatus = action.localStatus as any;
						}
					}).catch(() => {});
				}
				return;
			}
		}

		for (const action of actions) {
			if (action.type === "create") {
				const groupId = syncState?.groupId;
				createInFlightLocalIds.add(action.localId);
				client.callTool("commander_task", {
					operation: "create",
					description: action.text,
					working_directory: process.cwd(),
					status: action.commanderStatus,
					...(groupId !== undefined ? { group_id: groupId } : {}),
				}).then((res: any) => {
					const cid = parseCommanderTaskId(res);
					if (cid !== undefined && syncState) {
						// Mutate sync state to add mapping — tasks.ts will pick it up
						syncState.mappings.push({ localId: action.localId, commanderId: cid, lastSyncedStatus: action.localStatus as any });
						syncState.pendingCreates = (syncState.pendingCreates || []).filter(p => p.localId !== action.localId);
					}
				}).catch(() => {}).finally(() => {
					createInFlightLocalIds.delete(action.localId);
				});
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

	function registerAgent() {
		if (!isCommanderAvailable()) return;
		const client = getCommanderCliClient();

		// One-time identity announcement so the board shows a stable name.
		const name = resolveAgentName();
		const agent_type = resolveAgentType();
		const role = resolveAgentRole();

		client.callTool("commander_orchestration", {
			operation: "agent:register",
			name,
			agent_type,
			role,
		}).catch(() => {
			// Registration is best-effort; duplicate-name is fine
		});
	}

	function sendHeartbeat() {
		const currentTask = g.__piCurrentTask;
		if (!isCommanderAvailable() || !currentTask) return;
		const client = getCommanderCliClient();

		client.callTool("commander_orchestration", {
			operation: "agent:heartbeat",
			agent_name: resolveAgentName(),
		}).catch(() => {});
	}

	// ── Lifecycle ────────────────────────────────────────────────────

	pi.on("session_start", async () => {
		// No async gate anymore — Commander is "available" iff the `cmd` binary
		// is on PATH. Activate immediately when present; stay dormant otherwise.
		if (isCommanderAvailable()) {
			activate();
		}
	});

	pi.on("session_shutdown", async () => {
		deactivate();
		g.__piCommanderTracker = null;
	});
}
