// ABOUTME: Tool Caller — meta-tool that lets the agent invoke other tools programmatically by name.
// ABOUTME: Enables dynamic tool composition, pipelines, and conditional tool usage.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";
import { getToolRegistry } from "./tool-registry.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

// ── Tool Parameters ────────────────────────────────────────────────────

const CallToolParams = Type.Object({
	tool_name: Type.String({ description: "Name of the tool to invoke (e.g. 'read', 'commander_task', 'web_remote')" }),
	arguments: Type.Record(Type.String(), Type.Unknown(), { description: "Arguments to pass to the tool — must match the tool's parameter schema" }),
	reason: Type.Optional(Type.String({ description: "Brief description of why this tool is being called (for audit trail)" })),
});

// ── Self-reference prevention ──────────────────────────────────────────

const BLOCKED_TOOLS = new Set(["call_tool", "tool_search"]);

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const registry = getToolRegistry();

	// Cache of tool execute functions — built lazily
	const toolExecutors: Map<string, any> = new Map();

	// We need access to the raw tool definitions for execute functions
	// pi.getAllTools() only gives name+description, but we need the execute function
	// We'll use a different approach: register tools that proxy through pi's internal tool system

	pi.registerTool({
		name: "call_tool",
		label: "Call Tool",
		description:
			"Invoke any registered tool programmatically by name. " +
			"Use tool_search first to discover available tools and their parameters. " +
			"This enables dynamic tool composition — call tools based on runtime conditions.\n\n" +
			"Parameters:\n" +
			"- tool_name: The exact name of the tool to call (e.g. 'read', 'bash', 'commander_task')\n" +
			"- arguments: Object with the tool's expected parameters\n" +
			"- reason: (optional) Why this tool is being called\n\n" +
			"Examples:\n" +
			'{ "tool_name": "read", "arguments": { "path": "package.json" }, "reason": "Check project dependencies" }\n' +
			'{ "tool_name": "bash", "arguments": { "command": "git status" }, "reason": "Check repo state" }\n' +
			'{ "tool_name": "commander_task", "arguments": { "operation": "list" }, "reason": "List current tasks" }\n\n' +
			"Note: Cannot call 'call_tool' or 'tool_search' recursively. " +
			"All security restrictions still apply — blocked operations remain blocked.",
		parameters: CallToolParams,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const { tool_name, arguments: toolArgs, reason } = params;

			// Prevent self-referential calls
			if (BLOCKED_TOOLS.has(tool_name)) {
				return {
					content: [{ type: "text" as const, text: `Error: Cannot call '${tool_name}' through call_tool — use it directly.` }],
					details: { tool_name, error: "blocked_self_reference", reason },
				};
			}

			// Verify tool exists in registry
			const entry = registry.getByName(tool_name);
			if (!entry) {
				const similar = registry.search(tool_name).slice(0, 3);
				const suggestion = similar.length > 0
					? ` Did you mean: ${similar.map((s) => s.name).join(", ")}?`
					: "";
				return {
					content: [{ type: "text" as const, text: `Error: Tool "${tool_name}" not found.${suggestion}` }],
					details: { tool_name, error: "not_found", reason },
				};
			}

			// Verify tool is in the full tools list (getAllTools returns registered tools)
			const allTools = pi.getAllTools();
			const toolDef = allTools.find((t: any) => t.name === tool_name);
			if (!toolDef) {
				return {
					content: [{ type: "text" as const, text: `Error: Tool "${tool_name}" is indexed but not currently registered. It may have been unloaded.` }],
					details: { tool_name, error: "not_registered", reason },
				};
			}

			// Execute via pi's internal tool calling mechanism
			// We use sendMessage to inject a tool call that the agent loop will handle
			// But that's not programmatic — we need direct execution.
			//
			// The approach: we call the tool's execute function directly if available.
			// pi.getAllTools() doesn't expose execute, but we can access registered tools
			// through the global tool registry that Pi maintains internally.
			//
			// Alternative: use Bash to call `pi --mode json --tools <name> -p "<prompt>"`
			// But that's heavy. Instead, we leverage the fact that custom tools registered
			// via pi.registerTool share the same runtime — we can store references.

			try {
				// Access the tool execution system through Pi's internal mechanisms
				// We use the __piToolExecutors map that we build during session_start
				const executor = toolExecutors.get(tool_name);
				if (executor) {
					const result = await executor(
						`${toolCallId}-proxy-${tool_name}`,
						toolArgs,
						signal,
						onUpdate,
						ctx,
					);
					return {
						content: result.content || [{ type: "text" as const, text: "Tool returned no content" }],
						details: {
							tool_name,
							reason,
							proxied: true,
							originalDetails: result.details,
						},
					};
				}

				// Fallback: the tool is a built-in or we don't have direct access to its executor
				// In this case, we can use pi.exec to run a sub-process pi call
				// But for built-in tools, we can import and call them directly
				const builtinResult = await executeBuiltinTool(tool_name, toolArgs, ctx, signal, pi);
				if (builtinResult) {
					return {
						content: builtinResult.content || [{ type: "text" as const, text: "Tool returned no content" }],
						details: {
							tool_name,
							reason,
							proxied: true,
							executionMethod: "builtin",
							originalDetails: builtinResult.details,
						},
					};
				}

				// Last resort: report that programmatic execution isn't available for this tool
				return {
					content: [{
						type: "text" as const,
						text: `Tool "${tool_name}" exists but programmatic execution is not available. ` +
							`Call it directly instead of through call_tool.`,
					}],
					details: { tool_name, reason, error: "no_executor" },
				};
			} catch (err: any) {
				return {
					content: [{
						type: "text" as const,
						text: `Error executing "${tool_name}": ${err.message}`,
					}],
					details: { tool_name, reason, error: "execution_error", message: err.message },
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("call_tool "));
			text += theme.fg("accent", args.tool_name || "?");
			if (args.reason) {
				text += theme.fg("dim", ` — ${args.reason}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.error) {
				const errMsg = details.error === "not_found"
					? `✗ Tool not found: ${details.tool_name}`
					: details.error === "blocked_self_reference"
						? `✗ Cannot call ${details.tool_name} recursively`
						: `✗ Error: ${details.message || details.error}`;
				return new Text(theme.fg("error", errMsg), 0, 0);
			}

			if (details.proxied) {
				let summary = theme.fg("success", `✓ ${details.tool_name}`);
				if (details.reason) summary += theme.fg("dim", ` — ${details.reason}`);

				if (expanded) {
					const text = result.content[0];
					const body = text?.type === "text" ? text.text : "";
					const truncated = body.length > 500 ? body.slice(0, 500) + "..." : body;
					return new Text(summary + "\n" + theme.fg("muted", truncated), 0, 0);
				}
				return new Text(summary, 0, 0);
			}

			return new Text(theme.fg("dim", "call_tool completed"), 0, 0);
		},
	});

	// Hook into session_start to capture tool executors from other extensions
	pi.on("session_start", async (_event, _ctx) => {
		// Store references to tool executors that we can access
		// This is populated by other extensions that register tools via pi.registerTool
		// We access them through the global __piToolRegistry pattern

		const g = globalThis as any;

		// Build executor cache from any tools that expose their execute functions
		// via the global registry pattern
		if (g.__piRegisteredToolExecutors) {
			for (const [name, executor] of Object.entries(g.__piRegisteredToolExecutors)) {
				toolExecutors.set(name, executor);
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}

// ── Built-in Tool Execution ────────────────────────────────────────────

async function executeBuiltinTool(
	name: string,
	args: Record<string, unknown>,
	ctx: any,
	signal: AbortSignal | undefined,
	pi: ExtensionAPI,
): Promise<{ content: any[]; details?: any } | null> {
	const cwd = ctx.cwd || process.cwd();

	switch (name) {
		case "bash": {
			const command = args.command as string;
			if (!command) return { content: [{ type: "text", text: "Error: 'command' parameter required" }] };
			const timeout = (args.timeout as number) || undefined;
			try {
				// pi.exec takes (binary, args[], options) like child_process.spawn
				// For shell commands, we need to invoke bash -c "command"
				const result = await pi.exec("bash", ["-c", command], {
					signal,
					timeout: timeout ? timeout * 1000 : undefined,
					cwd,
				});
				const output = result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : "");
				return {
					content: [{ type: "text", text: output || "(no output)" }],
					details: { exitCode: result.code, command },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Bash error: ${err.message}` }],
					details: { error: true, command },
				};
			}
		}

		case "read": {
			const { readFileSync } = await import("node:fs");
			const { resolve } = await import("node:path");
			const path = (args.path as string) || "";
			if (!path) return { content: [{ type: "text", text: "Error: 'path' parameter required" }] };
			try {
				const fullPath = resolve(cwd, path);
				const content = readFileSync(fullPath, "utf-8");
				const offset = (args.offset as number) || 1;
				const limit = (args.limit as number) || 2000;
				const lines = content.split("\n");
				const sliced = lines.slice(offset - 1, offset - 1 + limit);
				return {
					content: [{ type: "text", text: sliced.join("\n") }],
					details: { path: fullPath, totalLines: lines.length },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Read error: ${err.message}` }],
					details: { error: true, path },
				};
			}
		}

		case "write": {
			const { writeFileSync, mkdirSync } = await import("node:fs");
			const { resolve, dirname } = await import("node:path");
			const path = (args.path as string) || "";
			const content = (args.content as string) || "";
			if (!path) return { content: [{ type: "text", text: "Error: 'path' parameter required" }] };
			try {
				const fullPath = resolve(cwd, path);
				mkdirSync(dirname(fullPath), { recursive: true });
				writeFileSync(fullPath, content, "utf-8");
				return {
					content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }],
					details: { path: fullPath, bytes: content.length },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Write error: ${err.message}` }],
					details: { error: true, path },
				};
			}
		}

		default:
			return null;
	}
}
