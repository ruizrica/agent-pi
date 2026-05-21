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
			mode: "auto",
			shouldSyncLocalTasksToCommander: true,
			reason: "Local tasks sync to Commander automatically, including WARDEN task lists.",
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

	return {
		mode: "auto",
		shouldSyncLocalTasksToCommander: true,
		reason: input.isSubagent && hasAssignedCommanderTask(input.commanderTaskId)
			? "Subagent local tasks sync to Commander automatically unless explicitly disabled."
			: "Local tasks sync to Commander automatically.",
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
		? `- Your assigned Commander task remains the parent board card for this work, and local \`tasks\` entries may also sync to Commander when local task sync is enabled. Do not create separate ad-hoc Commander tasks for progress, status, questions, coordination, or notes unless the user explicitly asks for durable follow-up work.`
		: `- Local \`tasks\` entries may sync to Commander when local task sync is enabled. Do not create separate ad-hoc Commander tasks for progress, status, questions, coordination, or notes; create a board task only for durable, executable follow-up work with a clear lifecycle owner.`;

	return `

## Commander Task Ownership — No Phantom Tasks
${assignedLine}
- Use \`bash\` running \`cmd mailbox send <to> "<subject>" "<body>" --type <kind>\` for cross-agent signals: status, discoveries, questions, blockers, handoffs, and worker_done/result messages.
- Use \`bash\` running \`cmd task comment <id> "<note>" --type progress\` (or \`--type info\`) for updates on an existing claimed/assigned task.
- Every Commander board task you create or claim is your responsibility. Before final output, it must be completed, failed, cancelled, or explicitly handed off with a current status and owner.
- Never leave pending/working tasks behind as placeholders. If the work is not actionable right now, send mailbox/status context instead of making a task.`;
}
