// ABOUTME: Shared persisted report index for plans, questions, specs, and completion reports.
// ABOUTME: Stores searchable metadata in SQLite with JSON migration and retention pruning.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type PersistedReportCategory = "plan" | "questions" | "spec" | "completion";

export interface PersistedReportEntry {
	id: string;
	category: PersistedReportCategory;
	title: string;
	summary: string;
	searchText: string;
	createdAt: string;
	updatedAt: string;
	sourcePath?: string;
	sourceLabel?: string;
	viewerPath?: string;
	viewerLabel?: string;
	tags?: string[];
	metadata?: Record<string, any>;
}

export interface PersistedReportIndex {
	version: 1;
	updatedAt: string;
	entries: PersistedReportEntry[];
}

const INDEX_DIR = resolve(".context", "reports");
const INDEX_PATH = join(INDEX_DIR, "index.json");
const DB_PATH = join(INDEX_DIR, "reports.db");
const DB_RETENTION_DAYS = parsePositiveInt(process.env.PI_REPORT_RETENTION_DAYS, 30);
const DB_MAX_ENTRIES = parsePositiveInt(process.env.PI_REPORT_MAX_ENTRIES, 500);

let db: DatabaseSync | null = null;
let initialized = false;

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const num = Number.parseInt(value || "", 10);
	return Number.isFinite(num) && num > 0 ? num : fallback;
}

function ensureDir() {
	if (!existsSync(INDEX_DIR)) mkdirSync(INDEX_DIR, { recursive: true });
}

function nowIso(): string {
	return new Date().toISOString();
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "report";
}

function compact(text: string, max = 240): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= max) return normalized;
	return normalized.slice(0, max - 1).trimEnd() + "…";
}

function arrayUnique(values: Array<string | undefined>): string[] {
	return [...new Set(values.map((v) => (v || "").trim()).filter(Boolean))];
}

function serializeJson(value: unknown): string {
	try {
		return JSON.stringify(value ?? {});
	} catch {
		return "{}";
	}
}

function parseJsonObject<T>(value: unknown, fallback: T): T {
	if (typeof value !== "string" || !value.trim()) return fallback;
	try {
		const parsed = JSON.parse(value);
		return parsed ?? fallback;
	} catch {
		return fallback;
	}
}

function cutoffIso(retentionDays = DB_RETENTION_DAYS): string {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	return cutoff.toISOString();
}

