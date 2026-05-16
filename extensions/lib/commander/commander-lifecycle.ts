// ABOUTME: Commander lifecycle helpers for pre-claim, post-complete, and post-fail operations.
// ABOUTME: Shared by agent-team.ts and subagent-widget.ts to avoid duplicating MCP call logic.
// ABOUTME: Includes single retry with 2s delay and error logging for reliability.

const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 2;

/** Helper: retry an async operation up to MAX_ATTEMPTS times with RETRY_DELAY_MS between attempts. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			return await fn();
		} catch (err: any) {
			const msg = err?.message || String(err);
			console.error(`[commander-lifecycle] ${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${msg}`);
			if (attempt < MAX_ATTEMPTS) {
				await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
			} else {
				throw err; // re-throw on final attempt so callers can handle
			}
		}
	}
	throw new Error(`${label}: unreachable`); // TypeScript exhaustiveness
}

export async function preClaimTask(client: any, taskId: number, agentName: string): Promise<boolean> {
	try {
		await withRetry(`preClaimTask(${taskId})`, () =>
			client.callTool("commander_task", {
				operation: "claim",
				task_id: taskId,
				agent_name: agentName,
			}),
		);
		// Mailbox is best-effort — no retry needed
		client.callTool("commander_mailbox", {
			operation: "send",
			from_agent: agentName,
			to_agent: "commander",
			body: `Starting task ${taskId}`,
			message_type: "status",
			task_id: taskId,
		}).catch(() => {});
		return true;
	} catch {
		return false;
	}
}

export async function postCompleteTask(client: any, taskId: number, agentName: string, summary: string): Promise<boolean> {
	try {
		await withRetry(`postCompleteTask(${taskId})`, () =>
			client.callTool("commander_task", {
				operation: "complete",
				task_id: taskId,
				result: summary,
			}),
		);
		// Mailbox is best-effort — no retry needed
		client.callTool("commander_mailbox", {
			operation: "send",
			from_agent: agentName,
			to_agent: "commander",
			body: `Task complete: ${summary}`,
			message_type: "status",
			task_id: taskId,
		}).catch(() => {});
		return true;
	} catch {
		return false;
	}
}

export async function postFailTask(client: any, taskId: number, errorMessage: string): Promise<boolean> {
	try {
		await withRetry(`postFailTask(${taskId})`, () =>
			client.callTool("commander_task", {
				operation: "fail",
				task_id: taskId,
				error_message: errorMessage,
			}),
		);
		return true;
	} catch {
		return false;
	}
}
