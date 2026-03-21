// ABOUTME: Web Chat Extension — opens a LAN-accessible chat interface for interacting with the Pi agent from a phone or other device.
// ABOUTME: Spawns Pi subprocess per message, bridges JSONL events to SSE, serves a mobile-first chat UI on 0.0.0.0.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { mkdirSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { homedir } from "node:os";
import { randomInt } from "node:crypto";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateWebChatHTML } from "./lib/web-chat-html.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: string;
	toolCalls?: string[];
}

interface SSEClient {
	id: number;
	res: ServerResponse;
}

// ── LAN IP Detection ─────────────────────────────────────────────────

function getLanIP(): string {
	const nets = networkInterfaces();
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] || []) {
			// Skip loopback and non-IPv4
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	return "0.0.0.0";
}

// ── PIN Authentication ───────────────────────────────────────────────

function generatePIN(): string {
	return String(randomInt(1000, 9999));
}

// ── Logo Loading ─────────────────────────────────────────────────────

function loadLogoBase64(): string {
	try {
		const extDir = dirname(fileURLToPath(import.meta.url));
		const logoPath = join(extDir, "..", "agent-logo.png");
		if (existsSync(logoPath)) {
			const buf = readFileSync(logoPath);
			return `data:image/png;base64,${buf.toString("base64")}`;
		}
	} catch {}
	return "";
}

// ── Session File Management ──────────────────────────────────────────

function getSessionDir(): string {
	const dir = join(homedir(), ".pi", "agent", "sessions", "web-chat");
	mkdirSync(dir, { recursive: true });
	return dir;
}

function getSessionFile(sessionId: string): string {
	return join(getSessionDir(), `chat-${sessionId}.jsonl`);
}

// ── SSE Helpers ──────────────────────────────────────────────────────

function sendSSE(client: SSEClient, event: string, data: any): void {
	try {
		client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	} catch {}
}

function broadcastSSE(clients: Map<number, SSEClient>, event: string, data: any): void {
	for (const client of clients.values()) {
		sendSSE(client, event, data);
	}
}

// ── Directory Discovery ──────────────────────────────────────────────

interface ProjectDir {
	path: string;
	name: string;
	hasGit: boolean;
	hasPackageJson: boolean;
}

