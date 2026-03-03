// ABOUTME: Spawns and manages background subagent processes with live status widgets.
// ABOUTME: Provides /sub, /subcont, /subrm, /subclear commands and subagent_* tools.
/**
 * Subagent Widget — /sub, /subclear, /subrm, /subcont commands with stacking live widgets
 *
 * Each /sub spawns a background Pi subagent with its own persistent session,
 * enabling conversation continuations via /subcont.
 *
 * Usage: pi -e extensions/subagent-widget.ts
 * Then:
 *   /sub list files and summarize          — spawn a new subagent
 *   /subcont 1 now write tests for it      — continue subagent #1's conversation
 *   /subrm 2                               — remove subagent #2 widget
 *   /subclear                              — clear all subagent widgets
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
const { spawn } = require("child_process") as any;
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { renderSubagentWidget, parseSubName } from "./lib/subagent-render.ts";
import { DEFAULT_SUBAGENT_MODEL } from "./lib/defaults.ts";
import { cleanOldSessionFiles } from "./lib/subagent-cleanup.ts";
import { buildCommanderPrompt } from "./lib/commander-prompt.ts";
import { preClaimTask, postCompleteTask, postFailTask } from "./lib/commander-lifecycle.ts";
import { parseGroupCreateResult, buildGroupCreatePayload } from "./lib/commander-sync.ts";

// ── Commander availability ───────────────────────────────────────────────────

function isCommanderAvailable(): boolean {
	const g = globalThis as any;
	return g.__piCommanderGate?.state === "available" && !!g.__piCommanderClient;
}

function getCommanderClient(): any | undefined {
	const g = globalThis as any;
	if (!isCommanderAvailable()) return undefined;
	return g.__piCommanderClient;
}

// ── Graceful kill helper ─────────────────────────────────────────────────────

/** Send SIGTERM and wait up to `timeoutMs` for exit; escalate to SIGKILL. */
function killGracefully(proc: any, timeoutMs = 3000): Promise<void> {
	return new Promise((resolve) => {
		if (!proc || proc.exitCode !== null) {
			resolve();
			return;
		}
		let settled = false;
		const onExit = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		};
		proc.once("exit", onExit);
		proc.kill("SIGTERM");
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			proc.removeListener("exit", onExit);
			try { proc.kill("SIGKILL"); } catch {}
			resolve();
		}, timeoutMs);
	});
}

interface SubState {
	id: number;
	status: "running" | "done" | "error";
	name: string;          // short role label, e.g. "SCOUT", "REVIEWER"
	task: string;
	textChunks: string[];
	toolCount: number;
	elapsed: number;
	sessionFile: string;   // persistent JSONL session path — used by /subcont to resume
	turnCount: number;     // increments each time /subcont continues this agent
	summary?: string;      // pre-written summary shown in widget (no markdown)
	proc?: any;            // active ChildProcess ref (for kill on /subrm)
	commanderTaskId?: number;  // pre-assigned Commander task ID
	autoRemove?: boolean;      // auto-remove widget ~30s after done (default: true)
	model?: string;            // resolved model string for display
}

