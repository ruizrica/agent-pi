// ABOUTME: Disk Cleanup viewer — opens a browser GUI for scanning, analyzing, and deleting junk files.
// ABOUTME: Provides /cleanup slash command and show_cleanup tool. AI analysis via Claude Agent SDK (OAuth).
// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateCleanupViewerHTML } from "./lib/viewers/cleanup-viewer-html.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";
import { runClaudeRuntime } from "./lib/claude/claude-runtime.ts";
import {
	CLEANUP_CATEGORIES as CATEGORIES,
	categorizeEntry,
	formatSize,
	isProtected,
	summarizeCleanupResults,
	type ScanFile,
} from "./lib/cleanup/cleanup-domain.ts";

// ── Types ────────────────────────────────────────────────────────────

interface CleanupResult {
	action: "done" | "closed";
	deletedCount?: number;
}

// ── Config ───────────────────────────────────────────────────────────

const MAX_DEPTH = Infinity;
const MAX_FILES = Infinity;

// ── Scanner ──────────────────────────────────────────────────────────

async function scanDirectory(rootDir: string, enabledCategories: string[]) {
	const results: Record<string, ScanFile[]> = { temp: [], compiled: [], archives: [] };
	let fileCount = 0;

	async function getDirSize(dir: string, depth: number): Promise<number> {
		if (depth > 5) return 0;
		let total = 0;
		try {
			const entries = await fsp.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const full = path.join(dir, entry.name);
				try {
					const stat = await fsp.lstat(full);
					if (stat.isSymbolicLink()) continue;
					if (stat.isDirectory()) total += await getDirSize(full, depth + 1);
					else total += stat.size;
				} catch { continue; }
			}
		} catch { /* permission denied */ }
		return total;
	}

	async function walk(dir: string, depth: number) {
		if (depth > MAX_DEPTH || fileCount >= MAX_FILES) return;
		if (isProtected(dir)) return;

		let entries;
		try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
		catch { return; }

		for (const entry of entries) {
			if (fileCount >= MAX_FILES) return;
			const fullPath = path.join(dir, entry.name);

			try {
				const stat = await fsp.lstat(fullPath);
				if (stat.isSymbolicLink()) continue;
			} catch { continue; }

			const isDir = entry.isDirectory();
			const category = categorizeEntry(entry.name, isDir);

			if (category && enabledCategories.includes(category)) {
				try {
					let size = 0;
					let mtime: Date;
					if (isDir) {
						size = await getDirSize(fullPath, 0);
						const stat = await fsp.stat(fullPath);
						mtime = stat.mtime;
					} else {
						const stat = await fsp.stat(fullPath);
						size = stat.size;
						mtime = stat.mtime;
					}
					results[category].push({
						path: fullPath, name: entry.name, size,
						sizeFormatted: formatSize(size),
						modified: mtime.toISOString(), isDirectory: isDir,
					});
					fileCount++;
				} catch { /* stat failed */ }
				if (isDir) continue;
			}

			if (isDir) await walk(fullPath, depth + 1);
		}
	}

	await walk(rootDir, 0);

	for (const cat of Object.keys(results)) {
		results[cat].sort((a, b) => b.size - a.size);
	}

	return results;
}

// ── Deletion Log ─────────────────────────────────────────────────────

const DELETION_LOG = path.join(os.homedir(), ".cleanup-deletion-log.json");

async function appendDeletionLog(entry: Record<string, unknown>) {
	try { await fsp.appendFile(DELETION_LOG, JSON.stringify(entry) + "\n"); }
	catch { /* non-critical */ }
}

async function readDeletionLog(): Promise<Record<string, unknown>[]> {
	try {
		const data = await fsp.readFile(DELETION_LOG, "utf-8");
		return data.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse().slice(0, 100);
	} catch { return []; }
}

// ── AI Analysis (Claude Code CLI runtime) ───────────────────────────

