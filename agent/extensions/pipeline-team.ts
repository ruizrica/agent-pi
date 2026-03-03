// ABOUTME: Pipeline-Team — Hybrid sequential pipeline with parallel agent dispatch
// ABOUTME: Combines agent-chain (sequential phases) with agent-team (parallel dispatch) plus Alt+P overlay
/**
 *
 * Pipeline: UNDERSTAND → GATHER → PLAN → EXECUTE → REVIEW
 *
 * Phase 1 (UNDERSTAND): Interactive — primary agent converses with user
 * Phase 2 (GATHER): Parallel scouts explore codebase concurrently
 * Phase 3 (PLAN): Sequential planner creates implementation plan
 * Phase 4 (EXECUTE): Parallel builders implement the plan
 * Phase 5 (REVIEW): Agent-driven loop — reviewer audits, primary decides approve/re-dispatch
 *
 * Commands:
 *   /pipeline            — select pipeline config from YAML (opt-in activation)
 *   /pipeline-status     — full pipeline state notification
 *   /pipeline-reset      — reset pipeline to phase 1
 *   /pipeline-clear      — clear pipeline widget from screen (keeps pipeline active)
 *   /pipeline-off       — deactivate pipeline and hide UI
 *
 * Usage: pi -e extensions/pipeline-team.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	Box, Text, Container, Spacer, Markdown,
	matchesKey, Key, truncateToWidth, visibleWidth,
} from "@mariozechner/pi-tui";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import { readFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "fs";
import { join, resolve, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { outputLine, outputBox, type BarColor } from "./lib/output-box.ts";
import { renderVerticalTimeline, renderCollapsedTimeline, statusButton } from "./lib/pipeline-render.ts";
import { DEFAULT_SUBAGENT_MODEL } from "./lib/defaults.ts";
import { parsePipelineYaml, type PhaseAgentDef, type PhaseDef, type PipelineConfig } from "./lib/parse-pipeline-yaml.ts";

// ── Types ────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	tools: string;
	model: string; // full provider/model ID, empty = use default
	systemPrompt: string;
}

interface AgentState {
	role: string;
	index: number;
	status: "idle" | "running" | "done" | "error";
	task: string;
	elapsed: number;
	lastWork: string;
	output: string;
	timer?: ReturnType<typeof setInterval>;
}

type PhaseStatus = "pending" | "active" | "done" | "error";

interface PhaseState {
	def: PhaseDef;
	status: PhaseStatus;
	summary: string;
	agents: AgentState[];
}

// ── Display Name Helper ──────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Frontmatter Parser (reused from agent-team) ──

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
		};
	} catch {
		return null;
	}
}

function scanAgentDirs(cwd: string, extProjectDir?: string): Map<string, AgentDef> {
	const dirs = [
		join(cwd, "agents"),
		join(cwd, ".claude", "agents"),
		join(cwd, ".pi", "agents"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents")] : []),
	];

	const agents = new Map<string, AgentDef>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const fullPath = resolve(dir, file);
				const def = parseAgentFile(fullPath);
				if (def && !agents.has(def.name.toLowerCase())) {
					agents.set(def.name.toLowerCase(), def);
				}
			}
		} catch {}
	}

	return agents;
}

// ── Context Helpers ──────────────────────────────

const CONTEXT_MAX = 30000;

function truncateContext(text: string): string {
	if (text.length <= CONTEXT_MAX) return text;
	return text.slice(0, CONTEXT_MAX) + "\n\n... [context truncated at 30000 chars]";
}

function resolveTemplate(
	template: string,
	vars: { task: string; context: string; plan: string; input: string; review: string },
): string {
	return template
		.replace(/\$TASK/g, vars.task)
		.replace(/\$CONTEXT/g, truncateContext(vars.context))
		.replace(/\$PLAN/g, vars.plan)
		.replace(/\$INPUT/g, vars.input)
		.replace(/\$REVIEW/g, vars.review);
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let allAgents: Map<string, AgentDef> = new Map();
	let pipelineConfigs: PipelineConfig[] = [];
	let activeConfig: PipelineConfig | null = null;
	let phaseStates: PhaseState[] = [];
	let currentPhaseIndex = 0;
	let widgetCtx: any;
	let widgetCollapsed = true;
	let sessionDir = "";
	let contextWindow = 0;

	// Accumulated context across phases
	let taskSummary = "";   // $TASK — from phase 1
	let accContext = "";     // $CONTEXT — accumulated from all phases
	let planOutput = "";     // $PLAN — from phase 3
	let reviewOutput = "";   // $REVIEW — from phase 5 (when looping)
	let reviewLoopCount = 0;

	// ── Load Config ──────────────────────────────

	function loadConfig(cwd: string) {
		sessionDir = join(cwd, ".pi", "agent-sessions");
		if (!existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}

		const extDir = dirname(fileURLToPath(import.meta.url));
		const extProjectDir = resolve(extDir, "..");
		allAgents = scanAgentDirs(cwd, extProjectDir);

		// Look for config in cwd first, fall back to extension's own project dir
		let configPath = join(cwd, ".pi", "agents", "pipeline-team.yaml");
		if (!existsSync(configPath)) {
			configPath = join(extProjectDir, ".pi", "agents", "pipeline-team.yaml");
		}
		if (existsSync(configPath)) {
			try {
				pipelineConfigs = parsePipelineYaml(readFileSync(configPath, "utf-8"));
			} catch {
				pipelineConfigs = [];
			}
		} else {
			pipelineConfigs = [];
		}
	}

	function activatePipeline(config: PipelineConfig) {
		activeConfig = config;
		(globalThis as any).__piActivePipeline = config.name;
		currentPhaseIndex = 0;
		taskSummary = "";
		accContext = "";
		planOutput = "";
		reviewOutput = "";
		reviewLoopCount = 0;

		phaseStates = config.phases.map(p => ({
			def: p,
			status: "pending" as PhaseStatus,
			summary: "",
			agents: [],
		}));

		if (phaseStates.length > 0) {
			phaseStates[0].status = "active";
		}

		updateWidget();
	}

	function resetPipeline() {
		if (activeConfig) activatePipeline(activeConfig);
	}


	// ── Widget ───────────────────────────────────

	function clearPipelineUI() {
		if (!widgetCtx) return;
		widgetCtx.ui.setWidget("pipeline-team", undefined);
		widgetCtx.ui.setStatus("pipeline-team", undefined);
	}

	function updateStatus() {
		if (!widgetCtx) return;
		if (!activeConfig) {
			widgetCtx.ui.setStatus("pipeline-team", undefined);
			return;
		}
		const phase = phaseStates[currentPhaseIndex];
		if (phase) {
			widgetCtx.ui.setStatus("pipeline-team", phase.def.name.toUpperCase());
		}
	}

	function updateWidget() {
		if (!widgetCtx) return;
		if (!activeConfig || phaseStates.length === 0) {
			clearPipelineUI();
			return;
		}
		// Only show when agents are actively running
		const hasActiveWork = phaseStates.some((ps) =>
			ps.agents.some((a) => a.status === "running"),
		);
		if (!hasActiveWork) {
			clearPipelineUI();
			return;
		}
		updateStatus();

		widgetCtx.ui.setWidget("pipeline-team", (_tui: any, theme: any) => {
			const text = new Text("", 0, 1);

			return {
				render(width: number): string[] {
					if (!activeConfig || phaseStates.length === 0) return [];
					const renderPhases = phaseStates.map(s => ({
						name: s.def.name,
						status: s.status,
						summary: s.summary,
						agents: s.agents.map(a => ({
							role: a.role,
							index: a.index,
							status: a.status,
							lastWork: a.lastWork,
							task: a.task,
							elapsed: a.elapsed,
						})),
					}));

					const rawLines = widgetCollapsed
						? renderCollapsedTimeline(renderPhases, currentPhaseIndex, activeConfig!.name, width, theme)
						: renderVerticalTimeline(renderPhases, currentPhaseIndex, width, theme);

					const allDone = phaseStates.every(p => p.status === "done");
					const hasError = phaseStates.some(p => p.status === "error");
					const barColor: BarColor = hasError ? "error" : allDone ? "success" : "accent";
					const outputLines = outputBox(theme, barColor, rawLines);

					text.setText(outputLines.join("\n"));
					return text.render(width);
				},
				invalidate() {
					text.invalidate();
				},
			};
		}, { placement: "belowEditor" });
	}

	// ── Subprocess Spawning ──────────────────────

	function spawnAgent(
		agentDef: AgentDef,
		task: string,
		agentState: AgentState,
		ctx: any,
	): Promise<{ output: string; exitCode: number; elapsed: number }> {
		agentState.status = "running";
		agentState.task = task;
		agentState.elapsed = 0;
		agentState.lastWork = "";
		agentState.output = "";
		updateWidget();

		const startTime = Date.now();
		agentState.timer = setInterval(() => {
			agentState.elapsed = Date.now() - startTime;
			updateWidget();
		}, 1000);

		// Use agent's defined model or fall back to default subagent model.
		// NOTE: We intentionally do NOT inherit the parent model. Each agent
		// should use its explicitly defined model or the lightweight default.
		const model = agentDef.model || DEFAULT_SUBAGENT_MODEL;

		const agentKey = `pipeline-${agentDef.name.toLowerCase().replace(/\s+/g, "-")}-${agentState.index}`;
		const agentSessionFile = join(sessionDir, `${agentKey}.json`);

		const tasksExtPath = join(dirname(fileURLToPath(import.meta.url)), "tasks.ts");
		const args = [
			"--mode", "json",
			"-p",
			"--no-extensions",
			"-e", tasksExtPath,
			"--model", model,
			"--tools", agentDef.tools,
			"--thinking", "off",
			"--append-system-prompt", agentDef.systemPrompt,
			"--session", agentSessionFile,
			task,
		];

		const textChunks: string[] = [];

		return new Promise((resolvePromise) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, PI_SUBAGENT: "1" },
			});

			let buffer = "";

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
								agentState.lastWork = last;
								updateWidget();
							}
						}
					} catch {}
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", () => {});

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

				clearInterval(agentState.timer);
				agentState.elapsed = Date.now() - startTime;
				const output = textChunks.join("");
				agentState.output = output;
				agentState.status = code === 0 ? "done" : "error";
				agentState.lastWork = output.split("\n").filter((l: string) => l.trim()).pop() || "";
				updateWidget();

				ctx.ui.notify(
					`${displayName(agentState.role)} #${agentState.index + 1} ${agentState.status} in ${Math.round(agentState.elapsed / 1000)}s`,
					agentState.status === "done" ? "success" : "error",
				);

				resolvePromise({ output, exitCode: code ?? 1, elapsed: agentState.elapsed });
			});

			proc.on("error", (err) => {
				clearInterval(agentState.timer);
				agentState.status = "error";
				agentState.lastWork = `Error: ${err.message}`;
				agentState.output = `Error spawning agent: ${err.message}`;
				updateWidget();
				resolvePromise({
					output: `Error spawning agent: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
				});
			});

			proc.on("exit", () => { clearInterval(agentState.timer); });
		});
	}

	// ── Dispatch Agents for a Phase ──────────────

	async function dispatchPhaseAgents(
		agentDefs: { role: string; task: string }[],
		mode: "parallel" | "sequential",
		ctx: any,
	): Promise<{ outputs: string[]; success: boolean }> {
		const phaseState = phaseStates[currentPhaseIndex];
		phaseState.agents = agentDefs.map((d, i) => ({
			role: d.role,
			index: i,
			status: "idle" as const,
			task: d.task,
			elapsed: 0,
			lastWork: "",
			output: "",
		}));
		updateWidget();

		const outputs: string[] = [];
		let allSuccess = true;

		if (mode === "parallel") {
			const promises = agentDefs.map((d, i) => {
				const def = allAgents.get(d.role.toLowerCase());
				if (!def) {
					phaseState.agents[i].status = "error";
					phaseState.agents[i].lastWork = `Agent "${d.role}" not found`;
					updateWidget();
					return Promise.resolve({ output: `Agent "${d.role}" not found`, exitCode: 1, elapsed: 0 });
				}
				return spawnAgent(def, d.task, phaseState.agents[i], ctx);
			});

			const results = await Promise.all(promises);
			for (const r of results) {
				outputs.push(r.output);
				if (r.exitCode !== 0) allSuccess = false;
			}
		} else {
			// Sequential — each agent's output becomes $INPUT for next
			let input = "";
			for (let i = 0; i < agentDefs.length; i++) {
				const d = agentDefs[i];
				const def = allAgents.get(d.role.toLowerCase());
				if (!def) {
					phaseState.agents[i].status = "error";
					phaseState.agents[i].lastWork = `Agent "${d.role}" not found`;
					updateWidget();
					outputs.push(`Agent "${d.role}" not found`);
					allSuccess = false;
					break;
				}

				const task = d.task.replace(/\$INPUT/g, input);
				const result = await spawnAgent(def, task, phaseState.agents[i], ctx);
				outputs.push(result.output);
				input = result.output;

				if (result.exitCode !== 0) {
					allSuccess = false;
					break;
				}
			}
		}

		return { outputs, success: allSuccess };
	}

	// ── Ctrl+J Overlay ───────────────────────────

	class AgentGridOverlay {
		private selectedIndex = 0;
		private expandedIndex: number | null = null;
		private scrollOffset = 0;

		constructor(
			private items: AgentState[],
			private onDone: () => void,
		) {
			this.selectedIndex = 0;
		}

		handleInput(data: string, tui: any): void {
			if (matchesKey(data, Key.up)) {
				this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			} else if (matchesKey(data, Key.down)) {
				this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
			} else if (matchesKey(data, Key.enter)) {
				this.expandedIndex = this.expandedIndex === this.selectedIndex ? null : this.selectedIndex;
			} else if (matchesKey(data, Key.escape)) {
				this.onDone();
				return;
			}
			tui.requestRender();
		}

		private ensureVisible(height: number) {
			const pageSize = Math.floor(height / 4);
			if (this.selectedIndex < this.scrollOffset) {
				this.scrollOffset = this.selectedIndex;
			} else if (this.selectedIndex >= this.scrollOffset + pageSize) {
				this.scrollOffset = this.selectedIndex - pageSize + 1;
			}
		}

		render(width: number, height: number, theme: any): string[] {
			this.ensureVisible(height);

			const container = new Container();

			// Header
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			const phaseName = phaseStates[currentPhaseIndex]?.def.name.toUpperCase() || "PIPELINE";
			container.addChild(new Text(
				`${theme.fg("accent", theme.bold(` AGENTS — ${phaseName}`))} ${theme.fg("dim", "|")} ${theme.fg("success", this.items.length.toString())} agents`,
				1, 0,
			));
			container.addChild(new Spacer(1));

			const visibleItems = this.items.slice(this.scrollOffset);

			visibleItems.forEach((item, idx) => {
				const absoluteIndex = idx + this.scrollOffset;
				const isSelected = absoluteIndex === this.selectedIndex;
				const isExpanded = absoluteIndex === this.expandedIndex;

				const cardBox = new Box(1, 0, (s) => isSelected ? theme.bg("selectedBg", s) : s);

				const agentLabel = displayName(item.role) + " #" + (item.index + 1);
				const statusBtn = statusButton(item.status, agentLabel, theme);
				const timeStr = item.elapsed > 0 ? ` ${Math.round(item.elapsed / 1000)}s` : "";
				const titleLine = `${statusBtn} ${theme.fg("dim", timeStr)}`;
				cardBox.addChild(new Text(titleLine, 0, 0));

				if (isExpanded && item.output) {
					cardBox.addChild(new Spacer(1));
					const output = item.output.length > 4000
						? item.output.slice(0, 4000) + "\n... [truncated]"
						: item.output;
					cardBox.addChild(new Text(theme.fg("muted", output), 0, 0));
				} else {
					const preview = (item.lastWork || item.task || "—").replace(/\n/g, " ");
					const truncated = preview.length > width - 10 ? preview.slice(0, width - 13) + "..." : preview;
					cardBox.addChild(new Text(theme.fg("dim", "  " + truncated), 0, 0));
				}

				container.addChild(cardBox);
			});

			// Footer
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", " ↑/↓ Navigate • Enter Expand • Esc Close"), 1, 0));
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return container.render(width);
		}
	}

	// ── Collect All Agents for Overlay ───────────

	function collectOverlayAgents(): AgentState[] {
		// Current phase agents first, then all others
		const current = phaseStates[currentPhaseIndex]?.agents || [];
		if (current.length > 0) return current;

		// If no current phase agents, show all from all phases
		const all: AgentState[] = [];
		for (const ps of phaseStates) {
			all.push(...ps.agents);
		}
		return all;
	}

	// ── Tools ────────────────────────────────────

	pi.registerTool({
		name: "advance_phase",
		label: "Advance Phase",
		description: "Move the pipeline to the next phase. Call this when the current phase is complete. In Phase 1 (UNDERSTAND), call this once the task is fully clarified.",
		parameters: Type.Object({
			summary: Type.String({ description: "Summary of what was accomplished in this phase / the clarified task" }),
			skip_to: Type.Optional(Type.String({ description: "Optional: skip to a specific phase name (e.g. 'plan' to skip gather)" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { summary, skip_to } = params as { summary: string; skip_to?: string };

			if (!activeConfig || phaseStates.length === 0) {
				return { content: [{ type: "text", text: "No pipeline active." }], details: {} };
			}

			// Mark current phase done
			phaseStates[currentPhaseIndex].status = "done";
			phaseStates[currentPhaseIndex].summary = summary;

			// Accumulate context
			if (currentPhaseIndex === 0) {
				taskSummary = summary;
			}
			accContext += `\n\n## Phase ${currentPhaseIndex + 1}: ${phaseStates[currentPhaseIndex].def.name}\n${summary}`;

			// Determine next phase
			let nextIndex = currentPhaseIndex + 1;
			if (skip_to) {
				const target = phaseStates.findIndex(p => p.def.name.toLowerCase() === skip_to.toLowerCase());
				if (target > currentPhaseIndex) nextIndex = target;
			}

			if (nextIndex >= phaseStates.length) {
				return {
					content: [{ type: "text", text: "Pipeline complete! All phases finished." }],
					details: { phase: "complete", summary },
				};
			}

			currentPhaseIndex = nextIndex;
			phaseStates[currentPhaseIndex].status = "active";
			updateWidget();

			const phase = phaseStates[currentPhaseIndex].def;
			return {
				content: [{ type: "text", text: `Advanced to phase: ${phase.name.toUpperCase()} — ${phase.description}\nMode: ${phase.mode}\nAgents: ${phase.agents.length}` }],
				details: { phase: phase.name, mode: phase.mode },
			};
		},

		renderCall(args, theme) {
			const summary = (args as any).summary || "";
			const preview = summary.length > 60 ? summary.slice(0, 57) + "..." : summary;
			const text =
				theme.fg("toolTitle", theme.bold("advance_phase ")) +
				theme.fg("muted", preview);
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			const msg = text?.type === "text" ? text.text : "";
			return new Text(outputLine(theme, "success", msg), 0, 0);
		},
	});

	pi.registerTool({
		name: "dispatch_agents",
		label: "Dispatch Agents",
		description: "Dispatch one or more agents for the current pipeline phase. Agents run in parallel or sequential mode depending on the phase configuration. Use this in phases 2-5 to do the actual work.",
		parameters: Type.Object({
			agents: Type.Array(Type.Object({
				role: Type.String({ description: "Agent role name (e.g. 'scout', 'builder', 'reviewer')" }),
				task: Type.String({ description: "Task description for this agent" }),
			}), { description: "Array of agents to dispatch" }),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { agents } = params as { agents: { role: string; task: string }[] };
			const phase = phaseStates[currentPhaseIndex];

			if (!phase) {
				return { content: [{ type: "text", text: "No active phase." }], details: {} };
			}

			if (onUpdate) {
				onUpdate({
					content: [{ type: "text", text: `Dispatching ${agents.length} agent(s) in ${phase.def.mode} mode...` }],
					details: { agents: agents.map(a => a.role), mode: phase.def.mode, status: "dispatching" },
				});
			}

			// Resolve template variables in task strings
			const resolved = agents.map(a => ({
				role: a.role,
				task: resolveTemplate(a.task, {
					task: taskSummary,
					context: accContext,
					plan: planOutput,
					input: "",
					review: reviewOutput,
				}),
			}));

			const mode = phase.def.mode === "interactive" ? "sequential" : phase.def.mode;
			const result = await dispatchPhaseAgents(resolved, mode as "parallel" | "sequential", ctx);

			// Merge outputs into accumulated context
			const mergedOutput = result.outputs.join("\n\n---\n\n");
			const outputSummary = mergedOutput.length > 3000
				? mergedOutput.slice(0, 3000) + "\n\n... [output truncated, full output was " + mergedOutput.length + " chars]"
				: mergedOutput;
			accContext += `\n\n## Phase ${currentPhaseIndex + 1} Agent Output:\n${outputSummary}`;

			// Store plan output if this is the plan phase
			if (phase.def.name.toLowerCase() === "plan") {
				planOutput = mergedOutput;
			}

			// Store review output if this is the review phase
			if (phase.def.name.toLowerCase() === "review") {
				reviewOutput = mergedOutput;
				reviewLoopCount++;
			}

			const truncated = mergedOutput.length > 8000
				? mergedOutput.slice(0, 8000) + "\n\n... [truncated]"
				: mergedOutput;

			const status = result.success ? "done" : "error";

			return {
				content: [{ type: "text", text: `[${phase.def.name}] ${status} — ${agents.length} agent(s)\n\n${truncated}` }],
				details: {
					phase: phase.def.name,
					agents: agents.map(a => a.role),
					status,
					fullOutput: mergedOutput,
					reviewLoop: reviewLoopCount,
				},
			};
		},

		renderCall(args, theme) {
			const agents = (args as any).agents || [];
			const roles = agents.map((a: any) => a.role).join(", ");
			const text =
				theme.fg("toolTitle", theme.bold("dispatch_agents ")) +
				theme.fg("accent", `${agents.length} agent(s)`) +
				theme.fg("dim", " — ") +
				theme.fg("muted", roles);
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (options.isPartial || details.status === "dispatching") {
				const runningBtn = statusButton("active", details.phase || "?", theme);
				const content = runningBtn +
					theme.fg("dim", ` dispatching ${(details.agents || []).length} agents...`);
				return new Text(outputLine(theme, "accent", content), 0, 0);
			}

			const status = details.status === "done" ? "done" : "error";
			const bar = status === "done" ? "success" : "error";
			const statusBtn = statusButton(status, details.phase, theme);
			const header = statusBtn +
				theme.fg("dim", ` ${(details.agents || []).length} agents`);

			if (options.expanded && details.fullOutput) {
				const output = details.fullOutput.length > 4000
					? details.fullOutput.slice(0, 4000) + "\n... [truncated]"
					: details.fullOutput;
				const mdTheme = getPiMdTheme();
				const container = new Container();
				container.addChild(new Text(outputLine(theme, bar, header), 0, 0));
				container.addChild(new Markdown(output, 2, 0, mdTheme));
				return container;
			}

			return new Text(outputLine(theme, bar, header), 0, 0);
		},
	});

	pi.registerTool({
		name: "pipeline_status",
		label: "Pipeline Status",
		description: "Returns the current pipeline state — phases, current phase, accumulated context summary. No parameters needed.",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			if (!activeConfig) {
				return { content: [{ type: "text", text: "No pipeline active." }], details: {} };
			}

			const phases = phaseStates.map((ps, i) => {
				const marker = i === currentPhaseIndex ? "→ " : "  ";
				return `${marker}${ps.def.name.toUpperCase()} [${ps.status}]${ps.summary ? ": " + ps.summary.slice(0, 100) : ""}`;
			}).join("\n");

			const status = [
				`Pipeline: ${activeConfig.name}`,
				`Current Phase: ${phaseStates[currentPhaseIndex]?.def.name.toUpperCase() || "none"} (${currentPhaseIndex + 1}/${phaseStates.length})`,
				`Review Loops: ${reviewLoopCount}/${activeConfig.review_max_loops}`,
				``,
				`Phases:`,
				phases,
				``,
				`Task: ${taskSummary || "(not yet clarified)"}`,
				`Context Length: ${accContext.length} chars`,
				`Plan: ${planOutput ? planOutput.slice(0, 200) + "..." : "(none yet)"}`,
			].join("\n");

			return {
				content: [{ type: "text", text: status }],
				details: { phase: currentPhaseIndex, total: phaseStates.length, reviewLoops: reviewLoopCount },
			};
		},

		renderCall(_args, theme) {
			return new Text(outputLine(theme, "accent", theme.bold("pipeline_status")), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			const msg = text?.type === "text" ? text.text : "";
			return new Text(outputLine(theme, "accent", msg), 0, 0);
		},
	});

	// ── Commands ──────────────────────────────────

	pi.registerCommand("pipeline", {
		description: "Select a pipeline configuration",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			if (pipelineConfigs.length === 0) {
				ctx.ui.notify("No pipelines in .pi/agents/pipeline-team.yaml", "warning");
				return;
			}

			/** Shows pipeline name with its first phase (starting point) */
			const options = pipelineConfigs.map(c => {
				const firstPhase = c.phases[0] ? displayName(c.phases[0].name) : "No Phases";
				return `${c.name} — ${firstPhase}`;
			});

			const choice = await ctx.ui.select("Select Pipeline", options);
			if (choice === undefined) return;

			const idx = options.indexOf(choice);
			activatePipeline(pipelineConfigs[idx]);
			updateStatus();
			ctx.ui.notify(`Pipeline: ${activeConfig!.name}\n${activeConfig!.description}`, "info");
		},
	});

	pi.registerCommand("pipeline-status", {
		description: "Show full pipeline state",
		handler: async (_args, ctx) => {
			if (!activeConfig) {
				ctx.ui.notify("No pipeline active", "warning");
				return;
			}

			const phases = phaseStates.map((ps, i) => {
				const marker = i === currentPhaseIndex ? "→ " : "  ";
				const agents = ps.agents.length > 0
					? ` (${ps.agents.filter(a => a.status === "done").length}/${ps.agents.length} agents done)`
					: "";
				return `${marker}${ps.def.name.toUpperCase()} [${ps.status}]${agents}`;
			}).join("\n");

			ctx.ui.notify(
				`Pipeline: ${activeConfig.name}\n\n${phases}\n\nReview loops: ${reviewLoopCount}/${activeConfig.review_max_loops}`,
				"info",
			);
		},
	});


	pi.registerCommand("pipeline-reset", {
		description: "Reset pipeline to phase 1",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			resetPipeline();
			ctx.ui.notify("Pipeline reset to phase 1", "info");
			updateStatus();
		},
	});

	pi.registerCommand("pipeline-off", {
		description: "Deactivate pipeline and hide UI",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			activeConfig = null;
			(globalThis as any).__piActivePipeline = null;
			phaseStates = [];
			clearPipelineUI();
			ctx.ui.notify("Pipeline deactivated. Use /pipeline to select one.", "info");
		},
	});

	pi.registerCommand("pipeline-clear", {
		description: "Clear pipeline widget from screen (keeps pipeline active)",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			clearPipelineUI();

			// Reset agent states within each phase so the widget can reappear on next dispatch
			for (const ps of phaseStates) {
				for (const agent of ps.agents) {
					if (agent.status === "done" || agent.status === "error") {
						agent.status = "idle";
						agent.lastWork = "";
						agent.output = "";
						agent.elapsed = 0;
					}
				}
			}

			ctx.ui.notify("Pipeline widget cleared. Pipeline remains active.", "info");
		},
	});

	// ── Ctrl+J Shortcut ──────────────────────────

	pi.registerShortcut("ctrl+j", {
		description: "Open agent grid overlay",
		handler: async (ctx) => {
			const agents = collectOverlayAgents();
			if (agents.length === 0) {
				ctx.ui.notify("No agents to inspect", "info");
				return;
			}

			await ctx.ui.custom((tui, theme, _kb, done) => {
				const overlay = new AgentGridOverlay(agents, () => done(undefined));
				return {
					render: (w) => overlay.render(w, 30, theme),
					handleInput: (data) => overlay.handleInput(data, tui),
					invalidate: () => {},
				};
			}, {
				overlay: true,
				overlayOptions: { width: "80%", anchor: "center" },
			});
		},
	});

	// ── Alt+P Shortcut ──────────────────────────

	pi.registerShortcut("alt+p", {
		description: "Toggle pipeline widget collapse/expand",
		handler: async (ctx) => {
			widgetCtx = ctx;
			if (!activeConfig) {
				ctx.ui.notify("No pipeline active. Use /pipeline to select one.", "info");
				return;
			}
			widgetCollapsed = !widgetCollapsed;
			updateWidget();
		},
	});

	// ── System Prompt (dynamic per-phase) ────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		// Mode gate: only fire when mode is PIPELINE (or unset for backward compat)
		const mode = (globalThis as any).__piCurrentMode;
		if (mode && mode !== "PIPELINE") return {};

		if (!activeConfig || phaseStates.length === 0) return {};

		const phase = phaseStates[currentPhaseIndex];
		const phaseName = phase.def.name.toUpperCase();

		// Build agent catalog for dispatch
		const agentCatalog = Array.from(allAgents.values())
			.map(a => `- **${displayName(a.name)}** (dispatch as \`${a.name}\`): ${a.description}`)
			.join("\n");

		// Pipeline status summary
		const phasesSummary = phaseStates.map((ps, i) => {
			const marker = i === currentPhaseIndex ? "→ " : "  ";
			return `${marker}${ps.def.name.toUpperCase()} [${ps.status}]`;
		}).join("\n");

		// Context summary
		const contextSummary = accContext
			? `\n## Accumulated Context\n${truncateContext(accContext)}`
			: "";

		const planSection = planOutput
			? `\n## Implementation Plan\n${truncateContext(planOutput)}`
			: "";

		const reviewSection = reviewOutput
			? `\n## Last Review (loop ${reviewLoopCount}/${activeConfig.review_max_loops})\n${truncateContext(reviewOutput)}`
			: "";

		// Phase-specific instructions
		let phaseInstructions = "";

		if (phase.def.name === "understand") {
			phaseInstructions = `## Phase Instructions: UNDERSTAND
You are in the UNDERSTAND phase. Your job is to:
1. Analyze the task and classify its complexity
2. Use your codebase tools to verify assumptions
3. When the task is fully clarified, call \`advance_phase\` with a detailed summary

## Task Complexity Routing

Before proceeding, classify the task:

**SIMPLE** — Do it yourself. No pipeline needed.
- Reading files, checking status, listing contents
- Quick lookups, answering questions, single small edits
→ Use your own tools directly. Do NOT call advance_phase.

**MEDIUM** — Shortened pipeline. Skip GATHER.
- Focused 1-2 file changes where scope is clear
- Bug fixes where location is known
→ Call advance_phase with skip_to: "plan" (or skip_to: "execute" if obvious)

**COMPLEX** — Full pipeline.
- Multi-file features, refactors, architectural changes
- Tasks needing codebase exploration first
→ Call advance_phase normally (all phases)

Do NOT dispatch agents in this phase. Converse directly with the user.
Call \`advance_phase\` with a comprehensive task summary when ready to proceed.`;

		} else if (phase.def.name === "gather") {
			phaseInstructions = `## Phase Instructions: GATHER
You are in the GATHER phase. Dispatch scout agents to explore the codebase in parallel.
Use \`dispatch_agents\` to send multiple scouts concurrently.
Review their findings, then call \`advance_phase\` with a summary.

Default agents from config:
${phase.def.agents.map((a, i) => `${i + 1}. ${a.role}: ${a.task_template.slice(0, 100)}`).join("\n")}`;

		} else if (phase.def.name === "plan") {
			phaseInstructions = `## Phase Instructions: PLAN
You are in the PLAN phase. Dispatch a planner agent to create an implementation plan.
Use \`dispatch_agents\` with a planner. The plan will be stored as $PLAN for later phases.
Call \`advance_phase\` with the plan summary when done.`;

		} else if (phase.def.name === "execute") {
			phaseInstructions = `## Phase Instructions: EXECUTE
You are in the EXECUTE phase. Dispatch builder agents to implement the plan.
You can dispatch multiple builders for independent tasks.
Use \`dispatch_agents\` then call \`advance_phase\` when implementation is complete.`;

		} else if (phase.def.name === "review") {
			phaseInstructions = `## Phase Instructions: REVIEW
You are in the REVIEW phase (loop ${reviewLoopCount + 1}/${activeConfig.review_max_loops}).
Dispatch a reviewer agent to audit the implementation.
After reviewing the output:
- If the reviewer says APPROVED → call \`advance_phase\` to complete the pipeline
- If issues found and loops remaining → use \`dispatch_agents\` to fix issues, then review again
- Max review loops: ${activeConfig.review_max_loops}`;
		}

		const commanderAvailable = !!(globalThis as any).__piCommanderAvailable;
		const commanderSection = commanderAvailable ? `

## Commander Integration
Commander is available. Use these tools when appropriate:
- \`commander_session { operation: "file:open", file_path: <path> }\` — display key files in Commander's floating viewer
- \`commander_task\` — track tasks in the Commander dashboard
- \`commander_mailbox\` — broadcast status updates to the dashboard
- Use file:open to show pipeline plans, phase results, or review reports` : "";

		return {
			systemPrompt: `You are orchestrating a pipeline called "${activeConfig.name}".
You have full codebase tools AND pipeline tools (advance_phase, dispatch_agents, pipeline_status).

## When to Work Directly (Skip the Pipeline)
- Simple one-off commands: reading a file, checking status, listing contents
- Quick lookups, small edits, answering questions about the codebase
- Anything you can handle in a single step without needing the pipeline
Use your judgment — if it's quick, just do it; if it's real work, use the pipeline.

## Current Phase: ${phaseName}
${phase.def.description}

## Pipeline Progress
${phasesSummary}

${phaseInstructions}

## Available Agents for Dispatch
${agentCatalog}

## Task
${taskSummary || "(Phase 1: Ask the user what they want to accomplish)"}
${contextSummary}${planSection}${reviewSection}

## Tools
- \`advance_phase\`: Move to next phase (required summary of what was done)
- \`dispatch_agents\`: Send agents to work (array of {role, task})
- \`pipeline_status\`: Check current pipeline state
- Plus all standard codebase tools (read, write, edit, bash, etc.)${commanderSection}`,
		};
	});

	// ── Session Start ────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		applyExtensionDefaults(import.meta.url, _ctx);

		// Clear widgets from previous session
		widgetCtx = _ctx;
		clearPipelineUI();
		contextWindow = _ctx.model?.contextWindow || 0;

		// Wipe pipeline session files
		const sessDir = join(_ctx.cwd, ".pi", "agent-sessions");
		if (existsSync(sessDir)) {
			for (const f of readdirSync(sessDir)) {
				if (f.startsWith("pipeline-") && f.endsWith(".json")) {
					try { unlinkSync(join(sessDir, f)); } catch {}
				}
			}
		}

		loadConfig(_ctx.cwd);

		if (pipelineConfigs.length === 0) {
			activeConfig = null;
			phaseStates = [];
			clearPipelineUI();
			_ctx.ui.notify("No pipelines found in .pi/agents/pipeline-team.yaml", "warning");
			return;
		}

		// Opt-in: do NOT auto-activate. User must run /pipeline to start.
		// Ensure no pipeline UI is shown until user explicitly activates one.
		activeConfig = null;
		(globalThis as any).__piActivePipeline = null;
		phaseStates = [];
		clearPipelineUI();
	});
}