function discoverProjects(): ProjectDir[] {
	const home = homedir();
	const results: ProjectDir[] = [];
	const seen = new Set<string>();

	function addDir(dirPath: string): void {
		if (seen.has(dirPath)) return;
		try {
			const s = statSync(dirPath);
			if (!s.isDirectory()) return;
		} catch { return; }
		seen.add(dirPath);

		const hasGit = existsSync(join(dirPath, ".git"));
		const hasPackageJson = existsSync(join(dirPath, "package.json"));
		results.push({
			path: dirPath,
			name: basename(dirPath),
			hasGit,
			hasPackageJson,
		});
	}

	// Scan known dev parent directories for subdirectories
	const devParents = [
		join(home, "Workshop", "GitHub"),
		join(home, "Workshop"),
		join(home, "Projects"),
		join(home, "Developer"),
		join(home, "Code"),
		join(home, "dev"),
		join(home, "repos"),
		join(home, "src"),
		join(home, "Sites"),
		join(home, "Desktop"),
	];

	for (const parent of devParents) {
		if (!existsSync(parent)) continue;
		try {
			const entries = readdirSync(parent, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (entry.name.startsWith(".")) continue;
				const full = join(parent, entry.name);
				// Only include directories that look like projects (have .git or package.json)
				const hasGit = existsSync(join(full, ".git"));
				const hasPkg = existsSync(join(full, "package.json"));
				const hasCargo = existsSync(join(full, "Cargo.toml"));
				const hasGo = existsSync(join(full, "go.mod"));
				const hasPy = existsSync(join(full, "pyproject.toml")) || existsSync(join(full, "setup.py"));
				if (hasGit || hasPkg || hasCargo || hasGo || hasPy) {
					addDir(full);
				}
			}
		} catch {}
	}

	// Also scan ~/ for top-level git repos (depth 1)
	try {
		const homeEntries = readdirSync(home, { withFileTypes: true });
		for (const entry of homeEntries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".")) continue;
			const full = join(home, entry.name);
			if (existsSync(join(full, ".git"))) {
				addDir(full);
			}
		}
	} catch {}

	// Sort: git repos first, then alphabetically
	results.sort((a, b) => {
		if (a.hasGit !== b.hasGit) return a.hasGit ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return results;
}

// ── Agent Process Manager ────────────────────────────────────────────

class AgentBridge {
	private proc: ChildProcess | null = null;
	private sessionFile: string;
	private busy = false;
	private history: ChatMessage[] = [];
	private clients: Map<number, SSEClient>;
	private textBuffer: string[] = [];
	private toolNames: string[] = [];
	private cwd: string;

	constructor(sessionId: string, clients: Map<number, SSEClient>, cwd?: string) {
		this.sessionFile = getSessionFile(sessionId);
		this.clients = clients;
		this.cwd = cwd || process.cwd();
	}

	isBusy(): boolean {
		return this.busy;
	}

	getCwd(): string {
		return this.cwd;
	}

	setCwd(newCwd: string): void {
		this.cwd = newCwd;
		// Reset conversation when switching directories
		if (this.proc) {
			try { this.proc.kill(); } catch {}
			this.proc = null;
		}
		this.busy = false;
		this.history = [];
		const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.sessionFile = getSessionFile(newId);
		broadcastSSE(this.clients, "dir_changed", { cwd: newCwd, name: basename(newCwd) });
		broadcastSSE(this.clients, "reset", { ok: true });
	}

	getHistory(): ChatMessage[] {
		return this.history;
	}

	reset(): void {
		if (this.proc) {
			try { this.proc.kill(); } catch {}
			this.proc = null;
		}
		this.busy = false;
		this.history = [];
		// Generate new session file
		const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.sessionFile = getSessionFile(newId);
		broadcastSSE(this.clients, "reset", { ok: true });
	}

	async sendMessage(message: string): Promise<void> {
		if (this.busy) {
			broadcastSSE(this.clients, "error_event", { message: "Agent is busy. Wait for the current response to finish." });
			return;
		}

		this.busy = true;
		this.textBuffer = [];
		this.toolNames = [];

		// Add user message to history
		const userMsg: ChatMessage = {
			role: "user",
			content: message,
			timestamp: new Date().toISOString(),
		};
		this.history.push(userMsg);
		broadcastSSE(this.clients, "user_message", userMsg);
		broadcastSSE(this.clients, "status", { busy: true });

		const extDir = fileURLToPath(new URL(".", import.meta.url));
		const tasksExt = join(extDir, "tasks.ts");
		const footerExt = join(extDir, "footer.ts");
		const memoryCycleExt = join(extDir, "memory-cycle.ts");

		// Check if commander is available
		const commanderAvail = !!(globalThis as any).__piCommanderClient;
		const extensions = ["-e", tasksExt, "-e", footerExt, "-e", memoryCycleExt];
		if (commanderAvail) {
			const commanderExt = join(extDir, "commander-mcp.ts");
			extensions.push("-e", commanderExt);
		}

		const args = [
			"--mode", "json",
			"-p",
			"--session", this.sessionFile,
			"--no-extensions",
			...extensions,
			"--tools", "read,bash,edit,write,grep,find,ls",
			"--thinking", "off",
			message,
		];

		return new Promise<void>((resolve) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				cwd: this.cwd,
				env: { ...process.env, PI_SUBAGENT: "1" },
			});

			this.proc = proc;
			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					this.processLine(line);
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				// Stderr is informational, ignore silently
			});

			proc.on("close", (code) => {
				if (buffer.trim()) this.processLine(buffer);
				this.proc = null;
				this.busy = false;

				// Finalize assistant message
				const fullText = this.textBuffer.join("");
				if (fullText) {
					const assistantMsg: ChatMessage = {
						role: "assistant",
						content: fullText,
						timestamp: new Date().toISOString(),
						toolCalls: this.toolNames.length > 0 ? this.toolNames : undefined,
					};
					this.history.push(assistantMsg);
				}

				broadcastSSE(this.clients, "done", {
					code,
					toolCount: this.toolNames.length,
				});
				broadcastSSE(this.clients, "status", { busy: false });
				resolve();
			});

			proc.on("error", (err) => {
				this.proc = null;
				this.busy = false;
				broadcastSSE(this.clients, "error_event", { message: err.message });
				broadcastSSE(this.clients, "status", { busy: false });
				resolve();
			});
		});
	}

	private processLine(line: string): void {
		if (!line.trim()) return;
		try {
			const event = JSON.parse(line);
			const type = event.type;

			if (type === "message_update") {
				const delta = event.assistantMessageEvent;
				if (delta?.type === "text_delta") {
					const text = delta.delta || "";
					this.textBuffer.push(text);
					broadcastSSE(this.clients, "text_delta", { text });
				}
			} else if (type === "tool_execution_start") {
				const toolName = event.toolName || event.tool_name || "tool";
				this.toolNames.push(toolName);
				broadcastSSE(this.clients, "tool_start", { name: toolName });
			} else if (type === "tool_execution_end") {
				broadcastSSE(this.clients, "tool_end", {});
			}
		} catch {}
	}

	destroy(): void {
		if (this.proc) {
			try { this.proc.kill(); } catch {}
			this.proc = null;
		}
		this.busy = false;
	}
}

