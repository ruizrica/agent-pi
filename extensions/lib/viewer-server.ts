// ABOUTME: Shared viewer HTTP server factory — eliminates duplicated server boilerplate across viewer extensions.
// ABOUTME: Provides createViewerServer() for standard CORS, logo, HTML serving, and openBrowser() helper.
// ABOUTME: Now supports routing to Commander when available.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import * as net from "node:net";

// Commander MCP connection check state
let commanderAvailableCache: boolean | null = null;
let commanderCacheTime = 0;
const COMMANDER_CACHE_TTL = 5000; // 5 second cache

export interface ViewerRoute {
	method: "GET" | "POST";
	path: string;
	handler: (req: IncomingMessage, res: ServerResponse, url: URL) => void | Promise<void>;
}

export interface ViewerServerConfig {
	/** Function that generates the HTML, called with the port number */
	getHtml: (port: number) => string;
	/** Additional custom routes beyond / and /logo.png */
	routes?: ViewerRoute[];
	/** Called when POST /result is received or server closes */
	onResult?: (body: any) => void;
	/** Fallback handler for requests not matched by exact routes (e.g., prefix-based routing). Return true if handled. */
	fallbackHandler?: (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;
	/** Listen on 0.0.0.0 instead of 127.0.0.1 (for LAN-accessible servers like web-chat) */
	listenAll?: boolean;
}

export interface ViewerServerHandle {
	port: number;
	server: Server;
	waitForResult: () => Promise<any>;
}

/**
 * Create a shared HTTP server for viewer extensions.
 * Handles CORS, logo serving, HTML serving, and custom routes.
 *
 * Features:
 * - Automatic CORS headers on every response
 * - OPTIONS → 204
 * - GET / → serves HTML from getHtml(port)
 * - GET /logo.png → serves logo from assets/agent-logo.png
 * - POST /result → parses JSON, calls onResult, resolves promise
 * - Custom routes from config.routes
 * - 404 fallback
 * - Listens on random port at 127.0.0.1
 * - server.on('close') also resolves the promise
 */
export function createViewerServer(config: ViewerServerConfig): Promise<ViewerServerHandle> {
	return new Promise((resolveSetup) => {
		let resolveResult: (result: any) => void;
		let resultResolved = false;
		const resultPromise = new Promise<any>((res) => {
			resolveResult = res;
		});

		// Build a map of custom routes for quick lookup
		const routeMap = new Map<string, ViewerRoute[]>();
		if (config.routes) {
			for (const route of config.routes) {
				const key = `${route.method} ${route.path}`;
				if (!routeMap.has(key)) {
					routeMap.set(key, []);
				}
				routeMap.get(key)!.push(route);
			}
		}

		const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
			// Set CORS headers on every response
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");

			// OPTIONS → 204
			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || "/", "http://localhost");
			const method = req.method || "GET";
			const routeKey = `${method} ${url.pathname}`;

			// GET / → serve HTML
			if (method === "GET" && url.pathname === "/") {
				const port = (server.address() as any)?.port || 0;
				const html = config.getHtml(port);
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			// GET /logo.png → serve logo
			if (method === "GET" && url.pathname === "/logo.png") {
				try {
					const logoPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "agent-logo.png");
					const logoData = readFileSync(logoPath);
					res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
					res.end(logoData);
				} catch {
					res.writeHead(404);
					res.end();
				}
				return;
			}

			// POST /result → parse JSON and resolve promise
			if (method === "POST" && url.pathname === "/result") {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk;
				});
				req.on("end", async () => {
					try {
						const data = body.trim() ? JSON.parse(body) : {};
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));

						if (!resultResolved) {
							resultResolved = true;
							if (config.onResult) {
								config.onResult(data);
							}
							resolveResult(data);
						}
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Invalid JSON" }));
					}
				});
				return;
			}

			// Check custom routes
			if (routeMap.has(routeKey)) {
				const routes = routeMap.get(routeKey)!;
				for (const route of routes) {
					try {
						await route.handler(req, res, url);
						return;
					} catch (err) {
						// Continue to next route on error
					}
				}
			}

			// Fallback handler for prefix-based or dynamic routes
			if (config.fallbackHandler) {
				const handled = await config.fallbackHandler(req, res, url);
				if (handled) return;
			}

			// 404 fallback
			res.writeHead(404);
			res.end("Not found");
		});

		// server.on('close') should also resolve the promise
		server.on("close", () => {
			if (!resultResolved) {
				resultResolved = true;
				resolveResult(undefined);
			}
		});

		server.listen(0, config.listenAll ? "0.0.0.0" : "127.0.0.1", () => {
			const addr = server.address() as any;
			resolveSetup({
				port: addr.port,
				server,
				waitForResult: () => resultPromise,
			});
		});
	});
}

/**
 * Cross-platform browser opener using execSync.
 * Tries: open (macOS) → xdg-open (Linux) → start (Windows)
 */
export function openBrowser(url: string): void {
	try {
		execSync(`open "${url}"`, { stdio: "ignore" });
	} catch {
		try {
			execSync(`xdg-open "${url}"`, { stdio: "ignore" });
		} catch {
			try {
				execSync(`start "${url}"`, { stdio: "ignore" });
			} catch {
				// Silently fail — URL is logged anyway
			}
		}
	}
}
