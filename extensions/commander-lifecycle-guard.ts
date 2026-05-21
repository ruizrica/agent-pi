// ABOUTME: Silent lifecycle recovery layer for Commander.
// ABOUTME: Replays pending intents on session_start and reaps stale claims on
// ABOUTME: agent_end. Does not surface findings to the user — observability was
// ABOUTME: deliberately removed 2026-05-20 (Ricardo's call: too noisy, recovery
// ABOUTME: should be invisible until something actually fails).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { getCommanderCliClient, isCommanderAvailable } from "./lib/commander/commander-cli-client.ts";
import {
	clearLifecycleIntent,
	listOpenLifecycleIntents,
	recordLifecycleIntent,
	MAX_INTENT_ATTEMPTS,
	type LifecycleIntent,
} from "./lib/commander/lifecycle-intents.ts";
// Note: alignPointerOnSessionStart deliberately not imported here anymore.
// The dashboard's currentProjectId is a UI-only filter owned by the user via
// the projects button (see desktop handoff 2026-05-20-handoff-commander-cross-
// project-dashboard.md). Pi must not auto-switch it on session start — the
// commander-v2 dashboard is being moved to a cross-project default view where
// the pointer becomes opt-in. The helper itself is retained in
// project-pointer-sync.ts in case a manual command wants to invoke it.

const RECONCILE_OP_TIMEOUT_MS = 30_000;
const REAP_OP_TIMEOUT_MS = 15_000;

/**
 * Invoke cmd housekeep reap:stale-claims to release claims left dangling by
 * crashed/aborted subagents. Never throws — callers should treat reap as
 * best-effort hygiene and not block hook completion on its failures.
 */
export async function runReapStaleClaims(client: any | null): Promise<void> {
	if (!client) return;
	try {
		await client.callTool("commander_housekeep", {
			operation: "reap:stale-claims",
			dry_run: false,
		}, REAP_OP_TIMEOUT_MS);
	} catch (err: any) {
		console.error("[lifecycle-guard] reap:stale-claims dispatch error:", err?.message || err);
	}
}

async function dispatchIntent(client: any, intent: LifecycleIntent): Promise<void> {
	const taskId = intent.taskId;
	switch (intent.action) {
		case "claim":
			await client.callTool("commander_task", {
				operation: "claim",
				task_id: taskId,
				agent_name: intent.owner ?? "pi",
			}, RECONCILE_OP_TIMEOUT_MS);
			return;
		case "complete":
			await client.callTool("commander_task", {
				operation: "complete",
				task_id: taskId,
				result: intent.message ?? "",
			}, RECONCILE_OP_TIMEOUT_MS);
			return;
		case "fail":
			await client.callTool("commander_task", {
				operation: "fail",
				task_id: taskId,
				error: intent.message ?? "",
			}, RECONCILE_OP_TIMEOUT_MS);
			return;
		case "cancel":
			await client.callTool("commander_task", {
				operation: "cancel",
				task_id: taskId,
				reason: intent.message ?? "",
			}, RECONCILE_OP_TIMEOUT_MS);
			return;
		case "comment":
			await client.callTool("commander_task", {
				operation: "comment:add",
				task_id: taskId,
				body: intent.message ?? "",
				type: "progress",
			}, RECONCILE_OP_TIMEOUT_MS);
			return;
	}
}

/**
 * Replay open lifecycle intents on session start. Each intent is dispatched
 * once via the matching cmd op; on success the intent is cleared. On failure
 * the intent is retained with an incremented `attempts` count. After
 * `maxAttempts` (default 5) failures the task is force-marked failed and the
 * intent is cleared so it stops haunting subsequent sessions.
 *
 * When `client` is null (Commander unavailable), intents are retained as-is
 * for the next session — never silently dropped.
 */
export async function reconcileOpenLifecycleIntents(
	client: any | null,
	options: { maxAttempts?: number } = {},
): Promise<{ reconciled: number; retained: number; exhausted: number }> {
	const maxAttempts = options.maxAttempts ?? MAX_INTENT_ATTEMPTS;
	const open = listOpenLifecycleIntents();
	if (open.length === 0) return { reconciled: 0, retained: 0, exhausted: 0 };
	if (!client) return { reconciled: 0, retained: open.length, exhausted: 0 };

	let reconciled = 0;
	let retained = 0;
	let exhausted = 0;

	for (const intent of open) {
		try {
			await dispatchIntent(client, intent);
			clearLifecycleIntent(intent.taskId, intent.action);
			reconciled++;
			continue;
		} catch (err: any) {
			const nextAttempts = intent.attempts + 1;
			if (nextAttempts >= maxAttempts) {
				try {
					await client.callTool("commander_task", {
						operation: "fail",
						task_id: intent.taskId,
						error: `lifecycle reconciliation exhausted after ${nextAttempts} attempts: ${intent.message ?? intent.action}`,
					}, RECONCILE_OP_TIMEOUT_MS);
				} catch (failErr: any) {
					console.error(`[lifecycle-reconciler] could not auto-fail exhausted intent for task ${intent.taskId}:`, failErr?.message || failErr);
				}
				clearLifecycleIntent(intent.taskId, intent.action);
				exhausted++;
			} else {
				recordLifecycleIntent({
					taskId: intent.taskId,
					action: intent.action,
					owner: intent.owner,
					message: intent.message,
				});
				retained++;
			}
		}
	}

	return { reconciled, retained, exhausted };
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);

		// Fast-path gate: only pay the synchronous reconcile + reap cost (two
		// board-wide bd scans, ~4s total) when there is actually open lifecycle
		// work to recover. The intents file is local + small, so this check is
		// effectively free; everything heavier stays deferred.
		const hasOpenIntents = listOpenLifecycleIntents().length > 0;
		if (hasOpenIntents && isCommanderAvailable()) {
			try {
				const client = getCommanderCliClient();
				await reconcileOpenLifecycleIntents(client);
				await runReapStaleClaims(client);
				// Recovery is silent — no ctx.ui.notify. If something is wrong the
				// errors above log to stderr; the user finds out via cmd housekeep
				// --doctor when they explicitly ask.
			} catch (err: any) {
				console.error("[lifecycle-guard] reconciler dispatch error:", err?.message || err);
			}
		}

		// Project-pointer auto-alignment removed 2026-05-20. Pi must not change
		// the dashboard's currentProjectId — it's a UI-only filter owned by the
		// user via the projects button. The commander-v2 dashboard is moving to
		// a cross-project default view; pointer drift stops being a bug there.
		// See: Desktop/2026-05-20-handoff-commander-cross-project-dashboard.md
		// Prior context: docs/adr/0001-cmd-contract.md (pointer-alignment ADR,
		// now superseded by the cross-project default design).
	});

	pi.on("agent_end", async (_event, _ctx) => {
		// Silent reap of stale claims at agent_end. No warning surface anymore
		// (removed 2026-05-20). If reap fails the error logs to stderr.
		if (isCommanderAvailable()) {
			try {
				await runReapStaleClaims(getCommanderCliClient());
			} catch (err: any) {
				console.error("[lifecycle-guard] reap dispatch error on agent_end:", err?.message || err);
			}
		}
	});
}