async function streamAIAnalysis(
	summary: Record<string, unknown>,
	sampleFiles: Record<string, unknown>,
	res: ServerResponse,
) {
	const prompt = `You are a disk cleanup advisor. Analyze these scan results and provide concise, actionable recommendations.

SCAN RESULTS:
${JSON.stringify(summary, null, 2)}

SAMPLE FILES (largest per category):
${JSON.stringify(sampleFiles, null, 2)}

Respond with:
1. A brief safety assessment for each category
2. Which files/directories are safe to delete and why
3. Any files that might need caution (e.g., archives that might contain important data)
4. Estimated space savings
5. A clear recommendation

Keep it concise and practical. No emojis. Use plain text formatting with dashes for lists.`;

	let bufferedText = "";
	try {
		const result = await runClaudeRuntime({
			profile: "claude-advisor",
			prompt,
			tools: "read,grep,find,ls,bash",
			systemPrompt: "You are a concise disk cleanup advisor. Provide practical, safety-conscious recommendations for file deletion. Be direct and clear. No emojis. Use elegant, minimal formatting.",
			onTextDelta: (delta) => {
				if (!delta) return;
				bufferedText += delta;
				res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
			},
			onStderr: (chunk) => {
				if (!chunk?.trim()) return;
				res.write(`data: ${JSON.stringify({ status: chunk.trim() })}\n\n`);
			},
		});

		if (!bufferedText && result.result) {
			res.write(`data: ${JSON.stringify({ text: result.result })}\n\n`);
		}
		res.write(`data: ${JSON.stringify({ done: true, result: result.result })}\n\n`);
	} catch (err: any) {
		res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
	}

	res.write("data: [DONE]\n\n");
	res.end();
}

// ── HTTP Server ──────────────────────────────────────────────────────

