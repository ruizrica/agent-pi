// ABOUTME: Obsidian Knowledge Base extension — Karpathy-style agent memory via Obsidian CLI.
// ABOUTME: Provides ingest, search, read, write, compile, navigate, and health operations on an Obsidian vault.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import {
	obsidianExec,
	rawPath,
	wikiPath,
	indexPath,
	masterIndexPath,
	sanitizeFilename,
	titleFromFilename,
	buildFrontmatter,
	parseLines,
	parseSearchContext,
	parseVaultInfo,
	groupByFile,
	VAULT_NAME,
	VAULT_PATH,
} from "./lib/obsidian-cli.ts";
import type { ObsidianToolParams } from "./lib/obsidian-types.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function ok(text: string, details?: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text }],
		details: { success: true, ...details },
	};
}

function err(text: string, details?: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text: `Error: ${text}` }],
		details: { success: false, error: text, ...details },
	};
}

function str(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback: number): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

// ── Operation Handlers ───────────────────────────────────────────────

async function handleIngest(p: ObsidianToolParams) {
	const title = str(p.title);
	const content = str(p.content);
	if (!title) return err("'title' is required for ingest.");
	if (!content) return err("'content' is required for ingest.");

	const source = str(p.source);
	const tags = str(p.tags);
	const category = str(p.category);

	// Build frontmatter
	const meta: Record<string, unknown> = {
		title,
		date: new Date().toISOString().split("T")[0],
		status: "raw",
	};
	if (source) meta.source = source;
	if (tags) meta.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);

	const frontmatter = buildFrontmatter(meta);
	const fullContent = `${frontmatter}\n\n${content}`;
	const filePath = rawPath(title + ".md", category || undefined);

	const result = await obsidianExec("create", {
		path: filePath,
		content: fullContent,
	});

	if (!result.success && result.stderr) return err(result.stderr);
	return ok(`Ingested: ${filePath}`, { path: filePath, title });
}

async function handleIngestAppend(p: ObsidianToolParams) {
	const path = str(p.path);
	const content = str(p.content);
	if (!path) return err("'path' is required for ingest:append.");
	if (!content) return err("'content' is required for ingest:append.");

	const result = await obsidianExec("append", { path, content });
	if (!result.success && result.stderr) return err(result.stderr);
	return ok(`Appended to: ${path}`, { path });
}

async function handleIngestDaily(p: ObsidianToolParams) {
	const content = str(p.content);
	if (!content) return err("'content' is required for ingest:daily.");

	const result = await obsidianExec("daily:append", { content });
	if (!result.success && result.stderr) return err(result.stderr);
	return ok(`Added to daily note: ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`, { content });
}

async function handleSearch(p: ObsidianToolParams) {
	const query = str(p.query);
	if (!query) return err("'query' is required for search.");

	const scope = str(p.scope);
	const limit = num(p.limit, 20);

	const args: Record<string, string | number | boolean | undefined> = {
		query,
		limit,
	};
	if (scope === "raw" || scope === "wiki") args.path = scope;

	const result = await obsidianExec("search:context", args);

	if (!result.stdout) {
		return ok(`No results found for: "${query}"`, { query, results: [], count: 0 });
	}

	const matches = parseSearchContext(result.stdout);
	const grouped = groupByFile(matches);

	const lines: string[] = [`Search results for "${query}" (${grouped.size} files, ${matches.length} matches):\n`];

	for (const [file, fileMatches] of grouped) {
		lines.push(`📄 ${file}`);
		for (const m of fileMatches.slice(0, 5)) {
			lines.push(`  L${m.line}: ${m.text}`);
		}
		if (fileMatches.length > 5) {
			lines.push(`  ... and ${fileMatches.length - 5} more matches`);
		}
		lines.push("");
	}

	return ok(lines.join("\n"), { query, fileCount: grouped.size, matchCount: matches.length });
}

