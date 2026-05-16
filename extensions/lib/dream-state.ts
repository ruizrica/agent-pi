// ABOUTME: Global-first state helpers for Pi's /dream memory consolidation system.
// ABOUTME: Stores dream state under the user's home directory so dream history is system-wide.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface DreamSummary {
	workspacesScanned: number;
	sourcesConsolidated: number;
	durableMemoriesPromoted: number;
	supersededItems: number;
	recommendationsGenerated: number;
}

export interface DreamState {
	lastDream: string | null;
	intervalHours: number;
	enabled: boolean;
	globalRoot: string;
	lastScope: "global" | "workspace";
	lastSummary?: DreamSummary;
}

export const DEFAULT_DREAM_STATE: DreamState = {
	lastDream: null,
	intervalHours: 24,
	enabled: true,
	globalRoot: path.join(os.homedir(), ".pi", "dream"),
	lastScope: "global",
};

export function getDreamRoot(): string {
	return path.join(os.homedir(), ".pi", "dream");
}

export function getDreamStatePath(): string {
	return path.join(getDreamRoot(), "dream-state.json");
}

export function ensureDreamRoot(): string {
	const root = getDreamRoot();
	if (!fs.existsSync(root)) {
		fs.mkdirSync(root, { recursive: true });
	}
	return root;
}

export function readDreamState(): DreamState {
	const statePath = getDreamStatePath();
	try {
		if (fs.existsSync(statePath)) {
			const content = fs.readFileSync(statePath, "utf-8");
			return { ...DEFAULT_DREAM_STATE, ...JSON.parse(content) };
		}
	} catch {
		// ignore malformed state and fall back to default
	}
	return { ...DEFAULT_DREAM_STATE };
}

export function writeDreamState(state: DreamState): void {
	ensureDreamRoot();
	fs.writeFileSync(getDreamStatePath(), JSON.stringify(state, null, 2));
}

export function getHoursSinceLastDream(state: DreamState): number | null {
	if (!state.lastDream) return null;
	const lastDreamDate = new Date(state.lastDream);
	const now = new Date();
	return (now.getTime() - lastDreamDate.getTime()) / (1000 * 60 * 60);
}

export function formatTimeSince(hours: number): string {
	if (hours < 1) {
		const minutes = Math.round(hours * 60);
		return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	}
	if (hours < 24) {
		const rounded = Math.round(hours);
		return `${rounded} hour${rounded === 1 ? "" : "s"}`;
	}
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? "" : "s"}`;
}

export function formatNextDream(state: DreamState): string {
	if (!state.lastDream) return "No previous dream recorded";
	const hoursSince = getHoursSinceLastDream(state);
	if (hoursSince === null) return "Unknown";
	const hoursUntilNext = state.intervalHours - hoursSince;
	if (hoursUntilNext <= 0) return "Now (overdue)";
	return `In ${formatTimeSince(hoursUntilNext)}`;
}
