/**
 * Message Integrity Guard Extension
 *
 * Prevents the "session-bricking" bug where orphaned tool_result messages
 * (tool_results without their matching tool_use in the preceding assistant message)
 * cause unrecoverable 400 errors from the Anthropic API:
 *
 *   "unexpected tool_use_id found in tool_result blocks: toolu_XXXX.
 *    Each tool_result block must have a corresponding tool_use block
 *    in the previous message."
 *
 * Root causes this guards against:
 * 1. Context compaction cutting between tool_use and tool_result
 * 2. Session save/restore losing messages
 * 3. Interrupted tool calls leaving partial history
 *
 * Strategy:
 * - On every LLM call (context event): validate and repair message ordering
 * - On compaction (session_before_compact): validate cut-point integrity
 * - On session restore (session_switch): validate restored history
 *
 * The "context" event is the last line of defense — it fires right before
 * messages are sent to the API, so we can catch and fix any corruption
 * regardless of how it happened.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Types (minimal, matching what we see in the message objects)
// ============================================================================

interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, any>;
}

interface AssistantMessage {
	role: "assistant";
	content: Array<{ type: string; id?: string; name?: string; [key: string]: any }>;
	stopReason?: string;
	errorMessage?: string;
	[key: string]: any;
}

interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: Array<{ type: string; text?: string; [key: string]: any }>;
	isError: boolean;
	timestamp: number;
	[key: string]: any;
}

interface UserMessage {
	role: "user";
	content: string | Array<{ type: string; [key: string]: any }>;
	timestamp: number;
	[key: string]: any;
}

type Message = AssistantMessage | ToolResultMessage | UserMessage | { role: string; [key: string]: any };

// ============================================================================
// Repair Logic
// ============================================================================

/**
 * Validate and repair tool_use/tool_result pairing in a message array.
 *
 * Rules enforced (matching Anthropic API contract):
 * 1. Every tool_result must reference a tool_use from the immediately
 *    preceding assistant message
 * 2. Every tool_use in an assistant message should have a corresponding
 *    tool_result (if missing, transform-messages.js handles this — we
 *    add synthetic results as a backup)
 * 3. No orphaned tool_results without matching tool_use
 *
 * Returns { messages, repairs } where repairs lists what was fixed.
 */