async function handleSearchTags(p: ObsidianToolParams) {
	const query = str(p.query);

	const result = await obsidianExec("tags", { counts: true, sort: "count" });
	if (!result.stdout) return ok("No tags found in vault.", { tags: [] });

	const lines = parseLines(result.stdout);
	let filtered = lines;
	if (query) {
		const q = query.toLowerCase();
		filtered = lines.filter((l) => l.toLowerCase().includes(q));
	}

	return ok(`Tags${query ? ` matching "${query}"` : ""}:\n\n${filtered.join("\n") || "No matching tags."}`, {
		count: filtered.length,
		query,
	});
}

async function handleRead(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	if (!path && !file) return err("'path' or 'file' is required for read.");

	const args: Record<string, string | undefined> = {};
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("read", args);
	if (!result.success && !result.stdout) return err(result.stderr || `File not found: ${path || file}`);

	const content = result.stdout;

	// Also get word count
	const wcResult = await obsidianExec("wordcount", args);
	const wordInfo = wcResult.stdout || "";

	return ok(`${content}\n\n---\n${wordInfo}`, { path: path || file, length: content.length });
}

async function handleReadOutline(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	if (!path && !file) return err("'path' or 'file' is required for read:outline.");

	const args: Record<string, string | undefined> = { format: "tree" };
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("outline", args);
	if (!result.stdout) return ok("No headings found.", { headings: 0 });

	return ok(`Outline:\n\n${result.stdout}`, { path: path || file });
}

async function handleReadProperties(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	if (!path && !file) return err("'path' or 'file' is required for read:properties.");

	const args: Record<string, string | undefined> = { format: "yaml" };
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("properties", args);
	if (!result.stdout) return ok("No properties found.", { properties: {} });

	return ok(`Properties:\n\n${result.stdout}`, { path: path || file });
}

async function handleBacklinks(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	if (!path && !file) return err("'path' or 'file' is required for backlinks.");

	const args: Record<string, string | boolean | undefined> = { counts: true };
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("backlinks", args);
	if (!result.stdout || result.stdout.includes("No backlinks")) {
		return ok("No backlinks found.", { backlinks: [], count: 0 });
	}

	const lines = parseLines(result.stdout);
	return ok(`Backlinks (${lines.length}):\n\n${lines.map((l) => `  ← ${l}`).join("\n")}`, {
		count: lines.length,
		backlinks: lines,
	});
}

async function handleLinks(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	if (!path && !file) return err("'path' or 'file' is required for links.");

	const args: Record<string, string | undefined> = {};
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("links", args);
	if (!result.stdout || result.stdout.includes("No links")) {
		return ok("No outgoing links found.", { links: [], count: 0 });
	}

	const lines = parseLines(result.stdout);
	return ok(`Outgoing links (${lines.length}):\n\n${lines.map((l) => `  → ${l}`).join("\n")}`, {
		count: lines.length,
		links: lines,
	});
}

async function handleList(p: ObsidianToolParams) {
	const scope = str(p.scope);
	const folder = scope === "raw" ? "raw" : scope === "wiki" ? "wiki" : str(p.path);

	const args: Record<string, string | undefined> = {};
	if (folder) args.folder = folder;

	const result = await obsidianExec("files", args);
	if (!result.stdout) return ok("No files found.", { files: [], count: 0 });

	const files = parseLines(result.stdout);
	return ok(`Files${folder ? ` in ${folder}/` : ""} (${files.length}):\n\n${files.join("\n")}`, {
		count: files.length,
		files,
		folder,
	});
}

