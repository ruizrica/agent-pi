// ABOUTME: Research session persistence for autoresearch lifecycle tracking.
// ABOUTME: Saves/loads research sessions as JSON files with SQLite index for searchable browsing.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Types ────────────────────────────────────────────────────────────

export type ResearchStatus = "understanding" | "planning" | "researching" | "implementing" | "complete" | "paused";

export interface ResearchMetric {
	name: string;
	direction: "higher" | "lower";
	verifyCommand: string;
	baseline?: number;
	final?: number;
	target?: number;
}

export interface ResearchScope {
	inScope: string[];
	readOnly: string[];
	outOfScope: string[];
}

export interface ResearchIteration {
	iteration: number;
	commit: string;
	metric: number;
	delta: number;
	status: string;        // "keep" | "discard" | "crash" | "baseline"
	description: string;
}

export interface ResearchNextStep {
	priority: number;
	description: string;
	status: "pending" | "implementing" | "done" | "skipped";
}

export interface ResearchImplementation {
	startedAt?: string;
	completedAt?: string;
	teamUsed?: string;
	tasksCreated?: number;
	summary?: string;
}

export interface ResearchSession {
	id: string;
	status: ResearchStatus;
	goal: string;
	metric: ResearchMetric;
	scope: ResearchScope;
	plan: string;
	clarifyingQA: Array<{ question: string; answer: string }>;
	iterations: ResearchIteration[];
	findings: string;
	nextSteps: ResearchNextStep[];
	implementation: ResearchImplementation;
	createdAt: string;
	updatedAt: string;
	workingDirectory: string;
	tags: string[];
}

// ── Compact summary for list views ──────────────────────────────────

export interface ResearchSessionSummary {
	id: string;
	status: ResearchStatus;
	goal: string;
	metricName: string;
	metricDirection: "higher" | "lower";
	baseline?: number;
	final?: number;
	iterationCount: number;
	keepCount: number;
	discardCount: number;
	crashCount: number;
	nextStepCount: number;
	nextStepsDone: number;
	createdAt: string;
	updatedAt: string;
	tags: string[];
}

// ── Constants ────────────────────────────────────────────────────────

const SESSIONS_DIR = resolve(".context", "research-sessions");
const INDEX_PATH = join(SESSIONS_DIR, "index.json");

// ── Helpers ──────────────────────────────────────────────────────────

function ensureDir(): void {
	if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

function nowIso(): string {
	return new Date().toISOString();
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "research";
}

function sessionFilePath(id: string): string {
	return join(SESSIONS_DIR, `${id}.json`);
}

// ── Default session factory ─────────────────────────────────────────

export function createResearchSession(goal: string, workingDirectory?: string): ResearchSession {
	const ts = nowIso();
	const id = `${ts.replace(/[:.]/g, "-")}-${slugify(goal)}`;
	return {
		id,
		status: "understanding",
		goal,
		metric: { name: "", direction: "higher", verifyCommand: "" },
		scope: { inScope: [], readOnly: [], outOfScope: [] },
		plan: "",
		clarifyingQA: [],
		iterations: [],
		findings: "",
		nextSteps: [],
		implementation: {},
		createdAt: ts,
		updatedAt: ts,
		workingDirectory: workingDirectory || process.cwd(),
		tags: [],
	};
}

// ── CRUD Operations ─────────────────────────────────────────────────

export function saveResearchSession(session: ResearchSession): void {
	ensureDir();
	session.updatedAt = nowIso();
	writeFileSync(sessionFilePath(session.id), JSON.stringify(session, null, 2), "utf-8");
	updateIndex(session);
}

export function loadResearchSession(id: string): ResearchSession | null {
	const path = sessionFilePath(id);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as ResearchSession;
	} catch {
		return null;
	}
}

export function updateResearchSession(id: string, partial: Partial<ResearchSession>): ResearchSession | null {
	const session = loadResearchSession(id);
	if (!session) return null;
	Object.assign(session, partial);
	saveResearchSession(session);
	return session;
}

export function listResearchSessions(): ResearchSessionSummary[] {
	ensureDir();
	const index = loadIndex();
	return index.sessions;
}

export function listResearchSessionsFull(): ResearchSession[] {
	ensureDir();
	const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json") && f !== "index.json");
	const sessions: ResearchSession[] = [];
	for (const file of files) {
		try {
			const data = JSON.parse(readFileSync(join(SESSIONS_DIR, file), "utf-8")) as ResearchSession;
			sessions.push(data);
		} catch { /* skip corrupted files */ }
	}
	sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return sessions;
}

// ── Summary extraction ──────────────────────────────────────────────

function sessionToSummary(session: ResearchSession): ResearchSessionSummary {
	const keeps = session.iterations.filter(i => i.status === "keep").length;
	const discards = session.iterations.filter(i => i.status === "discard").length;
	const crashes = session.iterations.filter(i => i.status === "crash").length;
	const nextStepsDone = session.nextSteps.filter(s => s.status === "done").length;

	return {
		id: session.id,
		status: session.status,
		goal: session.goal,
		metricName: session.metric.name,
		metricDirection: session.metric.direction,
		baseline: session.metric.baseline,
		final: session.metric.final,
		iterationCount: session.iterations.length,
		keepCount: keeps,
		discardCount: discards,
		crashCount: crashes,
		nextStepCount: session.nextSteps.length,
		nextStepsDone,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
		tags: session.tags,
	};
}

// ── JSON Index (lightweight, no SQLite dependency) ──────────────────

interface SessionIndex {
	version: 1;
	updatedAt: string;
	sessions: ResearchSessionSummary[];
}

function loadIndex(): SessionIndex {
	if (!existsSync(INDEX_PATH)) {
		return { version: 1, updatedAt: nowIso(), sessions: [] };
	}
	try {
		return JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as SessionIndex;
	} catch {
		return { version: 1, updatedAt: nowIso(), sessions: [] };
	}
}

function writeIndex(index: SessionIndex): void {
	ensureDir();
	index.updatedAt = nowIso();
	writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}

function updateIndex(session: ResearchSession): void {
	const index = loadIndex();
	const summary = sessionToSummary(session);
	const idx = index.sessions.findIndex(s => s.id === session.id);
	if (idx >= 0) {
		index.sessions[idx] = summary;
	} else {
		index.sessions.unshift(summary);
	}
	// Keep sorted by updatedAt descending
	index.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	writeIndex(index);
}

// ── Search helper ───────────────────────────────────────────────────

export function searchResearchSessions(query: string): ResearchSessionSummary[] {
	const all = listResearchSessions();
	if (!query.trim()) return all;
	const terms = query.toLowerCase().split(/\s+/);
	return all.filter(s => {
		const text = [s.goal, s.metricName, s.status, ...s.tags].join(" ").toLowerCase();
		return terms.every(t => text.includes(t));
	});
}

// ── Status helpers ──────────────────────────────────────────────────

export function getStatusColor(status: ResearchStatus): string {
	switch (status) {
		case "understanding": return "#a78bfa";  // purple
		case "planning": return "#60a5fa";        // blue
		case "researching": return "#2980b9";     // deep blue
		case "implementing": return "#f0b429";    // yellow
		case "complete": return "#48d889";         // green
		case "paused": return "#8892a0";           // gray
		default: return "#8892a0";
	}
}

export function getStatusLabel(status: ResearchStatus): string {
	switch (status) {
		case "understanding": return "Understanding";
		case "planning": return "Planning";
		case "researching": return "Researching";
		case "implementing": return "Implementing";
		case "complete": return "Complete";
		case "paused": return "Paused";
		default: return status;
	}
}
