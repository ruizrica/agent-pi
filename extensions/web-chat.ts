// ABOUTME: Web Chat Extension — opens a LAN-accessible chat interface that relays to the main Pi session.
// ABOUTME: Phone acts as a thin client — messages are injected into THIS session via pi.sendUserMessage().

import type { ExtensionAPI, ExtensionContext, MessageUpdateEvent, ToolExecutionStartEvent, ToolExecutionEndEvent } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { randomInt } from "node:crypto";
import qrTerminal from "qrcode-terminal";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateWebChatHTML } from "./lib/web-chat-html.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: string;
	source?: "phone" | "terminal";
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
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	return "0.0.0.0";
}

// ── Cloudflare Tunnel ────────────────────────────────────────────────

function isCloudflaredAvailable(): boolean {
	try {
		execSync("which cloudflared", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function startTunnel(localPort: number): Promise<{ url: string; proc: ChildProcess }> {
	return new Promise((resolve, reject) => {
		const proc = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${localPort}`], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let resolved = false;
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				reject(new Error("Tunnel failed to start within 15 seconds"));
			}
		}, 15000);

		// cloudflared prints the URL to stderr
		let stderrBuf = "";
		proc.stderr!.setEncoding("utf-8");
		proc.stderr!.on("data", (chunk: string) => {
			stderrBuf += chunk;
			const match = stderrBuf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
			if (match && !resolved) {
				resolved = true;
				clearTimeout(timeout);
				resolve({ url: match[0], proc });
			}
		});

		proc.on("error", (err) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				reject(err);
			}
		});

		proc.on("close", (code) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				reject(new Error(`cloudflared exited with code ${code}`));
			}
		});
	});
}

// ── PIN Authentication ───────────────────────────────────────────────

function generatePIN(): string {
	return String(randomInt(100000, 999999));
}

// ── Logo Loading ─────────────────────────────────────────────────────

function loadLogoBase64(): string {
	try {
		const extDir = dirname(fileURLToPath(import.meta.url));
		const logoPath = `${extDir}/../agent-logo.png`;
		if (existsSync(logoPath)) {
			const buf = readFileSync(logoPath);
			return `data:image/png;base64,${buf.toString("base64")}`;
		}
	} catch {}
	return "";
}

// ── QR Code Generation ───────────────────────────────────────────────

function generateQRString(url: string): Promise<string> {
	return new Promise((resolve) => {
		qrTerminal.generate(url, { small: true }, (code: string) => {
			resolve(code);
		});
	});
}

// ── SSE Helpers ──────────────────────────────────────────────────────

function sendSSE(client: SSEClient, event: string, data: any): void {
	try {
		client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	} catch {}
}

function broadcastSSE(clients: Map<number, SSEClient>, event: string, data: any): void {
	if (clients.size === 0 && (event === "text_delta" || event === "done" || event === "status")) {
		console.error(`[web-chat] broadcast ${event} but 0 SSE clients connected!`);
	}
	for (const client of clients.values()) {
		sendSSE(client, event, data);
	}
}

// ── Session Bridge (relay to main Pi session) ────────────────────────

const TERMINAL_BUFFER_MAX = 200;

class SessionBridge {
	private piApi: ExtensionAPI;
	private clients: Map<number, SSEClient>;
	private busy = false;
	private history: ChatMessage[] = [];
	private textBuffer: string[] = [];
	private toolNames: string[] = [];
	private terminalLines: string[] = [];
	private pendingFromPhone = false;

	constructor(piApi: ExtensionAPI, clients: Map<number, SSEClient>) {
		this.piApi = piApi;
		this.clients = clients;
	}

	isBusy(): boolean {
		return this.busy;
	}

	getHistory(): ChatMessage[] {
		return this.history;
	}

	getTerminalHistory(): string[] {
		return this.terminalLines;
	}

	hasClients(): boolean {
		return this.clients.size > 0;
	}

	pushTerminalLine(line: string): void {
		this.terminalLines.push(line);
		if (this.terminalLines.length > TERMINAL_BUFFER_MAX) {
			this.terminalLines.shift();
		}
		broadcastSSE(this.clients, "terminal_output", { line });
	}

	// ── Called from HTTP /send endpoint ──

	sendMessage(text: string): void {
		if (this.busy) {
			broadcastSSE(this.clients, "error_event", {
				message: "Agent is busy. Wait for the current response to finish.",
			});
			return;
		}

		// Track that this message came from the phone
		this.pendingFromPhone = true;

		const userMsg: ChatMessage = {
			role: "user",
			content: text,
			timestamp: new Date().toISOString(),
			source: "phone",
		};
		this.history.push(userMsg);
		broadcastSSE(this.clients, "user_message", userMsg);

		// Inject into main Pi session — this triggers a turn
		this.piApi.sendUserMessage(text);
	}

	// ── Event handlers (called from pi.on() hooks) ──

	onAgentStart(): void {
		this.busy = true;
		this.textBuffer = [];
		this.toolNames = [];
		broadcastSSE(this.clients, "status", { busy: true });
	}

	onAgentEnd(): void {
		this.busy = false;

		// Finalize assistant message from buffered text
		const fullText = this.textBuffer.join("");
		if (fullText) {
			const assistantMsg: ChatMessage = {
				role: "assistant",
				content: fullText,
				timestamp: new Date().toISOString(),
				toolCalls: this.toolNames.length > 0 ? [...this.toolNames] : undefined,
			};
			this.history.push(assistantMsg);
		}
		this.textBuffer = [];
		this.toolNames = [];
		this.pendingFromPhone = false;

		broadcastSSE(this.clients, "done", { toolCount: this.toolNames.length });
		broadcastSSE(this.clients, "status", { busy: false });
	}

	onMessageUpdate(event: MessageUpdateEvent): void {
		const delta = event.assistantMessageEvent;
		if (!delta) return;
		if (delta.type === "text_delta") {
			const text = (delta as any).delta || "";
			this.textBuffer.push(text);
			broadcastSSE(this.clients, "text_delta", { text });
		} else if (delta.type === "text_end") {
			// Full text block finished — use as fallback if streaming missed
			const fullText = (delta as any).content || "";
			if (fullText && this.textBuffer.length === 0) {
				// Streaming missed — send full text at once
				this.textBuffer.push(fullText);
				broadcastSSE(this.clients, "text_delta", { text: fullText });
			}
		}
	}

	onMessageEnd(message: any): void {
		// Fallback: if we never got text_delta but the message has content, send it
		if (this.textBuffer.length === 0 && message) {
			const content = message.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					if (part.type === "text" && part.text) {
						this.textBuffer.push(part.text);
						broadcastSSE(this.clients, "text_delta", { text: part.text });
					}
				}
			} else if (typeof content === "string" && content) {
				this.textBuffer.push(content);
				broadcastSSE(this.clients, "text_delta", { text: content });
			}
		}
	}

	onToolStart(event: ToolExecutionStartEvent): void {
		const name = event.toolName || "tool";
		this.toolNames.push(name);
		broadcastSSE(this.clients, "tool_start", { name });
		this.pushTerminalLine(`▶ ${name}`);
	}

	onToolEnd(_event: ToolExecutionEndEvent): void {
		broadcastSSE(this.clients, "tool_end", {});
		this.pushTerminalLine(`✓ tool done`);
	}

	onInput(text: string, source: string): void {
		// Capture input from the terminal user (not from phone — we already tracked that)
		if (source !== "extension" && !this.pendingFromPhone) {
			const userMsg: ChatMessage = {
				role: "user",
				content: text,
				timestamp: new Date().toISOString(),
				source: "terminal",
			};
			this.history.push(userMsg);
			broadcastSSE(this.clients, "user_message", userMsg);
		}
		// Reset the pending flag after input is processed
		if (this.pendingFromPhone) {
			this.pendingFromPhone = false;
		}
	}

	destroy(): void {
		this.busy = false;
		this.history = [];
		this.textBuffer = [];
		this.toolNames = [];
		this.terminalLines = [];
	}
}

// ── HTTP Server ──────────────────────────────────────────────────────

function startChatServer(
	bridge: SessionBridge,
	pin: string,
	onShutdown: () => void,
): Promise<{ port: number; server: Server }> {
	return new Promise((resolve) => {
		const sseClients = bridge["clients"];
		let clientIdCounter = 0;
		const logoDataUri = loadLogoBase64();
		// Single-user lock: only one authenticated session at a time
		let activeToken: string | null = null;

		function makeToken(): string {
			// Revoke any previous token — only one user at a time
			const t = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
			activeToken = t;
			return t;
		}

		function isAuthed(req: IncomingMessage, url: URL): boolean {
			if (!activeToken) return false;
			const cookies = req.headers.cookie || "";
			const match = cookies.match(/pi_token=([^;]+)/);
			if (match && match[1] === activeToken) return true;
			const qToken = url.searchParams.get("token");
			if (qToken && qToken === activeToken) return true;
			return false;
		}

		// Auto-shutdown timer: close server if no clients for 2 minutes
		let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
		function resetShutdownTimer() {
			if (shutdownTimer) clearTimeout(shutdownTimer);
			shutdownTimer = setTimeout(() => {
				if (sseClients.size === 0) {
					try { server.close(); } catch {}
					onShutdown();
				}
			}, 120_000);
		}

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");

			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || "/", `http://localhost`);

			if (url.pathname === "/favicon.ico") {
				res.writeHead(204);
				res.end();
				return;
			}

			// ── PIN Auth ─────────────────────────────────────────
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

			// ── Chat UI (PIN gate is client-side) ────────────────
			if (req.method === "GET" && url.pathname === "/") {
				res.setHeader("Cache-Control", "no-store");
				const html = generateWebChatHTML({ port: (server.address() as any)?.port || 0, logoDataUri });
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			// ── All API endpoints require auth ───────────────────
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
				console.error(`[web-chat] SSE client ${clientId} connected (total: ${sseClients.size})`);

				sendSSE(client, "connected", {
					busy: bridge.isBusy(),
					historyCount: bridge.getHistory().length,
					relay: true,
				});

				// Send existing history
				for (const msg of bridge.getHistory()) {
					sendSSE(client, msg.role === "user" ? "user_message" : "assistant_message", msg);
				}

				// Send existing terminal history
				for (const line of bridge.getTerminalHistory()) {
					sendSSE(client, "terminal_output", { line });
				}

				const pingInterval = setInterval(() => {
					try { res.write(":ping\n\n"); } catch {}
				}, 30000);

				req.on("close", () => {
					clearInterval(pingInterval);
					sseClients.delete(clientId);
					console.error(`[web-chat] SSE client ${clientId} disconnected (remaining: ${sseClients.size})`);
					if (sseClients.size === 0) resetShutdownTimer();
				});

				return;
			}

			// ── Send Message (relay to main session) ─────────────
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
						console.error(`[web-chat] /send received: "${message.slice(0, 50)}" (clients: ${sseClients.size})`);
						bridge.sendMessage(message);
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
					relay: true,
				}));
				return;
			}

			// ── Terminal History ──────────────────────────────────
			if (req.method === "GET" && url.pathname === "/terminal") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ lines: bridge.getTerminalHistory() }));
				return;
			}

			// ── History ──────────────────────────────────────────
			if (req.method === "GET" && url.pathname === "/history") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ messages: bridge.getHistory() }));
				return;
			}

			// ── Debug ────────────────────────────────────────────
			if (req.method === "GET" && url.pathname === "/debug") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					busy: bridge.isBusy(),
					clients: sseClients.size,
					historyCount: bridge.getHistory().length,
					terminalLines: bridge.getTerminalHistory().length,
					bridgeExists: !!bridge,
				}));
				return;
			}

			// ── Shutdown (explicit close from client) ────────────
			if (req.method === "POST" && url.pathname === "/shutdown") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				setTimeout(() => {
					try { server.close(); } catch {}
					onShutdown();
				}, 200);
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

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
	let activeTunnel: ChildProcess | null = null;
	let activeTunnelUrl: string | null = null;
	let activeBridge: SessionBridge | null = null;
	let activeSession: {
		kind: "chat";
		title: string;
		url: string;
		server: Server;
		onClose: () => void;
	} | null = null;

	function cleanupServer() {
		// Kill tunnel
		if (activeTunnel) {
			try { activeTunnel.kill(); } catch {}
			activeTunnel = null;
			activeTunnelUrl = null;
		}
		const server = activeServer;
		activeServer = null;
		if (server) {
			try { server.close(); } catch {}
		}
		if (activeBridge) {
			activeBridge.destroy();
			activeBridge = null;
		}
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	let currentPIN = "";

	interface LaunchResult {
		localUrl: string;
		lanUrl: string;
		pin: string;
		tunnelUrl?: string;
	}

	async function launchChat(ctx: ExtensionContext, remote = false): Promise<LaunchResult> {
		cleanupServer();

		// Create the session bridge with shared SSE client map
		const sseClients = new Map<number, SSEClient>();
		const bridge = new SessionBridge(pi, sseClients);
		activeBridge = bridge;

		currentPIN = generatePIN();
		const { port, server } = await startChatServer(bridge, currentPIN, () => {
			// Called on auto-shutdown or explicit /shutdown
			if (activeTunnel) {
				try { activeTunnel.kill(); } catch {}
				activeTunnel = null;
				activeTunnelUrl = null;
			}
			activeServer = null;
			activeBridge = null;
			if (activeSession) {
				clearActiveViewer(activeSession);
				activeSession = null;
			}
		});
		activeServer = server;

		const lanIP = getLanIP();
		const localUrl = `http://127.0.0.1:${port}`;
		const lanUrl = `http://${lanIP}:${port}`;

		let tunnelUrl: string | undefined;

		if (remote) {
			if (!isCloudflaredAvailable()) {
				throw new Error("cloudflared is not installed. Install it with: brew install cloudflared");
			}
			const tunnel = await startTunnel(port);
			activeTunnel = tunnel.proc;
			activeTunnelUrl = tunnel.url;
			tunnelUrl = tunnel.url;

			tunnel.proc.on("close", () => {
				activeTunnel = null;
				activeTunnelUrl = null;
			});
		}

		activeSession = {
			kind: "chat",
			title: "Web Chat",
			url: tunnelUrl || localUrl,
			server,
			onClose: () => {
				activeServer = null;
				activeSession = null;
			},
		};
		registerActiveViewer(activeSession);
		notifyViewerOpen(ctx, activeSession);

		return { localUrl, lanUrl, pin: currentPIN, tunnelUrl };
	}

	// ── Event hooks — relay main session events to phone ─────────────

	pi.on("agent_start", async () => {
		console.error("[web-chat] agent_start fired, bridge=" + !!activeBridge + " clients=" + (activeBridge?.hasClients() ?? "n/a"));
		if (activeBridge) {
			activeBridge.onAgentStart();
		}
	});

	pi.on("agent_end", async () => {
		console.error("[web-chat] agent_end fired");
		if (activeBridge) {
			activeBridge.onAgentEnd();
		}
	});

	pi.on("message_update", async (event) => {
		if (activeBridge) {
			const delta = event.assistantMessageEvent;
			const snippet = delta?.type === "text_delta" ? ` text="${String((delta as any).delta || "").slice(0, 30)}"` : "";
			console.error(`[web-chat] message_update type=${delta?.type}${snippet} clients=${activeBridge.hasClients()}`);
			activeBridge.onMessageUpdate(event);
		}
	});

	pi.on("message_end", async (event) => {
		console.error(`[web-chat] message_end fired, content_type=${typeof (event as any).message?.content}`);
		if (activeBridge) {
			activeBridge.onMessageEnd((event as any).message);
		}
	});

	pi.on("tool_execution_start", async (event) => {
		console.error("[web-chat] tool_start: " + event.toolName);
		if (activeBridge) {
			activeBridge.onToolStart(event);
		}
	});

	pi.on("tool_execution_end", async (event) => {
		console.error("[web-chat] tool_end: " + event.toolName);
		if (activeBridge) {
			activeBridge.onToolEnd(event);
		}
	});

	pi.on("input", async (event) => {
		console.error("[web-chat] input event source=" + event.source + " text=" + event.text?.slice(0, 50));
		if (activeBridge) {
			activeBridge.onInput(event.text, event.source);
		}
	});

	// ── show_chat tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "show_chat",
		label: "Web Chat",
		description:
			"Open a web-based chat interface accessible from your phone or any device on the local network. " +
			"Starts an HTTP server on 0.0.0.0 (LAN-accessible) with a mobile-friendly chat UI. " +
			"Messages from the phone are relayed directly into THIS Pi session — same conversation, same tools, same subagents. " +
			"The server stays running in the background — close it with /chat stop.",
		parameters: ShowChatParams,

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const { localUrl, lanUrl, pin } = await launchChat(ctx);
			openBrowser(localUrl);

			const qr = await generateQRString(lanUrl);
			console.error(`\n  \x1b[1;36m⚡ Web Chat (relay mode)\x1b[0m\n\n${qr}\n\n  \x1b[1mURL:\x1b[0m  ${lanUrl}\n  \x1b[1mPIN:\x1b[0m  \x1b[1;33m${pin}\x1b[0m\n`);

			return {
				content: [{
					type: "text" as const,
					text: [
						`Web Chat is live! (relay mode)`,
						``,
						`Local:  ${localUrl}`,
						`Phone:  ${lanUrl}`,
						`PIN:    ${pin}`,
						``,
						`Scan the QR code above with your phone camera.`,
						`Only one device can be authenticated at a time.`,
						``,
						`  /chat            — reopen/restart the chat`,
						`  /chat --remote   — secure tunnel (accessible from anywhere)`,
						`  /chat stop       — shut down the server`,
					].join("\n"),
				}],
			};
		},

		renderCall(_args, theme) {
			const text =
				theme.fg("toolTitle", theme.bold("show_chat ")) +
				theme.fg("accent", "Web Chat (relay)");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			const firstLine = text?.type === "text" ? text.text.split("\n")[0] : "";
			return new Text(outputLine(theme, "success", firstLine), 0, 0);
		},
	});

	// ── /chat command ────────────────────────────────────────────────

	pi.registerCommand("chat", {
		description: "Open web chat (relay mode). '/chat --remote' for tunnel, '/chat stop' to shut down",
		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();

			if (trimmed === "stop") {
				if (activeServer) {
					const hadTunnel = !!activeTunnel;
					cleanupServer();
					ctx.ui.notify(
						hadTunnel ? "Web chat server and tunnel stopped." : "Web chat server stopped.",
						"info",
					);
				} else {
					ctx.ui.notify("No web chat server is running.", "warning");
				}
				return;
			}

			if (!ctx.hasUI) {
				ctx.ui.notify("/chat requires interactive mode", "error");
				return;
			}

			const remote = trimmed === "--remote" || trimmed === "-r" || trimmed === "remote";

			try {
				const { localUrl, lanUrl, pin, tunnelUrl } = await launchChat(ctx, remote);
				openBrowser(localUrl);

				const phoneUrl = tunnelUrl || lanUrl;
				const qr = await generateQRString(phoneUrl);

				// Print QR code and connection info to stderr (shows in terminal)
				const lines = [
					"",
					`  \x1b[1;36m⚡ Web Chat (relay mode)\x1b[0m`,
					"",
					qr,
					"",
					`  \x1b[1mURL:\x1b[0m  ${phoneUrl}`,
					`  \x1b[1mPIN:\x1b[0m  \x1b[1;33m${pin}\x1b[0m`,
					"",
					`  \x1b[2mScan QR with your phone camera to connect.\x1b[0m`,
					`  \x1b[2mOnly one device can be authenticated at a time.\x1b[0m`,
					"",
				];
				console.error(lines.join("\n"));

				if (tunnelUrl) {
					ctx.ui.notify(`Web Chat → ${tunnelUrl} PIN: ${pin}`, "success");
				} else {
					ctx.ui.notify(`Web Chat → ${lanUrl} PIN: ${pin}`, "success");
				}
			} catch (err: any) {
				ctx.ui.notify(err?.message || "Failed to start chat", "error");
			}
		},
	});

	// ── Lifecycle ────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
	});

	// Kill chat server when the terminal/process exits (SIGINT, SIGTERM, etc.)
	const exitHandler = () => { cleanupServer(); };
	process.on("exit", exitHandler);
	process.on("SIGINT", exitHandler);
	process.on("SIGTERM", exitHandler);
}
