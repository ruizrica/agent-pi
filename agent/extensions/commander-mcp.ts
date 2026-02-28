// ABOUTME: Bridge extension that exposes Commander MCP tools as native Pi tools.
// ABOUTME: Spawns commander-mcp as a subprocess and proxies JSON-RPC calls over stdio.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { McpClient } from "./lib/mcp-client.ts";

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

// ── Shared schema ───────────────────────────────────────────────────

const ToolParams = Type.Object({
	operation: Type.String({ description: "Operation to perform" }),
}, { additionalProperties: true });

// ── Extension entry point ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const client = new McpClient(SERVER_PATH, SERVER_ENV);
	const g = globalThis as any;
	let healthCheckTimer: ReturnType<typeof setInterval> | undefined;

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
			parameters: ToolParams,

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
					}
				} catch {
					g.__piCommanderAvailable = false;
					ctx.ui.setStatus("Commander: offline", "commander");
				}
			}, 60_000);
		} catch {
			g.__piCommanderAvailable = false;
			ctx.ui.setStatus("Commander: offline", "commander");
		}
	}

	pi.on("session_shutdown", async () => {
		if (healthCheckTimer) {
			clearInterval(healthCheckTimer);
			healthCheckTimer = undefined;
		}
		g.__piCommanderAvailable = false;
		client.disconnect();
	});
}
