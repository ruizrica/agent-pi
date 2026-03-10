// ABOUTME: Lightweight local file viewer/editor that opens in the browser without Commander.
// ABOUTME: Serves a local web UI for viewing and optionally editing a single file directly from the CLI.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { execSync, spawn } from "node:child_process";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateFileViewerHTML } from "./lib/file-viewer-html.ts";
import { registerActiveViewer, clearActiveViewer, closeActiveViewer, getActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";

interface FileViewerResult {
	action: "done";
	modified: boolean;
	content: string;
}

function openBrowser(url: string): void {
	try {
		execSync(`open "${url}"`, { stdio: "ignore" });
	} catch {
		try {
			execSync(`xdg-open "${url}"`, { stdio: "ignore" });
		} catch {
			try {
				execSync(`start "${url}"`, { stdio: "ignore" });
			} catch {}
		}
	}
}

function parseRange(content: string, lineRange?: string): string {
	if (!lineRange) return content;
	const lines = content.split("\n");
	const match = lineRange.match(/^(\d+)(?:-(\d+))?$/);
	if (!match) return content;
	const start = Math.max(0, parseInt(match[1], 10) - 1);
	const end = match[2] ? Math.min(lines.length, parseInt(match[2], 10)) : start + 1;
	const out: string[] = [];
	if (start > 0) out.push("...");
	out.push(...lines.slice(start, end));
	if (end < lines.length) out.push("...");
	return out.join("\n");
}

function launchEditor(editor: string, filePath: string): { ok: boolean; error?: string } {
	const macAppMap: Record<string, string> = {
		cursor: "Cursor",
		windsurf: "Windsurf",
		vscode: "Visual Studio Code",
	};
	const commandMap: Record<string, string[]> = {
		cursor: ["cursor", filePath],
		windsurf: ["windsurf", filePath],
		vscode: ["code", filePath],
	};
	if (!commandMap[editor]) return { ok: false, error: `Unsupported editor: ${editor}` };
	try {
		if (process.platform === "darwin") {
			const appName = macAppMap[editor];
			const child = spawn("open", ["-a", appName, filePath], { detached: true, stdio: "ignore" });
			child.unref();
			return { ok: true };
		}
		const cmd = commandMap[editor];
		const child = spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore" });
		child.unref();
		return { ok: true };
	} catch (err: any) {
		return { ok: false, error: err?.message || `Failed to launch ${editor}` };
	}
}

function detectLanguage(filePath: string): string {
	const name = basename(filePath).toLowerCase();
	if (name === "dockerfile") return "dockerfile";
	if (name === "makefile" || name === "gnumakefile") return "makefile";
	if (name === ".gitignore" || name === ".gitconfig") return "ini";
	if (name === "cargo.toml") return "toml";
	if (name === ".env" || name.startsWith(".env.")) return "ini";
	const ext = extname(filePath).replace(/^\./, "").toLowerCase();
	const map: Record<string, string> = {
		js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
		ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
		py: "python", rb: "ruby", rs: "rust", go: "go",
		java: "java", kt: "kotlin", kts: "kotlin", swift: "swift",
		c: "c", h: "c", cpp: "cpp", cc: "cpp", cs: "csharp",
		html: "html", htm: "html", css: "css", scss: "scss",
		json: "json", jsonc: "json",
		md: "markdown", mdx: "markdown",
		yaml: "yaml", yml: "yaml",
		xml: "xml", svg: "xml", plist: "xml",
		sql: "sql",
		sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
		toml: "toml", ini: "ini", conf: "ini", cfg: "ini", properties: "ini",
		php: "php", lua: "lua", r: "r",
		graphql: "graphql", gql: "graphql",
		proto: "protobuf",
		tf: "hcl", hcl: "hcl",
	};
	return map[ext] || "";
}

function startFileViewerServer(opts: {
	filePath: string;
	title: string;
	editable: boolean;
	lineRange?: string;
	language?: string;
}): Promise<{ port: number; server: Server; waitForResult: () => Promise<FileViewerResult> }> {
	return new Promise((resolveSetup, rejectSetup) => {
		let initialContent = "";
		try {
			initialContent = readFileSync(opts.filePath, "utf-8");
		} catch (err) {
			rejectSetup(err);
			return;
		}

		let resolveResult: (result: FileViewerResult) => void;
		const resultPromise = new Promise<FileViewerResult>((res) => {
			resolveResult = res;
		});

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");

			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || "/", "http://localhost");

			if (url.pathname === "/favicon.ico") {
				res.writeHead(204);
				res.end();
				return;
			}

			if (req.method === "GET" && url.pathname === "/") {
				const port = (server.address() as any)?.port || 0;
				res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
				res.setHeader("Pragma", "no-cache");
				res.setHeader("Expires", "0");
				const html = generateFileViewerHTML({
					title: opts.title,
					filePath: opts.filePath,
					content: parseRange(initialContent, opts.lineRange),
					port,
					lineRange: opts.lineRange,
					editable: opts.editable,
					language: opts.language,
				});
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			if (req.method === "POST" && url.pathname === "/open-editor") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const result = launchEditor(String(data.editor || ""), opts.filePath);
						res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
						res.end(JSON.stringify(result));
					} catch (err: any) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: err?.message || "Editor launch failed" }));
					}
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/save") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						if (!opts.editable) throw new Error("This viewer is read-only");
						const data = JSON.parse(body || "{}");
						writeFileSync(opts.filePath, data.content || "", "utf-8");
						initialContent = data.content || "";
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
					} catch (err: any) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: err?.message || "Save failed" }));
					}
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/result") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
						resolveResult!({
							action: "done",
							modified: !!data.modified,
							content: typeof data.content === "string" ? data.content : initialContent,
						});
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
					}
				});
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as any;
			resolveSetup({ port: addr.port, server, waitForResult: () => resultPromise });
		});
	});
}

