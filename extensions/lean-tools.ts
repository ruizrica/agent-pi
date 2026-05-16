// ABOUTME: Lean Tools Mode — reduces system prompt bloat by deactivating non-essential tools.
// ABOUTME: Agent uses tool_search + call_tool to discover and invoke tools dynamically.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

// ── Configuration ────────────────────────────────

// Tools that remain active in lean mode
const LEAN_CORE_TOOLS = [
	// Meta-tools — the primary interface
	"tool_search",
	"call_tool",
	// Essential tools the agent always needs
	"read",
	"bash",
	"write",
	"edit",
	// Tasks — always needed for plan-mode workflow
	"tasks",
];

// ── State ────────────────────────────────────────

const g = globalThis as any;

export function isLeanMode(): boolean {
	return g.__piLeanToolsMode === true;
}

function setLeanMode(enabled: boolean): void {
	g.__piLeanToolsMode = enabled;
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Store all tool names so we can restore
	let allToolNames: string[] = [];

	pi.registerCommand("lean-tools", {
		description: "Toggle lean tools mode — agent uses tool_search + call_tool instead of all tools",
		handler: async (_args, ctx) => {
			if (isLeanMode()) {
				// Disable lean mode — restore all tools
				pi.setActiveTools(allToolNames);
				setLeanMode(false);
				ctx.ui.notify("Lean tools mode: OFF — all tools active", "info");
			} else {
				// Enable lean mode — keep only core tools
				allToolNames = pi.getActiveTools();
				pi.setActiveTools(LEAN_CORE_TOOLS);
				setLeanMode(true);
				ctx.ui.notify(
					`Lean tools mode: ON — ${LEAN_CORE_TOOLS.length} core tools active.\n` +
					`Use tool_search to discover ${allToolNames.length - LEAN_CORE_TOOLS.length} additional tools.`,
					"info",
				);
			}
		},
	});

	// Inject lean-mode instructions when enabled
	pi.on("before_agent_start", async (event, _ctx) => {
		if (!isLeanMode()) return;

		const leanPrompt = `\n\n## Lean Tools Mode Active

You are in lean tools mode. Your primary tools are:
- **tool_search**: Search and discover available tools by capability
- **call_tool**: Invoke any discovered tool by name with arguments
- **read, bash, write, edit**: Core filesystem and shell tools
- **tasks**: Task management

When you need a capability not covered by your active tools:
1. Use \`tool_search\` with a descriptive query to find relevant tools
2. Use \`tool_search inspect\` to understand the tool's parameters
3. Use \`call_tool\` to invoke the tool with the correct arguments

This approach keeps your context window efficient while giving you access to all tools.`;

		return {
			systemPrompt: (event.systemPrompt || "") + leanPrompt,
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		allToolNames = pi.getActiveTools();
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
