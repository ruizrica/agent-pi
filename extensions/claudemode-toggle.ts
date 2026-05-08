// ABOUTME: Toggle between Claude Code CLI and Direct API modes
// ABOUTME: Provides a /claude-mode command to switch between Claude execution modes

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const MODE_FILE = join(homedir(), ".pi", "claudemode");

export default function (pi: ExtensionAPI) {
	let currentMode: "code-cli" | "direct-api" = "code-cli"; // default to Code CLI
	
	pi.on("session_start", async (_event, ctx) => {
		// Initialize mode from persistent storage
		try {
			if (existsSync(MODE_FILE)) {
				const savedMode = readFileSync(MODE_FILE, "utf-8").trim() as "code-cli" | "direct-api";
				if (savedMode === "code-cli" || savedMode === "direct-api") {
					currentMode = savedMode;
				}
			}
		} catch {
			// If there's an error reading the file, keep default mode
		}
	});
	
	pi.registerCommand("claude-mode", {
		description: "Toggle between Claude Code CLI and Direct API modes",
		handler: async (_args, ctx) => {
			// Toggle to the opposite mode
			currentMode = currentMode === "code-cli" ? "direct-api" : "code-cli";
			
			// Save the new mode to persistent storage
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
			
			// Provide feedback to the user
			const modeDisplay = currentMode === "code-cli" ? "Code CLI" : "Direct API";
			ctx.ui.notify(`Claude mode switched to: ${modeDisplay}`, "success");
		},
	});
}