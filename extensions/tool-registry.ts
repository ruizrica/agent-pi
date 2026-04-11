// ABOUTME: Tool Registry — in-memory index of all available tools with categorization and search.
// ABOUTME: Provides the foundation for tool_search and call_tool extensions.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── Types ────────────────────────────────────────

export interface ToolEntry {
	name: string;
	label: string;
	description: string;
	category: string;
	tags: string[];
	source: "builtin" | "extension" | "skill" | "commander";
	parameterSummary: string;
}

// ── Category Detection ───────────────────────────

const CATEGORY_RULES: { category: string; names: string[]; keywords: string[] }[] = [
	{
		category: "filesystem",
		names: ["read", "write", "edit", "ls", "find", "grep"],
		keywords: ["file", "directory", "path", "read", "write", "edit"],
	},
	{
		category: "shell",
		names: ["bash"],
		keywords: ["command", "terminal", "shell", "execute"],
	},
	{
		category: "commander",
		names: [],
		keywords: ["commander"],
	},
	{
		category: "testing",
		names: ["web_remote", "debug_capture"],
		keywords: ["test", "screenshot", "capture", "audit"],
	},
	{
		category: "ui",
		names: ["ask_user", "show_plan", "show_file", "show_report", "show_spec"],
		keywords: ["viewer", "interactive", "user", "display", "plan", "report"],
	},
	{
		category: "agents",
		names: ["dispatch_agent", "subagent_create", "subagent_create_batch", "subagent_continue", "subagent_remove", "subagent_list", "claude_advisor"],
		keywords: ["agent", "subagent", "dispatch", "spawn", "advisor", "claude"],
	},
	{
		category: "workflow",
		names: ["tasks", "set_mode", "advance_phase", "dispatch_agents", "pipeline_status", "run_chain", "cycle_memory"],
		keywords: ["task", "mode", "pipeline", "phase", "workflow", "chain"],
	},
];

function detectCategory(name: string, description: string): string {
	const lowerName = name.toLowerCase();
	const lowerDesc = description.toLowerCase();

	// Commander tools — name-based match
	if (lowerName.startsWith("commander_")) return "commander";

	for (const rule of CATEGORY_RULES) {
		if (rule.names.includes(lowerName)) return rule.category;
		for (const kw of rule.keywords) {
			if (lowerDesc.includes(kw) && !lowerName.startsWith("commander_")) {
				// Only match if not already caught by a name rule above
			}
		}
	}

	// Keyword-based fallback
	for (const rule of CATEGORY_RULES) {
		for (const kw of rule.keywords) {
			if (lowerDesc.includes(kw)) return rule.category;
		}
	}

	return "general";
}

// ── Tag Extraction ───────────────────────────────

const TAG_KEYWORDS = [
	"file", "read", "write", "edit", "delete", "create", "search", "find",
	"bash", "command", "shell", "terminal", "execute", "run",
	"task", "project", "workflow", "pipeline", "plan", "mode",
	"agent", "subagent", "dispatch", "spawn", "parallel",
	"test", "debug", "screenshot", "capture", "audit", "accessibility",
	"browser", "web", "url", "page", "navigate", "click",
	"image", "generate", "visual",
	"session", "terminal", "cleanup",
	"message", "mailbox", "send", "inbox",
	"dependency", "graph", "block",
	"spec", "requirement", "feature",
	"jira", "issue", "ticket",
	"orchestration", "hierarchy", "registry",
	"git", "commit", "branch",
	"viewer", "interactive", "ui", "display",
	"memory", "compact", "context",
];

function extractTags(name: string, description: string): string[] {
	const text = `${name} ${description}`.toLowerCase();
	const tags: string[] = [];

	for (const kw of TAG_KEYWORDS) {
		if (text.includes(kw) && !tags.includes(kw)) {
			tags.push(kw);
		}
	}

	return tags.slice(0, 10); // Cap at 10 tags
}

