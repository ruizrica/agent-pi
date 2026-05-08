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
 *   /chain-clear       — clear chain widget from screen
 *
 * Usage: pi -e extensions/agent-chain.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  Container,
  Key,
  Markdown,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  DynamicBorder,
  getMarkdownTheme as getPiMdTheme,
} from "@earendil-works/pi-coding-agent";
import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { outputLine } from "./lib/output-box.ts";
import { statusButton } from "./lib/pipeline-render.ts";
import { DEFAULT_SUBAGENT_MODEL } from "./lib/defaults.ts";
import {
  resolveToolkitWorkerModel,
  shouldUseClaudeCliForAgent,
  spawnToolkitWorker,
} from "./lib/toolkit-cli.ts";
import {
  type AgentModelsConfig,
  loadAgentModelsConfig,
  resolveAgentModelString,
} from "./lib/agent-defs.ts";
import {
  type ChainDef,
  type ChainStep,
  parseChainYaml,
} from "./lib/parse-chain-yaml.ts";
import {
  type DiscoveredModule,
  discoverModules,
  formatModuleGroups,
  formatSelectedModulesForChain,
  groupModulesByType,
  type ModuleManifest,
} from "./lib/module-discovery.ts";
import {
  extractQualityScores,
  parseChainOutput,
} from "./lib/test-gen-parser.ts";
import { storeDrafts } from "./lib/gopher-draft-storage.ts";

// ── Types ────────────────────────────────────────

interface AgentDef {
  name: string;
  description: string;
  tools: string;
  model: string; // full provider/model ID, empty = use default
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
  return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Frontmatter Parser ───────────────────────────

function parseAgentFile(
  filePath: string,
  modelsConfig?: AgentModelsConfig,
): AgentDef | null {
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

    // Model resolution: models.json > frontmatter fallback > empty
    let model = "";
    if (modelsConfig) {
      const key = frontmatter.name.toLowerCase();
      const entry = modelsConfig.agents[key];
      if (entry) {
        model = resolveAgentModelString(frontmatter.name, modelsConfig);
      }
    }
    if (!model && frontmatter.model) {
      model = frontmatter.model;
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description || "",
      tools: frontmatter.tools || "read,grep,find,ls",
      model,
      systemPrompt: match[2].trim(),
    };
  } catch {
    return null;
  }
}

