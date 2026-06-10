// ABOUTME: Honest Claude routing toggle: direct-api (default) or code-cli.
// ABOUTME: /claude-mode [direct-api|code-cli] persists the choice; bridge tools read it to declare their path.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const MODE_FILE = join(homedir(), ".pi", "claudemode");

export default function (pi: ExtensionAPI) {
	let currentMode: "code-cli" | "direct-api" = "direct-api"; // default to direct provider/API routing
	
	pi.on("session_start", async (_event, _ctx) => {
		// Respect the persisted choice (no forced overwrite — the old behavior
		// silently disabled CLI routing even when the user opted into it).
		try {
			if (existsSync(MODE_FILE)) {
				const savedMode = readFileSync(MODE_FILE, "utf-8").trim();
				currentMode = savedMode === "code-cli" ? "code-cli" : "direct-api";
			}
		} catch {
			// If there's an error reading the file, keep direct API default mode
		}
	});
	
	pi.registerCommand("claude-mode", {
		description: "Toggle Claude routing: /claude-mode [direct-api|code-cli] (no arg shows current)",
		handler: async (_args, ctx) => {
			const requested = String(_args ?? "").trim();
			if (!requested) {
				ctx.ui.notify(`Claude mode: ${currentMode}`, "info");
				return;
			}
			if (requested !== "direct-api" && requested !== "code-cli") {
				ctx.ui.notify(`Unknown mode '${requested}' — use direct-api or code-cli`, "error");
				return;
			}
			currentMode = requested;
			
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
			
			ctx.ui.notify(`Claude mode set to: ${currentMode === "direct-api" ? "Direct API" : "Claude Code CLI"}`, "success");
		},
	});
}