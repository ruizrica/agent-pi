// ABOUTME: Shared session statistics type and helpers for cross-extension consumption.
// ABOUTME: Published to globalThis.__piSessionStats by summary-mode.ts; read by footer, tasks, widgets.

/**
 * Session Stats — Shared activity tracking across extensions
 *
 * summary-mode.ts owns the data and publishes snapshots to globalThis.
 * Other extensions (footer.ts, tasks.ts, mission-complete widget) read
 * the snapshot without direct dependency on summary-mode.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface SessionStats {
	/** Epoch ms when the session started */
	startedAt: number;
	/** Tool name → call count */
	toolCounts: Record<string, number>;
	/** Total tool invocations across all tools */
	totalToolCalls: number;
	/** Most recently modified file names (basename only) */
	recentFiles: string[];
	/** Recently active agent names */
	recentAgents: string[];
	/** Current agent status: Idle, Running, Working, Using tools, Ready */
	status: string;
	/** Last updated timestamp (epoch ms) */
	updatedAt: number;
}

// ── Defaults ─────────────────────────────────────────────────────────

export function emptySessionStats(): SessionStats {
	return {
		startedAt: Date.now(),
		toolCounts: {},
		totalToolCalls: 0,
		recentFiles: [],
		recentAgents: [],
		status: "Idle",
		updatedAt: Date.now(),
	};
}

// ── Publish / Read ───────────────────────────────────────────────────

const GLOBAL_KEY = "__piSessionStats";

/** Publish a stats snapshot to globalThis (called by summary-mode.ts) */
export function publishSessionStats(stats: SessionStats): void {
	(globalThis as any)[GLOBAL_KEY] = stats;
}

/** Read the current stats snapshot (returns undefined if summary-mode not loaded) */
export function getSessionStats(): SessionStats | undefined {
	return (globalThis as any)[GLOBAL_KEY] as SessionStats | undefined;
}

// ── Formatters ───────────────────────────────────────────────────────

/** Format elapsed ms into compact "Xm Ys" or "Ys" */
export function formatElapsed(elapsedMs: number): string {
	const total = Math.max(0, Math.round(elapsedMs / 1000));
	const hrs = Math.floor(total / 3600);
	const mins = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	if (hrs > 0) return `${hrs}h ${mins}m`;
	if (mins > 0) return `${mins}m ${secs}s`;
	return `${secs}s`;
}

/** Get the top N tools by usage count */
export function topTools(stats: SessionStats, n = 3): Array<{ name: string; count: number }> {
	return Object.entries(stats.toolCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([name, count]) => ({ name, count }));
}

/** Get the session elapsed time in ms */
export function sessionElapsedMs(stats: SessionStats): number {
	return Date.now() - stats.startedAt;
}
