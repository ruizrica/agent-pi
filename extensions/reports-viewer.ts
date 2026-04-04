// ABOUTME: Persisted reports browser for plans, questions, specs, and completion reports.
// ABOUTME: Opens a search-first /reports view with recent category sections and full-screen tables.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateReportsViewerHTML } from "./lib/reports-viewer-html.ts";
import { loadReportIndex } from "./lib/report-index.ts";

function openBrowser(url: string): void {
	try { execFileSync("open", [url], { stdio: "ignore" }); } catch {
		try { execFileSync("xdg-open", [url], { stdio: "ignore" }); } catch {
			try { execFileSync("cmd", ["/c", "start", url], { stdio: "ignore" }); } catch {}
		}
	}
}

/** Shell metacharacters that must never appear in paths passed to child processes. */
const SHELL_META = /[`$|;&(){}\\<>\n\r]/;

/** Validate and resolve a report path before execution. */
function validatePath(raw: string): string {
	const abs = resolve(raw);
	if (SHELL_META.test(abs)) {
		throw new Error(`Path contains disallowed characters: ${abs}`);
	}
	if (!existsSync(abs)) {
		throw new Error(`Path does not exist: ${abs}`);
	}
	return abs;
}

function openOriginalReport(entry: any): void {
	const target = entry.viewerPath || entry.sourcePath;
	if (!target) throw new Error("No source path available for this report");
	const safePath = validatePath(String(target));
	const cwd = process.cwd();
	const command = entry.category === "spec" ? "/spec" : "/show-file";

	if (process.platform === "darwin") {
		execFileSync("open", ["-na", "Terminal", "--args", "bash", "-lc", `cd '${cwd}' && pi ${command} '${safePath}'`], { stdio: "ignore" });
		return;
	}

	// Linux: spawn detached so the process outlives this one (replaces bash "... &")
	const child = spawn("bash", ["-lc", `cd '${cwd}' && pi ${command} '${safePath}'`], {
		stdio: "ignore",
		detached: true,
	});
	child.unref();
}

function startReportsServer(title: string): Promise<{ port: number; server: Server; waitForResult: () => Promise<void> }> {
	return new Promise((resolveSetup) => {
		let resolveResult: () => void;
		const resultPromise = new Promise<void>((res) => { resolveResult = res; });
		let lastHeartbeat = Date.now();
		const heartbeatCheck = setInterval(() => {
			if (Date.now() - lastHeartbeat > 15_000) {
				clearInterval(heartbeatCheck);
				resolveResult!();
			}
		}, 5_000);

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
			const url = new URL(req.url || "/", "http://localhost");

			if (req.method === "GET" && url.pathname === "/") {
				const port = (server.address() as any)?.port || 0;
				const html = generateReportsViewerHTML({ title, port, entries: loadReportIndex().entries });
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			if (req.method === "GET" && url.pathname === "/logo.png") {
				try {
					const logoPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "agent-logo.png");
					const logoData = readFileSync(logoPath);
					res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
					res.end(logoData);
				} catch {
					res.writeHead(404);
					res.end();
				}
				return;
			}

			if (req.method === "POST" && url.pathname === "/heartbeat") {
				lastHeartbeat = Date.now();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				return;
			}

			if (req.method === "POST" && url.pathname === "/open") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const entry = loadReportIndex().entries.find((item) => item.id === data.id);
						if (!entry) throw new Error("Report not found");
						openOriginalReport(entry);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
					} catch (err: any) {
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: err?.message || "Open failed" }));
					}
				});
				return;
			}

			if (req.method === "POST" && url.pathname === "/result") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				resolveResult!();
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as any;
			resolveSetup({
				port: addr.port,
				server,
				waitForResult: () => resultPromise.finally(() => clearInterval(heartbeatCheck)),
			});
		});
	});
}

const ShowReportsParams = Type.Object({
	title: Type.Optional(Type.String({ description: "Title for the reports browser view" })),
});

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	function cleanupServer() {
		if (activeServer) {
			try { activeServer.close(); } catch {}
			activeServer = null;
		}
	}

	async function runViewer(ctx: ExtensionContext, title: string) {
		cleanupServer();
		const { port, server, waitForResult } = await startReportsServer(title);
		activeServer = server;
		const url = `http://127.0.0.1:${port}`;
		openBrowser(url);
		if (ctx.hasUI) ctx.ui.notify(`Reports opened at ${url}`, "info");
		try {
			await waitForResult();
		} finally {
			cleanupServer();
		}
	}

	pi.registerTool({
		name: "show_reports",
		label: "Show Reports",
		description: "Open a searchable /reports browser view for persisted plans, questions, specs, and completion reports.",
		parameters: ShowReportsParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const p = params as { title?: string };
			try {
				loadReportIndex();
			} catch {}
			await runViewer(ctx, p.title || "Reports Index");
			return { content: [{ type: "text" as const, text: "Reports viewer closed." }] };
		},
		renderCall(args, theme) {
			const text = theme.fg("toolTitle", theme.bold("show_reports ")) + theme.fg("accent", (args as any).title || "Reports Index");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},
	});

	pi.registerCommand("reports", {
		description: "Open the persisted reports index in the browser",
		handler: async (_args, ctx) => {
			try {
				loadReportIndex();
			} catch {}
			await runViewer(ctx, "Reports Index");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
	});
}
