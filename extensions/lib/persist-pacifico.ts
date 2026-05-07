// ABOUTME: Persists pacifico extension state (selected model) to repo-local settings.json.
// ABOUTME: Mirrors persist-theme.ts shape; creates the file if missing so persistence is reliable.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SETTINGS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../settings.json");

function readSettings(): Record<string, unknown> {
	if (!existsSync(SETTINGS_PATH)) return {};
	try {
		return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function writeSettings(settings: Record<string, unknown>): void {
	try {
		writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
	} catch {
		// Non-critical — in-memory state still works for this session.
	}
}

export function loadPacificoModel(): string | null {
	const value = readSettings().pacificoModel;
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function persistPacificoModel(model: string | null): void {
	const settings = readSettings();
	if (model === null) delete settings.pacificoModel;
	else settings.pacificoModel = model;
	writeSettings(settings);
}

/** Same bearer as Pacifico `PACIFICO_API_KEY` / Worker secret (≥32 chars). */
export function loadPacificoApiKey(): string | undefined {
	const row = readSettings();
	const a = row.pacificoApiKey;
	if (typeof a === "string" && a.trim().length > 0) return a.trim();
	const h = row.harnessApiKey;
	if (typeof h === "string" && h.trim().length > 0) return h.trim();
	return undefined;
}

export function persistPacificoApiKey(key: string | null): void {
	const settings = readSettings();
	if (key === null || key.trim() === "") {
		delete settings.pacificoApiKey;
		delete settings.harnessApiKey;
	} else {
		settings.pacificoApiKey = key.trim();
	}
	writeSettings(settings);
}
