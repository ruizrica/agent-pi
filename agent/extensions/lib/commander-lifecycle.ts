// ABOUTME: Commander lifecycle helpers for pre-claim, post-complete, and post-fail operations.
// ABOUTME: Shared by agent-team.ts and subagent-widget.ts to avoid duplicating MCP call logic.

export async function preClaimTask(client: any, taskId: number, agentName: string): Promise<void> {
	await client.callTool("commander_task", {
		operation: "claim",
		task_id: taskId,
		agent_name: agentName,
	});
	await client.callTool("commander_mailbox", {
		operation: "send",
		from_agent: agentName,
		to_agent: "commander",
		body: `Starting task ${taskId}`,
		message_type: "status",
		task_id: taskId,
	});
}

export async function postCompleteTask(client: any, taskId: number, agentName: string, summary: string): Promise<void> {
	await client.callTool("commander_task", {
		operation: "complete",
		task_id: taskId,
		result: summary,
	});
	await client.callTool("commander_mailbox", {
		operation: "send",
		from_agent: agentName,
		to_agent: "commander",
		body: `Task complete: ${summary}`,
		message_type: "status",
		task_id: taskId,
	});
}

export async function postFailTask(client: any, taskId: number, errorMessage: string): Promise<void> {
	await client.callTool("commander_task", {
		operation: "fail",
		task_id: taskId,
		error_message: errorMessage,
	});
}
