// ABOUTME: Shared agent definition loader — scans .md files and parses frontmatter.
// ABOUTME: Loads model/provider assignments from .pi/agents/models.json config.

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	model: string; // full "provider/model" string, empty = use default
	systemPrompt: string;
	file: string;
}

// ── Model Config Types ───────────────────────────────────────────────────────

export interface AgentModelEntry {
	provider: string;
	model: string;
}

export interface AgentModelsConfig {
	default: AgentModelEntry;
	agents: Record<string, AgentModelEntry>;
}

// ── Model Config Loader ──────────────────────────────────────────────────────

const HARDCODED_DEFAULT: AgentModelEntry = {
	provider: "anthropic",
	model: "claude-haiku-4-5-20251001",
};

/**
 * Load agent model/provider config from .pi/agents/models.json.
 * Searches cwd first, then extProjectDir.
 * Returns the parsed config, or a minimal default if not found.
 */
export function loadAgentModelsConfig(cwd: string, extProjectDir?: string): AgentModelsConfig {
	const paths = [
		join(cwd, ".pi", "agents", "models.json"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents", "models.json")] : []),
	];

	for (const p of paths) {
		if (existsSync(p)) {
			try {
				const raw = readFileSync(p, "utf-8");
				const parsed = JSON.parse(raw);
				// Validate minimal structure
				if (parsed && typeof parsed === "object" && parsed.default && parsed.agents) {
					return parsed as AgentModelsConfig;
				}
			} catch {}
		}
	}

	// Fallback: no config file found
	return { default: HARDCODED_DEFAULT, agents: {} };
}

/**
 * Build a "provider/model" string from an AgentModelEntry.
 * If provider is empty, returns just the model ID.
 */
export function buildModelString(entry: AgentModelEntry): string {
	if (!entry.provider) return entry.model;
	return `${entry.provider}/${entry.model}`;
}

/**
 * Resolve the full model string for a given agent name.
 * Priority: 1) models.json agent entry, 2) models.json default.
 */
export function resolveAgentModelString(
	agentName: string,
	config: AgentModelsConfig,
): string {
	const key = agentName.toLowerCase();
	const entry = config.agents[key];
	if (entry) return buildModelString(entry);
	return buildModelString(config.default);
}

// ── Agent .md File Parsing ───────────────────────────────────────────────────

/**
 * Parse a single agent .md file with YAML frontmatter + system prompt body.
 * Model is NOT read from frontmatter — it comes from models.json instead.
 */
export function parseAgentFile(filePath: string, modelsConfig?: AgentModelsConfig): AgentDef | null {
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
				model = buildModelString(entry);
			}
		}
		// Fallback: if models.json didn't have this agent, check frontmatter
		// (backward compat for agents that still have model: in frontmatter)
		if (!model && frontmatter.model) {
			model = frontmatter.model;
		}

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			model,
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

/**
 * Scan standard agent directories and return a Map<lowercaseName, AgentDef>.
 * Searches: agents/, .claude/agents/, .pi/agents/ in cwd and optionally extProjectDir.
 * Recurses into subdirectories.
 */
export function scanAgentDefs(
	cwd: string,
	extProjectDir?: string,
	modelsConfig?: AgentModelsConfig,
): Map<string, AgentDef> {
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

/**
 * Resolve an agent definition by name (case-insensitive).
 * Returns the AgentDef if found, undefined otherwise.
 */
export function resolveAgentByName(
	name: string,
	agentDefs: Map<string, AgentDef>,
): AgentDef | undefined {
	const key = name.toLowerCase();
	return agentDefs.get(key);
}