function createDatabase(): DatabaseSync {
	ensureDir();
	const database = new DatabaseSync(DB_PATH);
	database.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS reports (
			id TEXT PRIMARY KEY,
			category TEXT NOT NULL,
			title TEXT NOT NULL,
			summary TEXT NOT NULL,
			search_text TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			source_path TEXT,
			source_label TEXT,
			viewer_path TEXT,
			viewer_label TEXT,
			tags_json TEXT NOT NULL DEFAULT '[]',
			metadata_json TEXT NOT NULL DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_reports_updated_at ON reports(updated_at DESC);
		CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
	`);
	return database;
}

function getDb(): DatabaseSync {
	if (!db) db = createDatabase();
	if (!initialized) {
		migrateJsonIndexIfNeeded();
		pruneExpiredReports();
		initialized = true;
	}
	return db;
}

function rowToEntry(row: any): PersistedReportEntry {
	return {
		id: String(row.id),
		category: row.category as PersistedReportCategory,
		title: String(row.title || ""),
		summary: String(row.summary || ""),
		searchText: String(row.search_text || ""),
		createdAt: String(row.created_at || nowIso()),
		updatedAt: String(row.updated_at || nowIso()),
		sourcePath: row.source_path ? String(row.source_path) : undefined,
		sourceLabel: row.source_label ? String(row.source_label) : undefined,
		viewerPath: row.viewer_path ? String(row.viewer_path) : undefined,
		viewerLabel: row.viewer_label ? String(row.viewer_label) : undefined,
		tags: parseJsonObject<string[]>(row.tags_json, []),
		metadata: parseJsonObject<Record<string, any>>(row.metadata_json, {}),
	};
}

function legacyLoadJsonIndex(): PersistedReportIndex {
	ensureDir();
	if (!existsSync(INDEX_PATH)) {
		return { version: 1, updatedAt: nowIso(), entries: [] };
	}

	try {
		const parsed = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
		return {
			version: 1,
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
			entries: Array.isArray(parsed.entries) ? parsed.entries : [],
		};
	} catch {
		return { version: 1, updatedAt: nowIso(), entries: [] };
	}
}

function writeLegacyJsonSnapshot(entries: PersistedReportEntry[]): void {
	ensureDir();
	const snapshot: PersistedReportIndex = {
		version: 1,
		updatedAt: nowIso(),
		entries,
	};
	writeFileSync(INDEX_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
}

function migrateJsonIndexIfNeeded(): void {
	const database = db!;
	const count = Number(database.prepare("SELECT COUNT(*) as count FROM reports").get().count || 0);
	if (count > 0 || !existsSync(INDEX_PATH)) return;

	const legacy = legacyLoadJsonIndex();
	if (!legacy.entries.length) return;

	const insert = database.prepare(`
		INSERT OR REPLACE INTO reports (
			id, category, title, summary, search_text, created_at, updated_at,
			source_path, source_label, viewer_path, viewer_label, tags_json, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const transaction = database.transaction((entries: PersistedReportEntry[]) => {
		for (const rawEntry of entries) {
			const entry = normalizeEntry(rawEntry);
			insert.run(
				entry.id,
				entry.category,
				entry.title,
				entry.summary,
				entry.searchText,
				entry.createdAt,
				entry.updatedAt,
				entry.sourcePath || null,
				entry.sourceLabel || null,
				entry.viewerPath || null,
				entry.viewerLabel || null,
				serializeJson(entry.tags || []),
				serializeJson(entry.metadata || {}),
			);
		}
	});

	transaction(legacy.entries);
	pruneExpiredReports();
	writeLegacyJsonSnapshot(loadEntriesFromDb());
}

function normalizeEntry(input: Partial<PersistedReportEntry> & { category: PersistedReportCategory; title: string }): PersistedReportEntry {
	const title = compact(String(input.title || "report"), 160);
	const summary = compact(String(input.summary || ""), 320);
	const sourcePath = input.sourcePath ? resolve(input.sourcePath) : undefined;
	const viewerPath = input.viewerPath ? resolve(input.viewerPath) : undefined;
	const metadata = input.metadata || {};
	const tags = arrayUnique(input.tags || []);
	const timestamp = typeof input.updatedAt === "string" && input.updatedAt ? input.updatedAt : nowIso();
	const createdAt = typeof input.createdAt === "string" && input.createdAt ? input.createdAt : timestamp;
	return {
		id: input.id || `${timestamp.replace(/[:.]/g, "-")}-${slugify(title)}`,
		category: input.category,
		title,
		summary,
		searchText: buildReportSearchText({
			category: input.category,
			title,
			summary,
			sourcePath,
			viewerLabel: input.viewerLabel,
			tags,
			metadata,
		}),
		createdAt,
		updatedAt: timestamp,
		sourcePath,
		sourceLabel: input.sourceLabel || (sourcePath ? basename(sourcePath) : undefined),
		viewerPath,
		viewerLabel: input.viewerLabel,
		tags,
		metadata,
	};
}

function loadEntriesFromDb(): PersistedReportEntry[] {
	const database = getDb();
	const rows = database.prepare(`
		SELECT id, category, title, summary, search_text, created_at, updated_at,
			source_path, source_label, viewer_path, viewer_label, tags_json, metadata_json
		FROM reports
		ORDER BY updated_at DESC, created_at DESC
	`).all();
	return rows.map(rowToEntry);
}

export function getReportIndexPath(): string {
	return DB_PATH;
}

export function loadReportIndex(): PersistedReportIndex {
	const entries = loadEntriesFromDb();
	return { version: 1, updatedAt: nowIso(), entries };
}

export function saveReportIndex(index: PersistedReportIndex): void {
	const database = getDb();
	const replace = database.prepare(`
		INSERT OR REPLACE INTO reports (
			id, category, title, summary, search_text, created_at, updated_at,
			source_path, source_label, viewer_path, viewer_label, tags_json, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	const incoming = Array.isArray(index.entries) ? index.entries : [];
	const ids = incoming.map((entry) => String(entry.id));
	const tx = database.transaction((entries: PersistedReportEntry[]) => {
		if (ids.length > 0) {
			const placeholders = ids.map(() => "?").join(", ");
			database.prepare(`DELETE FROM reports WHERE id NOT IN (${placeholders})`).run(...ids);
		} else {
			database.exec("DELETE FROM reports");
		}
		for (const rawEntry of entries) {
			const entry = normalizeEntry(rawEntry as any);
			replace.run(
				entry.id,
				entry.category,
				entry.title,
				entry.summary,
				entry.searchText,
				entry.createdAt,
				entry.updatedAt,
				entry.sourcePath || null,
				entry.sourceLabel || null,
				entry.viewerPath || null,
				entry.viewerLabel || null,
				serializeJson(entry.tags || []),
				serializeJson(entry.metadata || {}),
			);
		}
	});
	tx(incoming as PersistedReportEntry[]);
	pruneExpiredReports();
	writeLegacyJsonSnapshot(loadEntriesFromDb());
}

export function buildReportSearchText(entry: {
	category: PersistedReportCategory;
	title: string;
	summary?: string;
	sourcePath?: string;
	viewerLabel?: string;
	tags?: string[];
	metadata?: Record<string, any>;
}): string {
	return compact(arrayUnique([
		entry.category,
		entry.title,
		entry.summary,
		entry.sourcePath,
		entry.viewerLabel,
		...(entry.tags || []),
		...Object.values(entry.metadata || {}).map((v) => typeof v === "string" ? v : JSON.stringify(v)),
	]).join(" \n "), 4000);
}

export function pruneExpiredReports(retentionDays = DB_RETENTION_DAYS, maxEntries = DB_MAX_ENTRIES): number {
	const database = getDb();
	let pruned = 0;
	pruned += database.prepare("DELETE FROM reports WHERE updated_at < ?").run(cutoffIso(retentionDays)).changes;
	pruned += database.prepare(`
		DELETE FROM reports
		WHERE id IN (
			SELECT id FROM reports
			ORDER BY updated_at DESC, created_at DESC
			LIMIT -1 OFFSET ?
		)
	`).run(maxEntries).changes;
	if (pruned > 0) writeLegacyJsonSnapshot(loadEntriesFromDb());
	return pruned;
}

export function upsertPersistedReport(input: {
	category: PersistedReportCategory;
	title: string;
	summary?: string;
	sourcePath?: string;
	sourceLabel?: string;
	viewerPath?: string;
	viewerLabel?: string;
	tags?: string[];
	metadata?: Record<string, any>;
}): PersistedReportEntry {
	const database = getDb();
	const timestamp = nowIso();
	const sourcePath = input.sourcePath ? resolve(input.sourcePath) : undefined;
	const viewerPath = input.viewerPath ? resolve(input.viewerPath) : undefined;
	const existing = database.prepare(`
		SELECT id, created_at
		FROM reports
		WHERE category = ? AND COALESCE(viewer_path, source_path, '') = ? AND title = ?
		LIMIT 1
	`).get(input.category, viewerPath || sourcePath || "", input.title) as any;

	const entry = normalizeEntry({
		...input,
		id: existing?.id,
		createdAt: existing?.created_at || timestamp,
		updatedAt: timestamp,
		sourcePath,
		viewerPath,
	});

	database.prepare(`
		INSERT OR REPLACE INTO reports (
			id, category, title, summary, search_text, created_at, updated_at,
			source_path, source_label, viewer_path, viewer_label, tags_json, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		entry.id,
		entry.category,
		entry.title,
		entry.summary,
		entry.searchText,
		entry.createdAt,
		entry.updatedAt,
		entry.sourcePath || null,
		entry.sourceLabel || null,
		entry.viewerPath || null,
		entry.viewerLabel || null,
		serializeJson(entry.tags || []),
		serializeJson(entry.metadata || {}),
	);

	pruneExpiredReports();
	writeLegacyJsonSnapshot(loadEntriesFromDb());
	return entry;
}

export function resetReportStorageForTests(): void {
	if (db) {
		try { db.close(); } catch {}
		db = null;
	}
	initialized = false;
	if (existsSync(DB_PATH)) {
		try { unlinkSync(DB_PATH); } catch {}
	}
}
