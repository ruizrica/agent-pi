// ABOUTME: Resolves and persists the operational mode hint toggle.
// ABOUTME: Defaults hints to enabled while supporting env and settings.json overrides.

import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const DEFAULT_SETTINGS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../settings.json");
export const MODE_HINTS_ENV = "PI_MODE_HINTS_ENABLED";

export function parseModeHintsBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "on", "yes", "enabled"].includes(normalized)) return true;
	if (["0", "false", "off", "no", "disabled"].includes(normalized)) return false;
	return null;
}

export function resolveModeHintsEnabled(settingsPath: string = DEFAULT_SETTINGS_PATH, env: NodeJS.ProcessEnv = process.env): boolean {
	const envValue = parseModeHintsBoolean(env[MODE_HINTS_ENV]);
	if (envValue !== null) return envValue;

	try {
		const raw = readFileSync(settingsPath, "utf-8");
		const settings = JSON.parse(raw);
		const settingValue = parseModeHintsBoolean(settings?.modeHintsEnabled);
		if (settingValue !== null) return settingValue;
	} catch {
		// Non-critical: missing or invalid settings fall back to the default.
	}

	return true;
}

export function persistModeHintsEnabled(enabled: boolean, settingsPath: string = DEFAULT_SETTINGS_PATH): void {
	try {
		let settings: Record<string, unknown> = {};
		try {
			settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
		} catch {
			settings = {};
		}
		settings.modeHintsEnabled = enabled;
		writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
	} catch {
		// Non-critical: runtime toggling still works for this session.
	}
}
