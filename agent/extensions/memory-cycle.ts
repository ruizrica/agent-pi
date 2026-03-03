// ABOUTME: Memory-aware compaction extension — hooks into pi's native compaction to save/restore context.
// ABOUTME: Writes daily logs, session state, and optionally updates MEMORY.md during every compaction cycle.
/**
 * Memory Cycle — Automatic memory-aware compaction with seamless restore
 *
 * Hooks into pi's native compaction system to:
 * 1. BEFORE compact: Extract session insights (daily log, session state, stable facts)
 * 2. AFTER compact: Inject restored memory context so agent continues seamlessly
 *
 * Also provides:
 *   /cycle [instructions]  — Manual command to trigger compact → new session → restore
 *   cycle_memory            — LLM-callable tool for the same workflow
 *
 * The agent gets a clean context window but retains full awareness of
 * everything that happened before.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// convertToLlm and serializeConversation available if needed for custom summary generation
import { Type } from "@sinclair/typebox";
import {
	getProjectName,
	getTimestamp,
	extractFileOps,
	writeDailyLog,
	writeSessionState,
	readRecentLogs,
	readSessionState,
	extractCompactionContext,
	buildRestorationContent,
	buildCycleMemoryInjection,
} from "./lib/memory-cycle-helpers.ts";

// ── Tool Parameters ──────────────────────────────────────────────────

const CycleParams = Type.Object({
	instructions: Type.Optional(
		Type.String({ description: "Custom instructions for what to focus on in the summary" }),
	),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Track cwd across compact events (before_compact → compact)
	let preCompactCwd: string = "";

	// ── Hook: session_before_compact ──────────────────────────────
	// Runs as part of pi's native compaction (both auto and manual /compact).
	// We extract session insights and save them to disk BEFORE the context
	// is compacted. We do NOT cancel or replace compaction — we let pi's
	// default compaction run normally.
	pi.on("session_before_compact", async (event, ctx) => {
		preCompactCwd = ctx.cwd;
		const { preparation } = event;

		try {
			const project = getProjectName(ctx.cwd);
			const { date, time, iso } = getTimestamp();

			// Use pi's already-extracted file operations from preparation
			const prepFileOps = preparation.fileOps;
			const readFiles = prepFileOps?.read ? [...prepFileOps.read] : [];
			const writtenFiles = prepFileOps?.written ? [...prepFileOps.written] : [];
			const editedFiles = prepFileOps?.edited ? [...prepFileOps.edited] : [];
			const modifiedFiles = [...new Set([...writtenFiles, ...editedFiles])];

			// Also supplement with branch-level file ops for completeness
			const branchOps = extractFileOps(ctx.sessionManager.getBranch());
			for (const f of branchOps.read) { if (!readFiles.includes(f)) readFiles.push(f); }
			for (const f of branchOps.modified) { if (!modifiedFiles.includes(f)) modifiedFiles.push(f); }

			// Build a compact summary from the messages being compacted
			const { summaryText, continueText } = extractCompactionContext(
				preparation.messagesToSummarize,
				preparation.previousSummary,
			);

			// Write daily log entry
			writeDailyLog({
				project,
				summary: summaryText,
				date,
				time,
				keyFiles: [...modifiedFiles, ...readFiles].slice(0, 10),
				continuePrompt: continueText,
			});

			// Write session state
			writeSessionState(ctx.cwd, {
				project,
				iso,
				continuePrompt: continueText,
				currentTask: summaryText,
				filesEdited: modifiedFiles.slice(0, 10),
				filesRead: readFiles.slice(0, 10),
			});

			ctx.ui.notify("📝 Memory saved (daily log + session state)", "info");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[memory-cycle] Pre-compact save failed: ${msg}`);
			// Don't cancel compaction on save failure
		}

		// Return nothing = let pi's default compaction proceed normally
		return;
	});

	// ── Hook: session_compact ─────────────────────────────────────
	// Fires AFTER compaction completes. We inject a memory-restore message
	// so the agent knows what happened and can continue seamlessly.
	pi.on("session_compact", async (event, ctx) => {
		const { compactionEntry } = event;

		// Read recent logs and session state for context enrichment
		const recentLogs = readRecentLogs();
		const sessionState = readSessionState(preCompactCwd || ctx.cwd);

		// Build restoration context
		const parts = buildRestorationContent(sessionState);

		// Inject the restoration context as a follow-up so the agent is aware
		pi.sendMessage(
			{
				customType: "memory-restored",
				content: parts.join("\n"),
				display: false, // Don't clutter the display — agent sees it internally
			},
			{ deliverAs: "nextTurn" },
		);

		ctx.ui.notify("✅ Compaction complete — memory preserved", "success");
	});


	// ── /cycle command ────────────────────────────────────────────
	// Manual command: compact → new session → restore (full reset)
	pi.registerCommand("cycle", {
		description: "Compact → new session → restore: fresh context with full memory",
		handler: async (args, ctx) => {
			const customInstructions = args?.trim() || undefined;

			await ctx.waitForIdle();

			const parentSessionFile = ctx.sessionManager.getSessionFile();
			const entries = ctx.sessionManager.getBranch();

			if (entries.length < 3) {
				ctx.ui.notify("Session too short to cycle — nothing to compact.", "warning");
				return;
			}

			ctx.ui.notify("🔄 Memory Cycle: Step 1/3 — Compacting...", "info");

			// Step 1: Compact and capture summary
			const compactionSummary = await new Promise<string | null>((resolve) => {
				ctx.compact({
					customInstructions: customInstructions
						?? "Create a comprehensive summary preserving all goals, decisions, progress, file changes, and context needed to continue work seamlessly in a fresh session.",
					onComplete: () => {
						// The session_before_compact hook already saved memory artifacts.
						// Extract summary from post-compaction session.
						const postEntries = ctx.sessionManager.getBranch();
						for (let i = postEntries.length - 1; i >= 0; i--) {
							const entry = postEntries[i];
							if (entry.type === "compaction") {
								resolve((entry as any).summary ?? null);
								return;
							}
						}
						resolve(null);
					},
					onError: (err) => {
						ctx.ui.notify(`❌ Compaction failed: ${err.message}`, "error");
						resolve(null);
					},
				});
			});

			if (!compactionSummary) {
				ctx.ui.notify("❌ Memory Cycle aborted — compaction produced no summary.", "error");
				return;
			}

			ctx.ui.notify("🔄 Memory Cycle: Step 2/3 — Creating fresh session...", "info");

			// Gather restoration context
			const recentLogs = readRecentLogs();
			const sessionState = readSessionState(ctx.cwd);

			// Step 2: New session with parent link and memory injection
			const result = await ctx.newSession({
				parentSession: parentSessionFile,
				setup: async (sm) => {
					const memoryText = buildCycleMemoryInjection({
						compactionSummary,
						sessionState,
						recentLogs,
					});

					sm.appendMessage({
						role: "user",
						content: [{ type: "text", text: memoryText }],
						timestamp: Date.now(),
					});
				},
			});

			if (result.cancelled) {
				ctx.ui.notify("Memory Cycle cancelled — session switch was blocked.", "warning");
				return;
			}

			ctx.ui.notify("✅ Memory Cycle: Step 3/3 — Complete! Fresh context with full memory.", "success");
		},
	});

	// ── cycle_memory tool (LLM-callable) ─────────────────────────

	pi.registerTool({
		name: "cycle_memory",
		label: "Cycle Memory",
		description: "Compact current session, start fresh, and restore memory. Use when context is getting large or you want a clean slate while keeping all progress.",
		promptSnippet: "Compact → clear → restore: fresh context with full memory",
		promptGuidelines: [
			"Use cycle_memory when context usage is high (>70%) or the user asks to compact/cycle/refresh memory.",
			"After cycle_memory completes, you will have a fresh context window with full memory of what happened.",
		],
		parameters: CycleParams,
		async execute(_toolCallId, params: { instructions?: string }, _signal, _onUpdate, ctx) {
			const customInstructions = params.instructions?.trim() || undefined;

			// Compact directly using ctx.compact() — same approach as footer auto-compaction.
			// The session_before_compact hook saves daily log + session state automatically.
			const compactionResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
				ctx.compact({
					customInstructions: customInstructions
						?? "Create a comprehensive summary preserving all goals, decisions, progress, file changes, and context needed to continue work seamlessly.",
					onComplete: () => {
						resolve({ success: true });
					},
					onError: (err: Error) => {
						resolve({ success: false, error: err.message });
					},
				});
			});

			if (!compactionResult.success) {
				return {
					content: [
						{
							type: "text",
							text: `Memory cycle failed: ${compactionResult.error}. Try /compact manually.`,
						},
					],
					details: { status: "failed", error: compactionResult.error },
				};
			}

			// Read restored context for the agent
			const sessionState = readSessionState(ctx.cwd);
			const recentLogs = readRecentLogs();
			const parts = buildRestorationContent(sessionState);

			if (recentLogs) {
				parts.push("", recentLogs);
			}

			// Send a follow-up message to nudge the agent to continue working
			pi.sendMessage(
				{
					customType: "memory-cycle-resume",
					content: "Memory cycle complete. Context compacted and restored. Continue where you left off — resume the task you were working on.",
					display: false,
				},
				{ deliverAs: "followUp", triggerTurn: true },
			);

			ctx.ui.notify("Memory Cycle complete — context compacted and restored", "success");

			return {
				content: [
					{
						type: "text",
						text: `Memory cycle complete. Context compacted and memory preserved.\n\n${parts.join("\n")}`,
					},
				],
				details: { status: "complete", instructions: params.instructions },
			};
		},
	});
}
