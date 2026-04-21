// ABOUTME: Web Chat Extension — opens a LAN-accessible chat interface that relays to the main Pi session.
// ABOUTME: Phone acts as a thin client — messages are injected into THIS session via pi.sendUserMessage().
// ABOUTME: Uses WebSocket for reliable streaming through cloudflared tunnels.

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
import { WebSocketServer, WebSocket as WS } from "ws";
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

interface WSClient {
	id: number;
	ws: WS;
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
		const proc = spawn("cloudflared", [
			"tunnel",
			"--url", `http://127.0.0.1:${localPort}`,
		], {
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

function printLocalInfo(url: string, pin: string): void {
	const w = process.stderr.write.bind(process.stderr);
	w("\n");
	w(`  ${url}\n`);
	w(`  \x1b[1mPIN: ${pin}\x1b[0m\n`);
	w("\n");
}

// 3-row bitmap font for digits 0-9 (each char is 3 cols wide + 1 space)
const BIG_DIGITS: Record<string, string[]> = {
	"0": ["▄▀▄", "█ █", "▀▄▀"],
	"1": ["▄█ ", " █ ", "▄█▄"],
	"2": ["▀▀█", " ▄▀", "█▄▄"],
	"3": ["▀▀█", " ▀█", "▄▄█"],
	"4": ["█ █", "▀▀█", "  █"],
	"5": ["█▀▀", "▀▀█", "▄▄█"],
	"6": ["█▀▀", "█▀█", "▀▄▀"],
	"7": ["▀▀█", " ▐▌", " █ "],
	"8": ["▄▀▄", "█▀█", "▀▄▀"],
	"9": ["▄▀▄", "▀▀█", "▄▄▀"],
};

function renderBigPin(pin: string): string {
	const rows: string[] = ["", "", ""];
	for (const ch of pin) {
		const glyph = BIG_DIGITS[ch];
		if (!glyph) continue;
		for (let r = 0; r < 3; r++) {
			rows[r] += glyph[r] + " ";
		}
	}
	return rows.map((r) => `    ${r}`).join("\n");
}

function printRemoteQRBlock(qr: string, url: string, pin: string): void {
	const w = process.stderr.write.bind(process.stderr);
	w("\n\n\n\n\n\n");
	w(qr);
	w("\n\n\n\n");
	w(`  ${url}\n\n`);
	w(`  \x1b[1mPIN: ${pin}\x1b[0m\n`);
	w("\n\n");
}

// ── WebSocket Helpers ────────────────────────────────────────────────

function sendWS(client: WSClient, event: string, data: any): void {
	try {
		if (client.ws.readyState === WS.OPEN) {
			client.ws.send(JSON.stringify({ event, data }));
		}
	} catch {}
}

function broadcastWS(clients: Map<number, WSClient>, event: string, data: any): void {
	for (const client of clients.values()) {
		sendWS(client, event, data);
	}
}

// ── Session Bridge (relay to main Pi session) ────────────────────────

const TERMINAL_BUFFER_MAX = 200;

class SessionBridge {
	private piApi: ExtensionAPI;
	private clients: Map<number, WSClient>;
	private busy = false;
	private history: ChatMessage[] = [];
	private textBuffer: string[] = [];
	private toolNames: string[] = [];
	private terminalLines: string[] = [];
	private pendingFromPhone = false;

	constructor(piApi: ExtensionAPI, clients: Map<number, WSClient>) {
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
		broadcastWS(this.clients, "terminal_output", { line });
	}

	// ── Called from HTTP /send endpoint ──

	sendMessage(text: string): void {
		if (this.busy) {
			broadcastWS(this.clients, "error_event", {
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
		broadcastWS(this.clients, "user_message", userMsg);

		// Inject into main Pi session — this triggers a turn
		// Use deliverAs: "followUp" so it works even when the agent is busy
		try {
			this.piApi.sendUserMessage(text, { deliverAs: "followUp" });
		} catch (err: any) {
			broadcastWS(this.clients, "error_event", {
				message: "Failed to send message: " + (err?.message || "Unknown error"),
			});
			this.busy = false;
		}
	}

	// ── Event handlers (called from pi.on() hooks) ──

	onAgentStart(): void {
		this.busy = true;
		this.textBuffer = [];
		this.toolNames = [];
		this.pushTerminalLine("[start] Processing...");
		broadcastWS(this.clients, "status", { busy: true });
	}

	onAgentEnd(): void {
		this.busy = false;
		this.pendingFromPhone = false;
		broadcastWS(this.clients, "status", { busy: false });
	}

	onMessageUpdate(event: MessageUpdateEvent): void {
		const delta = event.assistantMessageEvent;
		if (!delta) return;

		if (delta.type === "text_delta") {
			const text = (delta as any).delta || "";
			this.textBuffer.push(text);
			broadcastWS(this.clients, "text_delta", { text });
		} else if (delta.type === "thinking_start") {
			this.pushTerminalLine("[think] Reasoning...");
		} else if (delta.type === "text_start") {
			this.pushTerminalLine("[text] Responding...");
		}
	}

	onMessageEnd(message: any): void {
		// Skip user messages and tool results — only relay assistant responses to the phone.
		// Without this, the user's own message gets echoed back as a "PI" message,
		// and tool results get incorrectly displayed as assistant messages.
		if (message?.role === "user" || message?.role === "toolResult") return;

		// Extract the full text from the completed message
		let fullText = "";
		if (message?.content) {
			if (Array.isArray(message.content)) {
				fullText = message.content
					.filter((p: any) => p.type === "text")
					.map((p: any) => p.text || "")
					.join("");
			} else if (typeof message.content === "string") {
				fullText = message.content;
			}
		}

		if (!fullText) {
			fullText = this.textBuffer.join("");
		}

		if (fullText) {
			const preview = fullText.length > 60 ? fullText.slice(0, 57) + "..." : fullText;
			this.pushTerminalLine(`[msg] ${preview.replace(/\n/g, " ")}`);

			const assistantMsg: ChatMessage = {
				role: "assistant",
				content: fullText,
				timestamp: new Date().toISOString(),
				toolCalls: this.toolNames.length > 0 ? [...this.toolNames] : undefined,
			};
			this.history.push(assistantMsg);
			broadcastWS(this.clients, "assistant_message", assistantMsg);
		}

		// ALWAYS signal completion — matches the working version.
		// This fires for every message (including tool-use), which resets
		// the phone's busy state. The phone handles this gracefully.
		broadcastWS(this.clients, "done", {});
		broadcastWS(this.clients, "status", { busy: false });
		this.busy = false;
		this.textBuffer = [];
		this.toolNames = [];
	}

	onToolStart(event: ToolExecutionStartEvent): void {
		const name = event.toolName || "tool";
		this.toolNames.push(name);
		broadcastWS(this.clients, "tool_start", { name });
		this.pushTerminalLine(`[tool] ${name}`);

		// Detect subagent spawning
		if (name === "subagent_create" || name === "subagent_create_batch") {
			const args = event.args;
			if (name === "subagent_create_batch" && args?.agents) {
				const count = args.agents.length;
				const names = args.agents.map((a: any) => a.name || a.summary || "agent").join(", ");
				this.pushTerminalLine(`[agent] Spawning ${count} agents: ${names}`);
				broadcastWS(this.clients, "subagent_start", { count, names });
			} else if (name === "subagent_create") {
				const agentName = args?.name || args?.summary || "agent";
				this.pushTerminalLine(`[agent] Spawning: ${agentName}`);
				broadcastWS(this.clients, "subagent_start", { count: 1, names: agentName });
			}
		}
	}

	onToolEnd(event: ToolExecutionEndEvent): void {
		const name = event.toolName || "tool";
		const ok = !event.isError;
		broadcastWS(this.clients, "tool_end", {});
		this.pushTerminalLine(`[${ok ? "ok" : "err"}] ${name}`);
	}

	onInput(text: string, source: string): void {
		// Log the input source in terminal feed
		const label = source === "extension" ? "[phone]" : "[term]";
		const preview = text.length > 60 ? text.slice(0, 57) + "..." : text;
		this.pushTerminalLine(`${label} ${preview}`);

		// Capture input from the terminal user (not from phone — we already tracked that)
		if (source !== "extension" && !this.pendingFromPhone) {
			const userMsg: ChatMessage = {
				role: "user",
				content: text,
				timestamp: new Date().toISOString(),
				source: "terminal",
			};
			this.history.push(userMsg);
			broadcastWS(this.clients, "user_message", userMsg);
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
		const wsClients = bridge["clients"];
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
				if (wsClients.size === 0) {
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
					clients: wsClients.size,
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

		// WebSocket server for streaming
		const wss = new WebSocketServer({ noServer: true });

		server.on("upgrade", (req, socket, head) => {
			const url = new URL(req.url || "/", `http://localhost`);
			if (url.pathname !== "/ws") {
				socket.destroy();
				return;
			}
			// Validate auth token
			if (!activeToken) { socket.destroy(); return; }
			const qToken = url.searchParams.get("token");
			const cookies = req.headers.cookie || "";
			const match = cookies.match(/pi_token=([^;]+)/);
			const cookieToken = match ? match[1] : null;
			if (qToken !== activeToken && cookieToken !== activeToken) {
				socket.destroy();
				return;
			}
			wss.handleUpgrade(req, socket, head, (ws) => {
				wss.emit("connection", ws, req);
			});
		});

		wss.on("connection", (ws) => {
			resetShutdownTimer();
			const clientId = ++clientIdCounter;
			const client: WSClient = { id: clientId, ws };
			wsClients.set(clientId, client);

			// Send initial state
			sendWS(client, "connected", {
				busy: bridge.isBusy(),
				historyCount: bridge.getHistory().length,
				relay: true,
			});

			// Send existing history (exclude tool results - they're internal, not chat messages)
			for (const msg of bridge.getHistory()) {
				if (msg.role === "user") {
					sendWS(client, "user_message", msg);
				} else if (msg.role === "assistant") {
					sendWS(client, "assistant_message", msg);
				}
				// toolResult messages are intentionally not sent to the web chat
			}

			// Send existing terminal history
			if (bridge.getTerminalHistory().length === 0) {
				sendWS(client, "terminal_output", { line: "[info] Connected — activity will appear here" });
			}
			for (const line of bridge.getTerminalHistory()) {
				sendWS(client, "terminal_output", { line });
			}

			// Ping to keep connection alive
			const pingInterval = setInterval(() => {
				try { if (ws.readyState === WS.OPEN) ws.ping(); } catch {}
			}, 30000);

			ws.on("close", () => {
				clearInterval(pingInterval);
				wsClients.delete(clientId);
				if (wsClients.size === 0) resetShutdownTimer();
			});

			ws.on("error", () => {
				clearInterval(pingInterval);
				wsClients.delete(clientId);
			});
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

		// Create the session bridge with shared WebSocket client map
		const wsClients = new Map<number, WSClient>();
		const bridge = new SessionBridge(pi, wsClients);
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
		if (activeBridge) {
			activeBridge.onAgentStart();
		}
	});

	pi.on("agent_end", async () => {
		if (activeBridge) {
			activeBridge.onAgentEnd();
		}
	});

	pi.on("message_update", async (event) => {
		if (activeBridge) {
			activeBridge.onMessageUpdate(event);
		}
	});

	pi.on("message_end", async (event) => {
		if (activeBridge) {
			activeBridge.onMessageEnd((event as any).message);
		}
	});

	pi.on("turn_end", async () => {
		if (activeBridge && activeBridge.isBusy()) {
			activeBridge.pushTerminalLine("[turn] Turn complete");
		}
	});

	pi.on("tool_execution_start", async (event) => {
		if (activeBridge) {
			activeBridge.onToolStart(event);
		}
	});

	pi.on("tool_execution_end", async (event) => {
		if (activeBridge) {
			activeBridge.onToolEnd(event);
		}
	});

	pi.on("input", async (event) => {
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

			printLocalInfo(lanUrl, pin);

			return {
				content: [{
					type: "text" as const,
					text: [
						`Web Chat is live (relay mode)`,
						``,
						`Local:  ${localUrl}`,
						`Phone:  ${lanUrl}`,
						`PIN:    ${pin}`,
						``,
						`Only one device can be authenticated at a time.`,
						``,
						`  /chat            -- reopen/restart the chat`,
						`  /chat --remote   -- secure tunnel (accessible from anywhere)`,
						`  /chat stop       -- shut down the server`,
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

				if (remote && tunnelUrl) {
					const qr = await generateQRString(tunnelUrl);
					printRemoteQRBlock(qr, tunnelUrl, pin);
					ctx.ui.notify(`Web Chat → ${tunnelUrl} PIN: ${pin}`, "success");
				} else {
					printLocalInfo(lanUrl, pin);
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
