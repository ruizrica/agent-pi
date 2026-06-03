// ABOUTME: Helpers for loading installed Pi package extensions from child processes.
// ABOUTME: Keeps --no-extensions child launches explicit without losing selected global plumbing.

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const UNNAMED_INTERCOM_ALIAS_PREFIX = "subagent-chat";

export function getInstalledPiExtensionPath(packageName: string, entry = "index.ts"): string | undefined {
	const extensionPath = join(homedir(), ".pi", "agent", "npm", "node_modules", packageName, entry);
	return existsSync(extensionPath) ? extensionPath : undefined;
}

export function appendInstalledPiExtension(args: string[], packageName: string, entry = "index.ts"): void {
	const extensionPath = getInstalledPiExtensionPath(packageName, entry);
	if (extensionPath) {
		args.push("-e", extensionPath);
	}
}

export function resolveIntercomPresenceName(sessionName?: string, sessionId?: string): string | undefined {
	const trimmedName = sessionName?.trim();
	if (trimmedName) return trimmedName;
	const trimmedSessionId = sessionId?.trim();
	if (!trimmedSessionId) return undefined;
	const normalized = trimmedSessionId.startsWith("session-")
		? trimmedSessionId.slice("session-".length)
		: trimmedSessionId;
	return `${UNNAMED_INTERCOM_ALIAS_PREFIX}-${normalized.slice(0, 8)}`;
}