async function handleListWikis(_p: ObsidianToolParams) {
	// Read the master index to get wiki list
	const result = await obsidianExec("read", { path: masterIndexPath() });

	if (!result.success || !result.stdout) {
		// Try to list wiki folders instead
		const folders = await obsidianExec("folders", { folder: "wiki" });
		if (!folders.stdout) return ok("No wikis found. The wiki/ folder may be empty.", { wikis: [], count: 0 });

		const wikiList = parseLines(folders.stdout).filter((f) => f !== "wiki" && f !== "/");
		return ok(`Wiki topics (${wikiList.length}):\n\n${wikiList.map((w) => `📚 ${w}`).join("\n")}`, {
			count: wikiList.length,
			wikis: wikiList,
		});
	}

	return ok(`Master Index:\n\n${result.stdout}`, { source: "master-index" });
}

async function handleListFolders(p: ObsidianToolParams) {
	const folder = str(p.path);
	const args: Record<string, string | undefined> = {};
	if (folder) args.folder = folder;

	const result = await obsidianExec("folders", args);
	if (!result.stdout) return ok("No folders found.", { folders: [], count: 0 });

	const folders = parseLines(result.stdout);
	return ok(`Folders (${folders.length}):\n\n${folders.map((f) => `📁 ${f}`).join("\n")}`, {
		count: folders.length,
		folders,
	});
}

async function handleListTags(_p: ObsidianToolParams) {
	const result = await obsidianExec("tags", { counts: true, sort: "count" });
	if (!result.stdout) return ok("No tags found.", { tags: [], count: 0 });

	return ok(`Tags:\n\n${result.stdout}`, { source: "tags" });
}

async function handleListRecent(p: ObsidianToolParams) {
	const limit = num(p.limit, 10);
	const result = await obsidianExec("files", { sort: "modified", limit });
	if (!result.stdout) return ok("No recent files found.", { files: [], count: 0 });

	const files = parseLines(result.stdout);
	return ok(`Recent files (${files.length}):\n\n${files.join("\n")}`, {
		count: files.length,
		files,
	});
}

async function handleWrite(p: ObsidianToolParams) {
	const wiki = str(p.wiki);
	const title = str(p.title);
	const content = str(p.content);
	if (!wiki) return err("'wiki' (topic name) is required for write.");
	if (!title) return err("'title' is required for write.");
	if (!content) return err("'content' is required for write.");

	const links = str(p.links);
	const overwrite = p.overwrite === true;

	// Build frontmatter
	const meta: Record<string, unknown> = {
		title,
		wiki,
		date: new Date().toISOString().split("T")[0],
		status: "wiki",
	};
	if (links) meta.related = links.split(",").map((l) => l.trim()).filter(Boolean);

	const frontmatter = buildFrontmatter(meta);
	const fullContent = `${frontmatter}\n\n${content}`;
	const filePath = wikiPath(wiki, title + ".md");

	const args: Record<string, string | boolean> = {
		path: filePath,
		content: fullContent,
	};
	if (overwrite) args.overwrite = true;

	const result = await obsidianExec("create", args);
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Written: ${filePath}`, { path: filePath, wiki, title });
}

async function handleWriteIndex(p: ObsidianToolParams) {
	const wiki = str(p.wiki);
	const content = str(p.content);
	if (!wiki) return err("'wiki' (topic name) is required for write:index.");
	if (!content) return err("'content' is required for write:index.");

	const filePath = indexPath(wiki);
	const result = await obsidianExec("create", {
		path: filePath,
		content,
		overwrite: true,
	});
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Index updated: ${filePath}`, { path: filePath, wiki });
}

async function handleWriteMasterIndex(p: ObsidianToolParams) {
	const content = str(p.content);
	if (!content) return err("'content' is required for write:master_index.");

	const filePath = masterIndexPath();
	const result = await obsidianExec("create", {
		path: filePath,
		content,
		overwrite: true,
	});
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Master index updated: ${filePath}`, { path: filePath });
}

async function handlePropertySet(p: ObsidianToolParams) {
	const path = str(p.path);
	const name = str(p.name);
	const value = str(p.value);
	if (!path) return err("'path' is required for property:set.");
	if (!name) return err("'name' is required for property:set.");
	if (!value) return err("'value' is required for property:set.");

	const propType = str(p.property_type);
	const args: Record<string, string | undefined> = { path, name, value };
	if (propType) args.type = propType;

	const result = await obsidianExec("property:set", args);
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Property set: ${name}=${value} on ${path}`, { path, name, value });
}

