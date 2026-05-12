// ABOUTME: Centralized agent identity resolution for stable Commander registration and heartbeats.
// ABOUTME: Resolves agent name from env vars or generates from hostname/PID; caches the result.

import os from "node:os";

// Module-level cache for identity — ensures heartbeats and tasks.ts currentActor() always agree
let cached: { name: string; agentType: string; role: string } | null = null;

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
 * Test-only helper: reset the cached identity.
 * DO NOT call from production code.
 */
export function __resetIdentityCacheForTests(): void {
	cached = null;
}
