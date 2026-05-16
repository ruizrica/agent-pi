// ABOUTME: Task Board Viewer — opens a GUI browser window showing a live Kanban board of agent work.
// ABOUTME: Polls Commander CLI-backed tools for tasks, agents, messages, and groups. Auto-refreshes every 3 seconds.
// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { type Server } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateBoardViewerHTML } from "./lib/viewers/board-viewer-html.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";

// ── Types ────────────────────────────────────────────────────────────

interface BoardResult {
	action: "closed";
}

interface BoardData {
	tasks: any[];
	agents: any[];
	messages: any[];
	groups: any[];
	readyTasks: any[];
	connected: boolean;
	timestamp: string;
	error?: string;
	localMode?: boolean;
	localTitle?: string;
}

// ── Commander Data Helpers ───────────────────────────────────────────

/**
 * Call a Commander CLI-backed tool via the global client set by commander-mcp.ts.
 * Returns the parsed result or null on failure.
 */
async function callCommander(toolName: string, params: Record<string, unknown>): Promise<any> {
	const g = globalThis as any;
	const client = g.__piCommanderClient;
	if (!client) return null;

	try {
		const result = await client.callTool(toolName, params, 8000);
		// Commander client results come as { content: [{ type: "text", text: "..." }] }
		if (result?.content?.[0]?.text) {
			try {
				return JSON.parse(result.content[0].text);
			} catch {
				return result.content[0].text;
			}
		}
		return result;
	} catch {
		return null;
	}
}

/**
 * Read local tasks from the tasks extension (globalThis.__piTaskList).
 * Always available regardless of Commander status.
 */
function getLocalTasks(): { tasks: any[]; title?: string } {
	const g = globalThis as any;
	const taskList = g.__piTaskList as { tasks: { id: number; text: string; status: string }[]; title?: string; remaining: number; total: number } | undefined;
	const now = new Date().toISOString();
	const statusMap: Record<string, string> = { idle: "pending", inprogress: "working", done: "completed" };

	const tasks = (taskList?.tasks || []).map((t) => ({
		task_id: t.id,
		description: t.text,
		status: statusMap[t.status] || t.status,
		created_at: now,
		updated_at: now,
	}));

	return { tasks, title: taskList?.title };
}

/**
 * Gather board data — tries Commander first, falls back to local tasks.
 * When Commander is available, returns full data (tasks, agents, messages, groups).
 * When Commander is unavailable, returns local tasks from the Pi tasks extension.
 */
async function gatherBoardData(): Promise<BoardData> {
	const g = globalThis as any;
	const local = getLocalTasks();

	// Try Commander if CLI client is available
	const client = g.__piCommanderClient;
	if (client) {
		try {
			const [taskResult, agentResult, messageResult, readyResult, groupResult] = await Promise.all([
				callCommander("commander_task", { operation: "list" }),
				callCommander("commander_orchestration", { operation: "agent:list", active_only: true }),
				callCommander("commander_mailbox", { operation: "inbox", agent_name: "@all" }),
				callCommander("commander_dependency", { operation: "ready_tasks" }),
				callCommander("commander_task", { operation: "group:list" }),
			]);

			// If we got tasks back, Commander is connected
			const commanderTasks = Array.isArray(taskResult) ? taskResult : taskResult?.tasks;
			if (Array.isArray(commanderTasks)) {
				return {
					tasks: commanderTasks || [],
					agents: agentResult?.agents || [],
					messages: messageResult?.messages || [],
					groups: groupResult?.groups || [],
					readyTasks: readyResult?.tasks || [],
					connected: true,
					timestamp: new Date().toISOString(),
				};
			}
		} catch {
			// Commander call failed — fall through to local mode
		}
	}

	// Fallback: local tasks only
	return {
		tasks: local.tasks,
		agents: [],
		messages: [],
		groups: [],
		readyTasks: [],
		connected: false,
		localMode: true,
		localTitle: local.title,
		timestamp: new Date().toISOString(),
	};
}

// ── HTTP Server ──────────────────────────────────────────────────────

