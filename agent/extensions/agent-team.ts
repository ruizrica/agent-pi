// ABOUTME: Multi-agent team dispatcher with specialist agents and grid dashboard.
// ABOUTME: Primary agent delegates via dispatch_agent tool; teams defined in .pi/agents/teams.yaml.
/**
 * Agent Team — Dispatcher-only orchestrator with grid dashboard
 *
 * The primary Pi agent has NO codebase tools. It can ONLY delegate work
 * to specialist agents via the `dispatch_agent` tool. Each specialist
 * maintains its own Pi session for cross-invocation memory.
 *
 * Loads agent definitions from agents/*.md, .claude/agents/*.md, .pi/agents/*.md.
 * Teams are defined in .pi/agents/teams.yaml — on boot a select dialog lets
 * you pick which team to work with. Only team members are available for dispatch.
 *
 * Commands:
 *   /agents-team          — switch active team
 *   /agents-list          — list loaded agents
 *   /agents-grid N        — set column count (default 2)
 *   Ctrl+G                — toggle compact/expanded widget view
 *
 * Usage: pi -e extensions/agent-team.ts -e extensions/footer.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, type AutocompleteItem, visibleWidth, truncateToWidth, Container, Spacer, Box, Markdown, matchesKey, Key, type Component } from "@mariozechner/pi-tui";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import { readdirSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { statusButton } from "./lib/pipeline-render.ts";
import { DEFAULT_SUBAGENT_MODEL } from "./lib/defaults.ts";
import { padRight, wordWrap, sideBySide } from "./lib/ui-helpers.ts";
import { contextBudgetLevel, isContextLossError } from "./lib/context-budget.ts";
import { renderTaskList, navDown, navUp, navExit, navEnter, type TaskListInfo, type TaskListState } from "./lib/task-list-render.ts";

// ── Types ────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	tools: string;
	model: string; // full provider/model ID, empty = inherit parent
	systemPrompt: string;
	file: string;
}

interface AgentState {
	def: AgentDef;
	status: "idle" | "running" | "done" | "error";
	task: string;
	toolCount: number;
	elapsed: number;
	lastWork: string;
	contextPct: number;
	sessionFile: string | null;
	runCount: number;
	resolvedModel: string;
	timer?: ReturnType<typeof setInterval>;
	_warnSent?: boolean;
	_criticalWarned?: boolean;
}

// ── Display Name Helper ──────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function abbreviateAgentName(name: string): string {
	const parts = name.split("-");
	if (parts.length > 1) {
		// Multi-word: take first letter of each word and uppercase
		return parts.map(w => w.charAt(0).toUpperCase()).join("");
	} else {
		// Single-word: uppercase the entire name
		return name.toUpperCase();
	}
}

// ── Teams YAML Parser ────────────────────────────

function parseTeamsYaml(raw: string): Record<string, string[]> {
	const teams: Record<string, string[]> = {};
	let current: string | null = null;
	for (const line of raw.split("\n")) {
		const teamMatch = line.match(/^(\S[^:]*):$/);
		if (teamMatch) {
			current = teamMatch[1].trim();
			teams[current] = [];
			continue;
		}
		const itemMatch = line.match(/^\s+-\s+(.+)$/);
		if (itemMatch && current) {
			teams[current].push(itemMatch[1].trim());
		}
	}
	return teams;
}

// ── Frontmatter Parser ───────────────────────────

function parseAgentFile(filePath: string): AgentDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			model: frontmatter.model || "",
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

function scanAgentDirs(cwd: string, extProjectDir?: string): AgentDef[] {
	const dirs = [
		join(cwd, "agents"),
		join(cwd, ".claude", "agents"),
		join(cwd, ".pi", "agents"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents")] : []),
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			const scan = (d: string) => {
				for (const file of readdirSync(d, { withFileTypes: true })) {
					const fullPath = resolve(d, file.name);
					if (file.isDirectory()) {
						scan(fullPath);
					} else if (file.name.endsWith(".md")) {
						const def = parseAgentFile(fullPath);
						if (def && !seen.has(def.name.toLowerCase())) {
							seen.add(def.name.toLowerCase());
							agents.push(def);
						}
					}
				}
			};
			scan(dir);
		} catch {}
	}

	return agents;
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const agentStates: Map<string, AgentState> = new Map();
	let allAgentDefs: AgentDef[] = [];
	let teams: Record<string, string[]> = {};
	let activeTeamName = "";
	let gridCols = 2;
	let widgetCtx: any;
	let sessionDir = "";
	let contextWindow = 0;
	let widgetCompact = true;
	let selectedAgentIndex = -1; // -1 = no selection
	let taskListState: TaskListState = { selectedIndex: -1, scrollOffset: 0 };

	function loadAgents(cwd: string) {
		const extDir = dirname(fileURLToPath(import.meta.url));
		const extProjectDir = resolve(extDir, "..");

		// Create session storage dir
		sessionDir = join(cwd, ".pi", "agent-sessions");
		if (!existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}

		// Load all agent definitions
		allAgentDefs = scanAgentDirs(cwd, extProjectDir);

		// Load teams from .pi/agents/teams.yaml (fallback to extension project dir)
		let teamsPath = join(cwd, ".pi", "agents", "teams.yaml");
		if (!existsSync(teamsPath)) {
			teamsPath = join(extProjectDir, ".pi", "agents", "teams.yaml");
		}
		if (existsSync(teamsPath)) {
			try {
				teams = parseTeamsYaml(readFileSync(teamsPath, "utf-8"));
			} catch {
				teams = {};
			}
		} else {
			teams = {};
		}

		// If no teams defined, create a default "all" team
		if (Object.keys(teams).length === 0) {
			teams = { all: allAgentDefs.map(d => d.name) };
		}
	}

	function activateTeam(teamName: string) {
		activeTeamName = teamName;
		const members = teams[teamName] || [];
		const defsByName = new Map(allAgentDefs.map(d => [d.name.toLowerCase(), d]));

		agentStates.clear();
		selectedAgentIndex = -1; // Reset selection when team changes
		for (const member of members) {
			const def = defsByName.get(member.toLowerCase());
			if (!def) continue;
			const key = def.name.toLowerCase().replace(/\s+/g, "-");
			const sessionFile = join(sessionDir, `${key}.json`);
			agentStates.set(def.name.toLowerCase(), {
				def,
				status: "idle",
				task: "",
				toolCount: 0,
				elapsed: 0,
				lastWork: "",
				contextPct: 0,
				sessionFile: existsSync(sessionFile) ? sessionFile : null,
				runCount: 0,
				resolvedModel: "",
			});
		}

		// Auto-size grid columns based on team size
		const size = agentStates.size;
		gridCols = size <= 3 ? size : size === 4 ? 2 : 3;
	}

	// ── Grid Rendering ───────────────────────────

	// No longer needed - we're using pills only

	function updateWidget() {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("agent-team", (_tui: any, theme: any) => {
			const text = new Text("", 0, 0);

			return {
				render(width: number): string[] {
					if (agentStates.size === 0) {
						text.setText(theme.fg("dim", "No agents found. Add .md files to agents/"));
						return text.render(width);
					}

					// Filter out only idle agents - show all others including completed ones
					const active = Array.from(agentStates.values()).filter(
						(a) => a.status !== "idle",
					);

					// Sort: done/error first (left), running last (right) - rightmost will be active if any
					active.sort((a, b) => {
						const statusOrder: Record<string, number> = { "done": 0, "error": 0, "running": 1 };
						const aOrder = statusOrder[a.status] ?? 0;
						const bOrder = statusOrder[b.status] ?? 0;
						return aOrder - bOrder;
					});

					if (widgetCompact) {
						// Compact mode: task list + agent pills
						const allLines: string[] = [];

						// ── Task list widget ──────────────────────────
						const taskList = (globalThis as any).__piTaskList as TaskListInfo | null;
						if (taskList && taskList.tasks.length > 0) {
							const termHeight = process.stdout.rows || 24;
							// Reserve lines for agent pills (1) + some breathing room
							const availableHeight = Math.max(3, Math.min(termHeight - 10, 14));
							const taskLines = renderTaskList(
								taskList, taskListState, width, availableHeight,
								{ truncateToWidth, fg: (c: string, t: string) => theme.fg(c, t) },
							);
							const taskBg = "\x1b[48;5;236m";
							const taskReset = "\x1b[0m";
							allLines.push(...taskLines.map(l => taskBg + padRight(l, width) + taskReset));
						}

						// ── Agent pills line ─────────────────────────
						if (active.length === 0 && allLines.length === 0) {
							text.setText("");
							return [];
						}

						if (active.length > 0) {
							if (allLines.length > 0) allLines.push(""); // spacer

							// Try with full names + model first
							const sep = theme.fg("dim", "  ");
							let parts = active.map((a) => {
								const name = displayName(a.def.name);
								const model = a.def.model ? ` | ${a.def.model}` : "";
								return statusButton(a.status, name + model, theme);
							});
							let right = parts.join(sep);
							let rightVis = visibleWidth(right);

							if (rightVis > width) {
								// Try full names without model
								parts = active.map((a) => {
									const name = displayName(a.def.name);
									return statusButton(a.status, name, theme);
								});
								right = parts.join(sep);
								rightVis = visibleWidth(right);
							}
							if (rightVis > width) {
								// Switch to abbreviated names (no model)
								parts = active.map((a) => {
									const name = abbreviateAgentName(a.def.name);
									return statusButton(a.status, name, theme);
								});
								right = parts.join(sep);
							}

							allLines.push(right);
						}

						text.setText(allLines.join("\n"));
						return allLines;
					}

					// Expanded mode: show selectable pills in a row
					if (active.length === 0) {
						// Reset selection if no agents available
						if (selectedAgentIndex >= 0) {
							selectedAgentIndex = -1;
						}
						text.setText(theme.fg("dim", "No agents available. Press F1/F2 to navigate when agents are running."));
						return text.render(width);
					}

					// Reset selection if it's out of bounds (agent completed)
					if (selectedAgentIndex >= active.length) {
						selectedAgentIndex = -1;
					}

					// Map selectedAgentIndex to filtered active agents
					const selectedActiveIndex = selectedAgentIndex >= 0 && selectedAgentIndex < active.length 
						? selectedAgentIndex 
						: -1;

					// Add hint text if selection is active
					let hint = "";
					if (selectedActiveIndex >= 0) {
						hint = theme.fg("dim", "  (F3: details, F4: exit)");
					}
					const hintVis = visibleWidth(hint);

					// Try with full names first
					const sep = theme.fg("dim", "  ");
					let nameFormatter = (name: string) => displayName(name);
					let pills = active.map((a, idx) => {
						const name = nameFormatter(a.def.name);
						const pill = statusButton(a.status, name, theme);
						
						// Add selection indicator (border around selected pill)
						if (idx === selectedActiveIndex) {
							// Wrap with selection border: [pill]
							return theme.fg("accent", "[") + pill + theme.fg("accent", "]");
						}
						return pill;
					});

					let pillsLine = pills.join(sep);
					let pillsVis = visibleWidth(pillsLine);
					let totalVis = pillsVis + hintVis;

					// Check if pills fit
					if (totalVis > width) {
						// Switch to abbreviated names
						nameFormatter = abbreviateAgentName;
						pills = active.map((a, idx) => {
							const name = nameFormatter(a.def.name);
							const pill = statusButton(a.status, name, theme);
							
							// Add selection indicator (border around selected pill)
							if (idx === selectedActiveIndex) {
								// Wrap with selection border: [pill]
								return theme.fg("accent", "[") + pill + theme.fg("accent", "]");
							}
							return pill;
						});
						pillsLine = pills.join(sep);
						pillsVis = visibleWidth(pillsLine);
						totalVis = pillsVis + hintVis;
					}
					
					// Right-align pills: pad left side to push pills to the right
					const padding = Math.max(0, width - totalVis);
					const output = " ".repeat(padding) + pillsLine + hint;
					text.setText(output);
					return text.render(width);
				},
				invalidate() {
					text.invalidate();
				},
			};
		}, { placement: "aboveEditor" });
	}

	// ── Dispatch Agent (returns Promise) ─────────

	function dispatchAgent(
		agentName: string,
		task: string,
		ctx: any,
	): Promise<{ output: string; exitCode: number; elapsed: number; model: string }> {
		const key = agentName.toLowerCase();
		const state = agentStates.get(key);
		if (!state) {
			return Promise.resolve({
				output: `Agent "${agentName}" not found. Available: ${Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`,
				exitCode: 1,
				elapsed: 0,
				model: "",
			});
		}

		if (state.status === "running") {
			return Promise.resolve({
				output: `Agent "${displayName(state.def.name)}" is already running. Wait for it to finish.`,
				exitCode: 1,
				elapsed: 0,
				model: "",
			});
		}

		state.status = "running";
		state.task = task;
		state.toolCount = 0;
		state.elapsed = 0;
		state.lastWork = "";
		state.runCount++;
		updateWidget();

		const startTime = Date.now();
		state.timer = setInterval(() => {
			state.elapsed = Date.now() - startTime;
			updateWidget();
		}, 1000);

		const model = state.def.model
			|| (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : DEFAULT_SUBAGENT_MODEL);
		state.resolvedModel = model;

		// Session file for this agent
		const agentKey = state.def.name.toLowerCase().replace(/\s+/g, "-");
		const agentSessionFile = join(sessionDir, `${agentKey}.json`);

		// Build args — first run creates session, subsequent runs resume
		const extDir = dirname(fileURLToPath(import.meta.url));
		const tasksExtPath = join(extDir, "tasks.ts");
		const commanderExtPath = join(extDir, "commander-mcp.ts");

		// Resolve tools — append commander tools when Commander is available
		const g = globalThis as any;
		const commanderAvailable = !!(g.__piCommanderAvailable && g.__piCommanderClient);

		// Commander lifecycle: fire-and-forget helper (mirrors tasks.ts pattern)
		function commanderSync(fn: (client: any) => Promise<void>): void {
			if (!g.__piCommanderAvailable || !g.__piCommanderClient) return;
			fn(g.__piCommanderClient).catch(() => {});
		}

		// Hoist for use in pre-dispatch claim + post-dispatch reconciliation
		const canonicalName = state.def.name;
		const taskId = commanderAvailable ? g.__piCurrentTask?.commanderTaskId as number | undefined : undefined;

		let tools = state.def.tools;
		if (commanderAvailable) {
			tools = tools + ",commander_task,commander_mailbox,commander_orchestration";
		}

		// Build system prompt — append Commander discipline when available
		let systemPrompt = state.def.systemPrompt;
		if (commanderAvailable) {
			const hasTask = taskId !== undefined;
			const idStr = hasTask ? String(taskId) : "<id>";

			systemPrompt += `\n\n## Commander Task Discipline
You are agent "${canonicalName}".${hasTask ? ` Your Commander task ID is ${taskId}.` : ""}
${hasTask ? `At START:
- Claim: commander_task { operation: "claim", task_id: ${idStr}, agent_name: "${canonicalName}" }
- Notify: commander_mailbox { operation: "send", from_agent: "${canonicalName}", to_agent: "commander", body: "Starting task ${idStr}", message_type: "status", task_id: ${idStr} }

During WORK:
- Log progress: commander_task { operation: "log", task_id: ${idStr}, message: "<progress>", level: "info" }
- For long tasks (>30s), send heartbeats: commander_orchestration { operation: "agent:heartbeat", agent_name: "${canonicalName}" }

On SUCCESS:
- Notify: commander_mailbox { operation: "send", from_agent: "${canonicalName}", to_agent: "commander", body: "Task complete: <summary>", message_type: "status", task_id: ${idStr} }
- Complete: commander_task { operation: "complete", task_id: ${idStr}, result: "<summary>" }

On FAILURE:
- Fail: commander_task { operation: "fail", task_id: ${idStr}, error_message: "<what went wrong>" }` : "No Commander task assigned. Commander tools are available if needed."}`;
		}

		const args = [
			"--mode", "json",
			"-p",
			"--no-extensions",
			"-e", tasksExtPath,
			...(commanderAvailable ? ["-e", commanderExtPath] : []),
			"--model", model,
			"--tools", tools,
			"--thinking", "off",
			"--append-system-prompt", systemPrompt,
			"--session", agentSessionFile,
		];

		// Continue existing session if we have one
		if (state.sessionFile) {
			args.push("-c");
		}

		args.push(task);

		const textChunks: string[] = [];

		return new Promise((resolve) => {
			// Build env — include Commander task ID when available
			const spawnEnv: Record<string, string | undefined> = { ...process.env, PI_SUBAGENT: "1" };
			if (commanderAvailable) {
				const currentTask = g.__piCurrentTask as { commanderTaskId?: number } | null;
				if (currentTask?.commanderTaskId !== undefined) {
					spawnEnv.PI_COMMANDER_TASK_ID = String(currentTask.commanderTaskId);
				}
			}

			// Pre-dispatch: claim task in Commander before spawning
			if (commanderAvailable && taskId !== undefined) {
				commanderSync(async (client) => {
					await client.callTool("commander_task", {
						operation: "claim",
						task_id: taskId,
						agent_name: canonicalName,
					});
					await client.callTool("commander_mailbox", {
						operation: "send",
						from_agent: canonicalName,
						to_agent: "commander",
						body: `Starting task ${taskId}`,
						message_type: "status",
						task_id: taskId,
					});
				});
			}

			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: spawnEnv,
				cwd: ctx.cwd,
			});

			let buffer = "";
			let stderrBuf = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						if (event.type === "message_update") {
							const delta = event.assistantMessageEvent;
							if (delta?.type === "text_delta") {
								textChunks.push(delta.delta || "");
								const full = textChunks.join("");
								const last = full.split("\n").filter((l: string) => l.trim()).pop() || "";
								state.lastWork = last;
								updateWidget();
							}
						} else if (event.type === "tool_execution_start") {
							state.toolCount++;
							updateWidget();
						} else if (event.type === "message_end") {
							const msg = event.message;
							if (msg?.usage && contextWindow > 0) {
								state.contextPct = ((msg.usage.input || 0) / contextWindow) * 100;
								const level = contextBudgetLevel(state.contextPct);
								if (level === "warn" && !state._warnSent) {
									state._warnSent = true;
									ctx.ui.notify(`${displayName(state.def.name)} context at ${Math.round(state.contextPct)}%`, "info");
								} else if (level === "critical" && !state._criticalWarned) {
									state._criticalWarned = true;
									ctx.ui.notify(`${displayName(state.def.name)} context at ${Math.round(state.contextPct)}% — risk of context loss`, "warning");
								}
								updateWidget();
							}
						} else if (event.type === "agent_end") {
							const msgs = event.messages || [];
							const last = [...msgs].reverse().find((m: any) => m.role === "assistant");
							if (last?.usage && contextWindow > 0) {
								state.contextPct = ((last.usage.input || 0) / contextWindow) * 100;
								updateWidget();
							}
						}
					} catch {}
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => { stderrBuf += chunk; });

			proc.on("close", (code) => {
				if (buffer.trim()) {
					try {
						const event = JSON.parse(buffer);
						if (event.type === "message_update") {
							const delta = event.assistantMessageEvent;
							if (delta?.type === "text_delta") textChunks.push(delta.delta || "");
						}
					} catch {}
				}

				clearInterval(state.timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";

				// Mark session file as available for resume
				if (code === 0) {
					state.sessionFile = agentSessionFile;
				}

				let full = textChunks.join("");
				if ((code !== 0 && code !== null) && stderrBuf.trim()) {
					if (isContextLossError(stderrBuf)) {
						full = "Context overflow: agent session broke tool_use/tool_result pairing. " +
							"Clear session and re-dispatch.";
						state.sessionFile = null;
					} else {
						full = full.trim()
							? `${full}\n\n--- stderr ---\n${stderrBuf.trim()}`
							: stderrBuf.trim();
					}
				}
				state.lastWork = full.split("\n").filter((l: string) => l.trim()).pop() || "";
				updateWidget();

				// Post-dispatch: reconcile Commander task to terminal state
				if (commanderAvailable && taskId !== undefined) {
					const summary = textChunks.join("").trim().split("\n").pop() || canonicalName;
					if (state.status === "done") {
						commanderSync(async (client) => {
							await client.callTool("commander_task", {
								operation: "complete",
								task_id: taskId,
								result: summary,
							});
							await client.callTool("commander_mailbox", {
								operation: "send",
								from_agent: canonicalName,
								to_agent: "commander",
								body: `Task complete: ${summary}`,
								message_type: "status",
								task_id: taskId,
							});
						});
					} else {
						const errMsg = stderrBuf.trim() || summary || "Agent exited with error";
						commanderSync(async (client) => {
							await client.callTool("commander_task", {
								operation: "fail",
								task_id: taskId,
								error_message: errMsg,
							});
						});
					}
				}

				ctx.ui.notify(
					`${displayName(state.def.name)} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error"
				);

				resolve({
					output: full,
					exitCode: code ?? 1,
					elapsed: state.elapsed,
					model,
				});
			});

			proc.on("error", (err) => {
				clearInterval(state.timer);
				state.status = "error";
				state.lastWork = `Error: ${err.message}`;
				updateWidget();
				resolve({
					output: `Error spawning agent: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
					model,
				});
			});

			proc.on("exit", () => { clearInterval(state.timer); });
		});
	}

	// ── dispatch_agent Tool (registered at top level) ──

	pi.registerTool({
		name: "dispatch_agent",
		label: "Dispatch Agent",
		description: "Dispatch a task to a specialist agent. The agent will execute the task and return the result. Use the system prompt to see available agent names.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (case-insensitive)" }),
			task: Type.String({ description: "Task description for the agent to execute" }),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { agent, task } = params as { agent: string; task: string };
			const defModel = agentStates.get(agent.toLowerCase())?.def.model || "";

			try {
				if (onUpdate) {
					onUpdate({
						content: [{ type: "text", text: `Dispatching to ${agent}...` }],
						details: { agent, task, status: "dispatching", model: defModel },
					});
				}

				const result = await dispatchAgent(agent, task, ctx);

				const truncated = result.output.length > 8000
					? result.output.slice(0, 8000) + "\n\n... [truncated]"
					: result.output;

				const status = result.exitCode === 0 ? "done" : "error";
				const summary = `[${agent}] ${status} in ${Math.round(result.elapsed / 1000)}s`;

				return {
					content: [{ type: "text", text: `${summary}\n\n${truncated}` }],
					details: {
						agent,
						task,
						status,
						elapsed: result.elapsed,
						exitCode: result.exitCode,
						fullOutput: result.output,
						model: result.model,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Error dispatching to ${agent}: ${err?.message || err}` }],
					details: { agent, task, status: "error", elapsed: 0, exitCode: 1, fullOutput: "", model: defModel },
				};
			}
		},

		renderCall(args, theme) {
			return new Text(
				theme.fg("dim", "dispatching:"),
				0, 0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			const modelSuffix = details.model ? ` | ${details.model}` : "";

			// Streaming/partial result while agent is still running
			if (options.isPartial || details.status === "dispatching") {
				const runningBtn = statusButton("running", (details.agent || "?") + modelSuffix, theme, false);
				return new Text(
					runningBtn,
					0, 0,
				);
			}

			const status = details.status === "done" ? "done" : "error";
			const agentLabel = (details.agent ?? "?") + modelSuffix;
			const statusBtn = statusButton(status, agentLabel, theme, false);
			const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
			const header = statusBtn +
				theme.fg("dim", ` ${elapsed}s`);

			if (options.expanded && details.fullOutput) {
				const output = details.fullOutput.length > 4000
					? details.fullOutput.slice(0, 4000) + "\n... [truncated]"
					: details.fullOutput;
				return new Text(header + "\n" + theme.fg("muted", output), 0, 0);
			}

			return new Text(header, 0, 0);
		},
	});

	// ── Commands ─────────────────────────────────

	pi.registerCommand("agents-team", {
		description: "Select a team to work with",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			const teamNames = Object.keys(teams);
			if (teamNames.length === 0) {
				ctx.ui.notify("No teams defined in .pi/agents/teams.yaml", "warning");
				return;
			}

			const options = teamNames.map(name => {
				const members = teams[name].map(m => displayName(m));
				return `${name} — ${members.join(", ")}`;
			});

			const choice = await ctx.ui.select("Select Team", options);
			if (choice === undefined) return;

			const idx = options.indexOf(choice);
			const name = teamNames[idx];
			activateTeam(name);
			updateWidget();
			ctx.ui.setStatus("agent-team", `Team: ${name} (${agentStates.size})`);
			ctx.ui.notify(`Team: ${name} — ${Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`, "info");
		},
	});

	pi.registerCommand("agents-list", {
		description: "List all loaded agents",
		handler: async (_args, _ctx) => {
			widgetCtx = _ctx;
			const names = Array.from(agentStates.values())
				.map(s => {
					const session = s.sessionFile ? "resumed" : "new";
					return `${displayName(s.def.name)} (${s.status}, ${session}, runs: ${s.runCount}): ${s.def.description}`;
				})
				.join("\n");
			_ctx.ui.notify(names || "No agents loaded", "info");
		},
	});

	pi.registerCommand("agents-grid", {
		description: "Set grid columns: /agents-grid <1-6>",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = ["1", "2", "3", "4", "5", "6"].map(n => ({
				value: n,
				label: `${n} columns`,
			}));
			const filtered = items.filter(i => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, _ctx) => {
			widgetCtx = _ctx;
			const n = parseInt(args?.trim() || "", 10);
			if (n >= 1 && n <= 6) {
				gridCols = n;
				_ctx.ui.notify(`Grid set to ${gridCols} columns`, "info");
				updateWidget();
			} else {
				_ctx.ui.notify("Usage: /agents-grid <1-6>", "error");
			}
		},
	});

	// ── Audit Command ──────────────────────────────


	// ── Agent Detail Overlay ──────────────────────

	class AgentDetailOverlay {
		private scrollOffset = 0;
		private totalContentLines = 0;

		constructor(
			private agent: AgentState,
			private onDone: () => void,
		) {}

		handleInput(data: string, tui: any): void {
			// Calculate max scroll based on current content
			const height = process.stdout.rows || 24;
			const contentHeight = height - 1; // Reserve 1 line for footer
			const maxScroll = Math.max(0, this.totalContentLines - contentHeight);

			if (matchesKey(data, Key.up)) {
				this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			} else if (matchesKey(data, Key.down)) {
				this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
			} else if (matchesKey(data, Key.pageUp)) {
				this.scrollOffset = Math.max(0, this.scrollOffset - Math.max(1, contentHeight - 1));
			} else if (matchesKey(data, Key.pageDown)) {
				this.scrollOffset = Math.min(maxScroll, this.scrollOffset + Math.max(1, contentHeight - 1));
			} else if (matchesKey(data, Key.home)) {
				this.scrollOffset = 0;
			} else if (matchesKey(data, Key.end)) {
				this.scrollOffset = maxScroll;
			} else if (matchesKey(data, Key.escape)) {
				this.onDone();
				return;
			}
			tui.requestRender();
		}

		render(width: number, height: number, theme: any): string[] {
			const container = new Container();
			const mdTheme = getPiMdTheme();

			// Full width with minimal padding
			const panelW = width - 4; // 2 chars padding each side
			const innerWidth = panelW - 2; // Account for border

			// Header with agent name pill and status
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			const name = displayName(this.agent.def.name);
			const statusBtn = statusButton(this.agent.status, name, theme, false);
			const timeStr = this.agent.status !== "idle" ? ` ${Math.round(this.agent.elapsed / 1000)}s` : "";
			container.addChild(new Text(
				`${statusBtn}${timeStr}`,
				1, 0,
			));
			container.addChild(new Spacer(1));

			// Section header helper - fills width with line characters
			const sectionHeader = (title: string) => {
				const label = ` ─── ${title} `;
				const remaining = Math.max(0, innerWidth - visibleWidth(label));
				return theme.fg("accent", theme.bold(label + "─".repeat(remaining)));
			};

			// Metadata section (full width, vertical list)
			container.addChild(new Text(sectionHeader("METADATA"), 1, 0));
			const formatRow = (label: string, value: string, valueColor: string = "muted") => {
				const labelStr = theme.fg("accent", theme.bold(padRight(label + ":", 14)));
				const valueStr = theme.fg(valueColor, value);
				return labelStr + " " + valueStr;
			};

			// Helper to add wrapped metadata rows
			const addWrappedRow = (label: string, value: string, valueColor: string = "muted") => {
				const labelWidth = 14;
				const valueWidth = innerWidth - labelWidth - 1;
				const wrapped = wordWrap(value, valueWidth);
				for (let i = 0; i < wrapped.length; i++) {
					const displayLabel = i === 0 ? label : "";
					container.addChild(new Text(formatRow(displayLabel, wrapped[i], valueColor), 1, 0));
				}
			};

			// STATUS - color based on state
			const statusColorMap: Record<string, string> = { running: "accent", done: "success", error: "error", idle: "dim" };
			const statusColor = statusColorMap[this.agent.status] || "muted";
			container.addChild(new Text(formatRow("STATUS", this.agent.status.toUpperCase(), statusColor), 1, 0));

			// DESCRIPTION - if present
			if (this.agent.def.description) {
				addWrappedRow("DESCRIPTION", this.agent.def.description, "muted");
			}

			// MODEL - accent color
			addWrappedRow("MODEL", this.agent.resolvedModel || this.agent.def.model || "(unknown)", "accent");

			// TOOLS - success color
			addWrappedRow("TOOLS", this.agent.def.tools, "success");

			// CONTEXT - conditional color based on percentage
			const pct = Math.ceil(this.agent.contextPct);
			const ctxColor = pct > 80 ? "error" : pct > 50 ? "warning" : "success";
			container.addChild(new Text(formatRow("CONTEXT", `${pct}%`, ctxColor), 1, 0));

			// RUNS - accent color
			container.addChild(new Text(formatRow("RUNS", this.agent.runCount.toString(), "accent"), 1, 0));

			// TOOLS USED - accent color
			container.addChild(new Text(formatRow("TOOLS USED", this.agent.toolCount.toString(), "accent"), 1, 0));

			// FILE - dim color (path)
			addWrappedRow("FILE", this.agent.def.file, "dim");

			// SESSION - dim color (path)
			if (this.agent.sessionFile) {
				addWrappedRow("SESSION", this.agent.sessionFile, "dim");
			}
			container.addChild(new Spacer(1));

			// System prompt section (full width)
			container.addChild(new Text(sectionHeader("SYSTEM PROMPT"), 1, 0));
			container.addChild(new Spacer(1));
			// Render system prompt as markdown - it will handle its own wrapping
			const sysPromptMd = new Markdown(this.agent.def.systemPrompt, 1, 0, mdTheme);
			container.addChild(sysPromptMd);
			container.addChild(new Spacer(1));

			// Task section (if present) - render as markdown
			if (this.agent.task) {
				container.addChild(new Text(sectionHeader("CURRENT TASK"), 1, 0));
				container.addChild(new Spacer(1));
				const taskMd = new Markdown(this.agent.task, 1, 0, mdTheme);
				container.addChild(taskMd);
				container.addChild(new Spacer(1));
			}

			// Last work section (if present) - render as markdown
			if (this.agent.lastWork) {
				container.addChild(new Text(sectionHeader("LAST WORK"), 1, 0));
				container.addChild(new Spacer(1));
				const workMd = new Markdown(this.agent.lastWork, 1, 0, mdTheme);
				container.addChild(workMd);
				container.addChild(new Spacer(1));
			}

			// Render all content (without footer)
			const allLines = container.render(panelW);
			this.totalContentLines = allLines.length; // Store for handleInput
			const contentHeight = height - 1; // Reserve 1 line for footer
			const maxScroll = Math.max(0, allLines.length - contentHeight);
			
			// Clamp scroll offset to valid range
			this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

			// Apply scrolling - show content lines, footer always at bottom
			const visibleContentLines = allLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);

			// Footer (always visible at bottom, separate from scrollable content)
			const scrollInfo = maxScroll > 0 
				? ` ↑/↓/PgUp/PgDn/Home/End Scroll (${this.scrollOffset + 1}-${Math.min(this.scrollOffset + contentHeight, allLines.length)}/${allLines.length}) • Esc Close`
				: " Esc Close";
			const footer = theme.fg("dim", scrollInfo);
			const footerLine = padRight(footer, panelW);

			// Dark backdrop: full screen from top to bottom
			const dimBg = "\x1b[48;2;10;10;15m";
			const reset = "\x1b[0m";

			const result: string[] = [];
			// Render visible content lines from top
			// Pad each line to panelW before wrapping with background to ensure full coverage
			for (const line of visibleContentLines) {
				result.push(dimBg + "  " + padRight(line, panelW) + "  " + reset);
			}

			// Add footer at bottom (already padded to panelW)
			result.push(dimBg + "  " + footerLine + "  " + reset);

			// Fill remaining height with dark background
			while (result.length < height) {
				result.push(dimBg + " ".repeat(width) + reset);
			}

			return result;
		}
	}

	async function showAgentDetail(ctx: any, agent: AgentState) {
		await ctx.ui.custom((tui, theme, _kb, done) => {
			const overlay = new AgentDetailOverlay(agent, () => done(undefined));
			return {
				render: (w) => overlay.render(w, process.stdout.rows || 24, theme),
				handleInput: (data) => overlay.handleInput(data, tui),
				invalidate: () => {},
			};
		}, {
			overlay: true,
			overlayOptions: { width: "100%" },
		});
	}

	pi.registerShortcut("ctrl+g", {
		description: "Toggle agent team compact/expanded view",
		handler: async (ctx) => {
			widgetCtx = ctx;
			widgetCompact = !widgetCompact;
			updateWidget();
		},
	});

	const selectNext = async (ctx: any) => {
		if (!ctx.hasUI) return;
		widgetCtx = ctx;
		// Filter out only idle agents - include completed ones
		const active = Array.from(agentStates.values()).filter(
			(a) => a.status !== "idle",
		);
		const count = active.length;
		if (count === 0) {
			selectedAgentIndex = -1;
			return;
		}
		// Auto-expand to expanded view if in compact mode so selection is visible
		if (widgetCompact) {
			widgetCompact = false;
		}
		if (selectedAgentIndex < 0) selectedAgentIndex = 0;
		selectedAgentIndex = (selectedAgentIndex + 1) % count;
		updateWidget();
	};

	const selectPrev = async (ctx: any) => {
		if (!ctx.hasUI) return;
		widgetCtx = ctx;
		// Filter out only idle agents - include completed ones
		const active = Array.from(agentStates.values()).filter(
			(a) => a.status !== "idle",
		);
		const count = active.length;
		if (count === 0) {
			selectedAgentIndex = -1;
			return;
		}
		// Auto-expand to expanded view if in compact mode so selection is visible
		if (widgetCompact) {
			widgetCompact = false;
		}
		if (selectedAgentIndex < 0) selectedAgentIndex = count - 1;
		selectedAgentIndex = (selectedAgentIndex - 1 + count) % count;
		updateWidget();
	};

	const exitSelection = async (ctx: any) => {
		if (!ctx.hasUI) return;
		widgetCtx = ctx;
		selectedAgentIndex = -1;
		updateWidget();
	};

	// ── System Prompt Override ───────────────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		// Mode gate: only fire when mode is TEAM (or unset for backward compat)
		const mode = (globalThis as any).__piCurrentMode;
		if (mode && mode !== "TEAM") return {};

		// Build dynamic agent catalog from active team only
		const agentCatalog = Array.from(agentStates.values())
			.map(s => `### ${displayName(s.def.name)}\n**Dispatch as:** \`${s.def.name}\`\n${s.def.description}\n**Tools:** ${s.def.tools}` + (s.def.model ? `\n**Model:** ${s.def.model}` : ""))
			.join("\n\n");

		const teamMembers = Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ");

		const commanderAvailable = !!(globalThis as any).__piCommanderAvailable;
		const commanderSection = commanderAvailable ? `

## Commander Integration
Commander is available. Use these tools when appropriate:
- \`commander_session { operation: "file:open", file_path: <path> }\` — display key files in Commander's floating viewer
- \`commander_task\` — track tasks in the Commander dashboard
- \`commander_mailbox\` — broadcast status updates to the dashboard
- Use file:open to show dispatched agent results or task lists` : "";

		return {
			systemPrompt: `You coordinate specialist agents but also work directly when appropriate.
You have direct access to all codebase tools and can dispatch specialist agents.

## Active Team: ${activeTeamName}
Members: ${teamMembers}
You can ONLY dispatch to agents listed below. Do not attempt to dispatch to agents outside this team.

## When to Work Directly
- Simple one-off commands: reading a file, checking status, listing contents
- Quick lookups, small edits, answering questions about the codebase
- Anything you can handle in a single step without needing specialists

## When to Dispatch Agents
- Significant work: new features, refactors, multi-file changes
- Tasks that benefit from specialist knowledge
- When you want structured, multi-agent collaboration

## Guidelines
- Use your judgment — if it's quick, just do it; if it's real work, dispatch
- You can mix direct work and agent dispatches in the same conversation
- You can chain agents: use scout to explore, then builder to implement
- You can dispatch the same agent multiple times with different tasks
- Keep tasks focused — one clear objective per dispatch

## Asking the User
- You have the ask_user tool to ask the user questions directly
- Use it when you need clarification, decisions, or preferences before dispatching agents
- Three modes: "select" (pick from options with markdown preview), "input" (free text), "confirm" (yes/no)
- If a sub-agent needs user input, it should describe what it needs — then YOU ask the user and relay the answer

## Task Management
- You have direct access to the \`tasks\` tool — use it yourself, do NOT dispatch agents for task management
- Use \`tasks new-list\` to start a themed list, \`tasks add\` to add items, \`tasks toggle\` to cycle status
- Define your plan as tasks BEFORE dispatching agents

## Agents

${agentCatalog}${commanderSection}`,
		};
	});

	// ── Reset helpers ─────────────────────────────────────────────────

	function resetAgentState(state: AgentState) {
		state.status = "idle";
		state.task = "";
		state.toolCount = 0;
		state.elapsed = 0;
		state.lastWork = "";
		state.contextPct = 0;
		state.resolvedModel = "";
	}

	// ── Reset agent boxes on new message ───────────────────────────────

	pi.on("input", () => {
		// When user sends a new message, reset completed/error agents to idle
		// so the boxes display cleanly for the new task
		for (const state of agentStates.values()) {
			if (state.status === "done" || state.status === "error") {
				resetAgentState(state);
			}
		}
		updateWidget();
	});

	// ── Reset agent boxes on /new ─────────────────────────────────────

	pi.on("session_switch", async (_event, _ctx) => {
		// /new fires session_switch — clear all agent boxes from previous session
		if (widgetCtx) {
			widgetCtx.ui.setWidget("agent-team", undefined);
		}
		widgetCtx = _ctx;
		for (const state of agentStates.values()) {
			resetAgentState(state);
		}
		updateWidget();
	});

	// ── Session Start ────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		applyExtensionDefaults(import.meta.url, _ctx);
		// Clear widgets from previous session
		if (widgetCtx) {
			widgetCtx.ui.setWidget("agent-team", undefined);
		}
		widgetCtx = _ctx;
		contextWindow = _ctx.model?.contextWindow || 0;

		// Wipe old agent session files so subagents start fresh
		const sessDir = join(_ctx.cwd, ".pi", "agent-sessions");
		if (existsSync(sessDir)) {
			for (const f of readdirSync(sessDir)) {
				if (f.endsWith(".json")) {
					try { unlinkSync(join(sessDir, f)); } catch {}
				}
			}
		}

		loadAgents(_ctx.cwd);

		// Default to first team — use /agents-team to switch
		const teamNames = Object.keys(teams);
		if (teamNames.length > 0) {
			activateTeam(teamNames[0]);
		}

		// All tools remain visible — dispatcher can use any registered tool directly

		_ctx.ui.setStatus("agent-team", `Team: ${activeTeamName} (${agentStates.size})`);
		updateWidget();

		// Use footer.ts for footer — do not overwrite; widget uses placement: belowEditor

		// Register nav providers for F-key navigation
		const providers = ((globalThis as any).__piNavProviders = (globalThis as any).__piNavProviders || []);

		// Task list nav provider (first priority when tasks exist)
		providers.push({
			isActive: () => {
				const tl = (globalThis as any).__piTaskList as TaskListInfo | null;
				return !!(tl && tl.tasks.length > 0);
			},
			selectPrev: (ctx: any) => {
				if (!ctx.hasUI) return;
				widgetCtx = ctx;
				const tl = (globalThis as any).__piTaskList as TaskListInfo | null;
				if (!tl || tl.tasks.length === 0) return;
				if (taskListState.selectedIndex < 0) {
					taskListState = navEnter(taskListState, tl.tasks.length);
				} else {
					taskListState = navUp(taskListState);
				}
				updateWidget();
			},
			selectNext: (ctx: any) => {
				if (!ctx.hasUI) return;
				widgetCtx = ctx;
				const tl = (globalThis as any).__piTaskList as TaskListInfo | null;
				if (!tl || tl.tasks.length === 0) return;
				if (taskListState.selectedIndex < 0) {
					taskListState = navEnter(taskListState, tl.tasks.length);
				} else {
					taskListState = navDown(taskListState, tl.tasks.length);
				}
				updateWidget();
			},
			showDetail: async (_ctx: any) => {
				// Could open /tasks overlay in the future
			},
			exitSelection: (ctx: any) => {
				if (!ctx.hasUI) return;
				widgetCtx = ctx;
				taskListState = navExit(taskListState);
				updateWidget();
			},
		});

		// Agent pills nav provider
		providers.push({
			isActive: () => {
				const active = Array.from(agentStates.values()).filter(a => a.status !== "idle");
				return active.length > 0;
			},
			selectPrev: selectPrev,
			selectNext: selectNext,
			showDetail: async (ctx: any) => {
				if (!ctx.hasUI) return;
				const active = Array.from(agentStates.values()).filter(
					(a) => a.status !== "idle",
				);
				const count = active.length;
				if (count === 0 || selectedAgentIndex < 0 || selectedAgentIndex >= count) return;
				const agent = active[selectedAgentIndex];
				if (!agent) return;
				await showAgentDetail(ctx, agent);
			},
			exitSelection: exitSelection,
		});
	});
}
