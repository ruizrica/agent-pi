// ABOUTME: Bridge extension that exposes Commander MCP tools as native Pi tools.
// ABOUTME: Spawns commander-mcp as a subprocess and proxies JSON-RPC calls over stdio.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { McpClient } from "./lib/mcp-client.ts";
import { createReadyGate, resolveGate, resetGate } from "./lib/commander-ready.ts";

// ── Configuration ───────────────────────────────────────────────────

const SERVER_PATH = "/Users/ricardo/Workshop/Github-Work/commander/services/commander-mcp/dist/server.js";
const SERVER_ENV: Record<string, string> = {
	COMMANDER_WS_URL: process.env.COMMANDER_WS_URL || "ws://localhost:9002",
	JIRA_URL: process.env.JIRA_URL || "",
	JIRA_EMAIL: process.env.JIRA_EMAIL || "",
	JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || "",
};

// ── Tool definitions ────────────────────────────────────────────────

const TOOLS: { name: string; label: string; description: string }[] = [
	{
		name: "commander_task",
		label: "Commander Task",
		description: `Unified task management - create, track, and execute work items.

OPERATIONS BY CATEGORY:

TASK CRUD:
- "create": Start new task (requires description, working_directory)
- "get": Get task details by task_id
- "update": Modify task fields
- "list": Find tasks with filters (status, agent_id, working_directory)

LIFECYCLE (state transitions):
- "claim": Start working on pending task (validates working_directory match)
- "complete": Mark success with result summary
- "fail": Mark failure with error_message

GROUPS (batch operations):
- "group:create": Create task group with multiple tasks (requires group_name, tasks[], initiative_summary, total_waves)
- "group:get": Get group details and progress percentage
- "group:list": List all groups (no group_id) or tasks in a group (with group_id)
- "group:update": Update wave progress and overall_status

COMMENTS & LOGS:
- "comment:add": Add progress/error/handoff comment (ALWAYS include agent_name!)
- "comment:list": View task comments
- "log": Add real-time dashboard log entry

POLICY:
- "policy:update": Modify task execution policy (Warden-compatible)

TASK WORKFLOW:
1. Create task → status='pending'
2. Claim task → status='working', validates working_directory
3. Complete/Fail → status='completed' or 'failed'

EXAMPLE - Create and claim a task:
{ "operation": "create", "description": "Fix auth bug in login.ts", "working_directory": "/project/src" }
{ "operation": "claim", "task_id": 123, "agent_name": "claude" }

EXAMPLE - Create task group:
{ "operation": "group:create", "group_name": "Auth Refactor", "initiative_summary": "Migrate JWT to OAuth", "total_waves": 3, "working_directory": "/project", "tasks": [{"description": "...", "task_prompt": "...", "dependency_order": 0, "context": "..."}] }`,
	},
	{
		name: "commander_session",
		label: "Commander Session",
		description: `Unified session and terminal management - track agents and UI state.

OPERATIONS BY CATEGORY:

SESSION MANAGEMENT:
- "create": Start new session (requires name)
- "get": Get session by session_id
- "list": List sessions (filter by working_directory, status)

TERMINAL OPERATIONS:
- "terminals:list": List active terminal processes (filter by cli_type, status)
- "pipe": Send text to terminal (requires terminal_session_id, data)

CLEANUP (housekeeping):
- "cleanup:status": Check stale session counts and get recommendation
- "cleanup:stale": Remove sessions older than min_age_hours (default 24h)
- "cleanup:terminate": End specific session by session_id
- "cleanup:self": Clean up calling agent's own session

FILE VIEWER (Commander UI):
- "file:open": Display file in floating window (requires file_path, supports line_range)
- "file:close": Close viewer by viewer_id

BEST PRACTICES FOR AGENTS:
1. At start of work: Call cleanup:status to check session health
2. If >10 stale sessions: Call cleanup:stale to clean up
3. When work is DONE: Call cleanup:self to clean up your own session

EXAMPLE - Cleanup workflow:
{ "operation": "cleanup:status" }
{ "operation": "cleanup:stale", "min_age_hours": 24 }`,
	},
	{
		name: "commander_workflow",
		label: "Commander Workflow",
		description: `Access development workflow documentation, templates, and standards.

WORKFLOWS: "kiro", "contextos"

OPERATIONS:
- "doc:get": Retrieve instruction document (requires workflow, doc_type)
- "doc:list": List available doc types for a workflow
- "doc:search": Search instructions by query (requires query)
- "template:get": Get template content (requires workflow, template_type)
- "template:list": List available templates for a workflow
- "steering:get": Get steering document (requires steering_type) - Kiro only
- "steering:list": List available steering documents - Kiro only

EXAMPLE - Get Kiro guidelines:
{ "operation": "doc:get", "workflow": "kiro", "doc_type": "guidelines" }`,
	},
	{
		name: "commander_spec",
		label: "Commander Spec",
		description: `Manage development specs - structured feature specifications for spec-driven development.

OPERATIONS:
- "create": Start new spec (requires name, description, project_id)
- "get": Get spec details by spec_id
- "list": List all specs
- "update": Modify spec status
- "shape": Initiate AI shaping (requires spec_id, feature_idea)
- "write": Generate requirements from shaped content (requires spec_id, shaped_content)
- "create_tasks": Convert spec to executable tasks (requires spec_id, selected_tasks[])

SPEC WORKFLOW:
1. CREATE → 2. SHAPE → 3. WRITE → 4. CREATE_TASKS

EXAMPLE - Start shaping a feature:
{ "operation": "shape", "spec_id": 1, "feature_idea": "Add OAuth login with Google and GitHub providers" }`,
	},
	{
		name: "commander_jira",
		label: "Commander Jira",
		description: `Interact with Jira issues - get details, update status, add comments, and link PRs.

OPERATIONS BY CATEGORY:

ISSUE OPERATIONS:
- "issue:get": Get issue details (requires issue_key)
- "issue:update": Update issue fields (requires issue_key, plus fields to update)
- "issue:search": Search using JQL (requires jql)

TRANSITION OPERATIONS:
- "transition:list": List available transitions for issue (requires issue_key)
- "transition:execute": Change issue status (requires issue_key + transition_id OR transition_name)

COMMENT OPERATIONS:
- "comment:add": Add comment to issue (requires issue_key, body)
- "comment:list": List issue comments (requires issue_key)

LINK OPERATIONS:
- "link:pr": Link PR to issue via formatted comment (requires issue_key, pr_url)

STATUS OPERATIONS:
- "status:check": Check Jira connection status

EXAMPLE - Start working on issue:
{ "operation": "issue:get", "issue_key": "PROJ-123" }
{ "operation": "transition:execute", "issue_key": "PROJ-123", "transition_name": "In Progress" }`,
	},
	{
		name: "commander_mailbox",
		label: "Commander Mailbox",
		description: `Inter-agent messaging and status broadcasting for Commander dashboard visibility.

IMPORTANT: ALL agents MUST send status updates at key milestones.

OPERATIONS:
- "send": Send a message (requires from_agent, to_agent, body)
- "inbox": Get inbox messages (requires agent_name)
- "outbox": Get sent messages (requires agent_name)
- "read": Mark message read (requires message_id)
- "read_all": Mark all read (requires agent_name)
- "thread": Get thread messages (requires thread_id)
- "unread_count": Get unread count (requires agent_name)
- "delete": Delete a message (requires message_id)

MESSAGE TYPES: status, question, result, error, dispatch, escalation, health_check, worker_done, merge_ready
PRIORITY: low, normal, high, urgent
BROADCAST GROUPS: @all, @builders, @scouts, @reviewers, @leads, @coordinators

EXAMPLE - Status update:
{ "operation": "send", "from_agent": "agent-task-42", "to_agent": "commander", "body": "Starting implementation", "message_type": "status", "task_id": 42 }`,
	},
	{
		name: "commander_orchestration",
		label: "Commander Orchestration",
		description: `Agent registry and orchestration for hierarchical multi-agent coordination.

OPERATIONS:
- "agent:register": Register a new agent (requires name, agent_type)
- "agent:deregister": Remove an agent (requires agent_id)
- "agent:list": List registered agents (optional: active_only)
- "agent:heartbeat": Record agent heartbeat (requires agent_id)
- "agent:hierarchy": Get agent hierarchy tree (optional: parent_agent_id)
- "agent:get_by_name": Find agent by name (requires name)
- "agent:find_capable": Find agents with a capability (requires capability)
- "agent:state": Update agent state (requires agent_id, state)
- "dispatch": Assign a task to an agent (requires agent_id, task_id)
- "health:check": Check for stale/zombie agents (optional: threshold_secs)

HIERARCHY RULES:
- Coordinator (depth 0) → Leads (depth 1) → Workers (depth 2)
- Max 25 concurrent agents
AGENT STATES: idle, spawning, running, working, stuck, done, stopped, dead

EXAMPLE:
{ "operation": "agent:register", "name": "worker-1", "agent_type": "claude", "role": "worker" }
{ "operation": "dispatch", "agent_id": 1, "task_id": 42 }`,
	},
	{
		name: "commander_dependency",
		label: "Commander Dependency",
		description: `Task dependency graph management for coordinating execution order.

OPERATIONS:
- "add": Create dependency between tasks (requires from_task_id, to_task_id)
- "remove": Delete dependency by ID (requires dependency_id)
- "remove_by_edge": Delete dependency by edge (requires from_task_id, to_task_id)
- "get": Get all dependencies for a task (requires task_id)
- "blockers": Get tasks that block this task (requires task_id)
- "dependents": Get tasks that depend on this task (requires task_id)
- "ready_tasks": Get tasks ready to work on (no open blocking deps)
- "blocked_tasks": Get tasks currently blocked
- "graph": Get full dependency graph (optional: group_id)
- "rebuild_cache": Rebuild transitive blocking cache
- "cached_blockers": Get cached blockers for a task (requires task_id)

DEPENDENCY TYPES: blocks, parent_child, waits_for, related, conditional_blocks

EXAMPLE - Create blocking dependency:
{ "operation": "add", "from_task_id": 1, "to_task_id": 2, "dependency_type": "blocks" }

EXAMPLE - Find ready work:
{ "operation": "ready_tasks" }`,
	},
];

