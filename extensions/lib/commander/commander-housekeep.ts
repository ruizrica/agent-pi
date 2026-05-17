// ABOUTME: Thin wrappers and parsers for cmd housekeep lifecycle maintenance.
// ABOUTME: Lets Pi surface cmd's canonical orphan/stale task findings without duplicating board state.

export interface HousekeepFinding {
	category: string;
	line: string;
	taskId?: string;
}

export interface HousekeepDoctorResult {
	total: number;
	findings: HousekeepFinding[];
	raw: string;
}

const CATEGORY_RE = /^\s{2}([^\n(]+?)(?:\s*\((\d+)\))?\s*$/;
const TASK_ID_RE = /\b(agent-[\w-]+|[a-z]+-[\w-]+|#?\d+)\b/;

export function parseHousekeepDoctorOutput(raw: string): HousekeepDoctorResult {
	const findings: HousekeepFinding[] = [];
	let currentCategory = "general";
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		// cmd prints a truecolor banner before doctor output even with --no-color; those
		// lines must never become findings or category labels (they corrupt Pi's TUI).
		if (/\x1b\[/u.test(line)) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed !== null && typeof parsed === "object") {
				continue;
			}
		} catch {
			/* not JSONL telemetry */
		}
		const categoryMatch = line.match(CATEGORY_RE);
		if (categoryMatch && !trimmed.startsWith("→")) {
			const nextCat = categoryMatch[1].trim();
			if (nextCat.length > 0 && nextCat.length < 120 && !/\x1b/u.test(nextCat)) {
				currentCategory = nextCat;
				continue;
			}
		}
		if (trimmed.startsWith("→")) continue;
		if (/finding/i.test(trimmed)) continue;
		const id = trimmed.match(TASK_ID_RE)?.[1]?.replace(/^#/, "");
		findings.push({ category: currentCategory, line: trimmed, taskId: id });
	}
	return { total: findings.length, findings, raw };
}