function startCleanupServer(defaultDir: string): Promise<{
	port: number;
	server: Server;
	waitForResult: () => Promise<CleanupResult>;
}> {
	return new Promise(async (resolveSetup) => {
		let resolveResult: (result: CleanupResult) => void;
		let settled = false;
		const settle = (result: CleanupResult) => {
			if (settled) return;
			settled = true;
			resolveResult(result);
		};
		const resultPromise = new Promise<CleanupResult>((res) => { resolveResult = res; });

		const handle = await createViewerServer({
			getHtml: (port) => generateCleanupViewerHTML({ port, defaultDir }),
			routes: [
				{
					method: "POST",
					path: "/scan",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", async () => {
							try {
								const data = JSON.parse(body);
								const dir = data.directory || "/Users/";
								const cats = data.categories || ["temp", "compiled", "archives"];

								try {
									const realDir = await fsp.realpath(dir);
									if (isProtected(realDir)) {
										res.writeHead(400, { "Content-Type": "application/json" });
										res.end(JSON.stringify({ error: "Cannot scan protected system directory." }));
										return;
									}
									const stat = await fsp.stat(realDir);
									if (!stat.isDirectory()) {
										res.writeHead(400, { "Content-Type": "application/json" });
										res.end(JSON.stringify({ error: "Path is not a directory." }));
										return;
									}
								} catch (err: any) {
									res.writeHead(400, { "Content-Type": "application/json" });
									res.end(JSON.stringify({ error: `Invalid path: ${err.message}` }));
									return;
								}

								const start = Date.now();
								const results = await scanDirectory(dir, cats);
								const elapsed = Date.now() - start;

								const { summary, totalFiles, totalSize, totalSizeFormatted } = summarizeCleanupResults(results);

								res.writeHead(200, { "Content-Type": "application/json" });
								res.end(JSON.stringify({
									results, summary, totalFiles, totalSize,
									totalSizeFormatted,
									scanTime: elapsed, directory: dir,
								}));
							} catch (err: any) {
								res.writeHead(500, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: err.message }));
							}
						});
					},
				},
				{
					method: "POST",
					path: "/delete",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", async () => {
							try {
								const data = JSON.parse(body);
								const files: string[] = data.files || [];
								if (files.length === 0) {
									res.writeHead(400, { "Content-Type": "application/json" });
									res.end(JSON.stringify({ error: "No files specified." }));
									return;
								}

								const results: any[] = [];
								for (const filePath of files) {
									try {
										const real = await fsp.realpath(filePath);
										if (isProtected(real)) {
											results.push({ path: filePath, success: false, error: "Protected path" });
											continue;
										}
										const stat = await fsp.stat(real);
										const size = stat.isDirectory()
											? await (async function getSize(d: string): Promise<number> {
												let t = 0;
												try {
													const ents = await fsp.readdir(d, { withFileTypes: true });
													for (const e of ents) {
														const fp = path.join(d, e.name);
														try {
															const s = await fsp.lstat(fp);
															if (s.isDirectory()) t += await getSize(fp);
															else t += s.size;
														} catch { /* skip */ }
													}
												} catch { /* skip */ }
												return t;
											})(real)
											: stat.size;

										if (stat.isDirectory()) {
											await fsp.rm(real, { recursive: true, force: true });
										} else {
											await fsp.unlink(real);
										}

										results.push({ path: filePath, success: true, size });
										await appendDeletionLog({ path: filePath, size, timestamp: new Date().toISOString(), success: true });
									} catch (err: any) {
										results.push({ path: filePath, success: false, error: err.message });
									}
								}

								const deleted = results.filter((r) => r.success);
								const freedBytes = deleted.reduce((s: number, r: any) => s + (r.size || 0), 0);

								res.writeHead(200, { "Content-Type": "application/json" });
								res.end(JSON.stringify({
									results, deletedCount: deleted.length,
									failedCount: results.length - deleted.length,
									freedBytes, freedFormatted: formatSize(freedBytes),
								}));
							} catch (err: any) {
								res.writeHead(500, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: err.message }));
							}
						});
					},
				},
				{
					method: "POST",
					path: "/analyze",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", async () => {
							res.setHeader("Content-Type", "text/event-stream");
							res.setHeader("Cache-Control", "no-cache");
							res.setHeader("Connection", "keep-alive");
							res.flushHeaders();

							try {
								const data = JSON.parse(body);
								await streamAIAnalysis(data.summary, data.sampleFiles, res);
							} catch (err: any) {
								res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
								res.write("data: [DONE]\n\n");
								res.end();
							}
						});
					},
				},
				{
					method: "GET",
					path: "/history",
					handler: async (req, res) => {
						const entries = await readDeletionLog();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify(entries));
					},
				},
			],
			onResult: (body) => {
				const data = body as any;
				settle({ action: data.action || "done", deletedCount: data.deletedCount });
			},
		});

		// Handle server close as fallback
		handle.server.on("close", () => {
			settle({ action: "closed" });
		});

		resolveSetup({
			port: handle.port,
			server: handle.server,
			waitForResult: () => resultPromise,
		});
	});
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowCleanupParams = Type.Object({
	directory: Type.Optional(Type.String({ description: "Directory to scan (default: /Users/)" })),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	let activeSession: { kind: "report"; title: string; url: string; server: Server; onClose: () => void } | null = null;

	function cleanupServer() {
		const server = activeServer;
		activeServer = null;
		if (server) { try { server.close(); } catch {} }
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	async function launchCleanup(dir: string, ctx?: any): Promise<string> {
		cleanupServer();

		const { port, server, waitForResult } = await startCleanupServer(dir);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "report" as const,
			title: "Disk Cleanup",
			url,
			server,
			onClose: () => { activeServer = null; activeSession = null; },
		};
		registerActiveViewer(activeSession);
		openBrowser(url);
		if (ctx) notifyViewerOpen(ctx, activeSession);

		try {
			const result = await waitForResult();
			const msg = result.action === "done"
				? "Disk cleanup session complete."
				: "Disk cleanup viewer closed.";
			return msg;
		} finally {
			cleanupServer();
		}
	}

	// ── show_cleanup tool ────────────────────────────────────────────

	pi.registerTool({
		name: "show_cleanup",
		label: "Disk Cleanup",
		description:
			"Open a disk cleanup viewer in the browser. " +
			"Scans for temporary files, compiled artifacts, and archives. " +
			"Includes AI-powered analysis via the local Claude Code CLI runtime. " +
			"User can select and delete files with confirmation.",
		parameters: ShowCleanupParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { directory } = params as { directory?: string };
			const dir = directory || "/Users/";
			const msg = await launchCleanup(dir, ctx);
			return { content: [{ type: "text" as const, text: msg }] };
		},

		renderCall(args, theme) {
			const dir = (args as any).directory || "~";
			const text =
				theme.fg("toolTitle", theme.bold("show_cleanup ")) +
				theme.fg("accent", dir);
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			return new Text(
				outputLine(theme, "success", text?.type === "text" ? text.text : ""),
				0, 0,
			);
		},
	});

	// ── /cleanup command ─────────────────────────────────────────────

	pi.registerCommand("cleanup", {
		description: "Open the disk cleanup viewer to scan and delete junk files",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/cleanup requires interactive mode", "error");
				return;
			}

			const dir = args.trim() || "/Users/";
			const msg = await launchCleanup(dir, ctx);
			ctx.ui.notify(msg, "info");
		},
	});

	// ── Session lifecycle ────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
	});
}
