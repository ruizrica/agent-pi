// ABOUTME: Shared default constants for pi agent extensions.
// ABOUTME: Reads the default subagent model from .pi/agents/models.json config.

import { loadAgentModelsConfig, buildModelString } from "./agent-defs.ts";

// Load once at import time from the extension project's own config.
// This covers the common case; callers with a specific cwd should use
// loadAgentModelsConfig() + resolveAgentModelString() directly.
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const _extDir = dirname(fileURLToPath(import.meta.url));
const _extProjectDir = resolve(_extDir, "..");
const _config = loadAgentModelsConfig(process.cwd(), _extProjectDir);

/**
 * The default model string for subagents that don't match any known agent definition.
 * Sourced from .pi/agents/models.json "default" entry.
 */
export const DEFAULT_SUBAGENT_MODEL = buildModelString(_config.default);
