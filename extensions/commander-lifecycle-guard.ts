// ABOUTME: Stop/start guard for Commander lifecycle recovery.
// ABOUTME: Surfaces cmd housekeep findings and Pi pending lifecycle intents before agents finish.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { getCommanderCliClient, isCommanderAvailable } from "./lib/commander/commander-cli-client.ts";
import {
	clearLifecycleIntent,
	listOpenLifecycleIntents,
	recordLifecycleIntent,
	type LifecycleIntent,
} from "./lib/commander/lifecycle-intents.ts";

const RECONCILE_OP_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INTENT_ATTEMPTS = 5;
const REAP_OP_TIMEOUT_MS = 15_000;
const DOCTOR_CACHE_TTL_MS = 60_000;

// Module-scoped cache for the cmd housekeep --doctor warning collection.
// Repeated Pi launches (or agent_end fires) within the TTL reuse the prior
// result instead of re-running the ~1.9s board-wide bd scan.
let cachedWarnings: string[] | undefined;
let lastDoctorAt = 0;

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

function parseWrappedJson(result: any): any | undefined {
	const text = result?.content?.[0]?.text;
	if (typeof text !== "string") return undefined;
	try { return JSON.parse(text); } catch { return undefined; }
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
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_INTENT_ATTEMPTS;
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

async function collectLifecycleWarnings(): Promise<string[]> {
	// Cache hit: reuse the prior result if it is still inside the TTL window.
	// Pi launches and rapid agent_end fires shouldn't each pay the ~1.9s
	// board-wide bd scan that backs cmd housekeep --doctor.
	const now = Date.now();
	if (cachedWarnings && now - lastDoctorAt < DOCTOR_CACHE_TTL_MS) {
		// Refresh the intents portion (cheap, file-only) on every call so the
		// cache doesn't hide a newly-opened intent. The expensive doctor part
		// stays cached.
		const intents = listOpenLifecycleIntents();
		const refreshed = cachedWarnings.filter(w => !w.startsWith("Pi has ") || !w.includes("pending Commander lifecycle intent"));
		if (intents.length > 0) {
			refreshed.unshift(`Pi has ${intents.length} pending Commander lifecycle intent(s): ${intents.map(i => `${i.taskId}:${i.action}`).join(", ")}.`);
		}
		return refreshed;
	}

	const warnings: string[] = [];
	const intents = listOpenLifecycleIntents();
	if (intents.length > 0) {
		warnings.push(`Pi has ${intents.length} pending Commander lifecycle intent(s): ${intents.map(i => `${i.taskId}:${i.action}`).join(", ")}.`);
	}
	if (isCommanderAvailable()) {
		try {
			const client = getCommanderCliClient();
			const doctor = parseWrappedJson(await client.callTool("commander_housekeep", { operation: "doctor" }, 15_000));
			const findings = Array.isArray(doctor?.findings) ? doctor.findings : [];
			if (findings.length > 0) {
				warnings.push(`cmd housekeep reports ${findings.length} lifecycle finding(s): ${findings.slice(0, 5).map((f: any) => `${f.category}: ${f.line}`).join("; ")}.`);
			}
		} catch {
			// Housekeep is advisory; pending intents still surface recovery requirements.
		}
	}
	cachedWarnings = warnings;
	lastDoctorAt = now;
	return warnings;
}

export default function (pi: ExtensionAPI) {
	let lastAgentEndFingerprint = "";
	let lastAgentEndNotifiedAt = 0;

	function shouldNotifyAgentEnd(warnings: string[]): boolean {
		const fingerprint = warnings.join("\n");
		const now = Date.now();
		if (fingerprint === lastAgentEndFingerprint && now - lastAgentEndNotifiedAt < 60_000) return false;
		lastAgentEndFingerprint = fingerprint;
		lastAgentEndNotifiedAt = now;
		return true;
	}

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
				const summary = await reconcileOpenLifecycleIntents(client);
				await runReapStaleClaims(client);
				if (summary.reconciled + summary.exhausted > 0) {
					ctx.ui.notify(
						`Lifecycle reconciler: ${summary.reconciled} recovered, ${summary.retained} retained, ${summary.exhausted} auto-failed.`,
						"info",
					);
				}
			} catch (err: any) {
				console.error("[lifecycle-guard] reconciler dispatch error:", err?.message || err);
			}
		}

		// Background the doctor warning collection so session_start completes
		// without waiting on the ~1.9s board-wide scan. A finding still surfaces
		// to the user via ctx.ui.notify, just on the next event-loop tick rather
		// than blocking startup.
		setTimeout(() => {
			collectLifecycleWarnings().then((warnings) => {
				if (warnings.length > 0) {
					ctx.ui.notify(`Commander lifecycle recovery needed: ${warnings[0]}`, "warning");
				}
			}).catch((err: any) => {
				console.error("[lifecycle-guard] deferred warning collection error:", err?.message || err);
			});
		}, 0);
	});

	pi.on("agent_end", async (_event, _ctx) => {
		if (isCommanderAvailable()) {
			try {
				await runReapStaleClaims(getCommanderCliClient());
			} catch (err: any) {
				console.error("[lifecycle-guard] reap dispatch error on agent_end:", err?.message || err);
			}
		}
		const warnings = await collectLifecycleWarnings();
		if (warnings.length === 0) {
			lastAgentEndFingerprint = "";
			lastAgentEndNotifiedAt = 0;
			return;
		}
		if (!shouldNotifyAgentEnd(warnings)) return;
		try {
			pi.sendMessage({
				customType: "commander-lifecycle-validation",
				content: `Commander lifecycle responsibilities remain open. Before stopping, resolve them through cmd: add a current task comment/handoff, then complete/fail/cancel/delete or adopt stale work.\n\n${warnings.map(w => `- ${w}`).join("\n")}`,
				display: true,
			}, { triggerTurn: false });
		} catch {
			// Short-lived/replaced sessions can make the extension API stale before
			// this advisory message is delivered. Do not surface lifecycle advice as
			// a startup/shutdown artifact.
		}
	});
}
