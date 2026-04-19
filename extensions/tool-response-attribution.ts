// ABOUTME: Tool Response Attribution Guard — prevents tool/extension results from being treated as user input.
// ABOUTME: Wraps custom message content with XML-tagged framing so the LLM knows these are system messages.

/**
 * Tool Response Attribution Guard
 *
 * Fixes the "tool result treated as user input" bug where custom messages
 * from extensions (subagent results, plan viewer events, tool outputs, etc.)
 * are converted to `role: "user"` by the core `convertToLlm()` function,
 * causing the LLM to misinterpret them as things the user typed.
 *
 * Strategy:
 * - Hook into the `context` event (fires before `convertToLlm`)
 * - Find all `role: "custom"` messages
 * - Wrap their content with clear XML-tagged attribution framing
 * - The LLM sees the framing even after the role becomes "user"
 *
 * This is the same defensive pattern used by message-integrity-guard.ts
 * and security-guard.ts.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Attribution Framing
// ============================================================================

/**
 * Map of customType → framing function.
 * Each returns [prefix, suffix] to wrap the content.
 */
const ATTRIBUTION_MAP: Record<string, (content: string) => [string, string]> = {
	// Subagent results — tool/agent output, NOT user input
	"subagent-result": () => [
		"[SYSTEM: The following is output from a background subagent/tool, NOT user input. Process it as a tool result.]\n",
		"",
	],

	// Plan viewer events — system notifications
	"plan-approved": () => [
		"[SYSTEM: Plan viewer notification — the user approved the plan via the UI.]\n",
		"",
	],
	"plan-changes-requested": () => [
		"[SYSTEM: Plan viewer notification — the user requested changes via the UI.]\n",
		"",
	],

	// Plan viewer answers — this IS user input, but from the UI
	"plan-viewer-answers": () => [
		"[SYSTEM: The user submitted these answers via the plan viewer UI.]\n",
		"",
	],

	// Spec viewer events
	"spec-approved": () => [
		"[SYSTEM: Spec viewer notification — the user approved the spec via the UI.]\n",
		"",
	],
	"spec-changes-requested": () => [
		"[SYSTEM: Spec viewer notification — the user requested changes via the UI.]\n",
		"",
	],

	// Test viewer events
	"tests-approved": () => [
		"[SYSTEM: Test viewer notification — the user approved the tests via the UI.]\n",
		"",
	],
	"test-gen-complete": () => [
		"[SYSTEM: Test generation completed. The following is tool output, NOT user input.]\n",
		"",
	],

	// Toolkit command results
	"toolkit-command-result": () => [
		"[SYSTEM: The following is output from a toolkit command execution, NOT user input.]\n",
		"",
	],
	"toolkit-command": () => [
		"[SYSTEM: Toolkit command event, NOT user input.]\n",
		"",
	],

	// Memory/session events
	"memory-cycle-resume": () => [
		"[SYSTEM: Memory cycle resumed. The following is restored context, NOT user input.]\n",
		"",
	],
	"memory-restored": () => [
		"[SYSTEM: Memory restored from previous session. NOT user input.]\n",
		"",
	],
	"session-recap": () => [
		"[SYSTEM: Session recap generated. NOT user input.]\n",
		"",
	],
	"session-recap-card": () => [
		"[SYSTEM: Session recap card. NOT user input.]\n",
		"",
	],

	// Vulnerability scan results
	"vulnerability-sweep-result": () => [
		"[SYSTEM: Vulnerability scan result. Tool output, NOT user input.]\n",
		"",
	],
	"vulnerability-install-result": () => [
		"[SYSTEM: Vulnerability install check result. Tool output, NOT user input.]\n",
		"",
	],

	// Viewer configs — these are system events
	"qa-rico-config": () => [
		"[SYSTEM: QA Rico viewer configuration event, NOT user input.]\n",
		"",
	],
	"swagbucks-config": () => [
		"[SYSTEM: Swagbucks viewer configuration event, NOT user input.]\n",
		"",
	],

	// Security/system events
	"security-guard-event": () => [
		"[SYSTEM: Security guard event. NOT user input.]\n",
		"",
	],
	"task-validation": () => [
		"[SYSTEM: Task validation result. NOT user input.]\n",
		"",
	],
	"auto-compact-gate": () => [
		"[SYSTEM: Auto-compaction gate event. NOT user input.]\n",
		"",
	],

	// Dream system
	"dream-config": () => [
		"[SYSTEM: Dream configuration event. NOT user input.]\n",
		"",
	],
	"dream-reminder": () => [
		"[SYSTEM: Dream cycle reminder. NOT user input.]\n",
		"",
	],
	"dream-status": () => [
		"[SYSTEM: Dream status update. NOT user input.]\n",
		"",
	],
};

/**
 * Default framing for unknown custom types.
 */
function defaultFraming(customType: string): [string, string] {
	return [
		`[SYSTEM: Extension message (${customType}). This is a system/tool event, NOT user input.]\n`,
		"",
	];
}

/**
 * Wrap a content string with attribution framing.
 */
function wrapContent(content: string, customType: string): string {
	const framingFn = ATTRIBUTION_MAP[customType];
	const [prefix, suffix] = framingFn ? framingFn(content) : defaultFraming(customType);
	return prefix + content + suffix;
}

/**
 * Apply attribution framing to a custom message's content.
 * Handles both string content and content arrays.
 */
function frameCustomMessage(msg: any): any {
	const customType = msg.customType || "unknown";

	if (typeof msg.content === "string") {
		return {
			...msg,
			content: wrapContent(msg.content, customType),
		};
	}

	if (Array.isArray(msg.content)) {
		// Find the first text block and prepend framing to it
		const framingFn = ATTRIBUTION_MAP[customType];
		const [prefix, suffix] = framingFn ? framingFn("") : defaultFraming(customType);

		let prefixApplied = false;
		const framedContent = msg.content.map((block: any) => {
			if (block.type === "text" && block.text && !prefixApplied) {
				prefixApplied = true;
				return {
					...block,
					text: prefix + block.text + suffix,
				};
			}
			return block;
		});

		// If no text block found, prepend a text block with framing
		if (!prefixApplied) {
			framedContent.unshift({
				type: "text",
				text: prefix.trimEnd(),
			});
		}

		return {
			...msg,
			content: framedContent,
		};
	}

	return msg;
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function toolResponseAttribution(pi: ExtensionAPI) {
	// ========================================================================
	// CONTEXT HANDLER: Frame custom messages before convertToLlm
	// ========================================================================
	pi.on("context", async (event) => {
		const messages = event.messages;
		if (!messages || messages.length === 0) return;

		let anyModified = false;
		const framedMessages = messages.map((msg: any) => {
			// Only process custom messages — these are the ones that get
			// converted to role: "user" by convertToLlm()
			if (msg.role !== "custom") return msg;

			// Skip messages that already have attribution framing
			const content = typeof msg.content === "string"
				? msg.content
				: Array.isArray(msg.content)
					? msg.content.find((b: any) => b.type === "text")?.text || ""
					: "";

			if (content.startsWith("[SYSTEM:")) return msg;

			anyModified = true;
			return frameCustomMessage(msg);
		});

		if (anyModified) {
			return { messages: framedMessages };
		}

		// No modifications needed
		return;
	});
}

// ============================================================================
// Exports for testing
// ============================================================================

export { frameCustomMessage, wrapContent, ATTRIBUTION_MAP, defaultFraming };