const ShowFileParams = Type.Object({
	file_path: Type.String({ description: "Path to the file to open" }),
	title: Type.Optional(Type.String({ description: "Optional title shown in the viewer header" })),
	line_range: Type.Optional(Type.String({ description: "Optional line range like '45-60' or '45'" })),
	editable: Type.Optional(Type.Boolean({ description: "Whether to allow editing and saving from the browser UI" })),
});

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	let activeSession: { kind: "file"; title: string; url: string; server: Server; onClose: () => void } | null = null;

	function cleanupServer() {
		const server = activeServer;
		activeServer = null;
		if (server) {
			try { server.close(); } catch {}
		}
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	async function runViewer(ctx: ExtensionContext, params: { file_path: string; title?: string; line_range?: string; editable?: boolean; }) {
		cleanupServer();

		const filePath = resolve(params.file_path);
		const editable = params.editable === true;
		const title = params.title || basename(filePath);

		const language = detectLanguage(filePath);
		const { port, server, waitForResult } = await startFileViewerServer({
			filePath,
			title,
			editable,
			lineRange: params.line_range,
			language,
		});
		activeServer = server;
		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "file",
			title: "File viewer",
			url,
			server,
			onClose: () => {
				activeServer = null;
				activeSession = null;
			},
		};
		registerActiveViewer(activeSession);
		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		try {
			return await waitForResult();
		} finally {
			cleanupServer();
		}
	}

	pi.registerTool({
		name: "show_file",
		label: "Show File",
		description:
			"Open a lightweight local file viewer/editor in the browser without Commander. " +
			"Supports read-only viewing by default, optional editing/saving, and simple line-range display.",
		parameters: ShowFileParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const p = params as { file_path: string; title?: string; line_range?: string; editable?: boolean };
			if (!existsSync(p.file_path)) {
				throw new Error(`File not found: ${p.file_path}`);
			}

			const result = await runViewer(ctx, p);
			return {
				content: [{
					type: "text",
					text: result.modified
						? `File viewer closed. Changes were made${p.editable ? " and may have been saved" : ""}.`
						: "File viewer closed.",
				}],
			};
		},
	});

	pi.registerCommand("show-file", {
		description: "Open a local file viewer/editor in the browser",
		handler: async (args, ctx) => {
			const filePath = String(args || "").trim();
			if (!filePath) {
				ctx.ui.notify("Usage: /show-file <path>", "warning");
				return;
			}

			await runViewer(ctx, { file_path: filePath, editable: false });
		},
	});

	pi.registerTool({
		name: "close_viewer",
		label: "Close Viewer",
		description: "Close the currently active local browser viewer from the CLI if one is open.",
		parameters: Type.Object({}),
		async execute() {
			const closed = closeActiveViewer();
			if (!closed.closed) {
				return { content: [{ type: "text" as const, text: "No active local viewer is open." }] };
			}
			return { content: [{ type: "text" as const, text: `Closed ${closed.kind} viewer${closed.title ? `: ${closed.title}` : ""}.` }] };
		},
	});

	pi.registerCommand("close-viewer", {
		description: "Close the currently active local browser viewer from the CLI",
		handler: async (_args, ctx) => {
			const viewer = getActiveViewer();
			if (!viewer) {
				ctx.ui.notify("No active local viewer is open", "info");
				return;
			}
			closeActiveViewer();
			ctx.ui.notify(`Closed ${viewer.kind} viewer`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.registerCommand("show-file-help", {
		description: "Show help for the local file viewer tool",
		handler: async (_args, ctx) => {
			outputLine(ctx, "show_file { file_path: \"path/to/file\", editable: true }", "info");
		},
	});
}
