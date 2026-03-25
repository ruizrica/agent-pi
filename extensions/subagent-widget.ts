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
import { scanAgentDefs, scanToolkitAgentDefs, resolveAgentByName, loadAgentModelsConfig, loadToolkitModelsConfig, resolveAgentModelString, type AgentDef, type AgentModelsConfig } from "./lib/agent-defs.ts";
import { resolveToolkitWorkerModel, isToolkitCliAgent, spawnToolkitWorker } from "./lib/toolkit-cli.ts";

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

/** Default timeout per agent role (ms). Prevents zombie subagents. */
const ROLE_TIMEOUT_MS: Record<string, number> = {
	SCOUT:    10 * 60 * 1000,   // 10 minutes
	BUILDER:  30 * 60 * 1000,   // 30 minutes
	REVIEWER: 15 * 60 * 1000,   // 15 minutes
	TESTER:   20 * 60 * 1000,   // 20 minutes
	PLANNER:  15 * 60 * 1000,   // 15 minutes
};
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

/** Grace period after SIGTERM before escalating to SIGKILL. */
const TIMEOUT_KILL_GRACE_MS = 30_000;

/** Resolve the timeout for a subagent based on role name or explicit override. */
function resolveTimeout(name: string, explicitTimeout?: number): number {
	if (explicitTimeout !== undefined && explicitTimeout > 0) return explicitTimeout;
	return ROLE_TIMEOUT_MS[name.toUpperCase()] || DEFAULT_TIMEOUT_MS;
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
	standby?: boolean;         // true = warmup spawn, suppress follow-up message
	maxDurationMs: number;     // watchdog timeout — kills agent after this duration
	watchdogTimer?: ReturnType<typeof setTimeout>; // reference to clear on normal exit
}

