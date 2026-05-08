// ABOUTME: Soundcn Extension — Browser-based sound viewer with Pi lifecycle hook notifications.
// ABOUTME: /sounds command opens browser UI to browse, preview, and assign sounds from soundcn.xyz to Pi events.

// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { openBrowser } from "./lib/viewer-server.ts";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateSoundsViewerHTML, type CatalogItem } from "./lib/sounds/sounds-viewer-html.ts";
import {
	loadConfig, saveConfig, getActiveAssignmentCount, getAssignedSoundNames,
	type SoundsConfig, type HookName, ALL_HOOKS, HOOK_DISPLAY_NAMES,
} from "./lib/sounds/sounds-config.ts";
import {
	ensureCachedImage,
	readCachedImageEntry,
} from "./lib/sounds/sounds-image-cache.ts";
import {
	playInstalledSound, installSound, uninstallSound, isSoundInstalled,
	installSoundFromUrl, cleanupAllPlayback,
} from "./lib/sounds/sounds-player.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";

// ── Types ────────────────────────────────────────────────────────────

interface SoundsViewerResult {
	action: "applied" | "cancelled";
	assignments?: Record<string, string>;
	volume?: number;
	enabled?: boolean;
}

// ── Catalog Fetching ─────────────────────────────────────────────────

let cachedCatalog: CatalogItem[] | null = null;

