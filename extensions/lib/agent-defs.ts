// ABOUTME: Shared agent definition loader — scans .md files and parses frontmatter.
// ABOUTME: Loads model/provider assignments from .pi/agents/models.json config.

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { isClaudeCliAgent } from "./claude/claude-config.ts";
import { isToolkitCliAgent, normalizeToolkitAgentName, TOOLKIT_WORKER_MODEL } from "./toolkit-cli.ts";

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	model: string; // resolved execution model, may be overridden for toolkit CLI agents
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
function loadModelsConfigFromPaths(paths: string[]): AgentModelsConfig {
	for (const p of paths) {
		if (existsSync(p)) {
			try {
				const raw = readFileSync(p, "utf-8");
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object" && parsed.default && parsed.agents) {
					return parsed as AgentModelsConfig;
				}
			} catch {}
		}
	}
	return { default: HARDCODED_DEFAULT, agents: {} };
}

export function loadAgentModelsConfig(cwd: string, extProjectDir?: string): AgentModelsConfig {
	return loadModelsConfigFromPaths([
		join(cwd, ".pi", "agents", "models.json"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents", "models.json"), join(extProjectDir, "agents", "models.json")] : []),
	]);
}

export function loadToolkitModelsConfig(cwd: string, extProjectDir?: string): AgentModelsConfig {
	return loadModelsConfigFromPaths([
		join(cwd, ".pi", "agents", "toolkit-models.json"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents", "toolkit-models.json"), join(extProjectDir, "agents", "toolkit-models.json")] : []),
	]);
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
	if (isClaudeCliAgent(agentName)) {
		if (entry) return buildModelString(entry);
		return buildModelString(config.default);
	}
	if (isToolkitCliAgent(agentName)) return TOOLKIT_WORKER_MODEL;
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

		// Model resolution: Claude profiles use configured model, generic toolkit CLIs use
		// the shared worker model, then models.json/frontmatter fallback for everyone else.
		let model = "";
		if (isClaudeCliAgent(frontmatter.name) && modelsConfig) {
			const key = frontmatter.name.toLowerCase();
			const entry = modelsConfig.agents[key];
			if (entry) model = buildModelString(entry);
		} else if (isToolkitCliAgent(frontmatter.name)) {
			model = TOOLKIT_WORKER_MODEL;
		} else if (modelsConfig) {
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
function scanAgentDirsInternal(
	dirs: string[],
	modelsConfig?: AgentModelsConfig,
): Map<string, AgentDef> {
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

export function scanAgentDefs(
	cwd: string,
	extProjectDir?: string,
	modelsConfig?: AgentModelsConfig,
): Map<string, AgentDef> {
	return scanAgentDirsInternal([
		join(cwd, "agents"),
		join(cwd, ".claude", "agents"),
		join(cwd, ".pi", "agents"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents"), join(extProjectDir, "agents")] : []),
	], modelsConfig);
}

export function scanToolkitAgentDefs(
	cwd: string,
	extProjectDir?: string,
	modelsConfig?: AgentModelsConfig,
): Map<string, AgentDef> {
	return scanAgentDirsInternal([
		join(cwd, ".pi", "agents", "toolkit"),
		...(extProjectDir ? [join(extProjectDir, ".pi", "agents", "toolkit")] : []),
	], modelsConfig);
}

/**
 * Resolve an agent definition by name (case-insensitive).
 * Returns the AgentDef if found, undefined otherwise.
 *
 * When modelsConfig is provided, supports dynamic builder variant resolution:
 * if name matches `builder-*` and no .md file exists, generates a def from
 * the base `builder.md` with the model overridden from models.json.
 */
export function resolveAgentByName(
	name: string,
	agentDefs: Map<string, AgentDef>,
	modelsConfig?: AgentModelsConfig,
): AgentDef | undefined {
	const key = name.toLowerCase();
	const direct = agentDefs.get(key);
	if (direct) return direct;

	const normalizedToolkit = normalizeToolkitAgentName(name);
	if (normalizedToolkit && normalizedToolkit !== key) {
		const aliased = agentDefs.get(normalizedToolkit);
		if (aliased) return aliased;
	}

	// Dynamic builder variant resolution: builder-{model-slug} → base builder.md + model from models.json
	if (key.startsWith("builder-") && modelsConfig) {
		const base = agentDefs.get("builder");
		if (base) {
			const entry = modelsConfig.agents[key];
			if (entry) {
				return {
					...base,
					name: key,
					description: `${key} Builder — dynamic variant using ${buildModelString(entry)}`,
					model: buildModelString(entry),
				};
			}
		}
	}

	return undefined;
}
