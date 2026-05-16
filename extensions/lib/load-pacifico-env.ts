// ABOUTME: Loads optional .pacifico.env from several well-known paths into process.env.
// ABOUTME: Runs once; only fills keys that are still unset or empty (shell wins).

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

let loaded = false;

function stripQuotes(raw: string): string {
	const t = raw.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
		return t.slice(1, -1);
	}
	return t;
}

function isUnset(key: string): boolean {
	const v = process.env[key];
	return v === undefined || v === "";
}

/** Unique paths, highest priority first. `agentPiPackageRoot` matches sibling of settings.json (see persist-pacifico). */
function pacificoEnvFileCandidates(): string[] {
	const libDir = dirname(fileURLToPath(import.meta.url));
	const settingsPath = resolve(libDir, "../../settings.json");
	const agentPiPackageRoot = dirname(settingsPath);
	const extensionsDir = dirname(libDir);
	const packageRoot = dirname(extensionsDir);
	const home = homedir();
	const ordered = [
		join(agentPiPackageRoot, ".pacifico.env"),
		join(process.cwd(), ".pacifico.env"),
		join(home, ".config", "pi", "pacifico.env"),
		join(home, ".pacifico.env"),
		join(extensionsDir, ".pacifico.env"),
		join(packageRoot, ".pacifico.env"),
	];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const p of ordered) {
		if (seen.has(p)) continue;
		seen.add(p);
		out.push(p);
	}
	return out;
}

function mergeEnvFile(path: string): void {
	if (!existsSync(path)) return;
	let text: string;
	try {
		text = readFileSync(path, "utf-8");
	} catch {
		return;
	}
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	for (const line of text.split(/\r?\n/)) {
		let trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (trimmed.toLowerCase().startsWith("export ")) trimmed = trimmed.slice(7).trim();
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		if (!key.startsWith("PACIFICO_") && key !== "HARNESS_API_KEY") continue;
		const value = stripQuotes(trimmed.slice(eq + 1));
		if (value.length === 0) continue;
		if (isUnset(key)) process.env[key] = value;
	}
}

/**
 * Merge PACIFICO_* / HARNESS_API_KEY from the first existing files among:
 * <agent-pi>/settings.json sibling .pacifico.env, cwd, ~/.config/pi/pacifico.env, ~/.pacifico.env, extensions/.pacifico.env, package root.
 */
export function ensurePacificoEnvLoaded(): void {
	if (loaded) return;
	loaded = true;
	for (const path of pacificoEnvFileCandidates()) {
		mergeEnvFile(path);
	}
}
