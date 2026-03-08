// ABOUTME: Registers toolkit .md files from .pi/commands/ as dynamic Pi slash commands.
// ABOUTME: Supports inline (inject as user message) and fork (spawn subprocess) execution modes.
/**
 * Toolkit Commands — Register toolkit command .md files as Pi slash commands
 *
 * Scans ~/.pi/agent/.pi/commands/ (including symlinked toolkit/commands) for .md files.
 * Parses frontmatter (description, argument-hint, allowed-tools, context) and registers
 * each as a Pi slash command. When invoked:
 * - Inline (no context: fork): injects body with $ARGUMENTS replaced as user message
 * - Fork (context: fork): spawns a pi subprocess with the command body as system prompt
 *
 * Usage: loaded via packages in settings.json
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "child_process";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { DEFAULT_SUBAGENT_MODEL } from "./lib/defaults.ts";

// ── Types ────────────────────────────────────────

interface CommandDef {
	name: string;
	nameFromFrontmatter: boolean;
	description: string;
	argumentHint: string;
	allowedTools: string[];
	context: "fork" | "inline";
	agent: string;
	body: string;
	file: string;
}

// Map toolkit tool names to Pi tool names
const TOOL_MAP: Record<string, string> = {
	Bash: "bash",
	bash: "bash",
	Read: "read",
	read: "read",
	Write: "write",
	write: "write",
	Edit: "edit",
	edit: "edit",
	Grep: "grep",
	grep: "grep",
	Glob: "find",
	glob: "find",
	Find: "find",
	find: "find",
	Ls: "ls",
	ls: "ls",
	"file-system": "read,write,edit",
	"AskUserQuestion": "ask_user",
	Task: "dispatch_agent",
	Skill: "skill",
	Python: "bash",
	python: "bash",
	terminal: "bash",
	"claude-code-sdk": "read,grep,bash",
	// Commander MCP tools (Claude Code → Pi name mapping)
	"mcp__commander__commander_task": "commander_task",
	"mcp__commander__commander_session": "commander_session",
	"mcp__commander__commander_workflow": "commander_workflow",
	"mcp__commander__commander_spec": "commander_spec",
	"mcp__commander__commander_jira": "commander_jira",
	"mcp__commander__commander_mailbox": "commander_mailbox",
	"mcp__commander__commander_orchestration": "commander_orchestration",
	"mcp__commander__commander_dependency": "commander_dependency",
	// Legacy tool names used in session-cleanup.md
	"mcp__commander__commander_session_cleanup": "commander_session",
	"mcp__commander__commander_terminal_sessions": "commander_session",
	// Legacy pre-unification commander tool names (all map to unified commander_task)
	"mcp__commander__commander_task_lifecycle": "commander_task",
	"mcp__commander__commander_task_group": "commander_task",
	"mcp__commander__commander_comment": "commander_task",
	"mcp__commander__commander_log": "commander_task",
	// Claude Code tool equivalents
	"SlashCommand": "skill",
};

export function mapTools(toolList: string[]): string[] {
	const result: string[] = [];
	for (let t of toolList) {
		// Handle Claude Code tool filter patterns like "Bash(python3:*)"
		// Strip the filter suffix — Pi doesn't use it, just map the base tool name
		const filterMatch = t.match(/^([A-Za-z_-]+)\(.*\)$/);
		if (filterMatch) t = filterMatch[1];

		const mapped = TOOL_MAP[t] ?? t.toLowerCase().replace(/-/g, "_");
		for (const m of mapped.split(",")) {
			const trimmed = m.trim();
			if (trimmed && !result.includes(trimmed)) result.push(trimmed);
		}
	}
	return result.length > 0 ? result : ["read", "grep", "find", "ls", "bash"];
}

// ── Parser ───────────────────────────────────────

function parseCommandFile(filePath: string): CommandDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		const desc = frontmatter.description;
		if (!desc) return null;

		const allowedToolsRaw = frontmatter["allowed-tools"];
		let allowedTools: string[] = [];
		if (allowedToolsRaw) {
			try {
				const parsed = JSON.parse(allowedToolsRaw.replace(/'/g, '"'));
				allowedTools = Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				allowedTools = allowedToolsRaw.split(",").map((s) => s.trim()).filter(Boolean);
			}
		}

		const context = (frontmatter.context || "").toLowerCase() === "fork" ? "fork" : "inline";
		const nameFromFrontmatter = !!frontmatter.name;
		const name = frontmatter.name || filePath.split("/").pop()?.replace(/\.md$/, "") || "unknown";

		return {
			name,
			nameFromFrontmatter,
			description: desc,
			argumentHint: frontmatter["argument-hint"] || "",
			allowedTools,
			context,
			agent: frontmatter.agent || "general-purpose",
			body: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

export function scanCommandDirs(baseDir: string): CommandDef[] {
	const commands: CommandDef[] = [];
	const seen = new Set<string>();

	function scan(d: string) {
		if (!existsSync(d)) return;
		for (const file of readdirSync(d, { withFileTypes: true })) {
			const fullPath = join(d, file.name);
			// Follow symlinks to directories (isDirectory() returns false for symlinks)
			if (file.isDirectory() || (file.isSymbolicLink() && statSync(fullPath).isDirectory())) {
				scan(fullPath);
			} else if (file.name.endsWith(".md")) {
				const def = parseCommandFile(fullPath);
				if (def) {
					if (!def.nameFromFrontmatter) {
						const relDir = relative(baseDir, d);
						if (relDir) {
							def.name = `${relDir.replace(/[\\/]/g, "-")}-${def.name}`;
						}
					}
					const key = def.name.toLowerCase();
					if (!seen.has(key)) {
						seen.add(key);
						commands.push(def);
					}
				}
			}
		}
	}

	scan(baseDir);
	return commands;
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const extDir = dirname(fileURLToPath(import.meta.url));
	const agentRoot = resolve(extDir, "..");
	const commandsDir = join(agentRoot, ".pi", "commands");
	const commands = scanCommandDirs(commandsDir);

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	for (const cmd of commands) {
			const cmdName = cmd.name;
			const desc = cmd.argumentHint
				? `${cmd.description} — ${cmd.argumentHint}`
				: cmd.description;

			pi.registerCommand(cmdName, {
				description: desc,
				handler: async (args, _ctx) => {
					const userArgs = (args ?? "").trim();
					const body = cmd.body.replace(/\$ARGUMENTS/g, userArgs);

					if (cmd.context === "fork") {
						const tools = mapTools(cmd.allowedTools).join(",");
						const model = _ctx.model
							? `${_ctx.model.provider}/${_ctx.model.id}`
							: DEFAULT_SUBAGENT_MODEL;

						const tasksExtPath = join(dirname(fileURLToPath(import.meta.url)), "tasks.ts");
						const proc = spawn("pi", [
							"--mode", "json",
							"-p",
							"--no-extensions",
							"-e", tasksExtPath,
							"--model", model,
							"--tools", tools,
							"--thinking", "off",
							"--append-system-prompt", body,
							userArgs || "",
						], {
							stdio: ["ignore", "pipe", "pipe"],
							env: { ...process.env, PI_SUBAGENT: "1" },
						});

						let output = "";
						proc.stdout?.setEncoding("utf-8");
						proc.stdout?.on("data", (chunk) => { output += chunk; });
						proc.stderr?.on("data", () => {});

						await new Promise<void>((res) => proc.on("close", () => res()));

						const truncated = output.length > 8000
							? output.slice(0, 8000) + "\n\n... [truncated]"
							: output;

						pi.sendMessage(
							{
								customType: "toolkit-command-result",
								content: truncated || "(no output)",
								display: true,
							},
							{ deliverAs: "followUp", triggerTurn: true },
						);
					} else {
						const tools = mapTools(cmd.allowedTools);
						if (tools.length > 0) {
							pi.setActiveTools(tools);
						}
						pi.sendMessage(
							{
								customType: "toolkit-command",
								content: body,
								display: true,
							},
							{ deliverAs: "user", triggerTurn: true },
						);
					}
				},
			});
	}
}