function getCatalogImageUrl(item: any): string | undefined {
	const direct = item?.imageUrl || item?.image || item?.thumbnail || item?.artwork;
	if (typeof direct === "string" && /^https?:\/\//.test(direct)) return direct;
	return undefined;
}

async function fetchCatalog(): Promise<CatalogItem[]> {
	if (cachedCatalog) return cachedCatalog;

	const resp = await fetch(
		"https://raw.githubusercontent.com/ruizrica/soundcn/main/registry.json",
	);
	if (!resp.ok) throw new Error(`Failed to fetch catalog: ${resp.status}`);

	const data = await resp.json();
	const items: CatalogItem[] = (data.items || [])
		.filter((item: any) => item.type === "registry:block")
		.map((item: any) => ({
			name: item.name,
			title: item.title || item.name,
			description: item.description || "",
			categories: item.categories || [],
			author: item.author,
			imageUrl: getCatalogImageUrl(item),
			meta: item.meta,
		}));

	cachedCatalog = items;
	return items;
}

// ── HTTP Server ──────────────────────────────────────────────────────

function startSoundsServer(
	catalog: CatalogItem[],
	config: SoundsConfig,
): Promise<{ port: number; server: Server; waitForResult: () => Promise<SoundsViewerResult> }> {
	return new Promise((resolveSetup) => {
		let resolveResult: (result: SoundsViewerResult) => void;
		const resultPromise = new Promise<SoundsViewerResult>((res) => {
			resolveResult = res;
		});
		let lastHeartbeat = Date.now();
		const heartbeatCheck = setInterval(() => {
			if (Date.now() - lastHeartbeat > 15_000) {
				clearInterval(heartbeatCheck);
				resolveResult!({ action: "cancelled" });
			}
		}, 5_000);

		const catalogByName = new Map(catalog.map((item) => [item.name, item]));
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

			// Serve main HTML page
			if (req.method === "GET" && url.pathname === "/") {
				const port = (server.address() as any)?.port || 0;
				res.setHeader("Cache-Control", "no-store");
				const html = generateSoundsViewerHTML({ catalog, config, port });
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			// Serve logo
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

			// Serve cached catalog images
			if (req.method === "GET" && url.pathname.startsWith("/api/image/")) {
				const key = decodeURIComponent(url.pathname.slice("/api/image/".length));
				if (!/^[a-f0-9]{24}$/.test(key)) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid image key" }));
					return;
				}
				const cached = readCachedImageEntry(key);
				if (!cached || !existsSync(cached.filePath)) {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Image not cached" }));
					return;
				}
				try {
					const imageData = readFileSync(cached.filePath);
					res.writeHead(200, {
						"Content-Type": cached.contentType,
						"Cache-Control": "public, max-age=604800, immutable",
					});
					res.end(imageData);
				} catch (err: any) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: err?.message || "Failed to read cached image" }));
				}
				return;
			}

			if (req.method === "GET" && url.pathname.startsWith("/api/image-by-sound/")) {
				const name = decodeURIComponent(url.pathname.slice("/api/image-by-sound/".length));
				const item = catalogByName.get(name);
				if (!item?.imageUrl) {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "No image configured for sound" }));
					return;
				}
				(async () => {
					try {
						const cached = await ensureCachedImage(item.imageUrl!);
						res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
						res.end(JSON.stringify({ key: cached.key, url: `/api/image/${cached.key}` }));
					} catch (err: any) {
						res.writeHead(502, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err?.message || "Failed to cache image" }));
					}
				})();
				return;
			}

			// Heartbeat keep-alive
			if (req.method === "POST" && url.pathname === "/heartbeat") {
				lastHeartbeat = Date.now();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				return;
			}

			// CORS proxy: fetch sound data from soundcn.xyz server-side
			if (req.method === "GET" && url.pathname.startsWith("/api/sound/")) {
				const name = decodeURIComponent(url.pathname.slice("/api/sound/".length));
				if (!name || name.includes("/") || name.includes("..")) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid sound name" }));
					return;
				}
				(async () => {
					try {
						const upstream = await fetch(`https://soundcn.xyz/r/${encodeURIComponent(name)}.json`);
						if (!upstream.ok) {
							res.writeHead(upstream.status, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: `Upstream returned ${upstream.status}` }));
							return;
						}
						const body = await upstream.text();
						res.writeHead(200, {
							"Content-Type": "application/json",
							"Cache-Control": "public, max-age=3600",
						});
						res.end(body);
					} catch (err: any) {
						res.writeHead(502, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err?.message || "Proxy fetch failed" }));
					}
				})();
				return;
			}

			// Handle result submission (apply/cancel)
			if (req.method === "POST" && url.pathname === "/result") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
						resolveResult!({
							action: data.action || "cancelled",
							assignments: data.assignments,
							volume: data.volume,
							enabled: data.enabled,
						});
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Invalid JSON" }));
					}
				});
				return;
			}

			// Install sound (save base64 data to cache)
			if (req.method === "POST" && url.pathname === "/install") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						if (data.name && data.dataUri) {
							installSound(data.name, data.dataUri);
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true }));
						} else {
							res.writeHead(400, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: "Missing name or dataUri" }));
						}
					} catch (err: any) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err?.message || "Install failed" }));
					}
				});
				return;
			}

			// Uninstall sound (remove from cache)
			if (req.method === "POST" && url.pathname === "/uninstall") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						if (data.name) {
							uninstallSound(data.name);
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true }));
						} else {
							res.writeHead(400, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: "Missing name" }));
						}
					} catch (err: any) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err?.message || "Uninstall failed" }));
					}
				});
				return;
			}

			// Install sound from URL (for custom sounds)
			if (req.method === "POST" && url.pathname === "/install-from-url") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", async () => {
					try {
						const data = JSON.parse(body);
						if (data.name && data.url) {
							await installSoundFromUrl(data.name, data.url);
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true }));
						} else {
							res.writeHead(400, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: "Missing name or url" }));
						}
					} catch (err: any) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err?.message || "Install from URL failed" }));
					}
				});
				return;
			}

			// Proxy audio URL (for custom sounds — avoids CORS in browser)
			if (req.method === "POST" && url.pathname === "/api/proxy-audio") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", async () => {
					try {
						const data = JSON.parse(body);
						if (!data.url) {
							res.writeHead(400, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: "Missing url" }));
							return;
						}
						const upstream = await fetch(data.url);
						if (!upstream.ok) {
							res.writeHead(upstream.status, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: `Upstream returned ${upstream.status}` }));
							return;
						}
						const buf = Buffer.from(await upstream.arrayBuffer());
						const base64 = buf.toString("base64");
						const mime = upstream.headers.get("content-type") || "audio/mpeg";
						const dataUri = `data:${mime};base64,${base64}`;
						res.writeHead(200, {
							"Content-Type": "application/json",
							"Cache-Control": "public, max-age=3600",
						});
						res.end(JSON.stringify({ dataUri }));
					} catch (err: any) {
						res.writeHead(502, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err?.message || "Proxy audio failed" }));
					}
				});
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



// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	let activeSession: any | null = null;
	let currentConfig: SoundsConfig = loadConfig();

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

	function updateStatus(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		if ((globalThis as any).__piSummaryModeActive) return;
		const count = getActiveAssignmentCount(currentConfig);
		if (!currentConfig.enabled) {
			ctx.ui.setStatus("sounds", "🔇 Sounds OFF");
		} else if (count > 0) {
			ctx.ui.setStatus("sounds", `🔊 ${count} hook${count !== 1 ? "s" : ""}`);
		} else {
			ctx.ui.setStatus("sounds", "🔊 Sounds");
		}
	}

	// ── Core viewer logic ────────────────────────────────────────────

	async function runSoundsViewer(ctx: ExtensionContext): Promise<SoundsViewerResult> {
		cleanupServer();

		// Fetch catalog
		ctx.ui.notify("Loading sound catalog from soundcn.xyz...", "info");
		let catalog: CatalogItem[];
		try {
			catalog = await fetchCatalog();
		} catch (err: any) {
			ctx.ui.notify(`Failed to fetch catalog: ${err.message}`, "error");
			return { action: "cancelled" };
		}

		ctx.ui.notify(`Loaded ${catalog.length} sounds. Opening browser...`, "info");

		// Start server
		const { port, server, waitForResult } = await startSoundsServer(catalog, currentConfig);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "sounds" as const,
			title: "Sound Browser",
			url,
			server,
			onClose: () => { activeServer = null; activeSession = null; },
		};
		registerActiveViewer(activeSession);

		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		try {
			const result = await waitForResult();

			// Apply config if user clicked "Apply"
			if (result.action === "applied" && result.assignments) {
				currentConfig = {
					assignments: result.assignments as Partial<Record<HookName, string>>,
					volume: typeof result.volume === "number" ? result.volume : currentConfig.volume,
					enabled: typeof result.enabled === "boolean" ? result.enabled : currentConfig.enabled,
					customSounds: currentConfig.customSounds,
				};
				saveConfig(currentConfig);
				updateStatus(ctx);
			}

			return result;
		} finally {
			cleanupServer();
		}
	}

	// ── /sounds command ──────────────────────────────────────────────

	pi.registerCommand("sounds", {
		description: "Open the sound browser, or use: /sounds toggle | /sounds status",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/sounds requires interactive mode", "error");
				return;
			}

			const arg = args.trim().toLowerCase();

			// /sounds toggle
			if (arg === "toggle") {
				currentConfig = { ...currentConfig, enabled: !currentConfig.enabled };
				saveConfig(currentConfig);
				updateStatus(ctx);
				ctx.ui.notify(
					currentConfig.enabled ? "🔊 Sounds enabled" : "🔇 Sounds disabled",
					"info",
				);
				return;
			}

			// /sounds status
			if (arg === "status") {
				const count = getActiveAssignmentCount(currentConfig);
				const lines: string[] = [
					`Sounds: ${currentConfig.enabled ? "Enabled" : "Disabled"}`,
					`Volume: ${Math.round(currentConfig.volume * 100)}%`,
					`Hooks: ${count}/${ALL_HOOKS.length} assigned`,
				];
				for (const hook of ALL_HOOKS) {
					const sound = currentConfig.assignments[hook];
					const label = HOOK_DISPLAY_NAMES[hook];
					lines.push(`  ${label}: ${sound || "(none)"}`);
				}
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			// /sounds — open browser
			const result = await runSoundsViewer(ctx);
			if (result.action === "applied") {
				const count = getActiveAssignmentCount(currentConfig);
				ctx.ui.notify(`✓ Sound config applied — ${count} hook${count !== 1 ? "s" : ""} assigned`, "info");
			}
		},
	});

	// ── show_sounds tool ─────────────────────────────────────────────

	pi.registerTool({
		name: "show_sounds",
		label: "Show Sounds",
		description:
			"Open the sound browser to let the user browse, preview, and assign sounds from soundcn.xyz to Pi lifecycle hooks like task completion, agent start, tool calls, etc.",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text" as const, text: "Sound browser requires interactive mode." }],
				};
			}

			const result = await runSoundsViewer(ctx);

			if (result.action === "applied") {
				const count = getActiveAssignmentCount(currentConfig);
				const assigned = Object.entries(currentConfig.assignments)
					.map(([hook, sound]) => `  ${HOOK_DISPLAY_NAMES[hook as HookName]}: ${sound}`)
					.join("\n");
				return {
					content: [{
						type: "text" as const,
						text: `Sound config applied. ${count} hook${count !== 1 ? "s" : ""} assigned:\n${assigned || "  (none)"}`,
					}],
					details: { action: "applied", config: currentConfig },
				};
			}

			return {
				content: [{ type: "text" as const, text: "Sound browser closed without applying changes." }],
				details: { action: "cancelled" },
			};
		},

		renderCall(_args, theme) {
			const text = theme.fg("toolTitle", theme.bold("show_sounds ")) +
				theme.fg("dim", "Opening sound browser...");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.action === "applied") {
				const count = getActiveAssignmentCount(details.config || {});
				return new Text(outputLine(theme, "success", `Sound config applied — ${count} hooks`), 0, 0);
			}
			return new Text(outputLine(theme, "warning", "Sound browser closed"), 0, 0);
		},
	});

	// ── Lifecycle Hook Sound Playback ────────────────────────────────

	const CLAUDE_DUPLICATE_LIFECYCLE_HOOKS = new Set<HookName>([
		"turn_start",
		"turn_end",
		"session_start",
	]);

	function isClaudeContext(ctx?: ExtensionContext): boolean {
		const model = ctx?.model;
		if (!model) return false;
		return model.provider === "anthropic" && /(^|\/)claude[-\w.]+/i.test(model.id);
	}

	function shouldSuppressPiSoundForClaude(hookName: HookName, ctx?: ExtensionContext): boolean {
		return CLAUDE_DUPLICATE_LIFECYCLE_HOOKS.has(hookName) && isClaudeContext(ctx);
	}

	function playHookSound(hookName: HookName, ctx?: ExtensionContext): void {
		if (!currentConfig.enabled) return;
		if (shouldSuppressPiSoundForClaude(hookName, ctx)) return;
		const soundName = currentConfig.assignments[hookName];
		if (!soundName) return;
		if (!isSoundInstalled(soundName)) return;
		// Fire and forget — don't block the hook
		playInstalledSound(soundName, currentConfig.volume).catch(() => {});
	}

	pi.on("agent_end", async (_event, ctx) => {
		playHookSound("agent_end", ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		playHookSound("agent_start", ctx);
	});

	pi.on("tool_execution_start", async (_event, ctx) => {
		playHookSound("tool_execution_start", ctx);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		playHookSound("tool_execution_end", ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		playHookSound("turn_start", ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		playHookSound("turn_end", ctx);
	});

	pi.on("session_compact", async (_event, ctx) => {
		playHookSound("session_compact", ctx);
	});

	// ── Session Lifecycle ────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		currentConfig = loadConfig();
		updateStatus(ctx);

		// Play session start sound if assigned. Suppress Pi's duplicate
		// lifecycle sound for Claude models because Claude Code hooks handle it.
		playHookSound("session_start", ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
		cleanupAllPlayback();
	});
}
