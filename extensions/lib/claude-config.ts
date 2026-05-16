// ABOUTME: Shared config and profile detection for Claude Code CLI integrations.
// ABOUTME: Used by worker/advisor runtimes to resolve models, tool posture, and session behavior.

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type ClaudeProfileName = "claude-worker" | "claude-advisor";

export interface ClaudeProfileConfig {
	model?: string;
	permissionMode?: "acceptEdits" | "auto" | "bypassPermissions" | "default" | "dontAsk" | "plan";
	allowedTools?: string[];
	dangerouslySkipPermissions?: boolean;
	noSessionPersistence?: boolean;
	includePartialMessages?: boolean;
	verbose?: boolean;
	timeoutMs?: number;
	maxBudgetUsd?: number;
}

export interface ClaudeConfigFile {
	profiles?: Partial<Record<ClaudeProfileName, Partial<ClaudeProfileConfig>>>;
}

const CLAUDE_PROFILE_NAMES = new Set<ClaudeProfileName>([
	"claude-worker",
	"claude-advisor",
]);

const DEFAULT_PROFILE_CONFIG: Record<ClaudeProfileName, ClaudeProfileConfig> = {
	"claude-worker": {
		permissionMode: "bypassPermissions",
		dangerouslySkipPermissions: true,
		noSessionPersistence: true,
		includePartialMessages: true,
		verbose: true,
		timeoutMs: 30 * 60 * 1000,
	},
	"claude-advisor": {
		permissionMode: "plan",
		dangerouslySkipPermissions: true,
		noSessionPersistence: true,
		includePartialMessages: true,
		verbose: true,
		timeoutMs: 15 * 60 * 1000,
	},
};

export function isClaudeCliAgent(name: string | undefined | null): name is ClaudeProfileName {
	if (!name) return false;
	return CLAUDE_PROFILE_NAMES.has(name.toLowerCase() as ClaudeProfileName);
}

export function toClaudeProfileName(name: string): ClaudeProfileName {
	return name.toLowerCase() === "claude-advisor" ? "claude-advisor" : "claude-worker";
}

function getConfigPaths(): string[] {
	const home = homedir();
	return [
		join(home, ".pi", "claude.json"),
		join(home, ".pi", "claude-worker.json"),
	];
}

export function loadClaudeConfig(): ClaudeConfigFile {
	for (const path of getConfigPaths()) {
		if (!existsSync(path)) continue;
		try {
			const raw = readFileSync(path, "utf-8");
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				return parsed as ClaudeConfigFile;
			}
		} catch {}
	}
	return {};
}

export function resolveClaudeProfileConfig(
	profile: ClaudeProfileName,
	overrides?: Partial<ClaudeProfileConfig>,
): ClaudeProfileConfig {
	const fileConfig = loadClaudeConfig();
	return {
		...DEFAULT_PROFILE_CONFIG[profile],
		...(fileConfig.profiles?.[profile] || {}),
		...(overrides || {}),
	};
}
