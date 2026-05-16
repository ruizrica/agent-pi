// ABOUTME: TypeScript interfaces for the Obsidian memory extension.
// ABOUTME: Defines types for vault operations, search results, health reports, and tool parameters.

// ── Vault Configuration ──────────────────────────────────────────────

export interface VaultConfig {
	name: string;
	path: string;
}

// ── Search Results ───────────────────────────────────────────────────

export interface SearchResult {
	file: string;
	matches: SearchMatch[];
	matchCount: number;
}

export interface SearchMatch {
	line: number;
	text: string;
}

// ── Article / File Metadata ──────────────────────────────────────────

export interface ArticleMetadata {
	path: string;
	title: string;
	tags?: string[];
	source?: string;
	date?: string;
	status?: string;
	wordCount?: number;
	[key: string]: unknown;
}

// ── Wiki Info ────────────────────────────────────────────────────────

export interface WikiInfo {
	name: string;
	path: string;
	articleCount: number;
	description?: string;
}

// ── Backlink Info ────────────────────────────────────────────────────

export interface BacklinkInfo {
	file: string;
	count?: number;
}

// ── Health Report ────────────────────────────────────────────────────

export interface HealthReport {
	orphans: string[];
	unresolved: string[];
	deadends: string[];
	stats: VaultStats;
	issues: number;
}

export interface VaultStats {
	files: number;
	folders: number;
	rawFiles: number;
	wikiFiles: number;
	wikiTopics: number;
	totalWords: number;
	tags: number;
}

// ── Operation Parameter Types ────────────────────────────────────────

export type ObsidianOperation =
	// Ingest
	| "ingest"
	| "ingest:append"
	| "ingest:daily"
	// Search
	| "search"
	| "search:tags"
	// Read/Navigate
	| "read"
	| "read:outline"
	| "read:properties"
	| "backlinks"
	| "links"
	// List/Browse
	| "list"
	| "list:wikis"
	| "list:folders"
	| "list:tags"
	| "list:recent"
	// Write/Compile
	| "write"
	| "write:index"
	| "write:master_index"
	| "property:set"
	| "property:remove"
	// Health/Stats
	| "health"
	| "stats"
	// Vault Management
	| "open"
	| "move"
	| "delete";

export interface ObsidianToolParams {
	operation: ObsidianOperation;
	// Ingest params
	title?: string;
	content?: string;
	source?: string;
	tags?: string;
	category?: string;
	// Search params
	query?: string;
	scope?: string;
	limit?: number;
	// Read/Navigate params
	path?: string;
	file?: string;
	direction?: string;
	// Write params
	wiki?: string;
	links?: string;
	overwrite?: boolean;
	// Property params
	name?: string;
	value?: string;
	property_type?: string;
	// Move params
	to?: string;
	// Format
	format?: string;
}

// ── CLI Execution Types ──────────────────────────────────────────────

export interface CLIResult {
	stdout: string;
	stderr: string;
	success: boolean;
}

export interface CLIArgs {
	[key: string]: string | number | boolean | undefined;
}
