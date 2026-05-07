// ABOUTME: Phase 3 worker model preference helper for advisor-default NORMAL mode.
// ABOUTME: Prefers x-ai/grok-4.1-fast as the default worker, with graceful fallback.

import {
	PREFERRED_WORKER_MODEL,
	FALLBACK_WORKER_MODEL,
} from "./advisor-default-config.ts";

/**
 * Result of worker model selection with preference and fallback info.
 */
export interface WorkerModelSelection {
	/** The selected model string (provider/model or model-only). */
	model: string;
	/** Whether fallback was used because the preferred model was unavailable. */
	fallbackUsed: boolean;
	/** Human-readable status message for logging/UI. */
	message: string;
}

// Re-export the constants for convenience
export { PREFERRED_WORKER_MODEL, FALLBACK_WORKER_MODEL };

/**
 * Prefer grok-4.1-fast as the default worker model, with graceful fallback.
 *
 * In advisor-default NORMAL mode, the worker should use grok-4.1-fast for
 * fast, implementation-focused work. If it is unavailable (provider error,
 * quota issue, etc.), fall back to haiku without ceremony.
 *
 * Checks both bare model names and provider/model strings for availability.
 *
 * @param availableModels Set of model strings the system can access. If empty,
 *                        fallback is used unconditionally.
 * @param preferredOverride Optional override to skip preference check (for testing).
 * @returns Selection with chosen model, fallback flag, and status message.
 */
export function selectWorkerModel(
	availableModels?: Set<string> | string[],
	preferredOverride?: boolean,
): WorkerModelSelection {
	// Convert array to Set if needed
	const available = availableModels
		? availableModels instanceof Set
			? availableModels
			: new Set(availableModels)
		: null;

	// If override is true, always use preferred (for testing)
	if (preferredOverride === true) {
		return {
			model: PREFERRED_WORKER_MODEL,
			fallbackUsed: false,
			message: `Worker model: ${PREFERRED_WORKER_MODEL} (preferred, explicit override)`,
		};
	}

	// If override is false, always use fallback (for testing)
	if (preferredOverride === false) {
		return {
			model: FALLBACK_WORKER_MODEL,
			fallbackUsed: true,
			message: `Worker model: ${FALLBACK_WORKER_MODEL} (fallback, explicit override — preferred ${PREFERRED_WORKER_MODEL} skipped)`,
		};
	}

	// If no availability input, assume preferred is usable.
	if (!availableModels) {
		return {
			model: PREFERRED_WORKER_MODEL,
			fallbackUsed: false,
			message: `Worker model: ${PREFERRED_WORKER_MODEL} (preferred, no availability check)`,
		};
	}

	// An explicit empty availability list means nothing suitable was reported.
	if (available.size === 0) {
		return {
			model: FALLBACK_WORKER_MODEL,
			fallbackUsed: true,
			message: `Worker model: ${FALLBACK_WORKER_MODEL} (no available models reported, using fallback)`,
		};
	}

	// Check if preferred is available (check both bare model name and provider/model forms).
	const preferredForms = new Set([
		PREFERRED_WORKER_MODEL,
		`x-ai/${PREFERRED_WORKER_MODEL}`,
	]);
	for (const candidate of preferredForms) {
		if (available.has(candidate)) {
			return {
				model: PREFERRED_WORKER_MODEL,
				fallbackUsed: false,
				message: `Worker model: ${PREFERRED_WORKER_MODEL} (preferred)`,
			};
		}
	}

	// Preferred unavailable; use fallback
	return {
		model: FALLBACK_WORKER_MODEL,
		fallbackUsed: true,
		message: `Worker model: ${FALLBACK_WORKER_MODEL} (preferred ${PREFERRED_WORKER_MODEL} unavailable, using fallback)`,
	};
}
