// ABOUTME: Provides /continue command to list and resume previous Pi sessions.
// ABOUTME: Scans session files across all projects and switches to the selected one.
/**
 * Session Continue — Resume a previous session via /continue
 *
 * Lists all past sessions across all projects, lets you pick one,
 * and switches to it, continuing from the last message.
 *
 * Usage: pi
 * Then: /continue
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

interface SessionInfo {
	path: string;
	cwd: string;
	timestamp: Date;
	sessionId: string;
	name?: string;
	lastUserMessage?: string;
	entryCount: number;
}

function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const diffMs = now - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay === 1) return "yesterday";
	if (diffDay < 7) return `${diffDay}d ago`;
	if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
	if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;
	return `${Math.floor(diffDay / 365)}y ago`;
}

function shortDir(cwd: string): string {
	const parts = cwd.split("/").filter(Boolean);
	if (parts.length <= 2) return cwd;
	return parts.slice(-2).join("/");
}

function extractTextContent(content: any): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c: any) => {
				if (c.type === "text") return c.text || "";
				return "";
			})
			.filter(Boolean)
			.join(" ");
	}
	return "";
}

function parseSessionFile(filePath: string): SessionInfo | null {
	try {
		const content = readFileSync(filePath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);
		if (lines.length === 0) return null;

		// Parse header (first line)
		const header = JSON.parse(lines[0]);
		if (header.type !== "session") return null;

		const sessionInfo: SessionInfo = {
			path: filePath,
			cwd: header.cwd || "",
			timestamp: new Date(header.timestamp || Date.now()),
			sessionId: header.id || "",
			entryCount: lines.length - 1, // Exclude header
		};

		// Scan entries for session_info and last user message
		let lastUserMessage: string | undefined;
		for (let i = 1; i < lines.length; i++) {
			try {
				const entry = JSON.parse(lines[i]);
				if (entry.type === "session_info" && entry.name) {
					sessionInfo.name = entry.name;
				}
				if (entry.type === "message" && entry.message) {
					const msg = entry.message;
					if (msg.role === "user") {
						const text = extractTextContent(msg.content);
						if (text) {
							lastUserMessage = text;
						}
					}
				}
			} catch {
				// Skip malformed entries
			}
		}

		sessionInfo.lastUserMessage = lastUserMessage;
		return sessionInfo;
	} catch {
		return null;
	}
}

function scanSessions(sessionsDir: string): SessionInfo[] {
	const sessions: SessionInfo[] = [];

	if (!existsSync(sessionsDir)) return sessions;

	try {
		const dirs = readdirSync(sessionsDir, { withFileTypes: true });
		for (const dir of dirs) {
			if (!dir.isDirectory()) continue;
			if (dir.name === "subagents") continue; // Skip subagents

			const dirPath = join(sessionsDir, dir.name);
			try {
				const files = readdirSync(dirPath);
				for (const file of files) {
					if (!file.endsWith(".jsonl")) continue;
					const filePath = join(dirPath, file);
					const session = parseSessionFile(filePath);
					if (session) {
						sessions.push(session);
					}
				}
			} catch {
				// Skip directories we can't read
			}
		}
	} catch {
		// Sessions dir doesn't exist or can't be read
	}

	return sessions;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.registerCommand("continue", {
		description: "List and resume a previous session",
		handler: async (args, ctx) => {
			const home = homedir();
			const sessionsDir = join(home, ".pi", "agent", "sessions");

			ctx.ui.setStatus("continue", "Scanning sessions...");

			const allSessions = scanSessions(sessionsDir);

			if (allSessions.length === 0) {
				ctx.ui.setStatus("continue", undefined);
				ctx.ui.notify("No previous sessions found.", "warning");
				return;
			}

			// Sort by most recent first
			allSessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

			// Limit to 30 most recent
			const recentSessions = allSessions.slice(0, 30);

			ctx.ui.setStatus("continue", undefined);

			// Filter if args provided
			let filtered = recentSessions;
			if (args && args.trim()) {
				const filter = args.trim().toLowerCase();
				filtered = recentSessions.filter((s) => {
					const name = (s.name || s.lastUserMessage || "").toLowerCase();
					const cwd = s.cwd.toLowerCase();
					return name.includes(filter) || cwd.includes(filter);
				});

				if (filtered.length === 0) {
					ctx.ui.notify(`No sessions match "${args}"`, "warning");
					return;
				}
			}

			// Format options for select dialog
			const options = filtered.map((s) => {
				const name = s.name || s.lastUserMessage || "Untitled session";
				const preview = name.length > 50 ? name.substring(0, 47) + "..." : name;
				const dir = shortDir(s.cwd);
				const time = formatRelativeTime(s.timestamp);
				const count = s.entryCount;
				return `${preview} | ${dir} | ${time} (${count})`;
			});

			const choice = await ctx.ui.select("Select Session to Continue", options);

			if (choice === undefined) {
				return;
			}

			const selectedIndex = options.indexOf(choice);
			if (selectedIndex === -1) {
				return;
			}

			const selectedSession = filtered[selectedIndex];

			// Wait for agent to be idle before switching sessions
			await ctx.waitForIdle();

			// Switch to the selected session
			try {
				// Use type assertion to access setSessionFile which exists at runtime
				const sm = ctx.sessionManager as any;
				if (typeof sm.setSessionFile === "function") {
					sm.setSessionFile(selectedSession.path);
					const sessionName = selectedSession.name || shortDir(selectedSession.cwd);
					ctx.ui.notify(`Resumed session: ${sessionName}`, "success");
				} else {
					// Fallback: read old session and create new one with its context
					ctx.ui.notify("Switching sessions...", "info");
					
					// Read the old session file to get its messages
					const oldContent = readFileSync(selectedSession.path, "utf-8");
					const oldLines = oldContent.trim().split("\n").filter(Boolean);
					
					// Find the last user message from the old session
					let lastUserContent: string | undefined;
					for (let i = oldLines.length - 1; i >= 1; i--) {
						try {
							const entry = JSON.parse(oldLines[i]);
							if (entry.type === "message" && entry.message?.role === "user") {
								lastUserContent = extractTextContent(entry.message.content);
								break;
							}
						} catch {
							// Skip malformed entries
						}
					}

					await ctx.newSession({
						setup: async (newSm) => {
							if (lastUserContent) {
								newSm.appendMessage({
									role: "user",
									content: [
										{
											type: "text",
											text: `[Continuing from previous session]\n\n${lastUserContent}`,
										},
									],
									timestamp: Date.now(),
								});
							}
						},
					});
					const sessionName = selectedSession.name || shortDir(selectedSession.cwd);
					ctx.ui.notify(`Resumed session: ${sessionName}`, "success");
				}
			} catch (error: any) {
				ctx.ui.notify(`Failed to resume session: ${error.message}`, "error");
			}
		},
	});
}
