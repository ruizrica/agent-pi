// ABOUTME: Task discipline extension that gates agent tools until tasks are defined.
// ABOUTME: Three-state lifecycle (idle/inprogress/done) with widget display and task validation.
/**
 * Tasks Extension — Task discipline for the agent
 *
 * A task-driven discipline extension. The agent MUST define what it's going
 * to do (via `tasks add`) before it can use any other tools. On agent
 * completion, if tasks remain incomplete, the agent gets nudged to continue
 * or mark them done.
 *
 * Three-state lifecycle:  idle → inprogress → done
 *
 * Each list has a title and description that give the tasks a theme.
 * Use `new-list` to start a fresh list. `clear` wipes tasks with user confirm.
 *
 * UI surfaces:
 * - Widget:  prominent "current task" display (the inprogress task)
 * - Status:  compact summary in the status line
 * - /tasks:  interactive overlay with full task details
 *
 * Usage: pi -e extensions/tasks.ts
 */

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import {
	localToCommander,
	parseCommanderTaskId,
	lookupMapping,
	addMapping,
	removeMapping,
	clearMappings,
	emptySyncState,
	shouldCreateGroup,
	isExternalSyncActive,
	markGroupCreationInFlight,
	parseGroupCreateResult,
	buildGroupCreatePayload,
	applyGroupCreateResult,
	updateMappingStatus,
	type SyncState,
} from "./lib/commander-sync.ts";
import { shouldConfirmNewList } from "./lib/tasks-confirm.ts";
import { stripLeadingNumber } from "./lib/task-list-render.ts";
import { enqueueOrExecute } from "./lib/commander-ready.ts";
import { addRetry } from "./lib/commander-tracker.ts";

// ── Types ──────────────────────────────────────────────────────────────

type TaskStatus = "idle" | "inprogress" | "done";

interface Task {
	id: number;
	text: string;
	status: TaskStatus;
}

interface TasksDetails {
	action: string;
	tasks: Task[];
	nextId: number;
	listTitle?: string;
	listDescription?: string;
	error?: string;
	syncState?: SyncState;
}

