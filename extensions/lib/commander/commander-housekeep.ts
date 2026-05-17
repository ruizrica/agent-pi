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
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed?.event === "housekeep_doctor") {
				continue;
			}
		} catch {}
		const categoryMatch = line.match(CATEGORY_RE);
		if (categoryMatch && !trimmed.startsWith("→")) {
			currentCategory = categoryMatch[1].trim();
			continue;
		}
		if (trimmed.startsWith("→")) continue;
		if (/finding/i.test(trimmed)) continue;
		const id = trimmed.match(TASK_ID_RE)?.[1]?.replace(/^#/, "");
		findings.push({ category: currentCategory, line: trimmed, taskId: id });
	}
	return { total: findings.length, findings, raw };
}
