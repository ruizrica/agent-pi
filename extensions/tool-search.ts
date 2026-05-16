// ABOUTME: Tool Search — meta-tool that lets the agent discover and inspect available tools at runtime.
// ABOUTME: Provides search, list, and inspect operations against the tool registry.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";
import { getToolRegistry, type ToolEntry } from "./tool-registry.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

// ── Tool Parameters ────────────────────────────────────────────────────

const ToolSearchParams = Type.Object({
	operation: StringEnum(["search", "list", "inspect"] as const),
	query: Type.Optional(Type.String({ description: "Search query — matches tool names, descriptions, tags, and categories" })),
	category: Type.Optional(Type.String({ description: "Filter by category (for 'list' operation). Use 'list' without category to see all categories." })),
	tool_name: Type.Optional(Type.String({ description: "Tool name to inspect (for 'inspect' operation)" })),
});

// ── Formatting Helpers ─────────────────────────────────────────────────

function formatToolCompact(entry: ToolEntry): string {
	return `• ${entry.name} [${entry.category}] — ${entry.parameterSummary}`;
}

function formatToolDetailed(entry: ToolEntry): string {
	const lines: string[] = [
		`## ${entry.name}`,
		``,
		`**Label:** ${entry.label}`,
		`**Category:** ${entry.category}`,
		`**Source:** ${entry.source}`,
		`**Tags:** ${entry.tags.join(", ") || "none"}`,
		``,
		`### Description`,
		entry.description,
	];
	return lines.join("\n");
}

