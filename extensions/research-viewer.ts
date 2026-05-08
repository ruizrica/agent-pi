// ABOUTME: Research sessions browser for autoresearch lifecycle tracking.
// ABOUTME: Opens a web viewer to browse, search, and resume saved research sessions.
// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";
import type { Server } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateResearchViewerHTML } from "./lib/viewers/research-viewer-html.ts";
import { isCommanderAvailable, openInCommander } from "./lib/commander/commander-viewer.ts";
import {
	listResearchSessions,
	loadResearchSession,
	listResearchSessionsFull,
	type ResearchSessionSummary,
} from "./lib/research-session.ts";

async function startResearchServer(title: string): Promise<{ port: number; server: Server; waitForResult: () => Promise<void> }> {
	let resolveResult: () => void;
	const resultPromise = new Promise<void>((res) => { resolveResult = res; });
	let lastHeartbeat = Date.now();
	const heartbeatCheck = setInterval(() => {
		if (Date.now() - lastHeartbeat > 15_000) {
			clearInterval(heartbeatCheck);
			resolveResult!();
		}
	}, 5_000);

	const routes = [
		{
			method: "POST" as const,
			path: "/heartbeat",
			handler: (req: any, res: any) => {
				lastHeartbeat = Date.now();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
			},
		},
		{
			method: "GET" as const,
			path: "/api/sessions",
			handler: (req: any, res: any) => {
				const sessions = listResearchSessions();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(sessions));
			},
		},
		{
			method: "GET" as const,
			path: "/api/sessions/:id",
			handler: (req: any, res: any, url: any) => {
				const pathname = url.pathname;
				if (!pathname.startsWith("/api/sessions/")) {
					res.writeHead(404);
					res.end();
					return;
				}
				const id = decodeURIComponent(pathname.slice("/api/sessions/".length));
				const session = loadResearchSession(id);
				if (session) {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(session));
				} else {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Session not found" }));
				}
			},
		},
	];

	const handle = await createViewerServer({
		getHtml: (port) => {
			const sessions = listResearchSessions();
			return generateResearchViewerHTML({ title, port, sessions });
		},
		routes,
		onResult: () => {
			resolveResult!();
		},
	});

	return {
		port: handle.port,
		server: handle.server,
		waitForResult: async () => {
			await handle.waitForResult();
			clearInterval(heartbeatCheck);
		},
	};
}

const ShowResearchParams = Type.Object({
	title: Type.Optional(Type.String({ description: "Title for the research browser view" })),
	session_id: Type.Optional(Type.String({ description: "Open directly to a specific session's detail view" })),
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

		// Try Commander first (read-only view)
		if (isCommanderAvailable()) {
			const sessions = listResearchSessions();
			const sessionsSummary = sessions.length > 0
				? sessions.slice(0, 20).map((s: ResearchSessionSummary) =>
					`- **${s.goal || s.id}** — ${s.status || "unknown"} (${s.iterationCount ?? 0} iterations)`
				).join("\n")
				: "_No research sessions found._";
			const markdownContent = [
				`# ${title}`,
				"",
				`**${sessions.length} session(s)**`,
				"",
				sessionsSummary,
			].join("\n");

			const opened = await openInCommander(
				{
					content: markdownContent,
					title,
					reportType: "research",
					mode: "view",
					format: "markdown",
				},
				ctx,
			);

			if (opened) return;
			// Fall through to browser if Commander unavailable or failed
		}

		const { port, server, waitForResult } = await startResearchServer(title);
		activeServer = server;
		const url = `http://127.0.0.1:${port}`;
		openBrowser(url);
		if (ctx.hasUI) ctx.ui.notify(`Research browser opened at ${url}`, "info");
		try {
			await waitForResult();
		} finally {
			cleanupServer();
		}
	}

	// ── show_research tool ───────────────────────────────────────────

	pi.registerTool({
		name: "show_research",
		label: "Show Research",
		description:
			"Open the research sessions browser. Browse, search, and resume saved autoresearch sessions.\n\n" +
			"Each session tracks the full lifecycle: goal → clarifying questions → plan → research iterations → findings → implementation.",
		parameters: ShowResearchParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const p = params as { title?: string; session_id?: string };
			await runViewer(ctx, p.title || "Research Sessions");
			return { content: [{ type: "text" as const, text: "Research browser closed." }] };
		},
		renderCall(args, theme) {
			const text = theme.fg("toolTitle", theme.bold("show_research ")) + theme.fg("accent", (args as any).title || "Research Sessions");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},
	});

	// ── /research command ────────────────────────────────────────────

	pi.registerCommand("research", {
		description: "Open the research sessions browser in the web viewer",
		handler: async (_args, ctx) => {
			await runViewer(ctx, "Research Sessions");
		},
	});

	// ── Lifecycle ────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
	});
}
