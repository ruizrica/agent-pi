// ABOUTME: Persisted reports browser for plans, questions, specs, and completion reports.
// ABOUTME: Opens a search-first /reports view with recent category sections and full-screen tables.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateReportsViewerHTML } from "./lib/reports-viewer-html.ts";
import { loadReportIndex } from "./lib/report-index.ts";

function openBrowser(url: string): void {
	try { execSync(`open "${url}"`, { stdio: "ignore" }); } catch {
		try { execSync(`xdg-open "${url}"`, { stdio: "ignore" }); } catch {
			try { execSync(`start "${url}"`, { stdio: "ignore" }); } catch {}
		}
	}
}

function quoteArg(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function openOriginalReport(entry: any): void {
	const target = entry.viewerPath || entry.sourcePath;
	if (!target) throw new Error("No source path available for this report");
	const path = String(target);

	if (process.platform === "darwin") {
		if (entry.category === "spec") {
			execSync(`open -na Terminal --args bash -lc ${quoteArg(`cd ${quoteArg(process.cwd())} && pi /spec ${quoteArg(path)}`)}`, { stdio: "ignore", shell: true });
		} else {
			execSync(`open -na Terminal --args bash -lc ${quoteArg(`cd ${quoteArg(process.cwd())} && pi /show-file ${quoteArg(path)}`)}`, { stdio: "ignore", shell: true });
		}
		return;
	}

	if (entry.category === "spec") {
		execSync(`bash -lc ${quoteArg(`cd ${quoteArg(process.cwd())} && pi /spec ${quoteArg(path)} >/dev/null 2>&1 &`)}`, { stdio: "ignore", shell: true });
	} else {
		execSync(`bash -lc ${quoteArg(`cd ${quoteArg(process.cwd())} && pi /show-file ${quoteArg(path)} >/dev/null 2>&1 &`)}`, { stdio: "ignore", shell: true });
	}
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