// ── HTTP Server ──────────────────────────────────────────────────────

function startChatServer(
	pin: string,
	onShutdown: () => void,
): Promise<{ port: number; server: Server }> {
	return new Promise((resolve) => {
		const sseClients = new Map<number, SSEClient>();
		let clientIdCounter = 0;
		const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const bridge = new AgentBridge(sessionId, sseClients);
		const logoDataUri = loadLogoBase64();
		const authedTokens = new Set<string>();

		// Generate a session token for authenticated clients
		function makeToken(): string {
			const t = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
			authedTokens.add(t);
			return t;
		}

		// Check if request is authenticated (via cookie or query param)
		function isAuthed(req: IncomingMessage, url: URL): boolean {
			// Check cookie
			const cookies = req.headers.cookie || "";
			const match = cookies.match(/pi_token=([^;]+)/);
			if (match && authedTokens.has(match[1])) return true;
			// Check query param
			const qToken = url.searchParams.get("token");
			if (qToken && authedTokens.has(qToken)) return true;
			return false;
		}

		// Auto-shutdown timer: close server if no clients for 2 minutes
		let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
		function resetShutdownTimer() {
			if (shutdownTimer) clearTimeout(shutdownTimer);
			shutdownTimer = setTimeout(() => {
				if (sseClients.size === 0) {
					try { server.close(); } catch {}
					bridge.destroy();
					onShutdown();
				}
			}, 120_000); // 2 minutes
		}

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			// CORS
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");

			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || "/", `http://localhost`);

			// ── Favicon ──────────────────────────────────────────
			if (url.pathname === "/favicon.ico") {
				res.writeHead(204);
				res.end();
				return;
			}

			// ── PIN Auth Endpoint ────────────────────────────────
			if (req.method === "POST" && url.pathname === "/auth") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						if (String(data.pin) === pin) {
							const token = makeToken();
							res.setHeader("Set-Cookie", `pi_token=${token}; Path=/; HttpOnly; SameSite=Strict`);
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true, token }));
						} else {
							res.writeHead(401, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: false, error: "Invalid PIN" }));
						}
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: "Bad request" }));
					}
				});
				return;
			}

			// ── Chat UI (no auth required — PIN gate is client-side) ──
			if (req.method === "GET" && url.pathname === "/") {
				res.setHeader("Cache-Control", "no-store");
				const html = generateWebChatHTML({ port: (server.address() as any)?.port || 0, logoDataUri });
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			// ── All API endpoints below require auth ─────────────
			if (!isAuthed(req, url)) {
				res.writeHead(401, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Unauthorized" }));
				return;
			}

			// ── SSE Events Stream ────────────────────────────────
			if (req.method === "GET" && url.pathname === "/events") {
				resetShutdownTimer();
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Connection": "keep-alive",
					"X-Accel-Buffering": "no",
				});

				const clientId = ++clientIdCounter;
				const client: SSEClient = { id: clientId, res };
				sseClients.set(clientId, client);

				// Send initial state
				sendSSE(client, "connected", {
					sessionId,
					busy: bridge.isBusy(),
					historyCount: bridge.getHistory().length,
					cwd: bridge.getCwd(),
					cwdName: basename(bridge.getCwd()),
				});

				// Send existing history
				for (const msg of bridge.getHistory()) {
					sendSSE(client, msg.role === "user" ? "user_message" : "assistant_message", msg);
				}

				// Keep-alive ping every 30s
				const pingInterval = setInterval(() => {
					try { res.write(":ping\n\n"); } catch {}
				}, 30000);

				req.on("close", () => {
					clearInterval(pingInterval);
					sseClients.delete(clientId);
					// Start shutdown timer when last client disconnects
					if (sseClients.size === 0) resetShutdownTimer();
				});

				return;
			}

			// ── Send Message ─────────────────────────────────────
			if (req.method === "POST" && url.pathname === "/send") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const message = String(data.message || "").trim();
						if (!message) {
							res.writeHead(400, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: false, error: "Empty message" }));
							return;
						}
						bridge.sendMessage(message).catch(() => {});
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
					} catch (err: any) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: err?.message || "Invalid request" }));
					}
				});
				return;
			}

			// ── Status ───────────────────────────────────────────
			if (req.method === "GET" && url.pathname === "/status") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					busy: bridge.isBusy(),
					historyCount: bridge.getHistory().length,
					clients: sseClients.size,
				}));
				return;
			}

			// ── History ──────────────────────────────────────────
			if (req.method === "GET" && url.pathname === "/history") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ messages: bridge.getHistory() }));
				return;
			}

			// ── Reset ────────────────────────────────────────────
			if (req.method === "POST" && url.pathname === "/reset") {
				bridge.reset();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				return;
			}

			// ── List Directories ─────────────────────────────────
			if (req.method === "GET" && url.pathname === "/directories") {
				const projects = discoverProjects();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					current: bridge.getCwd(),
					currentName: basename(bridge.getCwd()),
					directories: projects,
				}));
				return;
			}

			// ── Set Directory ────────────────────────────────────
			if (req.method === "POST" && url.pathname === "/set-directory") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const dirPath = String(data.path || "").trim();
						if (!dirPath || !existsSync(dirPath)) {
							res.writeHead(400, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: false, error: "Directory not found" }));
							return;
						}
						bridge.setCwd(dirPath);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, cwd: dirPath, name: basename(dirPath) }));
					} catch (err: any) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: false, error: err?.message || "Invalid request" }));
					}
				});
				return;
			}

			// ── Shutdown (explicit close from client) ────────────
			if (req.method === "POST" && url.pathname === "/shutdown") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				setTimeout(() => {
					bridge.destroy();
					try { server.close(); } catch {}
					onShutdown();
				}, 200);
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

		// Store bridge reference on server for cleanup
		(server as any).__bridge = bridge;

		server.listen(0, "0.0.0.0", () => {
			const addr = server.address() as any;
			resolve({ port: addr.port, server });
		});
	});
}