function scanAgentDirs(
  cwd: string,
  extProjectDir?: string,
  modelsConfig?: AgentModelsConfig,
): Map<string, AgentDef> {
  const dirs = [
    join(cwd, "agents"),
    join(cwd, ".claude", "agents"),
    join(cwd, ".pi", "agents"),
    ...(extProjectDir
      ? [join(extProjectDir, ".pi", "agents"), join(extProjectDir, "agents")]
      : []),
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
            const def = parseAgentFile(fullPath, modelsConfig);
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
  const piRef = pi;
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

  // Track the currently running chain subprocess for cancellation
  let currentChainProc: any = null;

  function loadChains(cwd: string) {
    const extDir = dirname(fileURLToPath(import.meta.url));
    const extProjectDir = resolve(extDir, "..");

    sessionDir = join(cwd, ".pi", "agent-sessions");
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Load model config from .pi/agents/models.json, then scan agent .md files
    const modelsConfig = loadAgentModelsConfig(cwd, extProjectDir);
    allAgents = scanAgentDirs(cwd, extProjectDir, modelsConfig);

    agentSessions.clear();
    for (const [key] of allAgents) {
      const sessionFile = join(sessionDir, `chain-${key}.json`);
      agentSessions.set(key, existsSync(sessionFile) ? sessionFile : null);
    }

    let chainPath = join(cwd, ".pi", "agents", "agent-chain.yaml");
    if (!existsSync(chainPath)) {
      chainPath = join(extProjectDir, ".pi", "agents", "agent-chain.yaml");
    }
    if (!existsSync(chainPath)) {
      chainPath = join(extProjectDir, "agents", "agent-chain.yaml");
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
    stepStates = chain.steps.map((s) => {
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

  function renderStepLines(
    state: StepState,
    index: number,
    width: number,
    theme: any,
  ): string[] {
    const name = displayName(state.agent);
    const statusForButton = state.status === "pending" ? "idle" : state.status;
    const btn = statusButton(statusForButton, name, theme);
    const timeStr = state.status !== "pending" && state.elapsed > 0
      ? "  " + theme.fg("dim", `${Math.round(state.elapsed / 1000)}s`)
      : "";
    const lines: string[] = [];
    let pillLine = ` ${btn}${timeStr}`;
    if (index === selectedStepIndex) {
      pillLine = ` ${theme.fg("accent", "[")}${btn}${
        theme.fg("accent", "]")
      }${timeStr}`;
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
    const hasActiveStep = stepStates.some((s) => s.status !== "pending");
    if (!hasActiveStep) return;
    if ((globalThis as any).__piSummaryModeActive) return;
    widgetCtx.ui.setWidget("agent-chain", (_tui: any, theme: any) => {
      const text = new Text("", 0, 1);

      return {
        render(width: number): string[] {
          if (!activeChain || stepStates.length === 0) {
            text.setText(
              theme.fg("dim", "No chain active. Use /chain to select one."),
            );
            return text.render(width);
          }

          const outputLines: string[] = [];
          const chainName = activeChain.name;
          const rule = "─".repeat(Math.max(0, width - chainName.length - 6));
          outputLines.push(
            theme.fg("dim", ` ── `) + theme.fg("accent", chainName) +
              theme.fg("dim", ` ${rule}`),
          );
          for (let i = 0; i < stepStates.length; i++) {
            outputLines.push(
              ...renderStepLines(stepStates[i], i, width, theme),
            );
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
    // Use agent's defined model or fall back to default subagent model.
    // NOTE: We intentionally do NOT inherit the parent model. Each agent
    // should use its explicitly defined model or the lightweight default.
    let model = resolveToolkitWorkerModel(
      agentDef.name,
      agentDef.model || DEFAULT_SUBAGENT_MODEL,
    );

    // Local overlays: reroute builder/worker agents to LM Studio Gemma or Qwen
    if (
      (globalThis as any).__piGemmaOverlay &&
      agentDef.name.toLowerCase().startsWith("builder")
    ) {
      model = "lmstudio/google/gemma-4-26b-a4b";
    }
    if (
      (globalThis as any).__piQwenOverlay &&
      agentDef.name.toLowerCase().startsWith("builder")
    ) {
      model = "lmstudio/qwen/qwen3.6-27b";
    }

    const agentKey = agentDef.name.toLowerCase().replace(/\s+/g, "-");
    const agentSessionFile = join(sessionDir, `chain-${agentKey}.json`);
    const hasSession = agentSessions.get(agentKey);

    const extDir = dirname(fileURLToPath(import.meta.url));
    const tasksExtPath = join(extDir, "tasks.ts");
    const footerExtPath = join(extDir, "footer.ts");
    const memoryCycleExtPath = join(extDir, "memory-cycle.ts");
    const args = [
      "--mode",
      "json",
      "-p",
      "--no-extensions",
      "-e",
      tasksExtPath,
      "-e",
      footerExtPath,
      "-e",
      memoryCycleExtPath,
      "--model",
      model,
      "--tools",
      agentDef.tools,
      "--thinking",
      "off",
      "--append-system-prompt",
      agentDef.systemPrompt,
      "--session",
      agentSessionFile,
    ];

    if (hasSession) {
      args.push("-c");
    }

    args.push(task);

    const textChunks: string[] = [];
    const startTime = Date.now();
    const state = stepStates[stepIndex];

    return new Promise((resolve) => {
      let timer: ReturnType<typeof setInterval> | null = null;
      const spawnEnv = {
        ...process.env,
        PI_SUBAGENT: "1",
        ...((globalThis as any).__piClaudeOverlay
          ? { PI_CLAUDE_OVERLAY_ACTIVE: "1" }
          : {}),
        ...((globalThis as any).__piGemmaOverlay
          ? { PI_GEMMA_OVERLAY_ACTIVE: "1" }
          : {}),
        ...((globalThis as any).__piQwenOverlay
          ? { PI_QWEN_OVERLAY_ACTIVE: "1" }
          : {}),
      };
      if (
        shouldUseClaudeCliForAgent(
          agentDef.name,
          model,
          !!(globalThis as any).__piClaudeOverlay,
        )
      ) {
        let toolkitFinalOutput = "";
        spawnToolkitWorker(agentDef, {
          task,
          sessionFile: agentSessionFile,
          cwd: ctx.cwd,
          env: spawnEnv,
          model,
          onSpawn: (proc: any) => {
            currentChainProc = proc;
          },
          onStdoutLine: (line: string) => {
            try {
              const event = JSON.parse(line);
              if (event.type === "message_update") {
                const delta = event.assistantMessageEvent;
                if (delta?.type === "text_delta") {
                  textChunks.push(delta.delta || "");
                  const full = textChunks.join("");
                  const last = full.split("\n").filter((l: string) =>
                    l.trim()
                  ).pop() || "";
                  state.lastWork = last;
                  updateWidget();
                }
              }
            } catch {}
          },
          onStderr: () => {},
        }).then(({ exitCode, output }) => {
          currentChainProc = null;
          toolkitFinalOutput = output || toolkitFinalOutput;
          if (timer) clearInterval(timer);
          const elapsed = Date.now() - startTime;
          state.elapsed = elapsed;
          const finalOutput = toolkitFinalOutput || textChunks.join("");
          state.lastWork = finalOutput.split("\n").filter((l: string) =>
            l.trim()
          ).pop() || "";
          if (exitCode === 0) {
            agentSessions.set(agentKey, agentSessionFile);
          }
          resolve({ output: finalOutput, exitCode: exitCode ?? 1, elapsed });
        });
        return;
      }

      const proc = spawn("pi", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: spawnEnv,
        cwd: ctx.cwd,
      });

      // Track for escape-cancel integration
      currentChainProc = proc;

      timer = setInterval(() => {
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
                const last = full.split("\n").filter((l: string) =>
                  l.trim()
                ).pop() || "";
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
        currentChainProc = null;

        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            if (event.type === "message_update") {
              const delta = event.assistantMessageEvent;
              if (delta?.type === "text_delta") {
                textChunks.push(delta.delta || "");
              }
            }
          } catch {}
        }

        if (timer) clearInterval(timer);
        const elapsed = Date.now() - startTime;
        state.elapsed = elapsed;
        const output = textChunks.join("");
        state.lastWork = output.split("\n").filter((l: string) =>
          l.trim()
        ).pop() || "";

        if (code === 0) {
          agentSessions.set(agentKey, agentSessionFile);
        }

        resolve({ output, exitCode: code ?? 1, elapsed });
      });

      proc.on("error", (err) => {
        currentChainProc = null;
        if (timer) clearInterval(timer);
        resolve({
          output: `Error spawning agent: ${err.message}`,
          exitCode: 1,
          elapsed: Date.now() - startTime,
        });
      });

      proc.on("exit", () => {
        if (timer) clearInterval(timer);
      });
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
    stepStates = activeChain.steps.map((s) => {
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
        return stepIndex >= 0 && stepIndex < stepOutputs.length
          ? stepOutputs[stepIndex]
          : "";
      });

      const agentDef = allAgents.get(step.agent.toLowerCase());
      if (!agentDef) {
        stepStates[i].status = "error";
        stepStates[i].lastWork = `Agent "${step.agent}" not found`;
        updateWidget();
        return {
          output: `Error at step ${
            i + 1
          }: Agent "${step.agent}" not found. Available: ${
            Array.from(allAgents.keys()).join(", ")
          }`,
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
    description:
      "Execute the active agent chain pipeline. Each step runs sequentially — output from one step feeds into the next. Agents maintain session context across runs.",
    parameters: Type.Object({
      task: Type.String({
        description: "The task/prompt for the chain to process",
      }),
    }) as any,

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const { task } = params as { task: string };

      if (onUpdate) {
        onUpdate({
          content: [{
            type: "text",
            text: `Starting chain: ${activeChain?.name}...`,
          }],
          details: { chain: activeChain?.name, task, status: "running" },
        });
      }

      const result = await runChain(task, ctx);

      const truncated = result.output.length > 8000
        ? result.output.slice(0, 8000) + "\n\n... [truncated]"
        : result.output;

      const status = result.success ? "done" : "error";
      const summary = `[chain:${activeChain?.name}] ${status} in ${
        Math.round(result.elapsed / 1000)
      }s`;

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
      const text = theme.fg("toolTitle", theme.bold("run_chain ")) +
        theme.fg("accent", activeChain?.name || "?") +
        theme.fg("dim", " — ") +
        theme.fg("muted", preview);
      return new Text(outputLine(theme, "accent", text), 0, 0);
    },

    renderResult(result, options, theme) {
      const details = result.details as any;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (options.isPartial || details.status === "running") {
        const runningBtn = statusButton(
          "running",
          details.chain || "chain",
          theme,
        );
        return new Text(outputLine(theme, "accent", runningBtn), 0, 0);
      }

      const status = details.status === "done" ? "done" : "error";
      const bar = status === "done" ? "success" : "error";
      const statusBtn = statusButton(status, details.chain, theme);
      const elapsed = typeof details.elapsed === "number"
        ? Math.round(details.elapsed / 1000)
        : 0;
      const header = statusBtn +
        theme.fg("dim", ` ${elapsed}s`);

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

  // ── Commands ─────────────────────────────────

  pi.registerCommand("chain", {
    description: "Switch active chain",
    handler: async (_args, ctx) => {
      widgetCtx = ctx;
      if (chains.length === 0) {
        ctx.ui.notify(
          "No chains defined in .pi/agents/agent-chain.yaml",
          "warning",
        );
        return;
      }

      const options = chains.map((c) => {
        const steps = c.steps.map((s) => displayName(s.agent)).join(" → ");
        const desc = c.description ? ` — ${c.description}` : "";
        return `${c.name}${desc} (${steps})`;
      });

      const choice = await ctx.ui.select("Select Chain", options);
      if (choice === undefined) return;

      const idx = options.indexOf(choice);
      activateChain(chains[idx]);
      const flow = chains[idx].steps.map((s) => displayName(s.agent)).join(
        " → ",
      );
      if (!(globalThis as any).__piSummaryModeActive) {
        ctx.ui.setStatus(
          "agent-chain",
          `Chain: ${chains[idx].name} (${chains[idx].steps.length} steps)`,
        );
      }
      ctx.ui.notify(
        `Chain: ${chains[idx].name}\n${chains[idx].description}\n${flow}`,
        "info",
      );
    },
  });

  pi.registerCommand("chain-clear", {
    description: "Clear chain widget from screen",
    handler: async (_args, ctx) => {
      widgetCtx = ctx;
      ctx.ui.setWidget("agent-chain", undefined);

      // Reset step states to pending so the widget can reappear on next run
      for (const s of stepStates) {
        s.status = "pending";
        s.elapsed = 0;
        s.lastWork = "";
      }
      selectedStepIndex = -1;

      ctx.ui.notify("Chain widget cleared.", "info");
    },
  });

  pi.registerCommand("chain-list", {
    description: "List all available chains",
    handler: async (_args, ctx) => {
      widgetCtx = ctx;
      if (chains.length === 0) {
        ctx.ui.notify(
          "No chains defined in .pi/agents/agent-chain.yaml",
          "warning",
        );
        return;
      }

      const list = chains.map((c) => {
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
    description:
      "Run comprehensive code audit — scans project, finds issues, generates report and hardening plan",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const scope = (args || "").trim();
      const scopeHint = scope ? ` (scope: ${scope})` : "";

      ctx.ui.notify(`Starting code audit${scopeHint}...`, "info");

      // Find audit chain
      const auditChain = chains.find((c) => c.name === "audit");
      if (!auditChain) {
        ctx.ui.notify(
          "Audit chain not found in .pi/agents/agent-chain.yaml",
          "error",
        );
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

      ctx.ui.notify(`Audit complete! Report saved to ${reportPath}`, "info");
    },
  });

  pi.registerCommand("performance", {
    description:
      "Optimize this codebase for performance — profile bottlenecks, stress-test, and build an optimization plan",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const scope = (args || "").trim();
      const scopeHint = scope ? ` (scope: ${scope})` : "";

      ctx.ui.notify(`Starting performance analysis${scopeHint}...`, "info");

      // Find performance chain
      const perfChain = chains.find((c) => c.name === "performance");
      if (!perfChain) {
        ctx.ui.notify(
          "Performance chain not found in .pi/agents/agent-chain.yaml",
          "error",
        );
        return;
      }

      // Activate the performance chain
      activateChain(perfChain);

      // Build task string with optional scope
      const task = scope
        ? `Optimize this codebase for performance. Scope: ${scope}`
        : "Optimize this codebase for performance";

      // Run the chain
      const result = await runChain(task, ctx);

      // Hide chain widget — performance analysis is done, result goes to file
      widgetCtx.ui.setWidget("agent-chain", undefined);

      if (!result.success) {
        ctx.ui.notify(
          `Performance analysis failed: ${result.output.slice(0, 200)}`,
          "error",
        );
        return;
      }

      // Write report file
      const reportPath = join(ctx.cwd, ".pi", "performance-report.md");
      const reportDir = dirname(reportPath);
      if (!existsSync(reportDir)) {
        mkdirSync(reportDir, { recursive: true });
      }
      writeFileSync(reportPath, result.output, "utf-8");

      ctx.ui.notify(
        `Performance analysis complete! Report saved to ${reportPath}`,
        "info",
      );
    },
  });

  pi.registerCommand("sentry-setup", {
    description:
      "Verify Sentry CLI setup — check auth, project linking, SDK integration, and DSN configuration",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const scope = (args || "").trim();
      const scopeHint = scope ? ` (scope: ${scope})` : "";

      ctx.ui.notify(`Starting Sentry setup check${scopeHint}...`, "info");

      // Find sentry-setup chain
      const sentrySetupChain = chains.find((c) => c.name === "sentry-setup");
      if (!sentrySetupChain) {
        ctx.ui.notify(
          "sentry-setup chain not found in .pi/agents/agent-chain.yaml",
          "error",
        );
        return;
      }

      // Activate the sentry-setup chain
      activateChain(sentrySetupChain);

      // Build task string with optional scope
      const task = scope
        ? `Verify Sentry setup for this project. Scope: ${scope}`
        : "Verify Sentry setup for this project";

      // Run the chain
      const result = await runChain(task, ctx);

      // Hide chain widget
      widgetCtx.ui.setWidget("agent-chain", undefined);

      if (!result.success) {
        ctx.ui.notify(
          `Sentry setup check failed: ${result.output.slice(0, 200)}`,
          "error",
        );
        return;
      }

      // Write report file
      const reportPath = join(ctx.cwd, ".pi", "sentry-setup-report.md");
      const reportDir = dirname(reportPath);
      if (!existsSync(reportDir)) {
        mkdirSync(reportDir, { recursive: true });
      }
      writeFileSync(reportPath, result.output, "utf-8");

      ctx.ui.notify(
        `Sentry setup check complete! Report saved to ${reportPath}`,
        "info",
      );
    },
  });

  pi.registerCommand("sentry-logs", {
    description:
      "Fetch Sentry issues and crashes, analyze root causes, and create a prioritized fix plan",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const scope = (args || "").trim();
      const scopeHint = scope ? ` (scope: ${scope})` : "";

      ctx.ui.notify(`Starting Sentry issue analysis${scopeHint}...`, "info");

      // Find sentry-logs chain
      const sentryLogsChain = chains.find((c) => c.name === "sentry-logs");
      if (!sentryLogsChain) {
        ctx.ui.notify(
          "sentry-logs chain not found in .pi/agents/agent-chain.yaml",
          "error",
        );
        return;
      }

      // Activate the sentry-logs chain
      activateChain(sentryLogsChain);

      // Build task string with optional scope
      const task = scope
        ? `Get Sentry issues and crashes for this project and create a fix plan. Scope: ${scope}`
        : "Get Sentry issues and crashes for this project and create a fix plan";

      // Run the chain
      const result = await runChain(task, ctx);

      // Hide chain widget
      widgetCtx.ui.setWidget("agent-chain", undefined);

      if (!result.success) {
        ctx.ui.notify(
          `Sentry issue analysis failed: ${result.output.slice(0, 200)}`,
          "error",
        );
        return;
      }

      // Write report file
      const reportPath = join(ctx.cwd, ".pi", "sentry-report.md");
      const reportDir = dirname(reportPath);
      if (!existsSync(reportDir)) {
        mkdirSync(reportDir, { recursive: true });
      }
      writeFileSync(reportPath, result.output, "utf-8");

      ctx.ui.notify(
        `Sentry issue analysis complete! Report saved to ${reportPath}`,
        "info",
      );
    },
  });

  pi.registerCommand("code-review", {
    description:
      "Multi-pass code review — parallel context gathering, split review, remediation, validation, test verification, and final report",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const inlineScope = (args || "").trim();

      // Find code-review chain
      const codeReviewChain = chains.find((c) => c.name === "code-review");
      if (!codeReviewChain) {
        ctx.ui.notify(
          "code-review chain not found in .pi/agents/agent-chain.yaml",
          "error",
        );
        return;
      }

      let task: string;

      if (inlineScope) {
        // User passed scope inline: /code-review src/auth/
        task = `Review the code. Scope: ${inlineScope}`;
      } else {
        // Interactive scope picker
        const scopeOptions = [
          "Last commit (git diff HEAD~1)",
          "Unstaged changes (git diff)",
          "Staged changes (git diff --cached)",
          "Last 3 commits (git diff HEAD~3)",
          "Specific file or directory",
          "Full codebase",
        ];

        const choice = await ctx.ui.select(
          "What do you want to review?",
          scopeOptions,
        );
        if (choice === undefined) return;

        switch (choice) {
          case scopeOptions[0]:
            task =
              "Review the changes in the last commit. Use `git diff HEAD~1` to identify changed files.";
            break;
          case scopeOptions[1]:
            task =
              "Review the current unstaged changes. Use `git diff` to identify changed files.";
            break;
          case scopeOptions[2]:
            task =
              "Review the staged changes. Use `git diff --cached` to identify changed files.";
            break;
          case scopeOptions[3]:
            task =
              "Review the changes in the last 3 commits. Use `git diff HEAD~3` to identify changed files.";
            break;
          case scopeOptions[4]: {
            const path = await ctx.ui.input(
              "Enter file or directory path:",
              "src/",
            );
            if (!path) return;
            task = `Review the code at: ${path}`;
            break;
          }
          case scopeOptions[5]:
            task = "Review the full codebase. Scan all source files.";
            break;
          default:
            task =
              "Review the current unstaged changes. Use `git diff` to identify changed files.";
        }
      }

      ctx.ui.notify(`Starting code review...`, "info");

      // Activate the code-review chain
      activateChain(codeReviewChain);

      // Run the chain
      const result = await runChain(task, ctx);

      // Hide chain widget
      widgetCtx.ui.setWidget("agent-chain", undefined);

      if (!result.success) {
        ctx.ui.notify(
          `Code review failed: ${result.output.slice(0, 200)}`,
          "error",
        );
        return;
      }

      // Write report file
      const reportPath = join(ctx.cwd, ".pi", "code-review-report.md");
      const reportDir = dirname(reportPath);
      if (!existsSync(reportDir)) {
        mkdirSync(reportDir, { recursive: true });
      }
      writeFileSync(reportPath, result.output, "utf-8");

      ctx.ui.notify(
        `Code review complete! Report saved to ${reportPath}`,
        "info",
      );
    },
  });

  pi.registerCommand("learn", {
    description:
      "Learn a codebase/folder — deep reconnaissance compiled into structured Obsidian wiki documentation",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const scope = (args || "").trim();
      const targetPath = scope || ctx.cwd;

      ctx.ui.notify(`Starting codebase learn: ${targetPath}...`, "info");

      // Find learn chain
      const learnChain = chains.find((c) => c.name === "learn");
      if (!learnChain) {
        ctx.ui.notify(
          "Learn chain not found in .pi/agents/agent-chain.yaml",
          "error",
        );
        return;
      }

      // Activate the learn chain
      activateChain(learnChain);

      // Check for existing wiki content to enable delta-aware re-learns
      let task = targetPath;
      const learnReader = (globalThis as any).__piLearnReadExisting;
      if (learnReader) {
        try {
          const existingContent = await learnReader(targetPath, ctx.cwd);
          if (existingContent) {
            task =
              `${targetPath}\n\n## Existing Wiki Content\n\nThis codebase has been learned before. Below is the current documentation. Focus on what's new or changed — preserve existing documentation that's still accurate.\n\n${existingContent}`;
            ctx.ui.notify(
              "Existing wiki found — running delta-aware re-learn",
              "info",
            );
          }
        } catch {
          // Ignore read errors — proceed with full learn
        }
      }

      // Run the chain
      const result = await runChain(task, ctx);

      // Hide chain widget — learn is done
      widgetCtx.ui.setWidget("agent-chain", undefined);

      if (!result.success) {
        ctx.ui.notify(`Learn failed: ${result.output.slice(0, 200)}`, "error");
        return;
      }

      // Write raw report backup
      const reportPath = join(ctx.cwd, ".pi", "learn-report.md");
      const reportDir = dirname(reportPath);
      if (!existsSync(reportDir)) {
        mkdirSync(reportDir, { recursive: true });
      }
      writeFileSync(reportPath, result.output, "utf-8");

      // Call into learn.ts's Obsidian writing logic via global hook
      const learnWriter = (globalThis as any).__piLearnFromChainOutput;
      if (learnWriter) {
        try {
          await learnWriter(
            result.output,
            targetPath,
            ctx.cwd,
            (msg: string, type: "error" | "warning" | "info") =>
              ctx.ui.notify(msg, type),
          );
        } catch (err: any) {
          ctx.ui.notify(
            `Obsidian write failed: ${err?.message || "unknown error"}`,
            "error",
          );
          ctx.ui.notify(`Raw report saved to ${reportPath}`, "info");
        }
      } else {
        ctx.ui.notify(
          `Learn chain complete! Report saved to ${reportPath}\n(Obsidian integration not loaded — load learn.ts extension for wiki writing)`,
          "warning",
        );
      }
    },
  });

  // ── /test-gen command ────────────────────────

  pi.registerCommand("test-gen", {
    description:
      "Thoughtful test generation — discover modules, plan strategy, generate and review tests with iterative feedback",
    handler: async (args, ctx) => {
      widgetCtx = ctx;
      const scope = (args || "").trim();

      // Step 1: Discover modules
      ctx.ui.notify("Discovering testable modules...", "info");
      let manifest: ModuleManifest;
      try {
        manifest = discoverModules(ctx.cwd);
      } catch (err: any) {
        ctx.ui.notify(
          `Module discovery failed: ${err?.message || "unknown error"}`,
          "error",
        );
        return;
      }

      if (manifest.modules.length === 0) {
        ctx.ui.notify(
          "No testable modules found. Check that your project has exported functions, components, or routes.",
          "warning",
        );
        return;
      }

      ctx.ui.notify(
        `Found ${manifest.modules.length} modules (${manifest.coverageGaps} without tests) in ${manifest.projectName} (${manifest.framework})`,
        "info",
      );

      // Step 2: Module selection
      let selectedModules: DiscoveredModule[];

      if (scope) {
        // Filter by scope argument (path prefix or module type)
        selectedModules = manifest.modules.filter((m) =>
          m.relativePath.includes(scope) ||
          m.name.toLowerCase().includes(scope.toLowerCase()) ||
          m.type === scope
        );
        if (selectedModules.length === 0) {
          ctx.ui.notify(
            `No modules match scope "${scope}". Try a different path or module name.`,
            "warning",
          );
          return;
        }
        ctx.ui.notify(
          `Scope filter: ${selectedModules.length} modules matching "${scope}"`,
          "info",
        );
      } else {
        // Interactive selection
        const selectionOptions = [
          `All high priority (${
            manifest.modules.filter((m) => m.suggestedPriority === "high")
              .length
          } modules)`,
          `All uncovered modules (${manifest.coverageGaps} modules)`,
          `All modules (${manifest.modules.length} modules)`,
          "Select by type...",
        ];

        const choice = await ctx.ui.select(
          "Select modules to test",
          selectionOptions,
        );
        if (choice === undefined) return;

        switch (choice) {
          case selectionOptions[0]:
            selectedModules = manifest.modules.filter((m) =>
              m.suggestedPriority === "high"
            );
            break;
          case selectionOptions[1]:
            selectedModules = manifest.modules.filter((m) =>
              m.coverageStatus === "none"
            );
            break;
          case selectionOptions[2]:
            selectedModules = manifest.modules;
            break;
          case selectionOptions[3]: {
            const groups = groupModulesByType(manifest.modules);
            const typeOptions = Array.from(groups.entries()).map((
              [type, mods],
            ) =>
              `${type} (${mods.length} modules, ${
                mods.filter((m) => m.coverageStatus === "none").length
              } uncovered)`
            );
            const typeChoice = await ctx.ui.select(
              "Select module type",
              typeOptions,
            );
            if (typeChoice === undefined) return;
            const typeIdx = typeOptions.indexOf(typeChoice);
            const selectedType = Array.from(groups.keys())[typeIdx];
            selectedModules = groups.get(selectedType) || [];
            break;
          }
          default:
            selectedModules = manifest.modules.filter((m) =>
              m.suggestedPriority === "high"
            );
        }
      }

      if (selectedModules.length === 0) {
        ctx.ui.notify("No modules selected.", "info");
        return;
      }

      // Step 3: Estimate and confirm
      const estMinutes = Math.ceil(selectedModules.length * 2.5); // ~2.5 min per module for full pipeline
      ctx.ui.notify(
        `Starting test generation for ${selectedModules.length} modules\n` +
          `Estimated time: ~${estMinutes} minutes\n` +
          `Pipeline: Scout → Planner → Builder (2 passes) → Reviewer (2 passes) → Test Viewer`,
        "info",
      );

      // Step 4: Find and activate test-generation chain
      const testGenChain = chains.find((c) => c.name === "test-generation");
      if (!testGenChain) {
        ctx.ui.notify(
          "test-generation chain not found in agent-chain.yaml",
          "error",
        );
        return;
      }

      activateChain(testGenChain);

      // Step 5: Format input and run chain
      const task = formatSelectedModulesForChain(selectedModules, manifest);
      const result = await runChain(task, ctx);

      // Hide chain widget
      widgetCtx.ui.setWidget("agent-chain", undefined);

      if (!result.success) {
        ctx.ui.notify(
          `Test generation failed: ${result.output.slice(0, 200)}`,
          "error",
        );
        // Still save partial output
        const reportPath = join(ctx.cwd, ".pi", "test-gen-report.md");
        const reportDir = dirname(reportPath);
        if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
        writeFileSync(reportPath, result.output, "utf-8");
        ctx.ui.notify(`Partial output saved to ${reportPath}`, "info");
        return;
      }

      // Step 6: Parse output into features
      const features = parseChainOutput(result.output);

      if (features.length === 0) {
        ctx.ui.notify(
          "Chain completed but no test files were parsed from the output. Saving raw output.",
          "warning",
        );
        const reportPath = join(ctx.cwd, ".pi", "test-gen-report.md");
        const reportDir = dirname(reportPath);
        if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
        writeFileSync(reportPath, result.output, "utf-8");
        ctx.ui.notify(`Raw output saved to ${reportPath}`, "info");
        return;
      }

      // Step 7: Store as Gopher drafts
      try {
        const drafts = storeDrafts(features, ctx.cwd);
        ctx.ui.notify(`Stored ${drafts.length} draft(s) in .gopher/`, "info");
      } catch (err: any) {
        ctx.ui.notify(
          `Draft storage failed: ${
            err?.message || "unknown"
          } — opening test viewer anyway`,
          "warning",
        );
      }

      // Step 8: Extract quality scores for summary
      const scores = extractQualityScores(result.output);
      const avgScore = scores.size > 0
        ? (Array.from(scores.values()).reduce((a, b) => a + b, 0) / scores.size)
          .toFixed(1)
        : "N/A";

      // Step 9: Open test viewer via sendMessage (triggers show_test_viewer)
      const elapsed = Math.round(result.elapsed / 1000);
      piRef.sendMessage(
        {
          customType: "test-gen-complete",
          content:
            `Test generation complete! ${features.length} feature/test pair(s) generated in ${elapsed}s.\n` +
            `Average quality score: ${avgScore}/10\n\n` +
            `Call \`show_test_viewer\` with these features to let the user review and approve:\n\n` +
            `\`\`\`json\n${
              JSON.stringify(
                features.map((f) => ({
                  name: f.name,
                  gherkin: f.gherkin,
                  playwright_code: f.playwrightCode,
                  file_path: f.filePath,
                })),
                null,
                2,
              )
            }\n\`\`\``,
          display: true,
        },
        { deliverAs: "followUp" as any, triggerTurn: true },
      );

      // Also save raw report
      const reportPath = join(ctx.cwd, ".pi", "test-gen-report.md");
      const reportDir = dirname(reportPath);
      if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
      writeFileSync(reportPath, result.output, "utf-8");

      ctx.ui.notify(
        `Test generation complete! ${features.length} features, avg score ${avgScore}/10, ${elapsed}s elapsed.\nReport: ${reportPath}`,
        "info",
      );
    },
  });

  // ── System Prompt Override ───────────────────

  pi.on("before_agent_start", async (_event, _ctx) => {
    // Force widget reset on first turn after /new
    if (pendingReset && activeChain) {
      pendingReset = false;
      widgetCtx = _ctx;
      stepStates = activeChain.steps.map((s) => {
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

    const flow = activeChain.steps.map((s) => displayName(s.agent)).join(" → ");
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
      .filter((s) => {
        const key = s.agent.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((s) => {
        const agentDef = allAgents.get(s.agent.toLowerCase());
        if (!agentDef) return `### ${displayName(s.agent)}\nAgent not found.`;
        return `### ${
          displayName(agentDef.name)
        }\n${agentDef.description}\n**Tools:** ${agentDef.tools}\n**Role:** ${agentDef.systemPrompt}`;
      })
      .join("\n\n");

    const commanderAvailable = !!(globalThis as any).__piCommanderAvailable;
    const commanderSection = commanderAvailable
      ? `

## Commander Integration (REQUIRED)
Commander is connected. ALWAYS use these tools for dashboard visibility:
- \`commander_session { operation: "file:open", file_path: <path> }\` — display key files in Commander's floating viewer
- \`commander_task\` — track tasks in the Commander dashboard
- \`commander_mailbox\` — send status updates to the dashboard

### Mailbox Protocol
- Check your inbox periodically: \`commander_mailbox { operation: "inbox", agent_name: "coordinator" }\`
- Send status at start, milestones, and completion
- Warm, professional, collaborative tone — no emojis anywhere`
      : "";

    return {
      systemPrompt:
        `You are an agent with a sequential pipeline called "${activeChain.name}" at your disposal.${desc}
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
        this.scrollOffset = Math.max(
          0,
          this.scrollOffset - Math.max(1, contentHeight - 1),
        );
      } else if (matchesKey(data, Key.pageDown)) {
        this.scrollOffset = Math.min(
          maxScroll,
          this.scrollOffset + Math.max(1, contentHeight - 1),
        );
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
      container.addChild(
        new DynamicBorder((s: string) => theme.fg("accent", s)),
      );
      const name = displayName(this.step.agent);
      const statusForButton = this.step.status === "pending"
        ? "idle"
        : this.step.status;
      const statusBtn = statusButton(statusForButton, name, theme);
      const timeStr = this.step.status !== "pending" && this.step.elapsed > 0
        ? ` ${Math.round(this.step.elapsed / 1000)}s`
        : "";
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
      const formatRow = (
        label: string,
        value: string,
        valueColor: string = "muted",
      ) => {
        const labelStr = theme.fg(
          "accent",
          theme.bold(padRight(label + ":", 14)),
        );
        const valueStr = theme.fg(valueColor, value);
        return labelStr + " " + valueStr;
      };

      const addWrappedRow = (
        label: string,
        value: string,
        valueColor: string = "muted",
      ) => {
        const labelWidth = 14;
        const valueWidth = innerWidth - labelWidth - 1;
        const wrapped = wordWrap(value, valueWidth);
        for (let i = 0; i < wrapped.length; i++) {
          const displayLabel = i === 0 ? label : "";
          container.addChild(
            new Text(formatRow(displayLabel, wrapped[i], valueColor), 1, 0),
          );
        }
      };

      const statusColorMap: Record<string, string> = {
        running: "accent",
        done: "success",
        error: "error",
        pending: "dim",
      };
      const statusColor = statusColorMap[this.step.status] || "muted";
      container.addChild(
        new Text(
          formatRow("STATUS", this.step.status.toUpperCase(), statusColor),
          1,
          0,
        ),
      );

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
        const sysPromptMd = new Markdown(
          this.agentDef.systemPrompt,
          1,
          0,
          mdTheme,
        );
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
      const visibleContentLines = allLines.slice(
        this.scrollOffset,
        this.scrollOffset + contentHeight,
      );

      const scrollInfo = maxScroll > 0
        ? ` \u2191/\u2193/PgUp/PgDn/Home/End Scroll (${this.scrollOffset + 1}-${
          Math.min(this.scrollOffset + contentHeight, allLines.length)
        }/${allLines.length}) \u2022 Esc Close`
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

  async function showStepDetail(
    ctx: any,
    step: StepState,
    agentDef: AgentDef | null,
  ) {
    await ctx.ui.custom((tui: any, theme: any, _kb: any, done: any) => {
      const overlay = new StepDetailOverlay(
        step,
        agentDef,
        () => done(undefined),
      );
      return {
        render: (w: number) =>
          overlay.render(w, process.stdout.rows || 24, theme),
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
          try {
            unlinkSync(join(sessDir, f));
          } catch {}
        }
      }
    }

    // Reload chains + clear agentSessions map (all agents start fresh)
    loadChains(_ctx.cwd);

    if (chains.length === 0) {
      _ctx.ui.notify(
        "No chains found in .pi/agents/agent-chain.yaml",
        "warning",
      );
      return;
    }

    // Default to first chain — use /chain to switch
    activateChain(chains[0]);

    // ── Expose global hooks for escape-cancel integration ────────────
    (globalThis as any).__piKillChainProc = (): boolean => {
      if (currentChainProc) {
        try {
          currentChainProc.kill("SIGTERM");
        } catch {}
        currentChainProc = null;
        return true;
      }
      return false;
    };
    (globalThis as any).__piHasRunningChain = (): boolean => {
      return currentChainProc !== null;
    };

    // run_chain is registered as a tool — available alongside all default tools

    if (!(globalThis as any).__piSummaryModeActive) {
      _ctx.ui.setStatus(
        "agent-chain",
        `Chain: ${activeChain!.name} (${activeChain!.steps.length} steps)`,
      );
    }
    // Footer: use footer.ts only — do not overwrite

    // Register nav provider for F-key navigation
    const providers =
      ((globalThis as any).__piNavProviders =
        (globalThis as any).__piNavProviders || []);
    providers.push({
      isActive: () => activeChain !== null && stepStates.length > 0,
      selectPrev: (_ctx2: any) => {
        const count = stepStates.length;
        if (count === 0) {
          selectedStepIndex = -1;
          return;
        }
        if (selectedStepIndex < 0) selectedStepIndex = count - 1;
        else selectedStepIndex = (selectedStepIndex - 1 + count) % count;
        updateWidget();
      },
      selectNext: (_ctx2: any) => {
        const count = stepStates.length;
        if (count === 0) {
          selectedStepIndex = -1;
          return;
        }
        if (selectedStepIndex < 0) selectedStepIndex = 0;
        else selectedStepIndex = (selectedStepIndex + 1) % count;
        updateWidget();
      },
      showDetail: async (ctx: any) => {
        if (selectedStepIndex < 0 || selectedStepIndex >= stepStates.length) {
          return;
        }
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
