// ABOUTME: Sequential pipeline orchestrator that chains agent steps with prompt templates.
// ABOUTME: Each step's output feeds into the next via $INPUT; provides run_chain tool and /chain command.
/**
 * Agent Chain — Sequential pipeline orchestrator
 *
 * Runs opinionated, repeatable agent workflows. Chains are defined in
 * .pi/agents/agent-chain.yaml — each chain is a sequence of agent steps
 * with prompt templates. The user's original prompt flows into step 1,
 * the output becomes $INPUT for step 2's prompt template, and so on.
 * $ORIGINAL is always the user's original prompt.
 *
 * The primary Pi agent has NO codebase tools — it can ONLY kick off the
 * pipeline via the `run_chain` tool. On boot you select a chain; the
 * agent decides when to run it based on the user's prompt.
 *
 * Agents maintain session context within a Pi session — re-running the
 * chain lets each agent resume where it left off.
 *
 * Commands:
 *   /chain             — switch active chain
 *   /chain-list        — list all available chains
 *
 * Usage: pi -e extensions/agent-chain.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, visibleWidth, truncateToWidth, Container, Spacer, Markdown, matchesKey, Key } from "@mariozechner/pi-tui";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import { readFileSync, existsSync, readdirSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { statusButton } from "./lib/pipeline-render.ts";
import { DEFAULT_SUBAGENT_MODEL } from "./lib/defaults.ts";
import { parseChainYaml, type ChainStep, type ChainDef } from "./lib/parse-chain-yaml.ts";

// ── Types ────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
}

interface StepState {
	agent: string;
	description: string;
	status: "pending" | "running" | "done" | "error";
	elapsed: number;
	lastWork: string;
}

// ── Display Name Helper ──────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
			const scan = (d: string) => {
				for (const file of readdirSync(d, { withFileTypes: true })) {
					const fullPath = resolve(d, file.name);
					if (file.isDirectory()) {
						scan(fullPath);
					} else if (file.name.endsWith(".md")) {
						const def = parseAgentFile(fullPath);
						if (def && !agents.has(def.name.toLowerCase())) {
							agents.set(def.name.toLowerCase(), def);
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
	let allAgents: Map<string, AgentDef> = new Map();
	let chains: ChainDef[] = [];
	let activeChain: ChainDef | null = null;
	let widgetCtx: any;
	let sessionDir = "";
	const agentSessions: Map<string, string | null> = new Map();

	// Per-step state for the active chain
	let stepStates: StepState[] = [];
	let pendingReset = false;
	let selectedStepIndex = -1;

	function loadChains(cwd: string) {
		const extDir = dirname(fileURLToPath(import.meta.url));
		const extProjectDir = resolve(extDir, "..");

		sessionDir = join(cwd, ".pi", "agent-sessions");
		if (!existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}

		allAgents = scanAgentDirs(cwd, extProjectDir);

		agentSessions.clear();
		for (const [key] of allAgents) {
			const sessionFile = join(sessionDir, `chain-${key}.json`);
			agentSessions.set(key, existsSync(sessionFile) ? sessionFile : null);
		}

		let chainPath = join(cwd, ".pi", "agents", "agent-chain.yaml");
		if (!existsSync(chainPath)) {
			chainPath = join(extProjectDir, ".pi", "agents", "agent-chain.yaml");
		}
		if (existsSync(chainPath)) {
			try {
				chains = parseChainYaml(readFileSync(chainPath, "utf-8"));
			} catch {
				chains = [];
			}
		} else {
			chains = [];
		}
	}

	function activateChain(chain: ChainDef) {
		activeChain = chain;
		(globalThis as any).__piActiveChain = chain.name;
		selectedStepIndex = -1;
		stepStates = chain.steps.map(s => {
			const agentDef = allAgents.get(s.agent.toLowerCase());
			return {
				agent: s.agent,
				description: agentDef?.description || "",
				status: "pending" as const,
				elapsed: 0,
				lastWork: "",
			};
		});
		// Skip widget re-registration if reset is pending — let before_agent_start handle it
		if (!pendingReset) {
			updateWidget();
		}
	}

	// ── Card Rendering ──────────────────────────

	function renderStepLines(state: StepState, index: number, width: number, theme: any): string[] {
		const name = displayName(state.agent);
		const statusForButton = state.status === "pending" ? "idle" : state.status;
		const btn = statusButton(statusForButton, name, theme);
		const timeStr = state.status !== "pending" && state.elapsed > 0
			? "  " + theme.fg("dim", `${Math.round(state.elapsed / 1000)}s`)
			: "";
		const lines: string[] = [];
		let pillLine = ` ${btn}${timeStr}`;
		if (index === selectedStepIndex) {
			pillLine = ` ${theme.fg("accent", "[")}${btn}${theme.fg("accent", "]")}${timeStr}`;
		}
		lines.push(pillLine);
		if (state.lastWork && state.status !== "pending") {
			const prefix = " \u2502  ";
			const maxWork = width - prefix.length - 1;
			const work = state.lastWork.length > maxWork
				? state.lastWork.slice(0, maxWork - 3) + "..."
				: state.lastWork;
			lines.push(theme.fg("dim", " \u2502") + "  " + theme.fg("muted", work));
		}
		if (state.status === "pending" && state.description) {
			const prefix = "    ";
			const maxDesc = width - prefix.length - 1;
			const desc = state.description.length > maxDesc
				? state.description.slice(0, maxDesc - 3) + "..."
				: state.description;
			lines.push("    " + theme.fg("dim", desc));
		}
		return lines;
	}

	function updateWidget() {
		if (!widgetCtx) return;
		// Only show widget when pipeline is actually running (at least one non-pending step)
		const hasActiveStep = stepStates.some(s => s.status !== "pending");
		if (!hasActiveStep) return;
		widgetCtx.ui.setWidget("agent-chain", (_tui: any, theme: any) => {
			const text = new Text("", 0, 1);

			return {
				render(width: number): string[] {
					if (!activeChain || stepStates.length === 0) {
						text.setText(theme.fg("dim", "No chain active. Use /chain to select one."));
						return text.render(width);
					}

					const outputLines: string[] = [];
					const chainName = activeChain.name;
					const rule = "─".repeat(Math.max(0, width - chainName.length - 6));
					outputLines.push(theme.fg("dim", ` ── `) + theme.fg("accent", chainName) + theme.fg("dim", ` ${rule}`));
					for (let i = 0; i < stepStates.length; i++) {
						outputLines.push(...renderStepLines(stepStates[i], i, width, theme));
						if (i < stepStates.length - 1) {
							outputLines.push(theme.fg("dim", " \u2502"));
						}
					}
					text.setText(outputLines.join("\n"));
					return text.render(width);
				},
				invalidate() {
					text.invalidate();
				},
			};
		});
	}

	// ── Run Agent (subprocess) ──────────────────

	function runAgent(
		agentDef: AgentDef,
		task: string,
		stepIndex: number,
		ctx: any,
	): Promise<{ output: string; exitCode: number; elapsed: number }> {
		const model = ctx.model
			? `${ctx.model.provider}/${ctx.model.id}`
			: DEFAULT_SUBAGENT_MODEL;

		const agentKey = agentDef.name.toLowerCase().replace(/\s+/g, "-");
		const agentSessionFile = join(sessionDir, `chain-${agentKey}.json`);
		const hasSession = agentSessions.get(agentKey);

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
		];

		if (hasSession) {
			args.push("-c");
		}

		args.push(task);

		const textChunks: string[] = [];
		const startTime = Date.now();
		const state = stepStates[stepIndex];

		return new Promise((resolve) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, PI_SUBAGENT: "1" },
				cwd: ctx.cwd,
			});

			const timer = setInterval(() => {
				state.elapsed = Date.now() - startTime;
				updateWidget();
			}, 1000);

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
								state.lastWork = last;
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

				clearInterval(timer);
				const elapsed = Date.now() - startTime;
				state.elapsed = elapsed;
				const output = textChunks.join("");
				state.lastWork = output.split("\n").filter((l: string) => l.trim()).pop() || "";

				if (code === 0) {
					agentSessions.set(agentKey, agentSessionFile);
				}

				resolve({ output, exitCode: code ?? 1, elapsed });
			});

			proc.on("error", (err) => {
				clearInterval(timer);
				resolve({
					output: `Error spawning agent: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
				});
			});

			proc.on("exit", () => { clearInterval(timer); });
		});
	}

	// ── Run Chain (sequential pipeline) ─────────

	async function runChain(
		task: string,
		ctx: any,
	): Promise<{ output: string; success: boolean; elapsed: number }> {
		if (!activeChain) {
			return { output: "No chain active", success: false, elapsed: 0 };
		}

		const chainStart = Date.now();

		// Reset all steps to pending
		selectedStepIndex = -1;
		stepStates = activeChain.steps.map(s => {
			const agentDef = allAgents.get(s.agent.toLowerCase());
			return {
				agent: s.agent,
				description: agentDef?.description || "",
				status: "pending" as const,
				elapsed: 0,
				lastWork: "",
			};
		});
		updateWidget();

		let input = task;
		const originalPrompt = task;
		const stepOutputs: string[] = [];

		for (let i = 0; i < activeChain.steps.length; i++) {
			const step = activeChain.steps[i];
			stepStates[i].status = "running";
			updateWidget();

			// Resolve prompt: $INPUT (previous step), $ORIGINAL (original task), $INPUT_N (step N output, 1-indexed)
			let resolvedPrompt = step.prompt
				.replace(/\$ORIGINAL/g, originalPrompt)
				.replace(/\$INPUT/g, input);
			
			// Replace $INPUT_N with stepOutputs[N-1] (1-indexed)
			resolvedPrompt = resolvedPrompt.replace(/\$INPUT_(\d+)/g, (_, n) => {
				const stepIndex = parseInt(n, 10) - 1;
				return stepIndex >= 0 && stepIndex < stepOutputs.length ? stepOutputs[stepIndex] : "";
			});

			const agentDef = allAgents.get(step.agent.toLowerCase());
			if (!agentDef) {
				stepStates[i].status = "error";
				stepStates[i].lastWork = `Agent "${step.agent}" not found`;
				updateWidget();
				return {
					output: `Error at step ${i + 1}: Agent "${step.agent}" not found. Available: ${Array.from(allAgents.keys()).join(", ")}`,
					success: false,
					elapsed: Date.now() - chainStart,
				};
			}

			const result = await runAgent(agentDef, resolvedPrompt, i, ctx);

			if (result.exitCode !== 0) {
				stepStates[i].status = "error";
				updateWidget();
				return {
					output: `Error at step ${i + 1} (${step.agent}): ${result.output}`,
					success: false,
					elapsed: Date.now() - chainStart,
				};
			}

			stepStates[i].status = "done";
			updateWidget();

			stepOutputs.push(result.output);
			input = result.output;
		}

		return { output: input, success: true, elapsed: Date.now() - chainStart };
	}

	// ── run_chain Tool ──────────────────────────

	pi.registerTool({
		name: "run_chain",
		label: "Run Chain",
		description: "Execute the active agent chain pipeline. Each step runs sequentially — output from one step feeds into the next. Agents maintain session context across runs.",
		parameters: Type.Object({
			task: Type.String({ description: "The task/prompt for the chain to process" }),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { task } = params as { task: string };

			if (onUpdate) {
				onUpdate({
					content: [{ type: "text", text: `Starting chain: ${activeChain?.name}...` }],
					details: { chain: activeChain?.name, task, status: "running" },
				});
			}

			const result = await runChain(task, ctx);

			const truncated = result.output.length > 8000
				? result.output.slice(0, 8000) + "\n\n... [truncated]"
				: result.output;

			const status = result.success ? "done" : "error";
			const summary = `[chain:${activeChain?.name}] ${status} in ${Math.round(result.elapsed / 1000)}s`;

			return {
				content: [{ type: "text", text: `${summary}\n\n${truncated}` }],
				details: {
					chain: activeChain?.name,
					task,
					status,
					elapsed: result.elapsed,
					fullOutput: result.output,
				},
			};
		},

		renderCall(args, theme) {
			const task = (args as any).task || "";
			const preview = task.length > 60 ? task.slice(0, 57) + "..." : task;
			return new Text(
				theme.fg("toolTitle", theme.bold("run_chain ")) +
				theme.fg("accent", activeChain?.name || "?") +
				theme.fg("dim", " — ") +
				theme.fg("muted", preview),
				0, 0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (options.isPartial || details.status === "running") {
				const runningBtn = statusButton("running", details.chain || "chain", theme);
				return new Text(
					runningBtn,
					0, 0,
				);
			}

			const status = details.status === "done" ? "done" : "error";
			const statusBtn = statusButton(status, details.chain, theme);
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

	pi.registerCommand("chain", {
		description: "Switch active chain",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			if (chains.length === 0) {
				ctx.ui.notify("No chains defined in .pi/agents/agent-chain.yaml", "warning");
				return;
			}

			const options = chains.map(c => {
				const steps = c.steps.map(s => displayName(s.agent)).join(" → ");
				const desc = c.description ? ` — ${c.description}` : "";
				return `${c.name}${desc} (${steps})`;
			});

			const choice = await ctx.ui.select("Select Chain", options);
			if (choice === undefined) return;

			const idx = options.indexOf(choice);
			activateChain(chains[idx]);
			const flow = chains[idx].steps.map(s => displayName(s.agent)).join(" → ");
			ctx.ui.setStatus("agent-chain", `Chain: ${chains[idx].name} (${chains[idx].steps.length} steps)`);
			ctx.ui.notify(
				`Chain: ${chains[idx].name}\n${chains[idx].description}\n${flow}`,
				"info",
			);
		},
	});

	pi.registerCommand("chain-list", {
		description: "List all available chains",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			if (chains.length === 0) {
				ctx.ui.notify("No chains defined in .pi/agents/agent-chain.yaml", "warning");
				return;
			}

			const list = chains.map(c => {
				const desc = c.description ? `  ${c.description}` : "";
				const steps = c.steps.map((s, i) =>
					`  ${i + 1}. ${displayName(s.agent)}`
				).join("\n");
				return `${c.name}:${desc ? "\n" + desc : ""}\n${steps}`;
			}).join("\n\n");

			ctx.ui.notify(list, "info");
		},
	});

	pi.registerCommand("audit", {
		description: "Run comprehensive code audit — scans project, finds issues, generates report and hardening plan",
		handler: async (args, ctx) => {
			widgetCtx = ctx;
			const scope = (args || "").trim();
			const scopeHint = scope ? ` (scope: ${scope})` : "";

			ctx.ui.notify(`Starting code audit${scopeHint}...`, "info");

			// Find audit chain
			const auditChain = chains.find(c => c.name === "audit");
			if (!auditChain) {
				ctx.ui.notify("Audit chain not found in .pi/agents/agent-chain.yaml", "error");
				return;
			}

			// Activate the audit chain
			activateChain(auditChain);

			// Build task string with optional scope
			const task = scope
				? `Audit this codebase. Scope: ${scope}`
				: "Audit this codebase";

			// Run the chain
			const result = await runChain(task, ctx);

			// Hide chain widget — audit is done, result goes to file
			widgetCtx.ui.setWidget("agent-chain", undefined);

			if (!result.success) {
				ctx.ui.notify(`Audit failed: ${result.output.slice(0, 200)}`, "error");
				return;
			}

			// Write report file
			const reportPath = join(ctx.cwd, ".pi", "audit-report.md");
			const reportDir = dirname(reportPath);
			if (!existsSync(reportDir)) {
				mkdirSync(reportDir, { recursive: true });
			}
			writeFileSync(reportPath, result.output, "utf-8");

			ctx.ui.notify(`Audit complete! Report saved to ${reportPath}`, "success");
		},
	});

	// ── System Prompt Override ───────────────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		// Force widget reset on first turn after /new
		if (pendingReset && activeChain) {
			pendingReset = false;
			widgetCtx = _ctx;
			stepStates = activeChain.steps.map(s => {
				const agentDef = allAgents.get(s.agent.toLowerCase());
				return {
					agent: s.agent,
					description: agentDef?.description || "",
					status: "pending" as const,
					elapsed: 0,
					lastWork: "",
				};
			});
			updateWidget();
		}

		// Mode gate: only fire when mode is CHAIN (or unset for backward compat)
		const mode = (globalThis as any).__piCurrentMode;
		if (mode && mode !== "CHAIN") return {};

		if (!activeChain) return {};

		const flow = activeChain.steps.map(s => displayName(s.agent)).join(" → ");
		const desc = activeChain.description ? `\n${activeChain.description}` : "";

		// Build pipeline steps summary
		const steps = activeChain.steps.map((s, i) => {
			const agentDef = allAgents.get(s.agent.toLowerCase());
			const agentDesc = agentDef?.description || "";
			return `${i + 1}. **${displayName(s.agent)}** — ${agentDesc}`;
		}).join("\n");

		// Build full agent catalog (like agent-team.ts)
		const seen = new Set<string>();
		const agentCatalog = activeChain.steps
			.filter(s => {
				const key = s.agent.toLowerCase();
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.map(s => {
				const agentDef = allAgents.get(s.agent.toLowerCase());
				if (!agentDef) return `### ${displayName(s.agent)}\nAgent not found.`;
				return `### ${displayName(agentDef.name)}\n${agentDef.description}\n**Tools:** ${agentDef.tools}\n**Role:** ${agentDef.systemPrompt}`;
			})
			.join("\n\n");

		const commanderAvailable = !!(globalThis as any).__piCommanderAvailable;
		const commanderSection = commanderAvailable ? `

## Commander Integration
Commander is available. Use these tools when appropriate:
- \`commander_session { operation: "file:open", file_path: <path> }\` — display key files in Commander's floating viewer
- \`commander_task\` — track tasks in the Commander dashboard
- \`commander_mailbox\` — broadcast status updates to the dashboard
- Use file:open to show chain results or audit reports` : "";

		return {
			systemPrompt: `You are an agent with a sequential pipeline called "${activeChain.name}" at your disposal.${desc}
You have full access to your own tools AND the run_chain tool to delegate to your team.

## Active Chain: ${activeChain.name}
Flow: ${flow}

${steps}

## Agent Details

${agentCatalog}

## When to Use run_chain
- Significant work: new features, refactors, multi-file changes, anything non-trivial
- Tasks that benefit from the full pipeline: planning, building, reviewing
- When you want structured, multi-agent collaboration on a problem

## When to Work Directly
- Simple one-off commands: reading a file, checking status, listing contents
- Quick lookups, small edits, answering questions about the codebase
- Anything you can handle in a single step without needing the pipeline

## How run_chain Works
- Pass a clear task description to run_chain
- Each step's output feeds into the next step as $INPUT
- Agents maintain session context — they remember previous work within this session
- You can run the chain multiple times with different tasks if needed
- After the chain completes, review the result and summarize for the user

## Guidelines
- Use your judgment — if it's quick, just do it; if it's real work, run the chain
- Keep chain tasks focused and clearly described
- You can mix direct work and chain runs in the same conversation${commanderSection}`,
		};
	});

	// ── Step Detail Overlay ──────────────────────

	function padRight(s: string, width: number): string {
		const vis = visibleWidth(s);
		if (vis >= width) return truncateToWidth(s, width, "");
		return s + " ".repeat(width - vis);
	}

	function wordWrap(text: string, width: number): string[] {
		if (visibleWidth(text) <= width) return [text];
		const words = text.split(/(\s+)/);
		const lines: string[] = [];
		let cur = "";
		for (const w of words) {
			if (visibleWidth(cur + w) > width && cur.length > 0) {
				lines.push(cur);
				cur = w.trimStart();
			} else {
				cur += w;
			}
		}
		if (cur.length > 0) lines.push(cur);
		return lines;
	}

	class StepDetailOverlay {
		private scrollOffset = 0;
		private totalContentLines = 0;

		constructor(
			private step: StepState,
			private agentDef: AgentDef | null,
			private onDone: () => void,
		) {}

		handleInput(data: string, tui: any): void {
			const height = process.stdout.rows || 24;
			const contentHeight = height - 1;
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
			const panelW = width - 4;
			const innerWidth = panelW - 2;

			// Header with step name pill and status
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			const name = displayName(this.step.agent);
			const statusForButton = this.step.status === "pending" ? "idle" : this.step.status;
			const statusBtn = statusButton(statusForButton, name, theme);
			const timeStr = this.step.status !== "pending" && this.step.elapsed > 0
				? ` ${Math.round(this.step.elapsed / 1000)}s` : "";
			container.addChild(new Text(`${statusBtn}${timeStr}`, 1, 0));
			container.addChild(new Spacer(1));

			// Section header helper
			const sectionHeader = (title: string) => {
				const label = ` ─── ${title} `;
				const remaining = Math.max(0, innerWidth - visibleWidth(label));
				return theme.fg("accent", theme.bold(label + "─".repeat(remaining)));
			};

			// Metadata section
			container.addChild(new Text(sectionHeader("METADATA"), 1, 0));
			const formatRow = (label: string, value: string, valueColor: string = "muted") => {
				const labelStr = theme.fg("accent", theme.bold(padRight(label + ":", 14)));
				const valueStr = theme.fg(valueColor, value);
				return labelStr + " " + valueStr;
			};

			const addWrappedRow = (label: string, value: string, valueColor: string = "muted") => {
				const labelWidth = 14;
				const valueWidth = innerWidth - labelWidth - 1;
				const wrapped = wordWrap(value, valueWidth);
				for (let i = 0; i < wrapped.length; i++) {
					const displayLabel = i === 0 ? label : "";
					container.addChild(new Text(formatRow(displayLabel, wrapped[i], valueColor), 1, 0));
				}
			};

			const statusColorMap: Record<string, string> = { running: "accent", done: "success", error: "error", pending: "dim" };
			const statusColor = statusColorMap[this.step.status] || "muted";
			container.addChild(new Text(formatRow("STATUS", this.step.status.toUpperCase(), statusColor), 1, 0));

			if (this.step.description) {
				addWrappedRow("DESCRIPTION", this.step.description, "muted");
			}

			if (this.agentDef?.tools) {
				addWrappedRow("TOOLS", this.agentDef.tools, "success");
			}

			container.addChild(new Spacer(1));

			// System prompt section
			if (this.agentDef?.systemPrompt) {
				container.addChild(new Text(sectionHeader("SYSTEM PROMPT"), 1, 0));
				container.addChild(new Spacer(1));
				const sysPromptMd = new Markdown(this.agentDef.systemPrompt, 1, 0, mdTheme);
				container.addChild(sysPromptMd);
				container.addChild(new Spacer(1));
			}

			// Last work section
			if (this.step.lastWork) {
				container.addChild(new Text(sectionHeader("LAST WORK"), 1, 0));
				container.addChild(new Spacer(1));
				const workMd = new Markdown(this.step.lastWork, 1, 0, mdTheme);
				container.addChild(workMd);
				container.addChild(new Spacer(1));
			}

			// Render all content
			const allLines = container.render(panelW);
			this.totalContentLines = allLines.length;
			const contentHeight = height - 1;
			const maxScroll = Math.max(0, allLines.length - contentHeight);
			this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
			const visibleContentLines = allLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);

			const scrollInfo = maxScroll > 0
				? ` \u2191/\u2193/PgUp/PgDn/Home/End Scroll (${this.scrollOffset + 1}-${Math.min(this.scrollOffset + contentHeight, allLines.length)}/${allLines.length}) \u2022 Esc Close`
				: " Esc Close";
			const footer = theme.fg("dim", scrollInfo);
			const footerLine = padRight(footer, panelW);

			const dimBg = "\x1b[48;2;10;10;15m";
			const reset = "\x1b[0m";

			const result: string[] = [];
			for (const line of visibleContentLines) {
				result.push(dimBg + "  " + padRight(line, panelW) + "  " + reset);
			}
			result.push(dimBg + "  " + footerLine + "  " + reset);
			while (result.length < height) {
				result.push(dimBg + " ".repeat(width) + reset);
			}

			return result;
		}
	}

	async function showStepDetail(ctx: any, step: StepState, agentDef: AgentDef | null) {
		await ctx.ui.custom((tui: any, theme: any, _kb: any, done: any) => {
			const overlay = new StepDetailOverlay(step, agentDef, () => done(undefined));
			return {
				render: (w: number) => overlay.render(w, process.stdout.rows || 24, theme),
				handleInput: (data: string) => overlay.handleInput(data, tui),
				invalidate: () => {},
			};
		}, {
			overlay: true,
			overlayOptions: { width: "100%" },
		});
	}

	// ── Session Start ───────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		applyExtensionDefaults(import.meta.url, _ctx);
		// Clear widget with both old and new ctx — one of them will be valid
		if (widgetCtx) {
			widgetCtx.ui.setWidget("agent-chain", undefined);
		}
		_ctx.ui.setWidget("agent-chain", undefined);
		widgetCtx = _ctx;

		// Reset execution state — widget re-registration deferred to before_agent_start
		stepStates = [];
		activeChain = null;
		(globalThis as any).__piActiveChain = null;
		selectedStepIndex = -1;
		pendingReset = true;

		// Wipe chain session files — reset agent context on /new and launch
		const sessDir = join(_ctx.cwd, ".pi", "agent-sessions");
		if (existsSync(sessDir)) {
			for (const f of readdirSync(sessDir)) {
				if (f.startsWith("chain-") && f.endsWith(".json")) {
					try { unlinkSync(join(sessDir, f)); } catch {}
				}
			}
		}

		// Reload chains + clear agentSessions map (all agents start fresh)
		loadChains(_ctx.cwd);

		if (chains.length === 0) {
			_ctx.ui.notify("No chains found in .pi/agents/agent-chain.yaml", "warning");
			return;
		}

		// Default to first chain — use /chain to switch
		activateChain(chains[0]);

		// run_chain is registered as a tool — available alongside all default tools

		_ctx.ui.setStatus("agent-chain", `Chain: ${activeChain!.name} (${activeChain!.steps.length} steps)`);
		// Footer: use footer.ts only — do not overwrite

		// Register nav provider for F-key navigation
		const providers = ((globalThis as any).__piNavProviders = (globalThis as any).__piNavProviders || []);
		providers.push({
			isActive: () => activeChain !== null && stepStates.length > 0,
			selectPrev: (_ctx2: any) => {
				const count = stepStates.length;
				if (count === 0) { selectedStepIndex = -1; return; }
				if (selectedStepIndex < 0) selectedStepIndex = count - 1;
				else selectedStepIndex = (selectedStepIndex - 1 + count) % count;
				updateWidget();
			},
			selectNext: (_ctx2: any) => {
				const count = stepStates.length;
				if (count === 0) { selectedStepIndex = -1; return; }
				if (selectedStepIndex < 0) selectedStepIndex = 0;
				else selectedStepIndex = (selectedStepIndex + 1) % count;
				updateWidget();
			},
			showDetail: async (ctx: any) => {
				if (selectedStepIndex < 0 || selectedStepIndex >= stepStates.length) return;
				const step = stepStates[selectedStepIndex];
				const agentDef = allAgents.get(step.agent.toLowerCase()) || null;
				await showStepDetail(ctx, step, agentDef);
			},
			exitSelection: (_ctx2: any) => {
				selectedStepIndex = -1;
				updateWidget();
			},
		});
	});
}