export default function (pi: ExtensionAPI) {
	const agents: Map<number, SubState> = new Map();
	let nextId = 1;
	let widgetCtx: any;
	const widgetBoxes = new Map<number, { invalidate: () => void }>();

	// ── Session file helpers ──────────────────────────────────────────────────

	function makeSessionFile(id: number): string {
		const dir = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents");
		fs.mkdirSync(dir, { recursive: true });
		return path.join(dir, `subagent-${id}-${Date.now()}.jsonl`);
	}

	// ── Widget rendering ──────────────────────────────────────────────────────

	// ── Dark background colors for subagent status ───────────────────────────
	// Standard dark shades that keep white text readable on any terminal.
	const STATUS_BG: Record<string, string> = {
		running: "\x1b[48;2;26;58;92m",   // dark steel blue
		done:    "\x1b[48;2;35;50;55m",    // dark teal-gray
		error:   "\x1b[48;2;70;35;35m",    // dark muted red
	};
	const RESET_BG = "\x1b[49m";
	const WHITE_BOLD = "\x1b[1;97m";  // bold bright white text
	const RESET_ALL = "\x1b[0m";

	function registerWidget(state: SubState) {
		if (!widgetCtx) return;
		const key = `sub-${state.id}`;
		widgetCtx.ui.setWidget(key, (_tui: any, theme: any) => {
			const bgFn = (text: string): string => {
				const bg = STATUS_BG[state.status] || STATUS_BG.running;
				return `${bg}${WHITE_BOLD}${text}${RESET_ALL}${RESET_BG}`;
			};

			const box = new Box(1, 1, bgFn);
			const content = new Text("", 0, 0);
			box.addChild(content);
			widgetBoxes.set(state.id, { invalidate: () => box.invalidate() });

			return {
				render(width: number): string[] {
					box.setBgFn((text: string): string => {
						const bg = STATUS_BG[state.status] || STATUS_BG.running;
						return `${bg}${WHITE_BOLD}${text}${RESET_ALL}${RESET_BG}`;
					});

					const result = renderSubagentWidget(state, width, theme);
					content.setText(result.lines.join("\n"));
					return box.render(width);
				},
				invalidate() {
					box.invalidate();
				},
			};
		});
	}

	function invalidateWidget(id: number) {
		widgetBoxes.get(id)?.invalidate();
	}

	// ── Streaming helpers ─────────────────────────────────────────────────────

	function processLine(state: SubState, line: string) {
		if (!line.trim()) return;
		try {
			const event = JSON.parse(line);
			const type = event.type;

			if (type === "message_update") {
				const delta = event.assistantMessageEvent;
				if (delta?.type === "text_delta") {
					state.textChunks.push(delta.delta || "");
					invalidateWidget(state.id);
				}
			} else if (type === "tool_execution_start") {
				state.toolCount++;
				invalidateWidget(state.id);
			}
		} catch {}
	}

	function spawnAgent(
		state: SubState,
		prompt: string,
		ctx: any,
		peerNames?: string[],
	): Promise<void> {
		// Model priority: 1) caller-specified override, 2) default subagent model
		// NOTE: We intentionally do NOT inherit the parent model. Each subagent
		// should use its explicitly specified model or the lightweight default.
		const model = state.model || DEFAULT_SUBAGENT_MODEL;
		state.model = model;

		const extDir = path.dirname(fileURLToPath(import.meta.url));
		const tasksExtPath = path.join(extDir, "tasks.ts");
		const commanderExtPath = path.join(extDir, "commander-mcp.ts");

		// Commander integration
		const commanderAvail = isCommanderAvailable();
		const cmdTaskId = state.commanderTaskId;

		let tools = "read,bash,grep,find,ls";
		const extensions = ["-e", tasksExtPath];
		if (commanderAvail) {
			// Commander tools are extension-registered (not built-in), so they must NOT
			// go in --tools (which only accepts built-in names and warns on unknowns).
			// Loading the extension is sufficient — pi auto-activates all extension tools.
			extensions.push("-e", commanderExtPath);
		}

		// Build system prompt with Commander discipline
		const systemPromptArgs: string[] = [];
		if (commanderAvail) {
			const cmdPrompt = buildCommanderPrompt({
				agentName: `SA-${state.id}-${state.name}`,
				taskId: cmdTaskId,
				enableMailboxChat: !!(peerNames && peerNames.length > 0),
				peerNames,
			});
			systemPromptArgs.push("--append-system-prompt", cmdPrompt);
		}

		// Pre-claim: parent claims Commander task on behalf of subagent
		if (commanderAvail && cmdTaskId !== undefined) {
			const client = getCommanderClient();
			if (client) {
				preClaimTask(client, cmdTaskId, `SA-${state.id}-${state.name}`).catch(() => {});
			}
		}

		const spawnEnv: Record<string, string | undefined> = { ...process.env, PI_SUBAGENT: "1" };
		if (commanderAvail && cmdTaskId !== undefined) {
			spawnEnv.PI_COMMANDER_TASK_ID = String(cmdTaskId);
		}

		return new Promise<void>((resolve) => {
			const proc = spawn("pi", [
				"--mode", "json",
				"-p",
				"--session", state.sessionFile,   // persistent session for /subcont resumption
				"--no-extensions",
				...extensions,
				"--model", model,
				"--tools", tools,
				"--thinking", "off",
				...systemPromptArgs,
				prompt,
			], {
				stdio: ["ignore", "pipe", "pipe"],
				env: spawnEnv,
			});

			state.proc = proc;

			const startTime = Date.now();
			const timer = setInterval(() => {
				state.elapsed = Date.now() - startTime;
				invalidateWidget(state.id);
			}, 1000);

			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(state, line);
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				if (chunk.trim()) {
					state.textChunks.push(chunk);
					invalidateWidget(state.id);
				}
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(state, buffer);
				clearInterval(timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";
				state.proc = undefined;
				invalidateWidget(state.id);

				// Post-dispatch: reconcile Commander task to terminal state
				if (commanderAvail && cmdTaskId !== undefined) {
					const client = getCommanderClient();
					if (client) {
						const agentLabel = `SA-${state.id}-${state.name}`;
						const summary = state.textChunks.join("").trim().split("\n").pop() || agentLabel;
						if (state.status === "done") {
							postCompleteTask(client, cmdTaskId, agentLabel, summary).catch(() => {});
						} else {
							const errMsg = summary || "Agent exited with error";
							postFailTask(client, cmdTaskId, errMsg).catch(() => {});
						}
					}
				}

				const result = state.textChunks.join("");
				ctx.ui.notify(
					`SA${state.id} (${state.name}) ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error"
				);

				pi.sendMessage({
					customType: "subagent-result",
					content: `SA${state.id} (${state.name})${state.turnCount > 1 ? ` (Turn ${state.turnCount})` : ""} finished "${prompt}" in ${Math.round(state.elapsed / 1000)}s.\n\nResult:\n${result.slice(0, 8000)}${result.length > 8000 ? "\n\n... [truncated]" : ""}`,
					display: true,
				}, { deliverAs: "followUp", triggerTurn: true });

				// Auto-remove widget after 30s (default behavior)
				if (state.autoRemove !== false) {
					setTimeout(() => {
						if (agents.has(state.id) && state.status !== "running") {
							ctx.ui.setWidget(`sub-${state.id}`, undefined);
							widgetBoxes.delete(state.id);
							agents.delete(state.id);
						}
					}, 30_000);
				}

				resolve();
			});

			proc.on("error", (err) => {
				clearInterval(timer);
				state.status = "error";
				state.proc = undefined;
				state.textChunks.push(`Error: ${err.message}`);
				invalidateWidget(state.id);
				resolve();
			});

			proc.on("exit", () => { clearInterval(timer); });
		});
	}

		// ── Tools for the Main Agent ──────────────────────────────────────────────

	pi.registerTool({
		name: "subagent_create",
		description: "Spawn a background subagent to perform a task. Returns the subagent ID immediately while it runs in the background. Results will be delivered as a follow-up message when finished.",
		parameters: Type.Object({
			task: Type.String({ description: "The complete task description for the subagent to perform" }),
			name: Type.Optional(Type.String({ description: "Short role label (e.g. REVIEWER, SCOUT)" })),
			summary: Type.Optional(Type.String({ description: "Short summary shown in widget (no markdown)" })),
			model: Type.Optional(Type.String({ description: "Model to use (e.g. 'anthropic/claude-haiku-4-5', 'grok-4-fast'). Defaults to lightweight subagent model." })),
			commanderTaskId: Type.Optional(Type.Number({ description: "Pre-assigned Commander task ID (avoids race conditions)" })),
			autoRemove: Type.Optional(Type.Boolean({ description: "Auto-remove widget ~30s after done (default: true)" })),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const id = nextId++;
			const state: SubState = {
				id,
				status: "running",
				name: (args.name || "AGENT").toUpperCase(),
				task: args.task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
				summary: args.summary,
				commanderTaskId: args.commanderTaskId,
				autoRemove: args.autoRemove,
				model: args.model, // caller-specified model override
			};
			agents.set(id, state);
			registerWidget(state);

			// Fire-and-forget
			spawnAgent(state, args.task, ctx);

			return {
				content: [{ type: "text", text: `SA${id} (${state.name}) spawned and running in background.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_create_batch",
		description: "Spawn multiple subagents at once with optional Commander task group. Pre-creates Commander tasks to avoid race conditions where multiple agents try to claim the same task.",
		parameters: Type.Object({
			agents: Type.Array(Type.Object({
				task: Type.String({ description: "The complete task description for the subagent" }),
				name: Type.Optional(Type.String({ description: "Short role label (e.g. REVIEWER, SCOUT)" })),
				summary: Type.Optional(Type.String({ description: "Short summary shown in widget (no markdown)" })),
				model: Type.Optional(Type.String({ description: "Model override for this agent (e.g. 'anthropic/claude-haiku-4-5')" })),
			}), { description: "Array of agent definitions to spawn" }),
			groupName: Type.Optional(Type.String({ description: "Commander task group name (used when Commander is available)" })),
			autoRemove: Type.Optional(Type.Boolean({ description: "Auto-remove widgets ~30s after done (default: true)" })),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const defs = args.agents;
			if (!defs || defs.length === 0) {
				return { content: [{ type: "text", text: "Error: No agents specified." }] };
			}

			// Build states for all agents
			const states: SubState[] = defs.map((def: any) => {
				const id = nextId++;
				return {
					id,
					status: "running" as const,
					name: (def.name || "AGENT").toUpperCase(),
					task: def.task,
					textChunks: [],
					toolCount: 0,
					elapsed: 0,
					sessionFile: makeSessionFile(id),
					turnCount: 1,
					summary: def.summary,
					autoRemove: args.autoRemove,
					model: def.model, // per-agent model override
				};
			});

			// Try to create Commander task group for all agents at once
			const client = getCommanderClient();
			if (client && isCommanderAvailable()) {
				const groupName = args.groupName || `subagent-batch-${Date.now()}`;
				const taskTexts = defs.map((def: any) => def.task);
				const payload = buildGroupCreatePayload(
					groupName,
					`Batch subagent group: ${groupName}`,
					taskTexts,
					process.cwd(),
				);
				try {
					const result = await client.callTool("commander_task", payload);
					const parsed = parseGroupCreateResult(result);
					if (parsed && parsed.taskIds.length >= states.length) {
						for (let i = 0; i < states.length; i++) {
							states[i].commanderTaskId = parsed.taskIds[i];
						}
					}
				} catch {
					// Commander group creation failed — proceed without task IDs
				}
			}

			// Collect peer names for mailbox banter
			const peerNames = states.map(s => `SA-${s.id}-${s.name}`);

			// Register and spawn all agents
			for (const state of states) {
				agents.set(state.id, state);
				registerWidget(state);
			}

			for (const state of states) {
				const peers = peerNames.filter(n => n !== `SA-${state.id}-${state.name}`);
				spawnAgent(state, state.task, ctx, peers);
			}

			const ids = states.map(s => `SA${s.id} (${s.name})`).join(", ");
			return {
				content: [{ type: "text", text: `Batch spawned ${states.length} subagents: ${ids}` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_continue",
		description: "Continue an existing subagent's conversation. Use this to give further instructions to a finished subagent. Returns immediately while it runs in the background.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the subagent to continue" }),
			prompt: Type.String({ description: "The follow-up prompt or new instructions" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No SA${args.id} found.` }] };
			}
			if (state.status === "running") {
				return { content: [{ type: "text", text: `Error: SA${args.id} is still running.` }] };
			}

			state.status = "running";
			state.task = args.prompt;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;
			invalidateWidget(state.id);

			ctx.ui.notify(`Continuing SA${args.id} (${state.name}) Turn ${state.turnCount}…`, "info");
			spawnAgent(state, args.prompt, ctx);

			return {
				content: [{ type: "text", text: `SA${args.id} (${state.name}) continuing conversation in background.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_remove",
		description: "Remove a specific subagent. Kills it if it's currently running.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the subagent to remove" }),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No SA${args.id} found.` }] };
			}

			if (state.proc && state.status === "running") {
				await killGracefully(state.proc);
			}
			ctx.ui.setWidget(`sub-${args.id}`, undefined);
			widgetBoxes.delete(args.id);
			agents.delete(args.id);

			return {
				content: [{ type: "text", text: `SA${args.id} removed.` }],
			};
		},
	});

	pi.registerTool({
		name: "subagent_list",
		description: "List all active and finished subagents, showing their IDs, tasks, and status.",
		parameters: Type.Object({}),
		execute: async () => {
			if (agents.size === 0) {
				return { content: [{ type: "text", text: "No active subagents." }] };
			}

			const list = Array.from(agents.values()).map(s =>
				`SA${s.id} [${s.status.toUpperCase()}] ${s.name} - ${s.task}`
			).join("\n");

			return {
				content: [{ type: "text", text: `Subagents:\n${list}` }],
			};
		},
	});



	// ── /sub <task> ───────────────────────────────────────────────────────────

	pi.registerCommand("sub", {
		description: "Spawn a subagent with live widget: /sub <task>",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const raw = args?.trim();
			if (!raw) {
				ctx.ui.notify("Usage: /sub [NAME] <task>", "error");
				return;
			}

			const parsed = parseSubName(raw);
			if (!parsed.task) {
				ctx.ui.notify("Usage: /sub [NAME] <task>", "error");
				return;
			}

			const id = nextId++;
			const state: SubState = {
				id,
				status: "running",
				name: parsed.name,
				task: parsed.task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
			};
			agents.set(id, state);
			registerWidget(state);

			// Fire-and-forget
			spawnAgent(state, parsed.task, ctx);
		},
	});

	// ── /subcont <number> <prompt> ────────────────────────────────────────────

	pi.registerCommand("subcont", {
		description: "Continue an existing subagent's conversation: /subcont <number> <prompt>",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const trimmed = args?.trim() ?? "";
			const spaceIdx = trimmed.indexOf(" ");
			if (spaceIdx === -1) {
				ctx.ui.notify("Usage: /subcont <number> <prompt>", "error");
				return;
			}

			const num = parseInt(trimmed.slice(0, spaceIdx), 10);
			const prompt = trimmed.slice(spaceIdx + 1).trim();

			if (isNaN(num) || !prompt) {
				ctx.ui.notify("Usage: /subcont <number> <prompt>", "error");
				return;
			}

			const state = agents.get(num);
			if (!state) {
				ctx.ui.notify(`No SA${num} found. Use /sub to create one.`, "error");
				return;
			}

			if (state.status === "running") {
				ctx.ui.notify(`SA${num} is still running — wait for it to finish first.`, "warning");
				return;
			}

			// Resume: update state for a new turn
			state.status = "running";
			state.task = prompt;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;
			invalidateWidget(state.id);

			ctx.ui.notify(`Continuing SA${num} (${state.name}) Turn ${state.turnCount}…`, "info");

			// Fire-and-forget — reuses the same sessionFile for conversation history
			spawnAgent(state, prompt, ctx);
		},
	});

	// ── /subrm <number> ───────────────────────────────────────────────────────

	pi.registerCommand("subrm", {
		description: "Remove a specific subagent widget: /subrm <number>",
		handler: async (args, ctx) => {
			widgetCtx = ctx;

			const num = parseInt(args?.trim() ?? "", 10);
			if (isNaN(num)) {
				ctx.ui.notify("Usage: /subrm <number>", "error");
				return;
			}

			const state = agents.get(num);
			if (!state) {
				ctx.ui.notify(`No SA${num} found.`, "error");
				return;
			}

			// Kill the process if still running
			if (state.proc && state.status === "running") {
				await killGracefully(state.proc);
				ctx.ui.notify(`SA${num} killed and removed.`, "warning");
			} else {
				ctx.ui.notify(`SA${num} removed.`, "info");
			}

			ctx.ui.setWidget(`sub-${num}`, undefined);
			widgetBoxes.delete(num);
			agents.delete(num);
		},
	});

	// ── /subclear ─────────────────────────────────────────────────────────────

	pi.registerCommand("subclear", {
		description: "Clear all subagent widgets",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;

			let killed = 0;
			const killPromises: Promise<void>[] = [];
			for (const [id, state] of Array.from(agents.entries())) {
				if (state.proc && state.status === "running") {
					killPromises.push(killGracefully(state.proc));
					killed++;
				}
				ctx.ui.setWidget(`sub-${id}`, undefined);
			}
			await Promise.all(killPromises);

			const total = agents.size;
			agents.clear();
			widgetBoxes.clear();
			nextId = 1;

			const msg = total === 0
				? "No subagents to clear."
				: `Cleared ${total} subagent${total !== 1 ? "s" : ""}${killed > 0 ? ` (${killed} killed)` : ""}.`;
			ctx.ui.notify(msg, total === 0 ? "info" : "success");
		},
	});

	// ── Session lifecycle ─────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		const sessDir = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents");
		cleanOldSessionFiles(sessDir, 7);
		const killPromises: Promise<void>[] = [];
		for (const [id, state] of Array.from(agents.entries())) {
			if (state.proc && state.status === "running") {
				killPromises.push(killGracefully(state.proc));
			}
			ctx.ui.setWidget(`sub-${id}`, undefined);
		}
		await Promise.all(killPromises);
		agents.clear();
		widgetBoxes.clear();
		nextId = 1;
		widgetCtx = ctx;
	});
}
