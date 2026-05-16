// ABOUTME: Ensures Claude uses direct API mode instead of Claude Code CLI mode
// ABOUTME: Provides a /claude-mode command that persists direct API routing

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const MODE_FILE = join(homedir(), ".pi", "claudemode");

export default function (pi: ExtensionAPI) {
	let currentMode: "code-cli" | "direct-api" = "direct-api"; // default to direct provider/API routing
	
	pi.on("session_start", async (_event, ctx) => {
		// Keep direct API mode even if an older install persisted code-cli.
		try {
			if (existsSync(MODE_FILE)) {
				const savedMode = readFileSync(MODE_FILE, "utf-8").trim();
				if (savedMode !== "direct-api") {
					writeFileSync(MODE_FILE, "direct-api\n", "utf-8");
				}
			}
			currentMode = "direct-api";
		} catch {
			// If there's an error reading the file, keep direct API default mode
		}
	});
	
	pi.registerCommand("claude-mode", {
		description: "Ensure Claude uses Direct API mode",
		handler: async (_args, ctx) => {
			currentMode = "direct-api";
			
			// Save the direct-API preference to persistent storage
			try {
				const dir = dirname(MODE_FILE);
				if (!existsSync(dir)) {
					// Create directory if it doesn't exist
					const { mkdirSync } = await import("node:fs");
					mkdirSync(dir, { recursive: true });
				}
				writeFileSync(MODE_FILE, currentMode, "utf-8");
			} catch (err) {
				ctx.ui.notify(`Failed to save mode preference: ${err}`, "error");
				return;
			}
			
			ctx.ui.notify("Claude mode set to: Direct API (Claude CLI disabled)", "success");
		},
	});
}