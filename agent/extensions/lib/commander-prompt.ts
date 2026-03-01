// ABOUTME: Pure function to build Commander Task Discipline system prompt for subagents.
// ABOUTME: Shared by agent-team.ts and subagent-widget.ts to avoid duplicating prompt logic.

export interface CommanderPromptOptions {
	agentName: string;
	taskId?: number;
	enableMailboxChat?: boolean;
	peerNames?: string[];
}

export function buildCommanderPrompt(opts: CommanderPromptOptions): string {
	const { agentName, taskId, enableMailboxChat, peerNames } = opts;
	const hasTask = taskId !== undefined;
	const idStr = hasTask ? String(taskId) : "<id>";

	let prompt = `\n\n## Commander Task Discipline
You are agent "${agentName}".${hasTask ? ` Your Commander task ID is ${taskId}.` : ""}
${hasTask ? `At START:
- Claim: commander_task { operation: "claim", task_id: ${idStr}, agent_name: "${agentName}" }
- Notify: commander_mailbox { operation: "send", from_agent: "${agentName}", to_agent: "commander", body: "Starting task ${idStr}", message_type: "status", task_id: ${idStr} }

During WORK:
- Log progress: commander_task { operation: "log", task_id: ${idStr}, message: "<progress>", level: "info" }
- For long tasks (>30s), send heartbeats: commander_orchestration { operation: "agent:heartbeat", agent_name: "${agentName}" }

On SUCCESS:
- Notify: commander_mailbox { operation: "send", from_agent: "${agentName}", to_agent: "commander", body: "Task complete: <summary>", message_type: "status", task_id: ${idStr} }
- Complete: commander_task { operation: "complete", task_id: ${idStr}, result: "<summary>" }

On FAILURE:
- Fail: commander_task { operation: "fail", task_id: ${idStr}, error_message: "<what went wrong>" }` : "No Commander task assigned. Commander tools are available if needed."}`;

	if (enableMailboxChat) {
		prompt += `\n\n## Inter-Agent Communication
You can message your fellow agents via commander_mailbox.`;
		if (peerNames && peerNames.length > 0) {
			prompt += ` Your peers are: ${peerNames.join(", ")}.`;
		}
		prompt += `
Be supportive and encouraging — warm but professional. Celebrate wins, offer help when you can.
Check your inbox periodically with commander_mailbox { operation: "inbox", agent_name: "${agentName}" }`;
	}

	return prompt;
}