// ── Browser Opener ───────────────────────────────────────────────────

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

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowChatParams = Type.Object({
	port: Type.Optional(Type.Number({ description: "Specific port to use (default: auto-assigned)" })),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	let activeSession: {
		kind: "chat";
		title: string;
		url: string;
		server: Server;
		onClose: () => void;
	} | null = null;

	function cleanupServer() {
		const server = activeServer;
		activeServer = null;
		if (server) {
			const bridge = (server as any).__bridge as AgentBridge | undefined;
			if (bridge) bridge.destroy();
			try { server.close(); } catch {}
		}
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	let currentPIN = "";

	async function launchChat(ctx: ExtensionContext): Promise<{ localUrl: string; lanUrl: string; pin: string }> {
		cleanupServer();

		currentPIN = generatePIN();
		const { port, server } = await startChatServer(currentPIN, () => {
			// Called when server auto-shuts down
			activeServer = null;
			if (activeSession) {
				clearActiveViewer(activeSession);
				activeSession = null;
			}
		});
		activeServer = server;

		const lanIP = getLanIP();
		const localUrl = `http://127.0.0.1:${port}`;
		const lanUrl = `http://${lanIP}:${port}`;

		activeSession = {
			kind: "chat",
			title: "Web Chat",
			url: localUrl,
			server,
			onClose: () => {
				activeServer = null;
				activeSession = null;
			},
		};
		registerActiveViewer(activeSession);
		notifyViewerOpen(ctx, activeSession);

		return { localUrl, lanUrl, pin: currentPIN };
	}

	// ── show_chat tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "show_chat",
		label: "Web Chat",
		description:
			"Open a web-based chat interface accessible from your phone or any device on the local network. " +
			"Starts an HTTP server on 0.0.0.0 (LAN-accessible) with a mobile-friendly chat UI. " +
			"The chat spawns a Pi agent subprocess with full tool access (read, bash, edit, write, grep, find, ls). " +
			"The server stays running in the background — close it with /chat stop.",
		parameters: ShowChatParams,

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const { localUrl, lanUrl, pin } = await launchChat(ctx);

			openBrowser(localUrl);

			return {
				content: [{
					type: "text" as const,
					text: [
						`🌐 Web Chat is live!`,
						``,
						`Local:  ${localUrl}`,
						`Phone:  ${lanUrl}`,
						`PIN:    ${pin}`,
						``,
						`Open the "Phone" URL on any device connected to the same WiFi.`,
						`Enter the PIN to authenticate. Server auto-closes when all clients disconnect.`,
						``,
						`  /chat       — reopen/restart the chat`,
						`  /chat stop  — shut down the server`,
					].join("\n"),
				}],
			};
		},

		renderCall(_args, theme) {
			const text =
				theme.fg("toolTitle", theme.bold("show_chat ")) +
				theme.fg("accent", "Web Chat Interface");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			const firstLine = text?.type === "text" ? text.text.split("\n")[0] : "";
			return new Text(
				outputLine(theme, "success", firstLine),
				0, 0,
			);
		},
	});

	// ── /chat command ────────────────────────────────────────────────

	pi.registerCommand("chat", {
		description: "Open web chat interface (use '/chat stop' to shut down)",
		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();

			if (trimmed === "stop") {
				if (activeServer) {
					cleanupServer();
					ctx.ui.notify("Web chat server stopped.", "info");
				} else {
					ctx.ui.notify("No web chat server is running.", "warning");
				}
				return;
			}

			if (!ctx.hasUI) {
				ctx.ui.notify("/chat requires interactive mode", "error");
				return;
			}

			const { localUrl, lanUrl, pin } = await launchChat(ctx);
			openBrowser(localUrl);
			ctx.ui.notify(`Web Chat live → ${lanUrl} PIN: ${pin}`, "success");
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