function formatCategoryList(categories: { name: string; count: number }[]): string {
	const lines = ["**Available Tool Categories:**", ""];
	for (const cat of categories) {
		lines.push(`• ${cat.name} (${cat.count} tools)`);
	}
	return lines.join("\n");
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const registry = getToolRegistry();

	pi.registerTool({
		name: "tool_search",
		label: "Tool Search",
		description:
			"Search, list, and inspect available tools. Use this to discover what tools are available " +
			"before calling them. Three operations:\n" +
			"- 'search': Find tools by query (matches names, descriptions, tags, categories)\n" +
			"- 'list': List all tools or filter by category. Omit category to see all categories.\n" +
			"- 'inspect': Get full details and parameter schema for a specific tool by name.\n\n" +
			"Examples:\n" +
			'{ "operation": "search", "query": "file management" }\n' +
			'{ "operation": "list", "category": "commander" }\n' +
			'{ "operation": "inspect", "tool_name": "commander_task" }',
		parameters: ToolSearchParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { operation, query, category, tool_name } = params;

			// Ensure registry is populated
			if (registry.size === 0) {
				const allTools = pi.getAllTools();
				registry.buildIndex(allTools);
			}

			if (operation === "search") {
				if (!query) {
					return {
						content: [{ type: "text" as const, text: "Error: 'query' is required for search operation" }],
					};
				}

				const results = registry.search(query);
				if (results.length === 0) {
					return {
						content: [{ type: "text" as const, text: `No tools found matching "${query}"` }],
						details: { operation, query, resultCount: 0 },
					};
				}

				const formatted = results.map(formatToolCompact).join("\n");
				return {
					content: [{
						type: "text" as const,
						text: `Found ${results.length} tool(s) matching "${query}":\n\n${formatted}`,
					}],
					details: { operation, query, resultCount: results.length, results: results.map((r) => r.name) },
				};
			}

			if (operation === "list") {
				if (category) {
					const tools = registry.getByCategory(category);
					if (tools.length === 0) {
						return {
							content: [{ type: "text" as const, text: `No tools in category "${category}". Use list without category to see available categories.` }],
							details: { operation, category, resultCount: 0 },
						};
					}

					const formatted = tools.map(formatToolCompact).join("\n");
					return {
						content: [{
							type: "text" as const,
							text: `**${category}** tools (${tools.length}):\n\n${formatted}`,
						}],
						details: { operation, category, resultCount: tools.length },
					};
				}

				// No category — show categories overview
				const categories = registry.getCategories().map((name) => ({
					name,
					count: registry.getByCategory(name).length,
				}));
				const totalTools = registry.size;
				const formatted = formatCategoryList(categories);
				return {
					content: [{
						type: "text" as const,
						text: `${formatted}\n\n**Total:** ${totalTools} tools across ${categories.length} categories`,
					}],
					details: { operation, categories: categories.map((c) => c.name), totalTools },
				};
			}

			if (operation === "inspect") {
				if (!tool_name) {
					return {
						content: [{ type: "text" as const, text: "Error: 'tool_name' is required for inspect operation" }],
					};
				}

				const entry = registry.getByName(tool_name);
				if (!entry) {
					// Try fuzzy search as fallback
					const similar = registry.search(tool_name).slice(0, 5);
					const suggestion = similar.length > 0
						? `\n\nDid you mean: ${similar.map((s) => s.name).join(", ")}?`
						: "";
					return {
						content: [{ type: "text" as const, text: `Tool "${tool_name}" not found.${suggestion}` }],
						details: { operation, tool_name, found: false },
					};
				}

				return {
					content: [{ type: "text" as const, text: formatToolDetailed(entry) }],
					details: { operation, tool_name, found: true, category: entry.category },
				};
			}

			return {
				content: [{ type: "text" as const, text: `Unknown operation: ${operation}. Use 'search', 'list', or 'inspect'.` }],
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("tool_search "));
			text += theme.fg("accent", args.operation || "");
			if (args.query) text += theme.fg("dim", ` "${args.query}"`);
			if (args.category) text += theme.fg("dim", ` category:${args.category}`);
			if (args.tool_name) text += theme.fg("dim", ` ${args.tool_name}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.operation === "search" || details.operation === "list") {
				const count = details.resultCount ?? details.totalTools ?? 0;
				let summary = theme.fg("success", `${count} result(s)`);
				if (details.query) summary += theme.fg("dim", ` for "${details.query}"`);
				if (details.category) summary += theme.fg("dim", ` in ${details.category}`);

				if (expanded) {
					const text = result.content[0];
					const body = text?.type === "text" ? text.text : "";
					return new Text(summary + "\n" + theme.fg("muted", body), 0, 0);
				}
				return new Text(summary, 0, 0);
			}

			if (details.operation === "inspect") {
				if (details.found) {
					const label = theme.fg("success", `✓ ${details.tool_name}`);
					const cat = theme.fg("dim", ` [${details.category}]`);
					if (expanded) {
						const text = result.content[0];
						const body = text?.type === "text" ? text.text : "";
						return new Text(label + cat + "\n" + theme.fg("muted", body), 0, 0);
					}
					return new Text(label + cat, 0, 0);
				}
				return new Text(theme.fg("error", `✗ Tool not found: ${details.tool_name}`), 0, 0);
			}

			return new Text(theme.fg("dim", "tool_search completed"), 0, 0);
		},
	});

	// Register /tool-search command as a shortcut
	pi.registerCommand("tool-search", {
		description: "Search for available tools by query",
		handler: async (args, ctx) => {
			const query = (args ?? "").trim();
			if (!query) {
				// Show all categories
				const categories = registry.getCategories().map((name) => ({
					name,
					count: registry.getByCategory(name).length,
				}));
				const formatted = formatCategoryList(categories);
				ctx.ui.notify(`${formatted}\n\nTotal: ${registry.size} tools`, "info");
			} else {
				const results = registry.search(query);
				if (results.length === 0) {
					ctx.ui.notify(`No tools found matching "${query}"`, "warning");
				} else {
					const formatted = results.slice(0, 10).map(formatToolCompact).join("\n");
					ctx.ui.notify(`Found ${results.length} tool(s):\n${formatted}`, "info");
				}
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