function startBoardServer(
	title: string,
): Promise<{ port: number; server: Server; waitForResult: () => Promise<BoardResult> }> {
	return new Promise(async (resolveSetup) => {
		let resolveResult: (result: BoardResult) => void;
		let settled = false;
		const settle = (result: BoardResult) => {
			if (settled) return;
			settled = true;
			resolveResult!(result);
		};
		const resultPromise = new Promise<BoardResult>((res) => {
			resolveResult = res;
		});

		const { port, server, waitForResult } = await createViewerServer({
			getHtml: (port) => {
				return generateBoardViewerHTML({ title, port });
			},
			routes: [
				{
					method: "GET",
					path: "/api/board-data",
					handler: async (_req, res) => {
						try {
							const data = await gatherBoardData();
							res.writeHead(200, {
								"Content-Type": "application/json",
								"Cache-Control": "no-cache",
							});
							res.end(JSON.stringify(data));
						} catch (err: any) {
							res.writeHead(500, { "Content-Type": "application/json" });
							res.end(JSON.stringify({
								tasks: [], agents: [], messages: [], groups: [], readyTasks: [],
								connected: false,
								timestamp: new Date().toISOString(),
								error: err.message,
							}));
						}
					},
				},
			],
			onResult: () => {
				settle({ action: "closed" });
			},
		});

		// Hook the shared result promise
		waitForResult().then(() => {
			settle({ action: "closed" });
		}).catch(() => {
			settle({ action: "closed" });
		});

		resolveSetup({
			port,
			server,
			waitForResult: () => resultPromise,
		});
	});
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowBoardParams = Type.Object({
	title: Type.Optional(Type.String({ description: "Title for the board (default: 'Task Board')" })),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	let activeSession: { kind: "board"; title: string; url: string; server: Server; onClose: () => void } | null = null;

	function cleanupServer() {
		const server = activeServer;
		activeServer = null;
		if (server) {
			try { server.close(); } catch {}
		}
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	// ── Core board launcher ──────────────────────────────────────────

	async function launchBoard(
		ctx: ExtensionContext,
		title: string,
	): Promise<string> {
		// Clean up any previous server
		cleanupServer();

		// Start server
		const { port, server } = await startBoardServer(title);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "board",
			title,
			url,
			server,
			onClose: () => {
				activeServer = null;
				activeSession = null;
			},
		};
		registerActiveViewer(activeSession);

		// Open the browser
		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		return url;
	}

	// ── show_board tool ──────────────────────────────────────────────

	pi.registerTool({
		name: "show_board",
		label: "Show Board",
		description:
			"Open a live task board in the browser. Shows a Kanban-style view of local tasks " +
			"(Pending → Working → Completed → Failed). Auto-refreshes every 3 seconds.\n\n" +
			"The board runs as a lightweight background web server. Unlike other viewers, " +
			"it stays open and keeps refreshing — close the browser tab when done.\n\n" +
			"Shows local tasks from the tasks extension — no Commander required.",
		parameters: ShowBoardParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { title = "Task Board" } = params as { title?: string };

			const url = await launchBoard(ctx, title);

			return {
				content: [{
					type: "text" as const,
					text: `Task board opened at ${url}\n\nThe board auto-refreshes every 3 seconds. Close the browser tab when done.\n\nFeatures:\n- Kanban columns: Pending → Working → Completed → Failed\n- Agent chips: click to filter by agent\n- Activity feed: recent mailbox messages\n- Group progress: task group completion bars\n- Keyboard: R=refresh, Esc=clear filter`,
				}],
			};
		},

		renderCall(args, theme) {
			const titleArg = (args as any).title || "Task Board";
			const text =
				theme.fg("toolTitle", theme.bold("show_board ")) +
				theme.fg("accent", titleArg);
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			const firstLine = text?.type === "text" ? text.text.split("\n")[0] : "";
			return new Text(
				outputLine(theme, "success", firstLine),
				0, 0,
			);
		},
	});

	// ── /board command ───────────────────────────────────────────────

	pi.registerCommand("board", {
		description: "Open the live task board in the browser",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/board requires interactive mode", "error");
				return;
			}

			const title = args.trim() || "Task Board";
			const url = await launchBoard(ctx, title);
			ctx.ui.notify(`Task board opened at ${url}`, "info");
		},
	});

	// ── Session lifecycle ────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
	});
}
