// ABOUTME: Commander lifecycle helpers for pre-claim, post-complete, and post-fail operations.
// ABOUTME: Shared by agent-team.ts and subagent-widget.ts to avoid duplicating MCP call logic.
// ABOUTME: Includes single retry with 2s delay, final comments, and recoverable intent logging.

import { clearLifecycleIntent, recordLifecycleIntent, MAX_INTENT_ATTEMPTS } from "./lifecycle-intents.ts";

const RETRY_DELAY_MS = 2000;
// Transient-fault retry within a single in-process lifecycle method call.
// Kept small so a failing cmd subprocess does not block the user-facing tool
// result for more than ~RETRY_DELAY_MS * (IN_PROCESS_RETRY_LIMIT - 1) seconds.
// The cross-session persistent-failure budget is MAX_INTENT_ATTEMPTS (imported
// from lifecycle-intents.ts) — that axis is enforced by the lifecycle guard's
// reconcileOpenLifecycleIntents, not here.
const IN_PROCESS_RETRY_LIMIT = 2;
const LIFECYCLE_TIMEOUT_MS = 30_000;
void MAX_INTENT_ATTEMPTS;  // exported for documentation cross-reference; consumed by commander-lifecycle-guard.ts

let lifecycleQueue: Promise<unknown> = Promise.resolve();

function enqueueLifecycle<T>(fn: () => Promise<T>): Promise<T> {
	const run = lifecycleQueue.catch(() => undefined).then(fn);
	lifecycleQueue = run.then(() => undefined, () => undefined);
	return run;
}

function callCommanderTask(client: any, params: Record<string, unknown>): Promise<any> {
	return client.callTool("commander_task", params, LIFECYCLE_TIMEOUT_MS);
}

/** Helper: retry an async operation up to IN_PROCESS_RETRY_LIMIT times with RETRY_DELAY_MS between attempts. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
	for (let attempt = 1; attempt <= IN_PROCESS_RETRY_LIMIT; attempt++) {
		try {
			return await fn();
		} catch (err: any) {
			const msg = err?.message || String(err);
			console.error(`[commander-lifecycle] ${label} failed (attempt ${attempt}/${IN_PROCESS_RETRY_LIMIT}): ${msg}`);
			if (attempt < IN_PROCESS_RETRY_LIMIT) {
				await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
			} else {
				throw err; // re-throw on final attempt so callers can handle
			}
		}
	}
	throw new Error(`${label}: unreachable`); // TypeScript exhaustiveness
}

export async function preClaimTask(client: any, taskId: number, agentName: string): Promise<boolean> {
	return enqueueLifecycle(async () => {
		recordLifecycleIntent({ taskId, action: "claim", owner: agentName, message: `Claiming task ${taskId}` });
		try {
			await withRetry(`preClaimTask(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "claim",
					task_id: taskId,
					agent_name: agentName,
				}),
			);
			clearLifecycleIntent(taskId, "claim");
			// Mailbox is best-effort — no retry needed
			client.callTool("commander_mailbox", {
				operation: "send",
				from_agent: agentName,
				to_agent: "commander",
				body: `Starting task ${taskId}`,
				message_type: "status",
				task_id: taskId,
			}, LIFECYCLE_TIMEOUT_MS).catch(() => {});
			return true;
		} catch {
			return false;
		}
	});
}

export async function postCompleteTask(client: any, taskId: number, agentName: string, summary: string): Promise<boolean> {
	return enqueueLifecycle(async () => {
		const finalMessage = `FINAL: ${summary || "Task completed."}`;
		recordLifecycleIntent({ taskId, action: "complete", owner: agentName, message: finalMessage });
		try {
			await withRetry(`postCompleteTask.comment(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "comment:add",
					task_id: taskId,
					body: finalMessage,
					type: "progress",
				}),
			);
			await withRetry(`postCompleteTask(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "complete",
					task_id: taskId,
					result: summary,
				}),
			);
			await callCommanderTask(client, { operation: "get", task_id: taskId }).catch(() => {});
			clearLifecycleIntent(taskId, "complete");
			// Mailbox is best-effort — no retry needed
			client.callTool("commander_mailbox", {
				operation: "send",
				from_agent: agentName,
				to_agent: "commander",
				body: `Task complete: ${summary}`,
				message_type: "status",
				task_id: taskId,
			}, LIFECYCLE_TIMEOUT_MS).catch(() => {});
			return true;
		} catch {
			return false;
		}
	});
}

export async function postFailTask(client: any, taskId: number, errorMessage: string): Promise<boolean> {
	return enqueueLifecycle(async () => {
		const finalMessage = `FAILED: ${errorMessage || "Agent exited with error."}`;
		recordLifecycleIntent({ taskId, action: "fail", message: finalMessage });
		try {
			await withRetry(`postFailTask.comment(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "comment:add",
					task_id: taskId,
					body: finalMessage,
					type: "error",
				}),
			);
			await withRetry(`postFailTask(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "fail",
					task_id: taskId,
					error_message: errorMessage,
				}),
			);
			await callCommanderTask(client, { operation: "get", task_id: taskId }).catch(() => {});
			clearLifecycleIntent(taskId, "fail");
			return true;
		} catch {
			return false;
		}
	});
}

export async function postCancelTask(client: any, taskId: number, reason: string): Promise<boolean> {
	return enqueueLifecycle(async () => {
		const finalMessage = `CANCELLED: ${reason || "Task cancelled."}`;
		recordLifecycleIntent({ taskId, action: "cancel", message: finalMessage });
		try {
			await withRetry(`postCancelTask.comment(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "comment:add",
					task_id: taskId,
					body: finalMessage,
					type: "progress",
				}),
			);
			await withRetry(`postCancelTask(${taskId})`, () =>
				callCommanderTask(client, {
					operation: "update",
					task_id: taskId,
					status: "cancelled",
				}),
			);
			await callCommanderTask(client, { operation: "get", task_id: taskId }).catch(() => {});
			clearLifecycleIntent(taskId, "cancel");
			return true;
		} catch {
			return false;
		}
	});
}