// ── Per-tool schemas ────────────────────────────────────────────────
// Each tool gets a schema that explicitly defines its parameters so that
// the model knows what to send. additionalProperties remains true for
// forward-compatibility with new fields.

const TaskParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	// CRUD
	description: Type.Optional(Type.String({ description: "Task description (for create)" })),
	working_directory: Type.Optional(Type.String({ description: "Working directory path (for create, list)" })),
	task_id: Type.Optional(Type.Number({ description: "Task ID (for get, update, claim, complete, fail)" })),
	status: Type.Optional(Type.String({ description: "Task status: pending, working, completed, failed, cancelled (for update, list)" })),
	agent_id: Type.Optional(Type.Number({ description: "Agent ID (for list filter)" })),
	// Lifecycle
	agent_name: Type.Optional(Type.String({ description: "Agent name (for claim)" })),
	result: Type.Optional(Type.String({ description: "Result summary (for complete)" })),
	error_message: Type.Optional(Type.String({ description: "Error message (for fail)" })),
	// Groups
	group_name: Type.Optional(Type.String({ description: "Group name (for group:create)" })),
	group_id: Type.Optional(Type.Number({ description: "Group ID (for group:get, group:list, group:update)" })),
	initiative_summary: Type.Optional(Type.String({ description: "Initiative summary (for group:create)" })),
	total_waves: Type.Optional(Type.Number({ description: "Total waves (for group:create)" })),
	tasks: Type.Optional(Type.Array(Type.Object({
		description: Type.String(),
		task_prompt: Type.Optional(Type.String()),
		dependency_order: Type.Optional(Type.Number()),
		context: Type.Optional(Type.String()),
	}), { description: "Array of task definitions (for group:create)" })),
	overall_status: Type.Optional(Type.String({ description: "Overall group status (for group:update)" })),
	// Comments & Logs
	body: Type.Optional(Type.String({ description: "Comment body (for comment:add)" })),
	message: Type.Optional(Type.String({ description: "Log message (for log)" })),
	// Policy
	policy: Type.Optional(Type.Object({}, { additionalProperties: true, description: "Policy object (for policy:update)" })),
}, { additionalProperties: true });

const SessionParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	name: Type.Optional(Type.String({ description: "Session name (for create)" })),
	session_id: Type.Optional(Type.Number({ description: "Session ID (for get, cleanup:terminate)" })),
	working_directory: Type.Optional(Type.String({ description: "Working directory filter (for list)" })),
	status: Type.Optional(Type.String({ description: "Status filter (for list)" })),
	// Terminal
	terminal_session_id: Type.Optional(Type.Number({ description: "Terminal session ID (for pipe)" })),
	cli_type: Type.Optional(Type.String({ description: "CLI type filter (for terminals:list)" })),
	data: Type.Optional(Type.String({ description: "Text to send to terminal (for pipe)" })),
	// File viewer
	file_path: Type.Optional(Type.String({ description: "File path to open (for file:open)" })),
	line_range: Type.Optional(Type.String({ description: "Line range like '45-60' (for file:open)" })),
	viewer_id: Type.Optional(Type.Number({ description: "Viewer ID (for file:close)" })),
	// Cleanup
	min_age_hours: Type.Optional(Type.Number({ description: "Minimum age in hours for stale cleanup (for cleanup:stale)" })),
}, { additionalProperties: true });

const WorkflowParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	workflow: Type.Optional(Type.String({ description: "Workflow name: kiro, contextos (for doc:get, doc:list, template:get, template:list)" })),
	doc_type: Type.Optional(Type.String({ description: "Document type (for doc:get)" })),
	query: Type.Optional(Type.String({ description: "Search query (for doc:search)" })),
	template_type: Type.Optional(Type.String({ description: "Template type (for template:get)" })),
	steering_type: Type.Optional(Type.String({ description: "Steering document type (for steering:get)" })),
}, { additionalProperties: true });

const SpecParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	spec_id: Type.Optional(Type.Number({ description: "Spec ID (for get, update, shape, write, create_tasks)" })),
	name: Type.Optional(Type.String({ description: "Spec name (for create)" })),
	description: Type.Optional(Type.String({ description: "Spec description (for create)" })),
	project_id: Type.Optional(Type.Number({ description: "Project ID (for create)" })),
	feature_idea: Type.Optional(Type.String({ description: "Feature idea text (for shape)" })),
	shaped_content: Type.Optional(Type.String({ description: "Shaped content (for write)" })),
	selected_tasks: Type.Optional(Type.Array(Type.Unknown(), { description: "Selected tasks to create (for create_tasks)" })),
}, { additionalProperties: true });

const JiraParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	issue_key: Type.Optional(Type.String({ description: "Jira issue key like PROJ-123 (for most operations)" })),
	jql: Type.Optional(Type.String({ description: "JQL query string (for issue:search)" })),
	body: Type.Optional(Type.String({ description: "Comment body (for comment:add)" })),
	pr_url: Type.Optional(Type.String({ description: "PR URL to link (for link:pr)" })),
	transition_id: Type.Optional(Type.Number({ description: "Transition ID (for transition:execute)" })),
	transition_name: Type.Optional(Type.String({ description: "Transition name (for transition:execute)" })),
}, { additionalProperties: true });

const MailboxParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	from_agent: Type.Optional(Type.String({ description: "Sender agent name (for send)" })),
	to_agent: Type.Optional(Type.String({ description: "Recipient agent name or broadcast group (for send)" })),
	agent_name: Type.Optional(Type.String({ description: "Agent name (for inbox, outbox, read_all, unread_count)" })),
	body: Type.Optional(Type.String({ description: "Message body (for send)" })),
	message_type: Type.Optional(Type.String({ description: "Message type: status, question, result, error, dispatch, escalation (for send)" })),
	message_id: Type.Optional(Type.Number({ description: "Message ID (for read, delete)" })),
	thread_id: Type.Optional(Type.Number({ description: "Thread ID (for thread)" })),
	task_id: Type.Optional(Type.Number({ description: "Related task ID (for send)" })),
	priority: Type.Optional(Type.String({ description: "Priority: low, normal, high, urgent (for send)" })),
}, { additionalProperties: true });

const OrchestrationParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	name: Type.Optional(Type.String({ description: "Agent name (for agent:register, agent:get_by_name)" })),
	agent_type: Type.Optional(Type.String({ description: "Agent type (for agent:register)" })),
	role: Type.Optional(Type.String({ description: "Agent role: coordinator, lead, worker (for agent:register)" })),
	agent_id: Type.Optional(Type.Number({ description: "Agent ID (for agent:deregister, agent:heartbeat, agent:state, dispatch)" })),
	agent_name: Type.Optional(Type.String({ description: "Agent name for heartbeat (for agent:heartbeat)" })),
	task_id: Type.Optional(Type.Number({ description: "Task ID (for dispatch)" })),
	state: Type.Optional(Type.String({ description: "Agent state: idle, running, working, stuck, done, stopped (for agent:state)" })),
	capability: Type.Optional(Type.String({ description: "Capability to search for (for agent:find_capable)" })),
	parent_agent_id: Type.Optional(Type.Number({ description: "Parent agent ID (for agent:hierarchy)" })),
	active_only: Type.Optional(Type.Boolean({ description: "Filter to active agents only (for agent:list)" })),
	threshold_secs: Type.Optional(Type.Number({ description: "Staleness threshold in seconds (for health:check)" })),
}, { additionalProperties: true });

const DependencyParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
	task_id: Type.Optional(Type.Number({ description: "Task ID (for get, blockers, dependents, cached_blockers)" })),
	from_task_id: Type.Optional(Type.Number({ description: "Source task ID (for add, remove_by_edge)" })),
	to_task_id: Type.Optional(Type.Number({ description: "Target task ID (for add, remove_by_edge)" })),
	dependency_id: Type.Optional(Type.Number({ description: "Dependency ID (for remove)" })),
	dependency_type: Type.Optional(Type.String({ description: "Dependency type: blocks, parent_child, waits_for, related (for add)" })),
	group_id: Type.Optional(Type.Number({ description: "Group ID (for graph)" })),
}, { additionalProperties: true });