async function handlePropertyRemove(p: ObsidianToolParams) {
	const path = str(p.path);
	const name = str(p.name);
	if (!path) return err("'path' is required for property:remove.");
	if (!name) return err("'name' is required for property:remove.");

	const result = await obsidianExec("property:remove", { path, name });
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Property removed: ${name} from ${path}`, { path, name });
}

async function handleHealth(_p: ObsidianToolParams) {
	// Run multiple checks in parallel
	const [orphansR, unresolvedR, deadendsR, vaultR, filesR, tagsR] = await Promise.all([
		obsidianExec("orphans"),
		obsidianExec("unresolved"),
		obsidianExec("deadends"),
		obsidianExec("vault"),
		obsidianExec("files", { total: true }),
		obsidianExec("tags", { total: true }),
	]);

	const orphans = orphansR.stdout ? parseLines(orphansR.stdout) : [];
	const unresolved = unresolvedR.stdout ? parseLines(unresolvedR.stdout) : [];
	const deadends = deadendsR.stdout ? parseLines(deadendsR.stdout) : [];
	const vaultInfo = parseVaultInfo(vaultR.stdout);

	const issues = orphans.length + unresolved.length;
	const status = issues === 0 ? "✅ Healthy" : `⚠️ ${issues} issue(s) found`;

	const lines = [
		`# Vault Health: ${status}\n`,
		`## Stats`,
		`- Files: ${vaultInfo.files || filesR.stdout || "?"}`,
		`- Folders: ${vaultInfo.folders || "?"}`,
		`- Tags: ${tagsR.stdout || "?"}`,
		`- Size: ${vaultInfo.size || "?"}`,
		"",
	];

	if (orphans.length > 0) {
		lines.push(`## Orphans (no incoming links): ${orphans.length}`);
		for (const o of orphans.slice(0, 20)) lines.push(`  - ${o}`);
		if (orphans.length > 20) lines.push(`  ... and ${orphans.length - 20} more`);
		lines.push("");
	}

	if (unresolved.length > 0) {
		lines.push(`## Unresolved Links: ${unresolved.length}`);
		for (const u of unresolved.slice(0, 20)) lines.push(`  - ${u}`);
		if (unresolved.length > 20) lines.push(`  ... and ${unresolved.length - 20} more`);
		lines.push("");
	}

	if (deadends.length > 0) {
		lines.push(`## Dead Ends (no outgoing links): ${deadends.length}`);
		for (const d of deadends.slice(0, 20)) lines.push(`  - ${d}`);
		if (deadends.length > 20) lines.push(`  ... and ${deadends.length - 20} more`);
	}

	return ok(lines.join("\n"), {
		orphans: orphans.length,
		unresolved: unresolved.length,
		deadends: deadends.length,
		issues,
		files: vaultInfo.files,
	});
}

async function handleStats(_p: ObsidianToolParams) {
	const [vaultR, filesR, foldersR, tagsR] = await Promise.all([
		obsidianExec("vault"),
		obsidianExec("files", { total: true }),
		obsidianExec("folders", { total: true }),
		obsidianExec("tags", { total: true }),
	]);

	const info = parseVaultInfo(vaultR.stdout);

	// Count raw and wiki files
	const rawR = await obsidianExec("files", { folder: "raw", total: true });
	const wikiR = await obsidianExec("files", { folder: "wiki", total: true });

	const lines = [
		`📊 Vault: ${info.name || VAULT_NAME}`,
		`📁 Path: ${info.path || VAULT_PATH}`,
		`📄 Total files: ${info.files || filesR.stdout || "0"}`,
		`📂 Folders: ${info.folders || foldersR.stdout || "0"}`,
		`📥 Raw files: ${rawR.stdout || "0"}`,
		`📚 Wiki files: ${wikiR.stdout || "0"}`,
		`🏷️  Tags: ${tagsR.stdout || "0"}`,
		`💾 Size: ${info.size || "?"}`,
	];

	return ok(lines.join("\n"), {
		vault: info.name || VAULT_NAME,
		files: info.files,
		rawFiles: rawR.stdout,
		wikiFiles: wikiR.stdout,
		tags: tagsR.stdout,
	});
}

