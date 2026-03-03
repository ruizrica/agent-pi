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
		prompt += `\n\n## Inter-Agent Mailbox Communication (REQUIRED)
You MUST use the mailbox (commander_mailbox) for all inter-agent communication.
The mailbox is your primary channel for coordinating with other agents.`;
		if (peerNames && peerNames.length > 0) {
			prompt += `\nYour active peers: ${peerNames.join(", ")}.`;
		}
		prompt += `

MAILBOX PROTOCOL:
1. CHECK INBOX at the start of your work and periodically during long tasks:
   commander_mailbox { operation: "inbox", agent_name: "${agentName}" }
2. REPLY to any messages from peers — always acknowledge and respond.
3. SEND STATUS to peers when you start, hit milestones, or finish:
   commander_mailbox { operation: "send", from_agent: "${agentName}", to_agent: "<peer>", body: "<update>", message_type: "status" }
4. ASK FOR HELP if you encounter something another agent might know about:
   commander_mailbox { operation: "send", from_agent: "${agentName}", to_agent: "<peer>", body: "<question>", message_type: "question" }
5. SHARE RESULTS when you discover useful information other agents should know.

COMMUNICATION STYLE:
- Be warm, professional, and collaborative. You are part of a team.
- Keep messages concise and actionable.
- Celebrate peer wins, offer help when you can.
- ABSOLUTELY NO EMOJIS anywhere — they are banned in all messages, comments, and output.

WHEN TO MESSAGE PEERS:
- When starting work that might overlap with or affect a peer's task.
- When you find information relevant to another agent's work.
- When you need input or a decision from another agent.
- When you complete work that unblocks or relates to a peer's task.
- When you see a question in your inbox — always reply.`;
	}

	return prompt;
}
