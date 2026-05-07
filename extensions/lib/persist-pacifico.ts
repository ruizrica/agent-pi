// ABOUTME: Persists pacifico extension state to settings.json.
// ABOUTME: Reads the current repo-local path plus the legacy extensions/settings.json path.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = resolve(LIB_DIR, "../../settings.json");
const LEGACY_SETTINGS_PATH = resolve(LIB_DIR, "../settings.json");

interface SettingsPaths {
	primary?: string;
	legacy?: string;
}

function readSettingsFile(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function readSettings(paths: SettingsPaths = {}): Record<string, unknown> {
	const primaryPath = paths.primary ?? SETTINGS_PATH;
	const legacyPath = paths.legacy ?? LEGACY_SETTINGS_PATH;
	const legacy = readSettingsFile(legacyPath);
	const primary = readSettingsFile(primaryPath);
	return { ...legacy, ...primary };
}

function writeSettings(settings: Record<string, unknown>, paths: SettingsPaths = {}): void {
	try {
		writeFileSync(paths.primary ?? SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
	} catch {
		// Non-critical — in-memory state still works for this session.
	}
}

export function loadPacificoModel(paths?: SettingsPaths): string | null {
	const value = readSettings(paths).pacificoModel;
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function persistPacificoModel(model: string | null, paths?: SettingsPaths): void {
	const settings = readSettings(paths);
	if (model === null) delete settings.pacificoModel;
	else settings.pacificoModel = model;
	writeSettings(settings, paths);
}

/** Same bearer as Pacifico `PACIFICO_API_KEY` / Worker secret (≥32 chars). */
export function loadPacificoApiKey(paths?: SettingsPaths): string | undefined {
	const row = readSettings(paths);
	const a = row.pacificoApiKey;
	if (typeof a === "string" && a.trim().length > 0) return a.trim();
	const h = row.harnessApiKey;
	if (typeof h === "string" && h.trim().length > 0) return h.trim();
	return undefined;
}

export function persistPacificoApiKey(key: string | null, paths?: SettingsPaths): void {
	const settings = readSettings(paths);
	if (key === null || key.trim() === "") {
		delete settings.pacificoApiKey;
		delete settings.harnessApiKey;
	} else {
		settings.pacificoApiKey = key.trim();
	}
	writeSettings(settings, paths);
}