const TasksParams = Type.Object({
	action: StringEnum(["new-list", "add", "toggle", "remove", "update", "list", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Task text (for add/update), or list title (for new-list)" })),
	texts: Type.Optional(Type.Array(Type.String(), { description: "Multiple task texts (for add). Use this to batch-add several tasks at once." })),
	description: Type.Optional(Type.String({ description: "List description (for new-list)" })),
	id: Type.Optional(Type.Number({ description: "Task ID (for toggle/remove/update)" })),
});

// ── Status helpers ─────────────────────────────────────────────────────

const STATUS_ICON: Record<TaskStatus, string> = { idle: "-", inprogress: "*", done: "x" };
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { idle: "inprogress", inprogress: "done", done: "idle" };
const STATUS_LABEL: Record<TaskStatus, string> = { idle: "idle", inprogress: "in progress", done: "done" };

export interface CurrentTaskInfo { id: number; text: string; commanderTaskId?: number }
export interface TaskListInfo {
	tasks: { id: number; text: string; status: TaskStatus }[];
	title?: string;
	remaining: number;
	total: number;
}

const g = globalThis as any;
function publishCurrentTask(tasks: Task[], sync: SyncState) {
	const cur = tasks.find(t => t.status === "inprogress");
	g.__piCurrentTask = cur ? { id: cur.id, text: cur.text, commanderTaskId: lookupMapping(sync, cur.id) } as CurrentTaskInfo : null;

	const remaining = tasks.filter(t => t.status !== "done").length;
	g.__piTaskList = {
		tasks: tasks.map(t => ({ id: t.id, text: t.text, status: t.status })),
		remaining,
		total: tasks.length,
		__syncState: sync,
	} as TaskListInfo;
}

// ── /tasks overlay component ───────────────────────────────────────────

class TasksListComponent {
	private tasks: Task[];
	private title: string | undefined;
	private desc: string | undefined;
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(tasks: Task[], title: string | undefined, desc: string | undefined, theme: Theme, onClose: () => void) {
		this.tasks = tasks;
		this.title = title;
		this.desc = desc;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const heading = this.title
			? th.fg("accent", ` ${this.title} `)
			: th.fg("accent", " Tasks ");
		const headingLen = this.title ? this.title.length + 2 : 8;
		lines.push(truncateToWidth(
			th.fg("borderMuted", "─".repeat(3)) + heading +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - 3 - headingLen))),
			width,
		));

		if (this.desc) {
			lines.push(truncateToWidth(`  ${th.fg("muted", this.desc)}`, width));
		}
		lines.push("");

		if (this.tasks.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No tasks yet. Ask the agent to add some!")}`, width));
		} else {
			const done = this.tasks.filter((t) => t.status === "done").length;
			const active = this.tasks.filter((t) => t.status === "inprogress").length;
			const idle = this.tasks.filter((t) => t.status === "idle").length;

			lines.push(truncateToWidth(
				"  " +
				th.fg("success", `${done} done`) + th.fg("dim", "  ") +
				th.fg("accent", `${active} active`) + th.fg("dim", "  ") +
				th.fg("muted", `${idle} idle`),
				width,
			));
			lines.push("");

			for (const task of this.tasks) {
				const icon = task.status === "done"
					? th.fg("success", STATUS_ICON.done)
					: task.status === "inprogress"
						? th.fg("accent", STATUS_ICON.inprogress)
						: th.fg("dim", STATUS_ICON.idle);
				const id = th.fg("accent", `#${task.id}`);
				const displayText = stripLeadingNumber(task.text);
				const text = task.status === "done"
					? th.fg("dim", displayText)
					: task.status === "inprogress"
						? th.fg("success", displayText)
						: th.fg("muted", displayText);
				lines.push(truncateToWidth(`  ${icon} ${id} ${text}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ── Extension entry point ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let tasks: Task[] = [];
	let nextId = 1;
	let listTitle: string | undefined;
	let listDescription: string | undefined;
	let nudgedThisCycle = false;
	let syncState: SyncState = emptySyncState();

	// ── Commander sync (gate-aware) ─────────────────────────────────────

	function syncToCommander(label: string, fn: (client: any) => Promise<void>): void {
		const g = globalThis as any;
		const gate = g.__piCommanderGate;
		if (!gate) return; // commander-mcp not loaded
		const wrappedFn = async (client: any) => {
			try { await fn(client); }
			catch {
				const tracker = g.__piCommanderTracker;
				if (tracker?._state) {
					tracker._state = addRetry(tracker._state, label, fn);
				}
			}
		};
		enqueueOrExecute(gate, { fn: wrappedFn, label }, g.__piCommanderClient);
	}

	// ── Snapshot for details ───────────────────────────────────────────

	const makeDetails = (action: string, error?: string): TasksDetails => ({
		action,
		tasks: [...tasks],
		nextId,
		listTitle,
		listDescription,
		syncState: { ...syncState, mappings: [...syncState.mappings] },
		...(error ? { error } : {}),
	});

	// ── UI refresh ─────────────────────────────────────────────────────

	const refreshWidget = (_ctx: ExtensionContext) => {
		publishCurrentTask(tasks, syncState);
	};

	const refreshUI = (ctx: ExtensionContext) => {
		const syncIndicator = (globalThis as any).__piCommanderGate?.state === "available" ? "(synced)" : "(local)";
		if (tasks.length === 0) {
			ctx.ui.setStatus(`Tasks: none ${syncIndicator}`, "tasks");
		} else {
			const remaining = tasks.filter((t) => t.status !== "done").length;
			const label = listTitle ? listTitle : "Tasks";
			ctx.ui.setStatus(`${label}: ${tasks.length} tasks (${remaining} remaining) ${syncIndicator}`, "tasks");
		}

		refreshWidget(ctx);
		if (g.__piTaskList) g.__piTaskList.title = listTitle;
		ctx.ui.setWidget("tasks-list", undefined);
	};

	// ── State reconstruction from session ──────────────────────────────

	const reconstructState = (ctx: ExtensionContext) => {
		tasks = [];
		nextId = 1;
		listTitle = undefined;
		listDescription = undefined;
		syncState = emptySyncState();

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "toolResult" || msg.toolName !== "tasks") continue;

			const details = msg.details as TasksDetails | undefined;
			if (details) {
				tasks = details.tasks;
				nextId = details.nextId;
				listTitle = details.listTitle;
				listDescription = details.listDescription;
				if (details.syncState) {
					syncState = { ...details.syncState, groupCreationInFlight: false };
				}
			}
		}

		refreshUI(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		reconstructState(ctx);
	});
	pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	// ── Blocking gate ──────────────────────────────────────────────────

	pi.on("tool_call", async (event, _ctx) => {
		// Sub-agents manage their own task discipline — don't gate them
		if (process.env.PI_SUBAGENT === "1") return { block: false };
		if (event.toolName === "tasks") return { block: false };
		// Communication, orchestration, dispatcher, and Commander MCP tools bypass the gate
		if (["dispatch_agent", "dispatch_agents", "ask_user", "run_chain", "advance_phase", "pipeline_status"].includes(event.toolName)) return { block: false };
		if (event.toolName.startsWith("commander_")) return { block: false };

		// Allow read-only exploration without task ceremony
		const readOnlyTools = ["read", "grep", "find", "ls", "glob"];
		if (readOnlyTools.includes(event.toolName)) return { block: false };

		const pending = tasks.filter((t) => t.status !== "done");
		const active = tasks.filter((t) => t.status === "inprogress");

		if (tasks.length === 0) {
			return {
				block: true,
				reason: "No tasks defined. You MUST use `tasks new-list` or `tasks add` to define your tasks before using any other tools. Plan your work first!",
			};
		}
		if (pending.length === 0) {
			return {
				block: true,
				reason: "All tasks are done. You MUST use `tasks add` for new tasks or `tasks new-list` to start a fresh list before using any other tools.",
			};
		}
		if (active.length === 0) {
			return {
				block: true,
				reason: "No task is in progress. You MUST use `tasks toggle` to mark a task as inprogress before doing any work.",
			};
		}

		return { block: false };
	});

	// ── Auto-nudge on agent_end ────────────────────────────────────────

	pi.on("agent_end", async (_event, _ctx) => {
		const incomplete = tasks.filter((t) => t.status !== "done");
		if (incomplete.length === 0 || nudgedThisCycle) return;

		nudgedThisCycle = true;

		const taskList = incomplete
			.map((t) => `  ${STATUS_ICON[t.status]} #${t.id} [${STATUS_LABEL[t.status]}]: ${t.text}`)
			.join("\n");

		pi.sendMessage(
			{
				customType: "task-validation",
				content: `You still have ${incomplete.length} incomplete task(s):\n\n${taskList}\n\nEither continue working on them or mark them done with \`tasks toggle\`. Don't stop until it's done!`,
				display: true,
			},
			{ triggerTurn: true },
		);
	});

	pi.on("input", async () => {
		nudgedThisCycle = false;
		return { action: "continue" as const };
	});

	// ── Register tasks tool ────────────────────────────────────────────

	pi.registerTool({
		name: "tasks",
		label: "Tasks",
		description:
			"Manage your task list. You MUST add tasks before using any other tools. " +
			"Actions: new-list (text=title, description), add (text or texts[] for batch), toggle (id) — cycles idle→inprogress→done, remove (id), update (id + text), list, clear. " +
			"Always toggle a task to inprogress before starting work on it, and to done when finished. " +
			"Use new-list to start a themed list with a title and description. " +
			"IMPORTANT: If the user's new request does not fit the current list's theme, use clear to wipe the slate and new-list to start fresh.",
		parameters: TasksParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			switch (params.action) {
				case "new-list": {
					if (!params.text) {
						return {
							content: [{ type: "text" as const, text: "Error: text (title) required for new-list" }],
							details: makeDetails("new-list", "text required"),
						};
					}

					// Only confirm if incomplete tasks exist; finished lists clear silently
					if (shouldConfirmNewList(tasks, listTitle)) {
						const confirmed = await ctx.ui.confirm(
							"Start a new list?",
							`This will replace${listTitle ? ` "${listTitle}"` : " the current list"} (${tasks.length} task(s)). Continue?`,
							{ timeout: 30000 },
						);
						if (!confirmed) {
							return {
								content: [{ type: "text" as const, text: "New list cancelled by user." }],
								details: makeDetails("new-list", "cancelled"),
							};
						}
					}

					// Cancel any previously synced tasks before resetting
					if (syncState.mappings.length > 0) {
						syncToCommander("cancel-old-list", async (client) => {
							for (const m of syncState.mappings) {
								await client.callTool("commander_task", { operation: "update", task_id: m.commanderId, status: "cancelled" });
							}
						});
					}

					tasks = [];
					nextId = 1;
					listTitle = params.text;
					listDescription = params.description || undefined;
					syncState = emptySyncState();

					// Group creation deferred to first `add` — avoids empty tasks[] rejection

					const result = {
						content: [{
							type: "text" as const,
							text: `New list: "${listTitle}"${listDescription ? ` — ${listDescription}` : ""}`,
						}],
						details: makeDetails("new-list"),
					};
					refreshUI(ctx);
					return result;
				}

				case "list": {
					const header = listTitle ? `${listTitle}:` : "";
					const result = {
						content: [{
							type: "text" as const,
							text: tasks.length
								? (header ? header + "\n" : "") +
									tasks.map((t) => `[${STATUS_ICON[t.status]}] #${t.id} (${t.status}): ${t.text}`).join("\n")
								: "No tasks defined yet.",
						}],
						details: makeDetails("list"),
					};
					refreshUI(ctx);
					return result;
				}

				case "add": {
					const items = params.texts?.length ? params.texts : params.text ? [params.text] : [];
					if (items.length === 0) {
						return {
							content: [{ type: "text" as const, text: "Error: text or texts required for add" }],
							details: makeDetails("add", "text required"),
						};
					}
					const added: Task[] = [];
					for (const item of items) {
						const t: Task = { id: nextId++, text: item, status: "idle" };
						tasks.push(t);
						added.push(t);
					}

					// Sync: create Commander tasks (skip if external sync owns it)
					if (!isExternalSyncActive()) {
						if (shouldCreateGroup(syncState)) {
							// Path A: no group yet — batch all tasks into a single group:create
							syncState = markGroupCreationInFlight(syncState);
							const localIds = added.map((t) => t.id);
							const payload = buildGroupCreatePayload(
								listTitle || "Tasks",
								listDescription || listTitle || "Tasks",
								added.map((t) => t.text),
								process.cwd(),
							);
							syncToCommander("group-create", async (client) => {
								const res = await client.callTool("commander_task", payload);
								const parsed = parseGroupCreateResult(res);
								if (parsed) {
									syncState = applyGroupCreateResult(syncState, localIds, parsed);
									for (const lid of localIds) {
										syncState = updateMappingStatus(syncState, lid, "idle");
									}
								} else {
									syncState = { ...syncState, groupCreationInFlight: false };
								}
							});
						} else if (syncState.groupId !== undefined) {
							// Path B: group exists — add individual tasks with group_id
							for (const t of added) {
								syncToCommander("task-create", async (client) => {
									const res = await client.callTool("commander_task", {
										operation: "create",
										description: t.text,
										working_directory: process.cwd(),
										group_id: syncState.groupId,
									});
									const cid = parseCommanderTaskId(res);
									if (cid !== undefined) {
										syncState = addMapping(syncState, t.id, cid);
										syncState = updateMappingStatus(syncState, t.id, "idle");
									}
								});
							}
						}
						// If groupCreationInFlight but no groupId yet, tasks are dropped
						// (race window — the group:create hasn't returned yet)
					}

					const msg = added.length === 1
						? `Added task #${added[0].id}: ${added[0].text}`
						: `Added ${added.length} tasks: ${added.map((t) => `#${t.id}`).join(", ")}`;
					const result = {
						content: [{ type: "text" as const, text: msg }],
						details: makeDetails("add"),
					};
					refreshUI(ctx);
					return result;
				}

				case "toggle": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text" as const, text: "Error: id required for toggle" }],
							details: makeDetails("toggle", "id required"),
						};
					}
					const task = tasks.find((t) => t.id === params.id);
					if (!task) {
						return {
							content: [{ type: "text" as const, text: `Task #${params.id} not found` }],
							details: makeDetails("toggle", `#${params.id} not found`),
						};
					}
					const prev = task.status;
					task.status = NEXT_STATUS[task.status];

					// Enforce single inprogress — demote any other active task
					const demoted: Task[] = [];
					if (task.status === "inprogress") {
						for (const t of tasks) {
							if (t.id !== task.id && t.status === "inprogress") {
								t.status = "idle";
								demoted.push(t);
							}
						}
					}

					let msg = `Task #${task.id}: ${prev} → ${task.status}`;
					if (demoted.length > 0) {
						msg += `\n(Auto-paused ${demoted.map((t) => `#${t.id}`).join(", ")} → idle. Only one task can be in progress at a time.)`;
					}

					// Sync: update Commander task status (skip if external sync owns it)
					if (!isExternalSyncActive()) {
						syncToCommander("task-toggle", async (client) => {
							const cid = lookupMapping(syncState, task.id);
							if (cid === undefined) return;
							await client.callTool("commander_task", {
								operation: "update",
								task_id: cid,
								status: localToCommander(task.status),
							});
							syncState = updateMappingStatus(syncState, task.id, task.status);
						});
						// Sync demoted tasks back to pending
						for (const d of demoted) {
							syncToCommander("task-demote", async (client) => {
								const cid = lookupMapping(syncState, d.id);
								if (cid === undefined) return;
								await client.callTool("commander_task", {
									operation: "update",
									task_id: cid,
									status: "pending",
								});
								syncState = updateMappingStatus(syncState, d.id, "idle");
							});
						}
					}

					const result = {
						content: [{
							type: "text" as const,
							text: msg,
						}],
						details: makeDetails("toggle"),
					};
					refreshUI(ctx);
					return result;
				}

				case "remove": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text" as const, text: "Error: id required for remove" }],
							details: makeDetails("remove", "id required"),
						};
					}
					const idx = tasks.findIndex((t) => t.id === params.id);
					if (idx === -1) {
						return {
							content: [{ type: "text" as const, text: `Task #${params.id} not found` }],
							details: makeDetails("remove", `#${params.id} not found`),
						};
					}
					const removed = tasks.splice(idx, 1)[0];

					// Sync: cancel Commander task (skip if external sync owns it)
					if (!isExternalSyncActive()) {
						syncToCommander("task-remove", async (client) => {
							const cid = lookupMapping(syncState, removed.id);
							if (cid === undefined) return;
							await client.callTool("commander_task", {
								operation: "update",
								task_id: cid,
								status: "cancelled",
							});
						});
					}
					syncState = removeMapping(syncState, removed.id);

					const result = {
						content: [{ type: "text" as const, text: `Removed task #${removed.id}: ${removed.text}` }],
						details: makeDetails("remove"),
					};
					refreshUI(ctx);
					return result;
				}

				case "update": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text" as const, text: "Error: id required for update" }],
							details: makeDetails("update", "id required"),
						};
					}
					if (!params.text) {
						return {
							content: [{ type: "text" as const, text: "Error: text required for update" }],
							details: makeDetails("update", "text required"),
						};
					}
					const toUpdate = tasks.find((t) => t.id === params.id);
					if (!toUpdate) {
						return {
							content: [{ type: "text" as const, text: `Task #${params.id} not found` }],
							details: makeDetails("update", `#${params.id} not found`),
						};
					}
					const oldText = toUpdate.text;
					toUpdate.text = params.text;
					const result = {
						content: [{ type: "text" as const, text: `Updated #${toUpdate.id}: "${oldText}" → "${toUpdate.text}"` }],
						details: makeDetails("update"),
					};
					refreshUI(ctx);
					return result;
				}

				case "clear": {
					if (shouldConfirmNewList(tasks, listTitle)) {
						const confirmed = await ctx.ui.confirm(
							"Clear task list?",
							`This will remove all ${tasks.length} task(s)${listTitle ? ` from "${listTitle}"` : ""}. Continue?`,
							{ timeout: 30000 },
						);
						if (!confirmed) {
							return {
								content: [{ type: "text" as const, text: "Clear cancelled by user." }],
								details: makeDetails("clear", "cancelled"),
							};
						}
					}

					const count = tasks.length;

					// Sync: cancel all mapped Commander tasks (skip if external sync owns it)
					if (!isExternalSyncActive() && syncState.mappings.length > 0) {
						syncToCommander("cancel-all", async (client) => {
							for (const m of syncState.mappings) {
								await client.callTool("commander_task", {
									operation: "update",
									task_id: m.commanderId,
									status: "cancelled",
								});
							}
						});
					}

					tasks = [];
					nextId = 1;
					listTitle = undefined;
					listDescription = undefined;
					syncState = clearMappings(syncState);

					const result = {
						content: [{ type: "text" as const, text: `Cleared ${count} task(s)` }],
						details: makeDetails("clear"),
					};
					refreshUI(ctx);
					return result;
				}

				default:
					return {
						content: [{ type: "text" as const, text: `Unknown action: ${params.action}` }],
						details: makeDetails("list", `unknown action: ${params.action}`),
					};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("tasks ")) + theme.fg("muted", args.action);
			if (args.texts?.length) text += ` ${theme.fg("dim", `${args.texts.length} tasks`)}`;
			else if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
			if (args.description) text += ` ${theme.fg("dim", `— ${args.description}`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as TasksDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			const taskList = details.tasks;

			switch (details.action) {
				case "new-list": {
					let msg = theme.fg("success", "New list ") + theme.fg("accent", `"${details.listTitle}"`);
					if (details.listDescription) {
						msg += theme.fg("dim", ` — ${details.listDescription}`);
					}
					return new Text(msg, 0, 0);
				}

				case "list": {
					if (taskList.length === 0) return new Text(theme.fg("dim", "No tasks"), 0, 0);

					let listText = "";
					if (details.listTitle) {
						listText += theme.fg("accent", details.listTitle) + theme.fg("dim", "  ");
					}
					listText += theme.fg("muted", `${taskList.length} task(s):`);
					const display = expanded ? taskList : taskList.slice(0, 5);
					for (const t of display) {
						const icon = t.status === "done"
							? theme.fg("success", STATUS_ICON.done)
							: t.status === "inprogress"
								? theme.fg("accent", STATUS_ICON.inprogress)
								: theme.fg("dim", STATUS_ICON.idle);
						const itemDisplayText = stripLeadingNumber(t.text);
						const itemText = t.status === "done"
							? theme.fg("dim", itemDisplayText)
							: t.status === "inprogress"
								? theme.fg("success", itemDisplayText)
								: theme.fg("muted", itemDisplayText);
						listText += `\n${icon} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
					}
					if (!expanded && taskList.length > 5) {
						listText += `\n${theme.fg("dim", `... ${taskList.length - 5} more`)}`;
					}
					return new Text(listText, 0, 0);
				}

				case "add": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("success", msg), 0, 0);
				}

				case "toggle": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("accent", msg), 0, 0);
				}

				case "remove": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("warning", msg), 0, 0);
				}

				case "update": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("success", msg), 0, 0);
				}

				case "clear":
					return new Text(theme.fg("success", "Cleared all tasks"), 0, 0);

				default:
					return new Text(theme.fg("dim", "done"), 0, 0);
			}
		},
	});

	// ── /tasks command ────────────────────────────────────────────────

	pi.registerCommand("tasks", {
		description: "Show all Tasks tasks on the current branch",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/tasks requires interactive mode", "error");
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TasksListComponent(tasks, listTitle, listDescription, theme, () => done());
			});
		},
	});
}