// ── Source Detection ─────────────────────────────

const BUILTIN_TOOLS = ["read", "write", "edit", "bash", "ls", "find", "grep"];

function detectSource(name: string): ToolEntry["source"] {
	if (BUILTIN_TOOLS.includes(name)) return "builtin";
	if (name.startsWith("commander_")) return "commander";
	return "extension";
}

// ── Parameter Summary ────────────────────────────

function summarizeParameters(description: string): string {
	// Extract parameter info from description — look for common patterns
	const lines = description.split("\n");
	const paramLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		// Match lines like: - "operation": description
		// or: requires field_name
		if (trimmed.match(/^-\s*"?\w+"?\s*[:—-]/)) {
			paramLines.push(trimmed.replace(/^-\s*/, "").trim());
		}
	}

	if (paramLines.length > 0) {
		return paramLines.slice(0, 5).join("; ");
	}

	// Fallback: first sentence of description
	const firstSentence = description.split(/[.\n]/)[0]?.trim() || "";
	return firstSentence.length > 100 ? firstSentence.slice(0, 100) + "..." : firstSentence;
}

// ── Registry Class ───────────────────────────────

export class ToolRegistry {
	private tools: Map<string, ToolEntry> = new Map();

	buildIndex(allTools: { name: string; description?: string }[]): void {
		this.tools.clear();

		for (const tool of allTools) {
			const desc = tool.description || "";
			const entry: ToolEntry = {
				name: tool.name,
				label: tool.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
				description: desc,
				category: detectCategory(tool.name, desc),
				tags: extractTags(tool.name, desc),
				source: detectSource(tool.name),
				parameterSummary: summarizeParameters(desc),
			};
			this.tools.set(tool.name, entry);
		}
	}

	getAll(): ToolEntry[] {
		return [...this.tools.values()];
	}

	getByName(name: string): ToolEntry | undefined {
		return this.tools.get(name);
	}

	getByCategory(category: string): ToolEntry[] {
		return this.getAll().filter((t) => t.category === category);
	}

	getCategories(): string[] {
		const cats = new Set<string>();
		for (const t of this.tools.values()) cats.add(t.category);
		return [...cats].sort();
	}

	search(query: string): ToolEntry[] {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (terms.length === 0) return this.getAll();

		const scored: { entry: ToolEntry; score: number }[] = [];

		for (const entry of this.tools.values()) {
			let score = 0;
			const searchText = `${entry.name} ${entry.label} ${entry.description} ${entry.tags.join(" ")} ${entry.category}`.toLowerCase();

			for (const term of terms) {
				// Exact name match — highest
				if (entry.name.toLowerCase() === term) score += 100;
				// Name contains term
				else if (entry.name.toLowerCase().includes(term)) score += 50;
				// Category match
				else if (entry.category.toLowerCase() === term) score += 40;
				// Tag match
				else if (entry.tags.includes(term)) score += 30;
				// Description contains term
				else if (entry.description.toLowerCase().includes(term)) score += 10;
				// Fuzzy: any field contains
				else if (searchText.includes(term)) score += 5;
			}

			if (score > 0) {
				scored.push({ entry, score });
			}
		}

		return scored
			.sort((a, b) => b.score - a.score)
			.map((s) => s.entry);
	}

	get size(): number {
		return this.tools.size;
	}
}

// ── Singleton & Extension ────────────────────────

// Shared registry instance accessible by other extensions via globalThis
const g = globalThis as any;

export function getToolRegistry(): ToolRegistry {
	if (!g.__piToolRegistry) {
		g.__piToolRegistry = new ToolRegistry();
	}
	return g.__piToolRegistry;
}

export default function (pi: ExtensionAPI) {
	const registry = getToolRegistry();

	pi.on("session_start", async (_event, _ctx) => {
		// Build index from all registered tools
		const allTools = pi.getAllTools();
		registry.buildIndex(allTools);
	});
}