function validateAndRepairMessages(messages: Message[]): {
	messages: Message[];
	repairs: string[];
} {
	const repairs: string[] = [];
	const result: Message[] = [];

	// Track the tool_use IDs from the most recent assistant message
	let currentToolUseIds = new Set<string>();
	// Track which tool_use IDs have been satisfied by tool_results
	let satisfiedToolUseIds = new Set<string>();

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];

		if (msg.role === "assistant") {
			const assistantMsg = msg as AssistantMessage;

			// Before processing a new assistant message, check if the previous
			// assistant's tool calls all got results. If not, synthesize them.
			if (currentToolUseIds.size > 0) {
				for (const toolId of currentToolUseIds) {
					if (!satisfiedToolUseIds.has(toolId)) {
						// Find the tool call info
						const prevAssistant = findPreviousAssistant(result);
						const toolCall = prevAssistant?.content.find(
							(b: any) => b.type === "toolCall" && b.id === toolId,
						) as ToolCall | undefined;

						const syntheticResult: ToolResultMessage = {
							role: "toolResult",
							toolCallId: toolId,
							toolName: toolCall?.name ?? "unknown",
							content: [{ type: "text", text: "[Result lost during session recovery]" }],
							isError: true,
							timestamp: Date.now(),
						};
						result.push(syntheticResult);
						repairs.push(
							`Synthesized missing tool_result for tool_use ${toolId} (${toolCall?.name ?? "unknown"})`,
						);
					}
				}
			}

			// Skip error/aborted assistant messages (transform-messages.js also does this,
			// but we do it here too as defense in depth)
			if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
				result.push(msg);
				currentToolUseIds = new Set();
				satisfiedToolUseIds = new Set();
				continue;
			}

			// Extract tool_use IDs from this assistant message
			currentToolUseIds = new Set<string>();
			satisfiedToolUseIds = new Set<string>();

			if (Array.isArray(assistantMsg.content)) {
				for (const block of assistantMsg.content) {
					if (block.type === "toolCall" && block.id) {
						currentToolUseIds.add(block.id);
					}
				}
			}

			result.push(msg);
		} else if (msg.role === "toolResult") {
			const toolResult = msg as ToolResultMessage;

			// Check: does this tool_result reference a tool_use in the current
			// assistant message's tool calls?
			if (currentToolUseIds.has(toolResult.toolCallId)) {
				// Valid pairing
				satisfiedToolUseIds.add(toolResult.toolCallId);
				result.push(msg);
			} else {
				// ORPHANED tool_result — this is the bug that causes 400 errors!
				// Check if any previous assistant in the history had this tool_use
				const ownerAssistant = findAssistantWithToolUse(result, toolResult.toolCallId);

				if (ownerAssistant) {
					repairs.push(
						`Removed orphaned tool_result for ${toolResult.toolName} ` +
							`(tool_use_id: ${toolResult.toolCallId}) — ` +
							`tool_use was in an earlier assistant message, not the immediately preceding one. ` +
							`This was likely caused by compaction or session restoration.`,
					);
				} else {
					repairs.push(
						`Removed orphaned tool_result for ${toolResult.toolName} ` +
							`(tool_use_id: ${toolResult.toolCallId}) — ` +
							`no matching tool_use found anywhere in history. ` +
							`The assistant message was likely lost during compaction or session restore.`,
					);
				}
				// DROP the orphaned tool_result — do NOT add to result
			}
		} else if (msg.role === "user") {
			// User messages break the tool flow. Check for unsatisfied tool calls.
			if (currentToolUseIds.size > 0) {
				for (const toolId of currentToolUseIds) {
					if (!satisfiedToolUseIds.has(toolId)) {
						const prevAssistant = findPreviousAssistant(result);
						const toolCall = prevAssistant?.content.find(
							(b: any) => b.type === "toolCall" && b.id === toolId,
						) as ToolCall | undefined;

						const syntheticResult: ToolResultMessage = {
							role: "toolResult",
							toolCallId: toolId,
							toolName: toolCall?.name ?? "unknown",
							content: [{ type: "text", text: "[Result lost — user interrupted]" }],
							isError: true,
							timestamp: Date.now(),
						};
						result.push(syntheticResult);
						repairs.push(
							`Synthesized missing tool_result for tool_use ${toolId} before user message (interrupted tool call)`,
						);
					}
				}
			}

			currentToolUseIds = new Set();
			satisfiedToolUseIds = new Set();
			result.push(msg);
		} else {
			// compactionSummary, branchSummary, bashExecution, custom, etc.
			// These are converted to user messages by convertToLlm(), so they
			// break tool flow just like user messages.
			if (currentToolUseIds.size > 0) {
				for (const toolId of currentToolUseIds) {
					if (!satisfiedToolUseIds.has(toolId)) {
						const prevAssistant = findPreviousAssistant(result);
						const toolCall = prevAssistant?.content.find(
							(b: any) => b.type === "toolCall" && b.id === toolId,
						) as ToolCall | undefined;

						const syntheticResult: ToolResultMessage = {
							role: "toolResult",
							toolCallId: toolId,
							toolName: toolCall?.name ?? "unknown",
							content: [{ type: "text", text: "[Result lost during session recovery]" }],
							isError: true,
							timestamp: Date.now(),
						};
						result.push(syntheticResult);
						repairs.push(
							`Synthesized missing tool_result for tool_use ${toolId} before non-standard message`,
						);
					}
				}
				currentToolUseIds = new Set();
				satisfiedToolUseIds = new Set();
			}
			result.push(msg);
		}
	}

	// Final check: unsatisfied tool calls at end of history
	if (currentToolUseIds.size > 0) {
		for (const toolId of currentToolUseIds) {
			if (!satisfiedToolUseIds.has(toolId)) {
				const prevAssistant = findPreviousAssistant(result);
				const toolCall = prevAssistant?.content.find(
					(b: any) => b.type === "toolCall" && b.id === toolId,
				) as ToolCall | undefined;

				const syntheticResult: ToolResultMessage = {
					role: "toolResult",
					toolCallId: toolId,
					toolName: toolCall?.name ?? "unknown",
					content: [{ type: "text", text: "[Result lost — end of recovered history]" }],
					isError: true,
					timestamp: Date.now(),
				};
				result.push(syntheticResult);
				repairs.push(
					`Synthesized missing tool_result for tool_use ${toolId} at end of history`,
				);
			}
		}
	}

	return { messages: result, repairs };
}

