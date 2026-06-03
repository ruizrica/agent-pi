// ABOUTME: Resolves the optional local Commander MCP server path.
// ABOUTME: Avoids stale machine-specific absolute paths in Commander integrations.

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const COMMANDER_SERVER_CANDIDATES = [
	process.env.COMMANDER_MCP_SERVER_PATH,
	join(homedir(), "Projects", "commander", "services", "commander-mcp", "dist", "server.js"),
	join(homedir(), "Projects", "Commander", "services", "commander-mcp", "dist", "server.js"),
	join(homedir(), "commander", "services", "commander-mcp", "dist", "server.js"),
	join(homedir(), "Workshop", "Github-Work", "commander", "services", "commander-mcp", "dist", "server.js"),
].filter((candidate): candidate is string => Boolean(candidate));

export function resolveCommanderServerPath(): string | undefined {
	for (const candidate of COMMANDER_SERVER_CANDIDATES) {
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

export function commanderServerMissingMessage(): string {
	return [
		"Commander MCP server not found.",
		"Set COMMANDER_MCP_SERVER_PATH to services/commander-mcp/dist/server.js, or restore the local Commander server checkout.",
		`Checked: ${COMMANDER_SERVER_CANDIDATES.join(", ")}`,
	].join(" ");
}
