// ABOUTME: SQLite-backed storage for security scan history with trend tracking.
// ABOUTME: Persists full scan snapshots so the report viewer can show historical trends, deltas, and pagination.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SecurityReportData, SecurityReportFinding } from "./security-report-html.ts";

let DatabaseSync: any = null;
let sqliteAvailable: boolean | null = null;

function initSqlite(): boolean {
	if (sqliteAvailable !== null) return sqliteAvailable;
	try {
		DatabaseSync = require("node:sqlite").DatabaseSync;
		sqliteAvailable = true;
	} catch {
		sqliteAvailable = false;
	}
	return sqliteAvailable;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface SeverityCounts {
	critical: number;
	high: number;
	medium: number;
	low: number;
	info: number;
}

export interface ScanSnapshot {
	id: string;
	title: string;
	summary: string;
	scope: string;
	createdAt: string;
	findings: SecurityReportFinding[];
	mitigations: string[];
	severityCounts: SeverityCounts;
	totalFindings: number;
}

export interface TrendPoint {
	createdAt: string;
	totalFindings: number;
	severityCounts: SeverityCounts;
}

export interface ScanDelta {
	newFindings: SecurityReportFinding[];
	resolvedFindings: SecurityReportFinding[];
	unchangedCount: number;
	previousScanAt: string;
}

export interface HistoryData {
	snapshots: ScanSnapshot[];
	trend: TrendPoint[];
	delta: ScanDelta | null;
}

// ── Configuration ──────────────────────────────────────────────────────

const HISTORY_DIR = resolve(".context", "reports");
const DB_PATH = join(HISTORY_DIR, "security-history.db");
const JSON_PATH = join(HISTORY_DIR, "security-history.json");
const RETENTION_DAYS = 90;
const MAX_SCANS = 500;

let db: any = null;
let initialized = false;

// ── Database ───────────────────────────────────────────────────────────

function ensureDir(): void {
	if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
}

function nowIso(): string {
	return new Date().toISOString();
}

function createDatabase(): any {
	ensureDir();
	const database = new DatabaseSync(DB_PATH);
	database.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS security_scans (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			summary TEXT NOT NULL,
			scope TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			findings_json TEXT NOT NULL DEFAULT '[]',
			mitigations_json TEXT NOT NULL DEFAULT '[]',
			severity_counts_json TEXT NOT NULL DEFAULT '{}',
			total_findings INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_security_scans_created
			ON security_scans(created_at DESC);
	`);
	return database;
}

function getDb(): any | null {
	if (!initSqlite()) return null;
	if (!db) db = createDatabase();
	if (!initialized) {
		pruneOldScans();
		initialized = true;
	}
	return db;
}

// ── JSON fallback (when SQLite is not available) ───────────────────────

interface JsonStore {
	scans: ScanSnapshot[];
}

function loadJsonStore(): JsonStore {
	ensureDir();
	if (!existsSync(JSON_PATH)) return { scans: [] };
	try {
		return JSON.parse(readFileSync(JSON_PATH, "utf-8"));
	} catch {
		return { scans: [] };
	}
}

function saveJsonStore(store: JsonStore): void {
	ensureDir();
	// Prune before save
	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	store.scans = store.scans
		.filter((s) => s.createdAt >= cutoff)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, MAX_SCANS);
	writeFileSync(JSON_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function pruneOldScans(): void {
	const database = db;
	if (!database) return;
	const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	database.prepare("DELETE FROM security_scans WHERE created_at < ?").run(cutoff);
	database.prepare(`
		DELETE FROM security_scans
		WHERE id IN (
			SELECT id FROM security_scans
			ORDER BY created_at DESC
			LIMIT -1 OFFSET ?
		)
	`).run(MAX_SCANS);
}

// ── Helpers ────────────────────────────────────────────────────────────

function countSeverities(findings: SecurityReportFinding[]): SeverityCounts {
	const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
	for (const f of findings) {
		if (f.severity in counts) counts[f.severity]++;
	}
	return counts;
}

function findingKey(f: SecurityReportFinding): string {
	return `${f.severity}|${f.title}|${f.category}`;
}

function parseJson<T>(value: unknown, fallback: T): T {
	if (typeof value !== "string" || !value.trim()) return fallback;
	try {
		return JSON.parse(value) ?? fallback;
	} catch {
		return fallback;
	}
}

function rowToSnapshot(row: any): ScanSnapshot {
	const findings = parseJson<SecurityReportFinding[]>(row.findings_json, []);
	const severityCounts = parseJson<SeverityCounts>(row.severity_counts_json, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
	return {
		id: String(row.id),
		title: String(row.title || ""),
		summary: String(row.summary || ""),
		scope: String(row.scope || ""),
		createdAt: String(row.created_at || nowIso()),
		findings,
		mitigations: parseJson<string[]>(row.mitigations_json, []),
		severityCounts,
		totalFindings: Number(row.total_findings || 0),
	};
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Persist a complete scan report to history.
 */
export function saveScanSnapshot(report: SecurityReportData): ScanSnapshot {
	const timestamp = nowIso();
	const id = `scan-${timestamp.replace(/[:.]/g, "-")}`;
	const severityCounts = countSeverities(report.findings);

	const snapshot: ScanSnapshot = {
		id,
		title: report.title,
		summary: report.summary,
		scope: report.scope || "",
		createdAt: timestamp,
		findings: report.findings,
		mitigations: report.mitigations,
		severityCounts,
		totalFindings: report.findings.length,
	};

	const database = getDb();
	if (database) {
		database.prepare(`
			INSERT INTO security_scans (
				id, title, summary, scope, created_at,
				findings_json, mitigations_json, severity_counts_json, total_findings
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			id,
			report.title,
			report.summary,
			report.scope || "",
			timestamp,
			JSON.stringify(report.findings),
			JSON.stringify(report.mitigations),
			JSON.stringify(severityCounts),
			report.findings.length,
		);
		pruneOldScans();
	} else {
		// JSON fallback
		const store = loadJsonStore();
		store.scans.unshift(snapshot);
		saveJsonStore(store);
	}

	return snapshot;
}

/**
 * Load scan history, most recent first.
 */
export function loadHistory(options?: { limit?: number; since?: string; until?: string }): ScanSnapshot[] {
	const database = getDb();
	if (database) {
		const limit = options?.limit ?? 200;
		let sql = "SELECT * FROM security_scans WHERE 1=1";
		const params: any[] = [];

		if (options?.since) {
			sql += " AND created_at >= ?";
			params.push(options.since);
		}
		if (options?.until) {
			sql += " AND created_at <= ?";
			params.push(options.until);
		}

		sql += " ORDER BY created_at DESC LIMIT ?";
		params.push(limit);

		return database.prepare(sql).all(...params).map(rowToSnapshot);
	}

	// JSON fallback
	const store = loadJsonStore();
	let scans = store.scans;
	if (options?.since) scans = scans.filter((s) => s.createdAt >= options.since!);
	if (options?.until) scans = scans.filter((s) => s.createdAt <= options.until!);
	return scans.slice(0, options?.limit ?? 200);
}

/**
 * Load trend data (severity counts over time) for charting.
 * Returns points in chronological order (oldest first).
 */
export function loadTrendData(options?: { limit?: number }): TrendPoint[] {
	const database = getDb();
	if (database) {
		const limit = options?.limit ?? 100;
		const rows = database.prepare(`
			SELECT created_at, total_findings, severity_counts_json
			FROM security_scans
			ORDER BY created_at DESC
			LIMIT ?
		`).all(limit);

		// Reverse to get chronological order for charting
		return rows.reverse().map((row: any) => ({
			createdAt: String(row.created_at),
			totalFindings: Number(row.total_findings || 0),
			severityCounts: parseJson<SeverityCounts>(row.severity_counts_json, { critical: 0, high: 0, medium: 0, low: 0, info: 0 }),
		}));
	}

	// JSON fallback
	const store = loadJsonStore();
	const limit = options?.limit ?? 100;
	return store.scans
		.slice(0, limit)
		.reverse()
		.map((s) => ({
			createdAt: s.createdAt,
			totalFindings: s.totalFindings,
			severityCounts: s.severityCounts,
		}));
}

/**
 * Get the N most recent snapshots.
 */
export function getLatestSnapshots(count: number): ScanSnapshot[] {
	return loadHistory({ limit: count });
}

/**
 * Compute delta between two scan snapshots.
 * Identifies new findings (in current but not in previous),
 * resolved findings (in previous but not in current), and unchanged count.
 */
export function computeDelta(current: SecurityReportData, previous: ScanSnapshot): ScanDelta {
	const currentKeys = new Set(current.findings.map(findingKey));
	const previousKeys = new Set(previous.findings.map(findingKey));

	const newFindings = current.findings.filter((f) => !previousKeys.has(findingKey(f)));
	const resolvedFindings = previous.findings.filter((f) => !currentKeys.has(findingKey(f)));
	const unchangedCount = current.findings.length - newFindings.length;

	return {
		newFindings,
		resolvedFindings,
		unchangedCount,
		previousScanAt: previous.createdAt,
	};
}

/**
 * Load complete history data for the report viewer.
 * Returns snapshots, trend data, and delta comparison.
 */
export function loadHistoryForReport(currentReport: SecurityReportData): HistoryData {
	const snapshots = loadHistory({ limit: 200 });
	const trend = loadTrendData({ limit: 100 });
	const delta = snapshots.length > 0 ? computeDelta(currentReport, snapshots[0]) : null;

	return { snapshots, trend, delta };
}

/**
 * Get the total number of stored scans.
 */
export function getScanCount(): number {
	const database = getDb();
	if (database) {
		const row = database.prepare("SELECT COUNT(*) as count FROM security_scans").get() as any;
		return Number(row?.count || 0);
	}
	return loadJsonStore().scans.length;
}

// ── Test helpers ───────────────────────────────────────────────────────

export function resetHistoryForTests(): void {
	if (db) {
		try { db.close(); } catch {}
		db = null;
	}
	initialized = false;
	if (existsSync(DB_PATH)) {
		try { unlinkSync(DB_PATH); } catch {}
	}
	if (existsSync(JSON_PATH)) {
		try { unlinkSync(JSON_PATH); } catch {}
	}
}

export { countSeverities, findingKey };