async function handleOpen(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);

	if (!path && !file) {
		// Open the vault itself
		await obsidianExec("open", {});
		return ok(`Opened Obsidian vault: ${VAULT_NAME}`);
	}

	const args: Record<string, string | undefined> = {};
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("open", args);
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Opened: ${path || file}`, { path: path || file });
}

async function handleMove(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	const to = str(p.to);
	if ((!path && !file) || !to) return err("'path' (or 'file') and 'to' are required for move.");

	const args: Record<string, string | undefined> = { to };
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("move", args);
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Moved: ${path || file} → ${to}`, { from: path || file, to });
}

async function handleDelete(p: ObsidianToolParams) {
	const path = str(p.path);
	const file = str(p.file);
	if (!path && !file) return err("'path' or 'file' is required for delete.");

	const args: Record<string, string | undefined> = {};
	if (path) args.path = path;
	if (file) args.file = file;

	const result = await obsidianExec("delete", args);
	if (!result.success && result.stderr) return err(result.stderr);

	return ok(`Deleted: ${path || file}`, { path: path || file });
}

// ── Operation Router ─────────────────────────────────────────────────

const OPERATIONS: Record<string, (p: ObsidianToolParams) => Promise<ReturnType<typeof ok>>> = {
	"ingest": handleIngest,
	"ingest:append": handleIngestAppend,
	"ingest:daily": handleIngestDaily,
	"search": handleSearch,
	"search:tags": handleSearchTags,
	"read": handleRead,
	"read:outline": handleReadOutline,
	"read:properties": handleReadProperties,
	"backlinks": handleBacklinks,
	"links": handleLinks,
	"list": handleList,
	"list:wikis": handleListWikis,
	"list:folders": handleListFolders,
	"list:tags": handleListTags,
	"list:recent": handleListRecent,
	"write": handleWrite,
	"write:index": handleWriteIndex,
	"write:master_index": handleWriteMasterIndex,
	"property:set": handlePropertySet,
	"property:remove": handlePropertyRemove,
	"health": handleHealth,
	"stats": handleStats,
	"open": handleOpen,
	"move": handleMove,
	"delete": handleDelete,
};