// Map tool names to their specific parameter schemas
const TOOL_PARAMS: Record<string, ReturnType<typeof Type.Object>> = {
	commander_task: TaskParams,
	commander_session: SessionParams,
	commander_workflow: WorkflowParams,
	commander_spec: SpecParams,
	commander_jira: JiraParams,
	commander_mailbox: MailboxParams,
	commander_orchestration: OrchestrationParams,
	commander_dependency: DependencyParams,
};

// ── Extension entry point ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const client = new McpClient(SERVER_PATH, SERVER_ENV);
	const g = globalThis as any;
	let healthCheckTimer: ReturnType<typeof setInterval> | undefined;

	// ── Ready gate — queues ops until probe resolves ────────────────
	const gate = createReadyGate();
	g.__piCommanderGate = gate;
	g.__piCommanderOnReady = g.__piCommanderOnReady || [];

	// Helper: drain queued ops after gate resolves to available
	function drainGateQueue(ops: { fn: (client: any) => Promise<void>; label: string }[]): void {
		for (const op of ops) {
			op.fn(client).catch(() => {});
		}
	}

	// Helper: drain onReady callbacks registered by other extensions
	function drainOnReadyCallbacks(): void {
		const cbs: Array<() => void> = g.__piCommanderOnReady || [];
		g.__piCommanderOnReady = [];
		for (const cb of cbs) {
			try { cb(); } catch {}
		}
	}

	// Helper: ensure connected before calling
	async function ensureConnected(): Promise<void> {
		if (!client.isConnected()) {
			await client.connect();
		}
	}

	// Register all 8 tools
	for (const tool of TOOLS) {
		pi.registerTool({
			name: tool.name,
			label: tool.label,
			description: tool.description,
			parameters: TOOL_PARAMS[tool.name] || TaskParams,

			async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
				try {
					await ensureConnected();
					const isLightweight = tool.name === "commander_mailbox";
					const timeoutMs = isLightweight ? 15000 : undefined;
					const result = await client.callTool(tool.name, params as Record<string, unknown>, timeoutMs);
					return result;
				} catch (err: any) {
					return {
						content: [{ type: "text" as const, text: `Commander error: ${err.message}` }],
					};
				}
			},
		});
	}

	// Lifecycle events
	pi.on("session_start", async (_event, ctx) => {
		// Fire-and-forget probe — don't block session_start chain
		// (other extensions like footer.ts must not wait for this)
		probeCommander(ctx).catch(() => {});
	});

	async function probeCommander(ctx: any) {
		try {
			await client.connect();
			// Lightweight probe — 3s timeout
			await client.callTool("commander_session", { operation: "list" }, 3000);
			g.__piCommanderAvailable = true;
			g.__piCommanderClient = client;
			ctx.ui.setStatus("Commander: connected", "commander");

			// Resolve gate — drain any ops queued while we were probing
			const queued = resolveGate(gate, true);
			drainGateQueue(queued);
			drainOnReadyCallbacks();

			// Periodic health check (60s)
			healthCheckTimer = setInterval(async () => {
				try {
					if (!client.isConnected()) {
						await client.connect();
					}
					await client.callTool("commander_session", { operation: "list" }, 3000);
					if (!g.__piCommanderAvailable) {
						g.__piCommanderAvailable = true;
						g.__piCommanderClient = client;
						ctx.ui.setStatus("Commander: connected", "commander");
						// Recovery — resolve gate if it was reset during offline
						if (gate.state !== "available") {
							const queued = resolveGate(gate, true);
							drainGateQueue(queued);
							drainOnReadyCallbacks();
						}
					}
				} catch {
					g.__piCommanderAvailable = false;
					ctx.ui.setStatus("Commander: offline", "commander");
					// Reset gate so ops queue again until recovery
					if (gate.state === "available") {
						resetGate(gate);
					}
				}
			}, 60_000);
		} catch {
			g.__piCommanderAvailable = false;
			ctx.ui.setStatus("Commander: offline", "commander");
			resolveGate(gate, false);
		}
	}

	pi.on("session_shutdown", async () => {
		if (healthCheckTimer) {
			clearInterval(healthCheckTimer);
			healthCheckTimer = undefined;
		}
		g.__piCommanderAvailable = false;
		resetGate(gate);
		client.disconnect();
	});
}
