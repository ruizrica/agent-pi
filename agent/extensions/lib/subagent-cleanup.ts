// ABOUTME: Cleans up old subagent session files from the sessions directory
// Called on session_start to prevent unbounded disk usage

import { readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

/**
 * Remove session files older than `maxDays` from `dir`.
 * Silently ignores missing directories or stat/unlink errors.
 */
export function cleanOldSessionFiles(dir: string, maxDays: number): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}

	const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;

	for (const name of entries) {
		try {
			const filePath = join(dir, name);
			const st = statSync(filePath);
			if (st.mtimeMs < cutoff) {
				unlinkSync(filePath);
			}
		} catch {
			// skip files that can't be stat'd or unlinked
		}
	}
}