export default function (pi: ExtensionAPI) {
	const agents: Map<number, SubState> = new Map();
	let nextId = 1;
	let widgetCtx: any;
	const widgetBoxes = new Map<number, { invalidate: () => void }>();

	// ── Agent definition registry (loaded from .md files + models.json) ───────
	// Maps lowercase agent names to their definitions. Model assignments come from
	// .pi/agents/models.json — not from .md frontmatter. When subagent_create is
	// called with a name matching a known agent, we auto-apply that agent's
	// configured model, tools, and system prompt.
	let knownAgents: Map<string, AgentDef> = new Map();
	let modelsConfig: AgentModelsConfig | null = null;

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
		// Model resolution priority:
		// 1) Caller-specified override (state.model set by tool call)
		// 2) Agent definition model (from .md file, resolved via models.json)
		// 3) models.json agent entry (even without .md file)
		// 4) models.json default entry
		const agentDef = resolveAgentByName(state.name, knownAgents);
		const configModel = modelsConfig ? resolveAgentModelString(state.name, modelsConfig) : undefined;
		const model = resolveToolkitWorkerModel(
			state.name,
			state.model || agentDef?.model || configModel || DEFAULT_SUBAGENT_MODEL,
		);
		state.model = model;

		const extDir = path.dirname(fileURLToPath(import.meta.url));
		const tasksExtPath = path.join(extDir, "tasks.ts");
		const commanderExtPath = path.join(extDir, "commander-mcp.ts");
		const footerExtPath = path.join(extDir, "footer.ts");
		const memoryCycleExtPath = path.join(extDir, "memory-cycle.ts");

		// Commander integration
		const commanderAvail = isCommanderAvailable();
		const cmdTaskId = state.commanderTaskId;

		// Tools: use agent definition tools if available, else default set
		let tools = agentDef?.tools || "read,bash,grep,find,ls";
		const extensions = ["-e", tasksExtPath, "-e", footerExtPath, "-e", memoryCycleExtPath];
		if (commanderAvail) {
			// Commander tools are extension-registered (not built-in), so they must NOT
			// go in --tools (which only accepts built-in names and warns on unknowns).
			// Loading the extension is sufficient — pi auto-activates all extension tools.
			extensions.push("-e", commanderExtPath);
		}

		// Build system prompt: agent definition prompt + Commander discipline
		const systemPromptArgs: string[] = [];
		if (agentDef?.systemPrompt) {
			systemPromptArgs.push("--append-system-prompt", agentDef.systemPrompt);
		}
		if (commanderAvail) {
			const cmdPrompt = buildCommanderPrompt({
				agentName: `SA-${state.id}-${state.name}`,
				taskId: cmdTaskId,
				enableMailboxChat: true,
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
			const startTime = Date.now();
			const isScout = (globalThis as any).__piScoutId === state.id;
			const timer = setInterval(() => {
				state.elapsed = Date.now() - startTime;
				invalidateWidget(state.id);
				if (isScout) publishScoutStatus(state);
			}, 1000);

			// ── Watchdog: kill agent if it exceeds maxDurationMs ──────────
			// Standby (warmup) spawns are exempt — they're short-lived by design.
			if (!state.standby && state.maxDurationMs > 0) {
				state.watchdogTimer = setTimeout(() => {
					if (state.status !== "running") return; // already finished
					const mins = Math.round(state.maxDurationMs / 60_000);
					state.textChunks.push(`\n[TIMEOUT] Agent timed out after ${mins} minutes.`);
					ctx.ui.notify(`SA${state.id} (${state.name}) timed out after ${mins}m`, "warning");
					if (state.proc) {
						killGracefully(state.proc, TIMEOUT_KILL_GRACE_MS).catch(() => {});
					}
				}, state.maxDurationMs);
			}

			const finish = (code: number | null) => {
				clearInterval(timer);
				// Clear watchdog — agent exited normally before timeout
				if (state.watchdogTimer) {
					clearTimeout(state.watchdogTimer);
					state.watchdogTimer = undefined;
				}
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";
				state.proc = undefined;
				invalidateWidget(state.id);

				// If this is the pre-spawned scout, publish status for the footer pill
				if ((globalThis as any).__piScoutId === state.id) {
					publishScoutStatus(state);
					// If errored, clear the global so the main agent falls back
					if (state.status === "error") {
						(globalThis as any).__piScoutId = undefined;
						(globalThis as any).__piScoutStatus = undefined;
					}
				}

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

				// Standby spawns (warmup) suppress notification and follow-up message
				if (!state.standby) {
					ctx.ui.notify(
						`SA${state.id} (${state.name}) ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
						state.status === "done" ? "success" : "error"
					);

					pi.sendMessage({
						customType: "subagent-result",
						content: `SA${state.id} (${state.name})${state.turnCount > 1 ? ` (Turn ${state.turnCount})` : ""} finished "${prompt}" in ${Math.round(state.elapsed / 1000)}s.\n\nResult:\n${result.slice(0, 8000)}${result.length > 8000 ? "\n\n... [truncated]" : ""}`,
						display: true,
					}, { deliverAs: "followUp", triggerTurn: true });
				} else {
					// Clear standby flag after warmup completes — next use is real work
					state.standby = false;
				}

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
			};

			if (isToolkitCliAgent(state.name)) {
				spawnToolkitWorker({
					name: state.name,
					tools,
					systemPrompt: [agentDef?.systemPrompt, ...systemPromptArgs.filter((_, i) => i % 2 === 1)].filter(Boolean).join("\n\n"),
				}, {
					task: prompt,
					sessionFile: state.sessionFile,
					env: spawnEnv,
					onStdoutLine: (line: string) => processLine(state, line),
					onStderr: (chunk: string) => {
						if (chunk.trim()) {
							state.textChunks.push(chunk);
							invalidateWidget(state.id);
						}
					},
				}).then(({ exitCode }) => {
					finish(exitCode);
				});
				return;
			}

			const proc = spawn("pi", [
				"--mode", "json",
				"-p",
				"--session", state.sessionFile,
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
				finish(code);
			});

			proc.on("error", (err) => {
				state.textChunks.push(`Error: ${err.message}`);
				finish(1);
			});

			proc.on("exit", () => { clearInterval(timer); });
		});
	}

		// ── Tools for the Main Agent ──────────────────────────────────────────────

	pi.registerTool({
		name: "subagent_create",
		description: "Spawn a background subagent to perform a task. Returns the subagent ID immediately while it runs in the background. Results will be delivered as a follow-up message when finished.\n\nWhen `name` matches a known agent definition (scout, builder, reviewer, planner, tester, red-team), that agent's configured model, tools, and system prompt are automatically applied. Only set `model` to override the agent's default.",
		parameters: Type.Object({
			task: Type.String({ description: "The complete task description for the subagent to perform" }),
			name: Type.Optional(Type.String({ description: "Short role label (e.g. REVIEWER, SCOUT). If this matches a known agent definition, that agent's model/tools/prompt are auto-applied." })),
			summary: Type.Optional(Type.String({ description: "Short summary shown in widget (no markdown)" })),
			model: Type.Optional(Type.String({ description: "Model override. Only set this to override the agent's default model. If omitted, uses the agent definition's model or the system default." })),
			commanderTaskId: Type.Optional(Type.Number({ description: "Pre-assigned Commander task ID (avoids race conditions)" })),
			autoRemove: Type.Optional(Type.Boolean({ description: "Auto-remove widget ~30s after done (default: true)" })),
			timeout: Type.Optional(Type.Number({ description: "Max runtime in milliseconds. Defaults by role: scout=10min, builder=30min, reviewer=15min, default=20min. Set 0 to disable." })),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const id = nextId++;
			const agentName = (args.name || "AGENT").toUpperCase();
			const state: SubState = {
				id,
				status: "running",
				name: agentName,
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
				maxDurationMs: resolveTimeout(agentName, args.timeout),
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
		description: "Spawn multiple subagents at once with optional Commander task group. Pre-creates Commander tasks to avoid race conditions where multiple agents try to claim the same task.\n\nWhen an agent's `name` matches a known agent definition, that agent's configured model, tools, and system prompt are automatically applied.",
		parameters: Type.Object({
			agents: Type.Array(Type.Object({
				task: Type.String({ description: "The complete task description for the subagent" }),
				name: Type.Optional(Type.String({ description: "Short role label (e.g. REVIEWER, SCOUT). If this matches a known agent definition, that agent's model/tools/prompt are auto-applied." })),
				summary: Type.Optional(Type.String({ description: "Short summary shown in widget (no markdown)" })),
				model: Type.Optional(Type.String({ description: "Model override. Only set to override the agent definition's default model." })),
			}), { description: "Array of agent definitions to spawn" }),
			groupName: Type.Optional(Type.String({ description: "Commander task group name (used when Commander is available)" })),
			autoRemove: Type.Optional(Type.Boolean({ description: "Auto-remove widgets ~30s after done (default: true)" })),
			timeout: Type.Optional(Type.Number({ description: "Max runtime in ms for all agents in this batch. Defaults by role." })),
			force: Type.Optional(Type.Boolean({ description: "Force spawn even if agents are already running (default: false)" })),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const defs = args.agents;
			if (!defs || defs.length === 0) {
				return { content: [{ type: "text", text: "Error: No agents specified." }] };
			}

			// ── Guard: prevent duplicate batch spawns while agents are running ──
			if (!args.force) {
				const running = Array.from(agents.values()).filter(a => a.status === "running");
				if (running.length > 0) {
					const names = running.map(a => `SA${a.id} (${a.name})`).join(", ");
					return {
						content: [{ type: "text", text: `Warning: ${running.length} agent(s) still running: ${names}. Wait for them to finish, use subagent_cleanup to clear stale agents, or pass force: true to override.` }],
					};
				}
			}

			// ── Auto-cleanup: remove done/error agents before spawning new batch ──
			for (const [id, a] of Array.from(agents.entries())) {
				if (a.status === "done" || a.status === "error") {
					if (widgetCtx) widgetCtx.ui.setWidget(`sub-${id}`, undefined);
					widgetBoxes.delete(id);
					agents.delete(id);
				}
			}

			// Build states for all agents
			const states: SubState[] = defs.map((def: any) => {
				const id = nextId++;
				const agentName = (def.name || "AGENT").toUpperCase();
				return {
					id,
					status: "running" as const,
					name: agentName,
					task: def.task,
					textChunks: [],
					toolCount: 0,
					elapsed: 0,
					sessionFile: makeSessionFile(id),
					turnCount: 1,
					summary: def.summary,
					autoRemove: args.autoRemove,
					model: def.model, // per-agent model override
					maxDurationMs: resolveTimeout(agentName, args.timeout),
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

			// Re-register widget if it was removed (e.g. after standby warmup auto-remove)
			if (!widgetBoxes.has(state.id)) {
				registerWidget(state);
			}
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

	pi.registerTool({
		name: "subagent_cleanup",
		description: "Clean up finished and stale subagents. Removes done/error agents and kills agents running longer than max_age_seconds. Use before spawning new batches or when the screen is cluttered.",
		parameters: Type.Object({
			max_age_seconds: Type.Optional(Type.Number({ description: "Kill agents running longer than this (default: 600s = 10 min). Set 0 to only remove done/error agents." })),
		}),
		execute: async (callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const maxAge = (args.max_age_seconds ?? 600) * 1000;
			let removedDone = 0;
			let killedStale = 0;
			const killPromises: Promise<void>[] = [];

			for (const [id, state] of Array.from(agents.entries())) {
				// Skip the pre-spawned scout — it's managed separately
				if ((globalThis as any).__piScoutId === id) continue;

				if (state.status === "done" || state.status === "error") {
					ctx.ui.setWidget(`sub-${id}`, undefined);
					widgetBoxes.delete(id);
					agents.delete(id);
					removedDone++;
				} else if (state.status === "running" && maxAge > 0 && state.elapsed > maxAge) {
					if (state.proc) {
						killPromises.push(killGracefully(state.proc));
					}
					state.status = "error";
					state.textChunks.push(`\n[CLEANUP] Killed after ${Math.round(state.elapsed / 1000)}s (stale).`);
					ctx.ui.setWidget(`sub-${id}`, undefined);
					widgetBoxes.delete(id);
					agents.delete(id);
					killedStale++;
				}
			}

			await Promise.all(killPromises);
			const remaining = Array.from(agents.values()).filter(a => a.status === "running").length;
			const summary = `Cleanup: removed ${removedDone} done/error, killed ${killedStale} stale. ${remaining} active remain.`;

			return {
				content: [{ type: "text", text: summary }],
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
				maxDurationMs: resolveTimeout(parsed.name),
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

			// Re-register widget if it was removed (e.g. after auto-remove)
			if (!widgetBoxes.has(state.id)) {
				registerWidget(state);
			}
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

	// ── Pre-spawn scout helper ────────────────────────────────────────────────

	/** Publish scout status to globalThis so the footer can render a pill. */
	function publishScoutStatus(state: SubState) {
		(globalThis as any).__piScoutStatus = {
			status: state.status,
			model: state.model || "",
			elapsed: state.elapsed,
		};
	}

	function preSpawnScout(ctx: any) {
		// Only pre-spawn if scout agent definition exists
		const scoutDef = resolveAgentByName("scout", knownAgents);
		if (!scoutDef) return;

		const id = nextId++;
		const state: SubState = {
			id,
			status: "running",
			name: "SCOUT",
			task: "Warming up — standing by for recon tasks.",
			textChunks: [],
			toolCount: 0,
			elapsed: 0,
			sessionFile: makeSessionFile(id),
			turnCount: 1,
			summary: "Standing by...",
			autoRemove: false,     // keep widget alive — scout persists across tasks
			standby: true,         // suppress follow-up message on warmup completion
			maxDurationMs: 0,      // no timeout for pre-spawned scout (warmup is exempt)
		};
		agents.set(id, state);
		// No registerWidget — scout shows as a footer pill, not a stacking widget

		// Store scout ID globally so mode prompts can reference it
		(globalThis as any).__piScoutId = id;
		publishScoutStatus(state);

		// Spawn with a minimal warmup prompt — establishes the session file
		spawnAgent(state, "You are now on standby. Respond with exactly: Ready.", ctx);
	}

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

		// Clear stale scout state from previous session
		(globalThis as any).__piScoutId = undefined;
		(globalThis as any).__piScoutStatus = undefined;

		// Load model config from .pi/agents/models.json, then scan agent .md files.
		// Models come from the JSON config; .md files provide tools + system prompts.
		const extDir = path.dirname(fileURLToPath(import.meta.url));
		const extProjectDir = path.resolve(extDir, "..");
		modelsConfig = loadAgentModelsConfig(ctx.cwd || process.cwd(), extProjectDir);
		const standardAgents = scanAgentDefs(ctx.cwd || process.cwd(), extProjectDir, modelsConfig);
		const toolkitModelsConfig = loadToolkitModelsConfig(ctx.cwd || process.cwd(), extProjectDir);
		const toolkitAgents = scanToolkitAgentDefs(ctx.cwd || process.cwd(), extProjectDir, toolkitModelsConfig);
		knownAgents = new Map([...standardAgents, ...toolkitAgents]);

		// Pre-spawn scout subagent so it's always ready for recon tasks
		preSpawnScout(ctx);

		// ── Expose global hooks for escape-cancel integration ────────────
		(globalThis as any).__piKillAllSubagents = (): number => {
			let killed = 0;
			for (const [, state] of agents) {
				if (state.proc && state.status === "running") {
					try { state.proc.kill("SIGTERM"); } catch {}
					killed++;
				}
			}
			return killed;
		};
		(globalThis as any).__piHasRunningSubagents = (): boolean => {
			for (const [, state] of agents) {
				if (state.status === "running") return true;
			}
			return false;
		};
	});

	// ── /new resets — re-spawn scout for the new session ──────────────────────

	pi.on("session_switch", async (_event, ctx) => {
		// Kill running subagents and clear all widgets
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

		// Clear stale scout state
		(globalThis as any).__piScoutId = undefined;
		(globalThis as any).__piScoutStatus = undefined;

		// Re-spawn scout for the new session
		preSpawnScout(ctx);
	});
}
