// ABOUTME: Generic MCP (Model Context Protocol) client over stdio using JSON-RPC 2.0.
// ABOUTME: Spawns a subprocess, communicates via line-delimited JSON on stdin/stdout.

import { spawn, type ChildProcess } from "child_process";

// ── JSON-RPC helpers ────────────────────────────────────────────────

export function formatJsonRpcRequest(id: number | undefined, method: string, params: Record<string, unknown>): string {
	const msg: Record<string, unknown> = { jsonrpc: "2.0", method, params };
	if (id !== undefined) msg.id = id;
	return JSON.stringify(msg);
}

export function parseJsonRpcLines(data: string): { messages: any[]; remainder: string } {
	const messages: any[] = [];
	let remainder = "";

	if (!data) return { messages, remainder };

	const lines = data.split("\n");
	// Last element is either empty (if data ended with \n) or a partial line
	remainder = lines.pop() ?? "";

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			messages.push(JSON.parse(trimmed));
		} catch {
			// Skip non-JSON lines (e.g. log output from server)
		}
	}

	return { messages, remainder };
}

// ── MCP Client ──────────────────────────────────────────────────────

type PendingCall = {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export class McpClient {
	private serverPath: string;
	private env: Record<string, string>;
	private timeoutMs: number;
	private proc: ChildProcess | null = null;
	private nextId = 1;
	private pending = new Map<number, PendingCall>();
	private buffer = "";
	private connected = false;

	constructor(serverPath: string, env: Record<string, string>, timeoutMs = 60_000) {
		this.serverPath = serverPath;
		this.env = env;
		this.timeoutMs = timeoutMs;
	}

	async connect(): Promise<void> {
		this.proc = spawn("node", [this.serverPath], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ...this.env },
		});

		this.proc.stdout!.setEncoding("utf-8");
		this.proc.stdout!.on("data", (chunk: string) => this.onData(chunk));
		this.proc.stderr!.on("data", () => {}); // Drain stderr
		this.proc.on("close", () => this.onClose());

		// Handle stdin errors (EPIPE when server dies) to prevent uncaught crash
		this.proc.stdin!.on("error", (err) => {
			this.onClose();
		});

		// Send initialize handshake
		const initId = this.nextId++;
		const initMsg = formatJsonRpcRequest(initId, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "pi-mcp-client", version: "1.0.0" },
		});

		try {
			this.proc.stdin!.write(initMsg + "\n");
		} catch (err) {
			throw new Error(`MCP initialize write failed: ${(err as Error).message}`);
		}

		// Wait for initialize response
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error("MCP initialize timeout"));
			}, this.timeoutMs);

			this.pending.set(initId, {
				resolve: () => {
					clearTimeout(timer);
					// Send initialized notification
					const notif = formatJsonRpcRequest(undefined, "notifications/initialized", {});
					try {
						this.proc!.stdin!.write(notif + "\n");
					} catch {
						// Non-fatal — handshake already succeeded
					}
					this.connected = true;
					resolve();
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
				timer,
			});
		});
	}

	async callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<any> {
		if (!this.proc || !this.connected) {
			throw new Error("MCP client not connected");
		}

		const id = this.nextId++;
		const msg = formatJsonRpcRequest(id, "tools/call", { name, arguments: args });

		const effectiveTimeout = timeoutMs ?? this.timeoutMs;
		return new Promise<any>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP tool call timeout after ${effectiveTimeout}ms`));
			}, effectiveTimeout);

			this.pending.set(id, { resolve, reject, timer });

			// Write after registering the pending handler so EPIPE triggers onClose
			// which rejects all pending calls cleanly instead of crashing
			try {
				this.proc!.stdin!.write(msg + "\n");
			} catch (err) {
				// Synchronous write error (stream already destroyed)
				this.pending.delete(id);
				clearTimeout(timer);
				reject(new Error(`MCP write failed: ${(err as Error).message}`));
			}
		});
	}

	disconnect(): void {
		this.connected = false;
		if (this.proc) {
			this.proc.kill();
			this.proc = null;
		}
		// Reject any pending calls
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("MCP client disconnected"));
			this.pending.delete(id);
		}
	}

	isConnected(): boolean {
		return this.connected;
	}

	private onData(chunk: string): void {
		const { messages, remainder } = parseJsonRpcLines(this.buffer + chunk);
		this.buffer = remainder;

		for (const msg of messages) {
			if (msg.id !== undefined && this.pending.has(msg.id)) {
				const pending = this.pending.get(msg.id)!;
				this.pending.delete(msg.id);
				clearTimeout(pending.timer);

				if (msg.error) {
					pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
				} else {
					pending.resolve(msg.result);
				}
			}
		}
	}

	private onClose(): void {
		this.connected = false;
		this.proc = null;
		// Reject all pending calls
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("MCP server process closed unexpectedly"));
			this.pending.delete(id);
		}
	}
}