// ── Extension Registration ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── Main Tool ──────────────────────────────────────────────────

	pi.registerTool({
		name: "obsidian_memory",
		label: "Obsidian Memory",
		description: [
			"Obsidian-powered knowledge base — Karpathy-style agent memory.",
			`Vault: ${VAULT_NAME} at ${VAULT_PATH}`,
			"Uses the Obsidian CLI for native vault operations.",
			"",
			"OPERATIONS BY CATEGORY:",
			"",
			"INGEST (get data into the vault):",
			'- "ingest": Create raw file in raw/ (requires title, content; optional source, tags, category)',
			'- "ingest:append": Append content to existing file (requires path, content)',
			'- "ingest:daily": Add to today\'s daily note (requires content)',
			"",
			"SEARCH:",
			'- "search": Full-text search with context (requires query; optional scope=raw|wiki, limit)',
			'- "search:tags": Search/list tags (optional query to filter)',
			"",
			"READ/NAVIGATE:",
			'- "read": Read file content (requires path or file)',
			'- "read:outline": Get heading structure (requires path or file)',
			'- "read:properties": Get file frontmatter/properties (requires path or file)',
			'- "backlinks": Find files linking TO this file (requires path or file)',
			'- "links": Find outgoing links FROM this file (requires path or file)',
			"",
			"LIST/BROWSE:",
			'- "list": List files (optional scope=raw|wiki, or path for subfolder)',
			'- "list:wikis": List all wiki topics from master index',
			'- "list:folders": List folder structure (optional path)',
			'- "list:tags": List all tags with counts',
			'- "list:recent": Recently modified files (optional limit)',
			"",
			"WRITE/COMPILE:",
			'- "write": Create wiki article (requires wiki, title, content; optional links, overwrite)',
			'- "write:index": Create/update wiki index (requires wiki, content)',
			'- "write:master_index": Update master index (requires content)',
			'- "property:set": Set a property on a file (requires path, name, value; optional property_type)',
			'- "property:remove": Remove a property (requires path, name)',
			"",
			"HEALTH/STATS:",
			'- "health": Full health check (orphans, unresolved links, dead-ends, stats)',
			'- "stats": Quick vault statistics',
			"",
			"VAULT MANAGEMENT:",
			'- "open": Open file in Obsidian UI (optional path or file; omit both to open vault)',
			'- "move": Move/rename a file (requires path or file, and to)',
			'- "delete": Delete a file (requires path or file)',
			"",
			"KARPATHY WORKFLOW:",
			'1. Ingest raw content: { operation: "ingest", title: "AI Research Paper", content: "...", tags: "ai,research" }',
			'2. Compile wiki: { operation: "write", wiki: "ai-research", title: "Overview", content: "..." }',
			'3. Update index: { operation: "write:index", wiki: "ai-research", content: "# AI Research\\n\\n- [[Overview]]..." }',
			'4. Search: { operation: "search", query: "neural networks" }',
			'5. Navigate: { operation: "backlinks", file: "Overview" }',
			'6. Health check: { operation: "health" }',
		].join("\n"),
		parameters: Type.Object({
			operation: Type.String({ description: "Operation to perform (see description for full list)" }),
			title: Type.Optional(Type.String({ description: "Title for ingest or write" })),
			content: Type.Optional(Type.String({ description: "Content body" })),
			source: Type.Optional(Type.String({ description: "Source URL or path (for ingest)" })),
			tags: Type.Optional(Type.String({ description: "Comma-separated tags (for ingest)" })),
			category: Type.Optional(Type.String({ description: "Sub-folder category (for ingest)" })),
			query: Type.Optional(Type.String({ description: "Search query" })),
			scope: Type.Optional(Type.String({ description: "Scope filter: raw, wiki, or all" })),
			limit: Type.Optional(Type.Number({ description: "Max results (default: 20)" })),
			path: Type.Optional(Type.String({ description: "File path (relative to vault root)" })),
			file: Type.Optional(Type.String({ description: "File name (wiki-link style resolution)" })),
			wiki: Type.Optional(Type.String({ description: "Wiki topic name (for write operations)" })),
			links: Type.Optional(Type.String({ description: "Comma-separated related article titles" })),
			overwrite: Type.Optional(Type.Boolean({ description: "Overwrite existing file" })),
			name: Type.Optional(Type.String({ description: "Property name" })),
			value: Type.Optional(Type.String({ description: "Property value" })),
			property_type: Type.Optional(Type.String({ description: "Property type: text, list, number, checkbox, date, datetime" })),
			to: Type.Optional(Type.String({ description: "Destination path (for move)" })),
			format: Type.Optional(Type.String({ description: "Output format: json, tsv, csv, text" })),
		}),

		async execute(_toolCallId, params) {
			const p = params as ObsidianToolParams;
			const op = str(p.operation);

			const handler = OPERATIONS[op];
			if (!handler) {
				const ops = Object.keys(OPERATIONS).join(", ");
				return err(`Unknown operation: "${op}". Valid operations: ${ops}`);
			}

			try {
				return await handler(p);
			} catch (error: any) {
				return err(`Operation "${op}" failed: ${error.message}`);
			}
		},

		renderCall(args, theme) {
			const p = args as any;
			const op = p.operation || "?";
			const detail = p.query || p.title || p.path || p.file || p.wiki || "";
			return new Text(
				theme.fg("toolTitle", theme.bold("obsidian_memory ")) +
				theme.fg("accent", op) +
				(detail ? theme.fg("muted", ` ${detail.slice(0, 50)}`) : ""),
				0, 0,
			);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			if (details?.error) {
				return new Text(theme.fg("error", `obsidian: ${details.error}`), 0, 0);
			}
			const op = details?.operation || "";
			return new Text(theme.fg("success", `obsidian: ${op || "done"} ✓`), 0, 0);
		},
	});

	// ── Slash Command: /memory ──────────────────────────────────────

	pi.registerCommand("memory", {
		description: "Obsidian knowledge base — /memory status|search|open|health|ingest",
		handler: async (args, ctx) => {
			const parts = (args || "").trim().split(/\s+/);
			const subCmd = parts[0]?.toLowerCase() || "status";
			const rest = parts.slice(1).join(" ");

			if (subCmd === "status" || subCmd === "stats") {
				const result = await handleStats({} as ObsidianToolParams);
				ctx.ui.notify(result.content[0].text, "info");
			} else if (subCmd === "search" && rest) {
				const result = await handleSearch({ query: rest } as ObsidianToolParams);
				ctx.ui.notify(result.content[0].text, "info");
			} else if (subCmd === "open") {
				const result = await handleOpen({ path: rest || undefined } as ObsidianToolParams);
				ctx.ui.notify(result.content[0].text, "info");
			} else if (subCmd === "health") {
				const result = await handleHealth({} as ObsidianToolParams);
				ctx.ui.notify(result.content[0].text, "info");
			} else if (subCmd === "ingest" && rest) {
				const result = await handleIngestDaily({ content: rest } as ObsidianToolParams);
				ctx.ui.notify(result.content[0].text, "info");
			} else {
				ctx.ui.notify(
					"Usage: /memory <command>\n" +
					"  status  — vault stats\n" +
					"  search <query> — search vault\n" +
					"  open [path] — open in Obsidian\n" +
					"  health — health check\n" +
					"  ingest <text> — quick add to daily note",
					"info",
				);
			}
		},
	});

	// ── Session Start Hook ──────────────────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		// Ensure vault structure exists
		try {
			// Check if raw/ and wiki/ folders exist by listing them
			const rawCheck = await obsidianExec("files", { folder: "raw", total: true });
			const wikiCheck = await obsidianExec("files", { folder: "wiki", total: true });

			// If wiki/_master-index.md doesn't exist, create it
			const masterCheck = await obsidianExec("read", { path: masterIndexPath() });
			if (!masterCheck.success || !masterCheck.stdout) {
				const template = [
					"# Knowledge Base — Master Index",
					"",
					"This is the master index for all wiki topics in the knowledge base.",
					"Each wiki has its own folder under `wiki/` with an `_index.md` listing its articles.",
					"",
					"## Wiki Topics",
					"",
					"_No wikis yet. Use `obsidian_memory` with `operation: \"write\"` to create your first wiki._",
					"",
					"---",
					"",
					"## Vault Structure",
					"",
					"- `raw/` — Raw ingested content (articles, papers, logs, research)",
					"- `wiki/` — Compiled wiki articles with indexes and cross-links",
					"- `wiki/_master-index.md` — This file (master directory)",
					"- `wiki/<topic>/_index.md` — Index for each wiki topic",
				].join("\n");

				await obsidianExec("create", {
					path: masterIndexPath(),
					content: template,
				});
			}
		} catch {
			// Non-fatal — Obsidian may not be running
		}
	});
}
