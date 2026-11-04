// ABOUTME: Pure state machine for the /tool-advisor on|off toggle — session-scoped enable/disable.
// ABOUTME: Default ON when configured (models.json has entry); refuses 'on' when not configured.
// ABOUTME: Fail-open: if the reviewer is unavailable (timeout, API error, parse failure), the gate
// ABOUTME: does NOT block — the tool call passes through unchanged.

export interface ToggleState {
	/** Whether the gate fires on tool calls this session. */
	enabled: boolean;
	/** Whether agents/models.json has a `tool-advisor` entry. Required for 'on'. */
	configured: boolean;
}

export type ToggleAction = "on" | "off" | "status";

export interface ToggleResult {
	state: ToggleState;
	message: string;
	level: "info" | "warning";
}

const NOT_CONFIGURED_MESSAGE =
	"tool-advisor: not configured. Add a 'tool-advisor' entry to agents/models.json " +
	"(provider: openrouter, model: openai/gpt-5-nano), then run /tool-advisor on.";

/**
 * Default to ON when the user has configured a model — the entry is a signal
 * of intent. Stay OFF when unconfigured, so removing the entry is a clean way
 * to permanently disable without code changes.
 *
 * Fail-open: even when enabled, the gate never blocks if the reviewer is
 * unavailable. See tool-advisor-runner.ts → reviewToolCall → failOpen().
 */
export function initialToggleState(configured: boolean): ToggleState {
	return { enabled: configured, configured };
}

/**
 * Apply a toggle action and return the new state + a user-facing message.
 * Pure — no side effects. The extension wires this to UI notifications.
 */
export function applyToggleAction(state: ToggleState, action: ToggleAction): ToggleResult {
	if (action === "on") {
		if (!state.configured) {
			return { state, message: NOT_CONFIGURED_MESSAGE, level: "warning" };
		}
		return {
			state: { ...state, enabled: true },
			message: "tool-advisor: ON — gating irreversible tool calls",
			level: "info",
		};
	}

	if (action === "off") {
		return {
			state: { ...state, enabled: false },
			message: "tool-advisor: OFF — no review on tool calls this session",
			level: "info",
		};
	}

	// status
	const label = !state.configured
		? "DISABLED (not configured)"
		: state.enabled
			? "ON"
			: "OFF";
	return { state, message: `tool-advisor: ${label}`, level: "info" };
}
