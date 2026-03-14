// ABOUTME: Config types, persistence, and hook assignment management for the Sounds extension.
// ABOUTME: Manages which sounds are assigned to which Pi lifecycle hooks, plus volume/enabled state.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Hook Types ───────────────────────────────────────────────────────

export type HookName =
	| "agent_end"
	| "agent_start"
	| "tool_execution_start"
	| "tool_execution_end"
	| "turn_start"
	| "turn_end"
	| "session_start"
	| "session_compact";

export const ALL_HOOKS: HookName[] = [
	"agent_end",
	"agent_start",
	"tool_execution_start",
	"tool_execution_end",
	"turn_start",
	"turn_end",
	"session_start",
	"session_compact",
];

export const HOOK_DISPLAY_NAMES: Record<HookName, string> = {
	agent_end: "Task Complete",
	agent_start: "Agent Starting",
	tool_execution_start: "Tool Called",
	tool_execution_end: "Tool Finished",
	turn_start: "Turn Start",
	turn_end: "Turn End",
	session_start: "Session Boot",
	session_compact: "Context Compacted",
};

export const HOOK_DESCRIPTIONS: Record<HookName, string> = {
	agent_end: "Plays when the agent finishes and is ready for input",
	agent_start: "Plays when the agent starts processing your message",
	tool_execution_start: "Plays each time a tool begins executing",
	tool_execution_end: "Plays each time a tool finishes executing",
	turn_start: "Plays at the start of each LLM turn",
	turn_end: "Plays at the end of each LLM turn",
	session_start: "Plays when a new session starts",
	session_compact: "Plays when context is compacted",
};

// ── Config Types ─────────────────────────────────────────────────────

export interface SoundsConfig {
	/** Map of hook name → assigned sound name */
	assignments: Partial<Record<HookName, string>>;
	/** Global volume 0.0–1.0 */
	volume: number;
	/** Global enable/disable toggle */
	enabled: boolean;
}

// ── Paths ────────────────────────────────────────────────────────────

const EXT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const CONFIG_PATH = join(EXT_DIR, "sounds-config.json");
export const SOUNDS_DIR = join(EXT_DIR, "sounds");

// ── Defaults ─────────────────────────────────────────────────────────

function defaultConfig(): SoundsConfig {
	return {
		assignments: {},
		volume: 0.5,
		enabled: true,
	};
}

// ── Persistence ──────────────────────────────────────────────────────

export function loadConfig(): SoundsConfig {
	try {
		if (existsSync(CONFIG_PATH)) {
			const raw = readFileSync(CONFIG_PATH, "utf-8");
			const parsed = JSON.parse(raw);
			return {
				assignments: parsed.assignments || {},
				volume: typeof parsed.volume === "number" ? parsed.volume : 0.5,
				enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
			};
		}
	} catch {
		// Corrupt config — return defaults
	}
	return defaultConfig();
}

export function saveConfig(config: SoundsConfig): void {
	try {
		writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
	} catch {
		// Non-critical — config persistence is best-effort
	}
}

// ── Assignment Helpers ───────────────────────────────────────────────

export function getAssignment(config: SoundsConfig, hook: HookName): string | undefined {
	return config.assignments[hook];
}

export function setAssignment(config: SoundsConfig, hook: HookName, soundName: string): SoundsConfig {
	return {
		...config,
		assignments: { ...config.assignments, [hook]: soundName },
	};
}

export function clearAssignment(config: SoundsConfig, hook: HookName): SoundsConfig {
	const { [hook]: _, ...rest } = config.assignments;
	return {
		...config,
		assignments: rest as Partial<Record<HookName, string>>,
	};
}

export function getActiveAssignmentCount(config: SoundsConfig): number {
	return Object.keys(config.assignments).length;
}

/** Get all sound names currently assigned to any hook */
export function getAssignedSoundNames(config: SoundsConfig): string[] {
	return [...new Set(Object.values(config.assignments).filter(Boolean) as string[])];
}

// ── Sounds Directory ─────────────────────────────────────────────────

export function ensureSoundsDir(): void {
	if (!existsSync(SOUNDS_DIR)) {
		mkdirSync(SOUNDS_DIR, { recursive: true });
	}
}
