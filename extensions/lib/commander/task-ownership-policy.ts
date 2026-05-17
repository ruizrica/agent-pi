// ABOUTME: Shared Commander task ownership policy for prompts and local-task sync gating.
// ABOUTME: Keeps status/coordination in mailbox/comments and prevents subagent task-board sprawl.

export type CommanderTaskSyncMode = "auto" | "local-only" | "assigned-only" | "disabled" | "external";

export interface CommanderTaskSyncPolicyInput {
	isSubagent?: boolean;
	commanderTaskId?: string | number;
	syncMode?: string;
	externalSyncActive?: boolean;
}

export interface CommanderTaskSyncPolicy {
	mode: CommanderTaskSyncMode;
	shouldSyncLocalTasksToCommander: boolean;
	reason: string;
	suppressedMessage?: string;
}

function hasAssignedCommanderTask(taskId: string | number | undefined): boolean {
	return taskId !== undefined && String(taskId).trim().length > 0;
}

export function resolveCommanderTaskSyncPolicy(input: CommanderTaskSyncPolicyInput = {}): CommanderTaskSyncPolicy {
	if (input.externalSyncActive) {
		return {
			mode: "external",
			shouldSyncLocalTasksToCommander: false,
			reason: "External Commander sync owns this task list.",
			suppressedMessage: "Commander board sync is managed by the external plan/group owner.",
		};
	}

	const requested = String(input.syncMode || "").trim().toLowerCase();
	if (["disabled", "off", "none"].includes(requested)) {
		return {
			mode: "disabled",
			shouldSyncLocalTasksToCommander: false,
			reason: "Commander local-task sync is disabled by environment policy.",
			suppressedMessage: "Commander board sync suppressed by task sync policy.",
		};
	}

	if (["local-only", "local", "warden", "warden-only"].includes(requested)) {
		return {
			mode: "local-only",
			shouldSyncLocalTasksToCommander: false,
			reason: "Local WARDEN task lists are bookkeeping and are not Commander board cards.",
			suppressedMessage: "Local WARDEN task list not promoted to Commander; create durable Commander cards explicitly with cmd task add and lifecycle ownership.",
		};
	}

	if (["assigned-only", "assigned", "parent", "parent-managed"].includes(requested)) {
		return {
			mode: "assigned-only",
			shouldSyncLocalTasksToCommander: false,
			reason: "This agent has a parent-managed Commander task; child local tasks must remain local-only.",
			suppressedMessage: "Commander board sync suppressed for subagent; assigned Commander task is managed by parent.",
		};
	}

	if (["auto", "local-tasks", "sync", "on", "true"].includes(requested)) {
		return {
			mode: "auto",
			shouldSyncLocalTasksToCommander: true,
			reason: "Local tasks sync to Commander automatically.",
		};
	}

	if (input.isSubagent && hasAssignedCommanderTask(input.commanderTaskId)) {
		return {
			mode: "assigned-only",
			shouldSyncLocalTasksToCommander: false,
			reason: "Subagent local tasks are bookkeeping; the assigned Commander task represents the board work.",
			suppressedMessage: "Commander board sync suppressed for subagent; assigned Commander task is managed by parent.",
		};
	}

	return {
		mode: "local-only",
		shouldSyncLocalTasksToCommander: false,
		reason: "Local WARDEN task lists are bookkeeping and are not Commander board cards by default.",
		suppressedMessage: "Local WARDEN task list not promoted to Commander; create durable Commander cards explicitly with cmd task add and lifecycle ownership.",
	};
}

export function resolveCommanderTaskSyncPolicyFromEnv(
	env: Record<string, string | undefined>,
	externalSyncActive = false,
): CommanderTaskSyncPolicy {
	return resolveCommanderTaskSyncPolicy({
		externalSyncActive,
		isSubagent: env.PI_SUBAGENT === "1" || env.PI_SUBAGENT === "true",
		commanderTaskId: env.PI_COMMANDER_TASK_ID,
		syncMode: env.PI_COMMANDER_TASK_SYNC_MODE,
	});
}

export interface CommanderTaskOwnershipPromptOptions {
	agentName?: string;
	taskId?: number;
	hasAssignedTask?: boolean;
}

export function buildCommanderTaskOwnershipPolicy(opts: CommanderTaskOwnershipPromptOptions = {}): string {
	const hasAssignedTask = opts.hasAssignedTask ?? opts.taskId !== undefined;
	const assignedLine = hasAssignedTask
		? `- Your assigned Commander task is the board card for this work. Do not create additional Commander board tasks for progress, status, questions, coordination, or notes unless the user explicitly asks you to create durable follow-up work.`
		: `- Do not create Commander board tasks for progress, status, questions, coordination, or notes. Create a board task only for durable, executable follow-up work with a clear lifecycle owner.`;

	return `

## Commander Task Ownership — No Phantom Tasks
${assignedLine}
- Use \`commander_mailbox\` for cross-agent signals: status, discoveries, questions, blockers, handoffs, and worker_done/result messages.
- Use \`commander_task comment:add\` or \`commander_task log\` for updates on an existing claimed/assigned task.
- Every Commander board task you create or claim is your responsibility. Before final output, it must be completed, failed, cancelled, or explicitly handed off with a current status and owner.
- Never leave pending/working tasks behind as placeholders. If the work is not actionable right now, send mailbox/status context instead of making a task.`;
}
