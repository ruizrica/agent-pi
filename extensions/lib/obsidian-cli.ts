// ABOUTME: Obsidian CLI wrapper — executes obsidian CLI commands and parses output.
// ABOUTME: Provides typed helpers for vault operations, path management, and output parsing.

import { execFile } from "node:child_process";
import type { CLIResult, CLIArgs } from "./obsidian-types.ts";

// ── Configuration ────────────────────────────────────────────────────

const OBSIDIAN_BIN = "/usr/local/bin/obsidian";
export const VAULT_NAME = "Obsidian";
export const VAULT_PATH = "/Users/ricardo/Workshop/Obsidian";
const DEFAULT_TIMEOUT = 15_000;

// ── Path Helpers ─────────────────────────────────────────────────────

export function rawPath(filename: string, category?: string): string {
	const safe = sanitizeFilename(filename);
	return category ? `raw/${sanitizeFolderName(category)}/${safe}` : `raw/${safe}`;
}

export function wikiPath(topic: string, article?: string): string {
	const safeTopic = sanitizeFolderName(topic);
	if (!article) return `wiki/${safeTopic}`;
	return `wiki/${safeTopic}/${sanitizeFilename(article)}`;
}

export function indexPath(topic: string): string {
	return `wiki/${sanitizeFolderName(topic)}/_index.md`;
}

export function masterIndexPath(): string {
	return "wiki/_master-index.md";
}

export function sanitizeFolderName(name: string): string {
	// Folder names: lowercase, no extension, no special chars, kebab-case
	return name
		.toLowerCase()
		.replace(/\.md$/, "")
		.replace(/[^a-z0-9\s_-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "") || "untitled";
}

export function sanitizeFilename(name: string): string {
	// Obsidian wiki links resolve by exact filename stem.
	// So filenames should preserve the human-readable title (with spaces)
	// to match [[Wiki Link]] syntax. We only strip dangerous filesystem chars.
	const hasMd = name.endsWith(".md");
	let base = hasMd ? name.slice(0, -3) : name;

	// Remove filesystem-unsafe characters but preserve spaces and capitalization
	base = base
		.replace(/[/\\:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim();

	if (!base) base = "Untitled";
	return base + ".md";
}

export function titleFromFilename(filename: string): string {
	return filename
		.replace(/\.md$/, "")
		.replace(/^_/, "")
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Frontmatter Builder ──────────────────────────────────────────────

export function buildFrontmatter(meta: Record<string, unknown>): string {
	const lines = ["---"];
	for (const [key, value] of Object.entries(meta)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) {
				lines.push(`  - ${item}`);
			}
		} else {
			lines.push(`${key}: ${value}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

// ── CLI Execution ────────────────────────────────────────────────────

export function obsidianExec(command: string, args: CLIArgs = {}, timeout = DEFAULT_TIMEOUT): Promise<CLIResult> {
	return new Promise((resolve) => {
		// Build argument array
		const cliArgs: string[] = [command];

		for (const [key, value] of Object.entries(args)) {
			if (value === undefined || value === null) continue;
			if (value === true) {
				// Boolean flag: just the key name
				cliArgs.push(key);
			} else if (value === false) {
				// Skip false booleans
				continue;
			} else {
				// Key=value pair
				cliArgs.push(`${key}=${String(value)}`);
			}
		}

		// Always add vault targeting
		cliArgs.push(`vault=${VAULT_NAME}`);

		execFile(OBSIDIAN_BIN, cliArgs, {
			timeout,
			encoding: "utf-8",
			maxBuffer: 5 * 1024 * 1024, // 5MB buffer for large outputs
		}, (error, stdout, stderr) => {
			if (error) {
				// CLI often returns non-zero for "no results found" etc.
				// Check if we got useful output anyway
				const output = stdout?.trim() || stderr?.trim() || error.message || "Unknown error";
				const isRealError = output.startsWith("Error:") || output.includes("not found") || (!stdout?.trim() && error.code !== 0);
				resolve({
					stdout: stdout?.trim() || "",
					stderr: stderr?.trim() || error.message || "",
					success: !isRealError,
				});
				return;
			}
			resolve({
				stdout: stdout?.trim() || "",
				stderr: stderr?.trim() || "",
				success: true,
			});
		});
	});
}

// ── Output Parsers ───────────────────────────────────────────────────

/**
 * Parse TSV output into array of objects.
 * First line is header, subsequent lines are data.
 */
export function parseTSV(output: string): Record<string, string>[] {
	const lines = output.split("\n").filter(Boolean);
	if (lines.length < 2) return [];

	const headers = lines[0].split("\t");
	return lines.slice(1).map((line) => {
		const values = line.split("\t");
		const obj: Record<string, string> = {};
		headers.forEach((h, i) => {
			obj[h.trim()] = (values[i] || "").trim();
		});
		return obj;
	});
}

/**
 * Parse JSON output safely.
 */
export function parseJSON<T = unknown>(output: string): T | null {
	try {
		return JSON.parse(output) as T;
	} catch {
		return null;
	}
}

/**
 * Parse simple line-per-item output into string array.
 */
export function parseLines(output: string): string[] {
	return output.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Parse search:context output into structured results.
 * Format: "file/path.md:linenum: matching text"
 */
export function parseSearchContext(output: string): { file: string; line: number; text: string }[] {
	const results: { file: string; line: number; text: string }[] = [];
	for (const line of output.split("\n")) {
		const match = line.match(/^(.+?):(\d+):\s*(.*)$/);
		if (match) {
			results.push({
				file: match[1],
				line: parseInt(match[2], 10),
				text: match[3],
			});
		}
	}
	return results;
}

/**
 * Parse vault info output (key\tvalue pairs).
 */
export function parseVaultInfo(output: string): Record<string, string> {
	const info: Record<string, string> = {};
	for (const line of output.split("\n")) {
		const [key, ...rest] = line.split("\t");
		if (key) info[key.trim()] = rest.join("\t").trim();
	}
	return info;
}

/**
 * Group search context results by file.
 */
export function groupByFile(results: { file: string; line: number; text: string }[]): Map<string, { line: number; text: string }[]> {
	const grouped = new Map<string, { line: number; text: string }[]>();
	for (const r of results) {
		const existing = grouped.get(r.file) || [];
		existing.push({ line: r.line, text: r.text });
		grouped.set(r.file, existing);
	}
	return grouped;
}
