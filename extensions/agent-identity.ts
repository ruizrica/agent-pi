// ABOUTME: Centralized agent identity resolution for stable Commander registration and heartbeats.
// ABOUTME: Resolves agent name from env vars or generates from hostname/PID; caches the result.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import os from "node:os";

// Module-level cache for identity — ensures heartbeats and tasks.ts currentActor() always agree
let cached: { name: string; agentType: string; role: string } | null = null;

// Module-level cache for model — resolves once per process
let cachedModel: string | null = null;

// Module-level cache for runtime label — resolves once per process
let cachedRuntime: string | null = null;

/**
 * Short hostname without .local, .lan, .home suffixes.
 * Used in the fallback agent name.
 */
function shortHostname(): string {
	const h = os.hostname();
	// Strip domain suffixes and take first segment only (e.g., "ricardo-mbp.local" → "ricardo-mbp")
	return h.replace(/\.(local|lan|home)$/i, "").split(".")[0] || h;
}

/**
 * Resolve the stable agent name with this precedence:
 * 1. PI_AGENT_NAME environment variable (if set and non-empty)
 * 2. PI_SUBAGENT_NAME environment variable (if set, marks this as a subagent)
 * 3. Fallback: pi-{shortHostname}-{pid} (e.g., pi-ricardo-mbp-48213)
 *
 * The result is cached so all callers get the same name for the lifetime of the process.
 */
export function resolveAgentName(): string {
	if (cached) return cached.name;

	const env = process.env.PI_AGENT_NAME?.trim();
	const sub = process.env.PI_SUBAGENT_NAME?.trim();

	let name: string;
	if (env) {
		name = env;
	} else if (sub) {
		name = sub;
	} else {
		name = `pi-${shortHostname()}-${process.pid}`;
	}

	// Mark whether this is a subagent (PI_SUBAGENT_NAME set and PI_AGENT_NAME unset)
	const isSub = !!sub && !env;

	cached = {
		name,
		agentType: isSub ? "pi-subagent" : "pi-coordinator",
		role: isSub ? "worker" : "coordinator",
	};

	return cached.name;
}

/**
 * Resolve the agent type: either "pi-coordinator" or "pi-subagent".
 * Triggers cache resolution if not yet cached.
 */
export function resolveAgentType(): string {
	resolveAgentName();
	return cached!.agentType;
}

/**
 * Resolve the agent role: either "coordinator" or "worker".
 * Triggers cache resolution if not yet cached.
 */
export function resolveAgentRole(): string {
	resolveAgentName();
	return cached!.role;
}

/**
 * Resolve the model name with this precedence:
 * 1. PI_MODEL environment variable
 * 2. ANTHROPIC_MODEL environment variable
 * 3. CLAUDE_MODEL environment variable
 * 4. "unknown" fallback
 *
 * The result is cached so all callers get the same model for the lifetime of the process.
 */
export function resolveModelName(): string {
	if (cachedModel !== null) return cachedModel;

	const piModel = process.env.PI_MODEL?.trim();
	const anthropicModel = process.env.ANTHROPIC_MODEL?.trim();
	const claude = process.env.CLAUDE_MODEL?.trim();

	let model: string;
	if (piModel) {
		model = piModel;
	} else if (anthropicModel) {
		model = anthropicModel;
	} else if (claude) {
		model = claude;
	} else {
		model = "unknown";
	}

	cachedModel = model;
	return cachedModel;
}

/**
 * Resolve the runtime label.
 * Defaults to "pi" unless PI_RUNTIME_LABEL environment variable is set.
 * The result is cached so all callers get the same label for the lifetime of the process.
 */
export function resolveRuntimeLabel(): string {
	if (cachedRuntime !== null) return cachedRuntime;

	const label = process.env.PI_RUNTIME_LABEL?.trim() || "pi";
	cachedRuntime = label;
	return cachedRuntime;
}

/**
 * Insert cmd identity flags at position 2 (after subcommand + sub-subcommand).
 * Ensures every `cmd` invocation carries `--runtime <label> --model <model>` in the right place.
 * If args already include `--runtime`, they pass through unchanged (no double-injection).
 */
export function applyCmdIdentityFlags(args: string[]): string[] {
	if (args.includes("--runtime")) {
		return args;
	}
	const idx = Math.min(2, args.length);
	return [
		...args.slice(0, idx),
		"--runtime", resolveRuntimeLabel(),
		"--model",   resolveModelName(),
		...args.slice(idx),
	];
}

/**
 * Test-only helper: reset the cached identity and model/runtime labels.
 * DO NOT call from production code.
 */
export function __resetIdentityCacheForTests(): void {
	cached = null;
	cachedModel = null;
	cachedRuntime = null;
}

// Pi auto-discovers every top-level .ts file in extensions/ and requires each to
// default-export a factory (pi: ExtensionAPI) => void. This module is a utility,
// not an extension — the default export is a no-op so the loader accepts it.
export default function (_pi: ExtensionAPI): void {}