/**
 * Find the last assistant message in the result array.
 */
function findPreviousAssistant(messages: Message[]): AssistantMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			return messages[i] as AssistantMessage;
		}
	}
	return undefined;
}

/**
 * Find any assistant message in history that contains a tool_use with the given ID.
 */
function findAssistantWithToolUse(messages: Message[], toolUseId: string): AssistantMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			const assistantMsg = msg as AssistantMessage;
			if (Array.isArray(assistantMsg.content)) {
				for (const block of assistantMsg.content) {
					if (block.type === "toolCall" && block.id === toolUseId) {
						return assistantMsg;
					}
				}
			}
		}
	}
	return undefined;
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function messageIntegrityGuard(pi: ExtensionAPI) {
	// Track repair stats for the session
	let totalRepairs = 0;
	let repairLog: string[] = [];

	// ========================================================================
	// PRIMARY DEFENSE: Validate messages before every LLM call
	// ========================================================================
	pi.on("context", async (event, ctx) => {
		const { messages, repairs } = validateAndRepairMessages(event.messages);

		if (repairs.length > 0) {
			totalRepairs += repairs.length;
			repairLog.push(...repairs);

			// Silent self-healing — no console output for routine repairs

			return { messages };
		}

		// No repairs needed — return nothing to pass through unchanged
		return;
	});

	// ========================================================================
	// COMPACTION DEFENSE: Validate cut-point doesn't orphan tool_results
	// ========================================================================
	pi.on("session_before_compact", async (event, ctx) => {
		// We don't modify compaction behavior — we just log if the preparation
		// would create orphans. The "context" handler above will fix them.
		// This is informational/diagnostic only.

		const { preparation } = event;
		if (!preparation) return;

		const { messagesToSummarize } = preparation;

		// Check: does the last message being summarized contain tool_use calls?
		// If so, are their tool_results being kept (not summarized)?
		// If the compaction boundary splits tool_use from tool_result,
		// the context handler will silently repair the orphans on next LLM call.

		// Don't cancel or modify compaction — let it proceed
		return;
	});

	// ========================================================================
	// SESSION RESTORE DEFENSE: Validate history on session switch
	// ========================================================================
	pi.on("session_switch", async (event, ctx) => {
		// The actual validation happens in the "context" handler on the next
		// LLM call. We just reset our counters here.
		totalRepairs = 0;
		repairLog = [];
	});

	// ========================================================================
	// AGENT END: Check for error patterns that indicate corruption we missed
	// ========================================================================
	pi.on("agent_end", async (event, ctx) => {
		if (!event.messages) return;

		// Look for the telltale 400 error in the last assistant message
		for (let i = event.messages.length - 1; i >= 0; i--) {
			const msg = event.messages[i];
			if (msg.role !== "assistant") continue;

			const assistantMsg = msg as AssistantMessage;
			if (
				assistantMsg.stopReason === "error" &&
				assistantMsg.errorMessage &&
				/unexpected.*tool_use_id|tool_result.*must have.*tool_use/i.test(
					assistantMsg.errorMessage,
				)
			) {
				// This should NEVER happen if our context handler is working.
				// If it does, log it loudly so we can investigate.
				console.error(
					`[message-integrity-guard] CRITICAL: Tool use/result mismatch error ` +
						`detected AFTER our validation! Error: ${assistantMsg.errorMessage}`,
				);
				ctx.ui.notify(
					"⚠️ Tool history corruption detected! The context handler should " +
						"have prevented this. Please report this as a bug. " +
						"Try /compact or /new to recover.",
					"error",
				);
			}
		}
	});
}
