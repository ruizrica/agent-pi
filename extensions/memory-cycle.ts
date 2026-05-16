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

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
// convertToLlm and serializeConversation available if needed for custom summary generation
import { Type } from "@sinclair/typebox";
import { Box, Text } from "@earendil-works/pi-tui";
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
import { getProactiveCompactionPhase } from "./lib/context-gate.ts";

// ── Tool Parameters ──────────────────────────────────────────────────

const CycleParams = Type.Object({
	instructions: Type.Optional(
		Type.String({ description: "Custom instructions for what to focus on in the summary" }),
	),
});

// ── Compaction Card Details ──────────────────────────────────────────

interface CompactionCardDetails {
	/** "cycle" for cycle_memory, "auto" for footer auto-compact, "manual" for /compact */
	source: "cycle" | "auto" | "manual";
	/** Context percentage after compaction */
	postPercent: number;
	/** Recent session task, if available */
	task?: string;
	/** Recently edited files */
	recentFiles?: string[];
}

// ── Compaction Card Renderer ─────────────────────────────────────────
// Renders a minimal, elegant dark-themed status card when compaction
// completes. Appears for cycle_memory, auto-compact, and manual /compact.

function renderCompactionCard(
	message: any,
	_options: any,
	theme: any,
) {
	const details = message.details;
	const percent = details?.postPercent ?? 0;
	const source = details?.source ?? "cycle";

	// ── Title ───────────────────────────────────────────────────
	const label = source === "auto"
		? "Context Compacted"
		: source === "manual"
			? "Context Compacted"
			: "Memory Cycle Complete";
	const title = theme.fg("muted", label);

	// ── Percentage — color-coded by health ──────────────────────
	const pctColor = percent <= 30 ? "success" : percent <= 60 ? "muted" : "warning";
	const pctText = theme.fg(pctColor as any, `${percent}%`) +
		theme.fg("dim", " context used");

	// ── Detail lines (task + files) ─────────────────────────────
	const detailLines: string[] = [];

	if (details?.task) {
		const truncated = details.task.length > 72
			? details.task.slice(0, 69) + "..."
			: details.task;
		detailLines.push(
			theme.fg("dim", "task ") + theme.fg("muted", truncated),
		);
	}

	if (details?.recentFiles?.length) {
		const shown = details.recentFiles.slice(0, 3);
		const names = shown.map((f: string) => {
			const parts = f.split("/");
			return parts.length > 1 ? parts.slice(-2).join("/") : parts[0];
		});
		const more = details.recentFiles.length > 3
			? theme.fg("dim", ` +${details.recentFiles.length - 3}`)
			: "";
		detailLines.push(
			theme.fg("dim", "files ") +
			theme.fg("muted", names.join(theme.fg("dim", " / "))) + more,
		);
	}

	// ── Assemble card body ──────────────────────────────────────
	const lines: string[] = [
		title,
		pctText,
	];

	if (detailLines.length > 0) {
		lines.push("");  // blank separator line
		for (const dl of detailLines) lines.push(dl);
	}

	const body = lines.join("\n");

	// Custom dark-charcoal background — distinct from the ocean-blue theme
	// Neutral gray so it reads as a "system" card, not success/error
	const cardBg = (text: string) => `\x1b[48;2;30;36;42m${text}\x1b[49m`;
	const box = new Box(
		3,  // generous horizontal padding
		1,  // vertical breathing room
		cardBg,
	);
	box.addChild(new Text(body, 0, 0));
	return box;
}

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── Message Renderers ────────────────────────────────────────
	// Register custom renderers for compaction status cards.
	// These render in the chat when display:true is set on sendMessage.

	pi.registerMessageRenderer<CompactionCardDetails>("memory-cycle-resume", renderCompactionCard);
	pi.registerMessageRenderer<CompactionCardDetails>("auto-compact-resume", renderCompactionCard);
	pi.registerMessageRenderer<CompactionCardDetails>("memory-restored", renderCompactionCard);

	// ── Proactive compaction state ───────────────────────────────
	// Two-phase: prep at 70% (wrap up work), hard stop at 80% (call cycle_memory).
	// Flags prevent repeated injection within the same compaction cycle.
	let prepInjected = false;      // true after 70% prep message sent
	let compactInjected = false;   // true after 80% hard-stop message sent

	// ── Hook: before_agent_start — proactive compaction ──────────
	// Fires before every agent turn. Checks context usage and injects
	// messages to guide the LLM toward compaction before overflow.
	pi.on("before_agent_start", async (_event, ctx) => {
		const usage = ctx.getContextUsage();
		const { phase, percent } = getProactiveCompactionPhase(usage?.percent);

		if (phase === "compact" && !compactInjected) {
			compactInjected = true;
			ctx.ui.notify(
				`Context overflow detected, Auto-compacting... (escape to cancel)`,
				"info",
			);
			return {
				message: {
					customType: "auto-compact-gate",
					content: `URGENT: Context window is at ${Math.round(percent)}% capacity. You MUST call cycle_memory immediately to prevent context overflow. Do not perform any other actions first. Call cycle_memory now.`,
					display: false,
				},
			};
		}

		if (phase === "prep" && !prepInjected) {
			prepInjected = true;
			ctx.ui.notify(
				`Context at ${Math.round(percent)}% -- wrapping up soon`,
				"info",
			);
			return {
				message: {
					customType: "auto-compact-gate",
					content: `Context window is at ${Math.round(percent)}% capacity. Start wrapping up your current work: commit any in-progress changes, save state, and prepare for a memory cycle. When you finish your current step, call cycle_memory. Do not start any new large operations.`,
					display: false,
				},
			};
		}

		return {};
	});

	// Track cwd across compact events (before_compact → compact)
	let preCompactCwd: string = "";

	// When cycle_memory triggers compaction, suppress redundant UI from
	// session_before_compact and session_compact — the cycle_memory
	// onComplete handler shows a single clean card instead.
	let cycleMemoryActive = false;

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

			// Only show notification for manual /compact — cycle_memory shows its own card
			if (!cycleMemoryActive) {
				ctx.ui.notify("Memory saved (daily log + session state)", "info");
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[memory-cycle] Pre-compact save failed: ${msg}`);
			// Don't cancel compaction on save failure
		}

		// Return nothing = let pi's default compaction proceed normally
		return;
	});

	// ── Hook: session_compact ─────────────────────────────────────
	// Fires AFTER compaction completes (both manual /compact and core auto-compaction).
	// We inject a memory-restore message so the agent knows what happened
	// and can continue seamlessly.
	//
	// For core auto-compaction: the interactive-mode handles UI rebuild via
	// auto_compaction_start/end events. We just provide the restoration context.
	// For manual /compact: we send both a display card and restoration context.
	pi.on("session_compact", async (event, ctx) => {
		// Reset proactive compaction flags — allows next cycle to trigger
		prepInjected = false;
		compactInjected = false;

		const { compactionEntry } = event;

		const recentLogs = readRecentLogs();
		const sessionState = readSessionState(preCompactCwd || ctx.cwd);

		// Build restoration context
		const parts = buildRestorationContent(sessionState);
		if (recentLogs) parts.push("", recentLogs);

		const postUsage = ctx.getContextUsage();
		const postPercent = postUsage?.percent ? Math.round(postUsage.percent) : 0;

		// When cycle_memory is driving compaction, skip the display card here —
		// the cycle_memory onComplete handler shows a single clean card instead.
		// Only show the card for manual /compact or core auto-compaction.
		if (!cycleMemoryActive) {
			// Short card visible to user
			pi.sendMessage(
				{
					customType: "memory-restored",
					content: `Context compacted -- now at ${postPercent}%.`,
					display: true,
					details: {
						source: "manual",
						postPercent,
						task: sessionState?.currentTask,
						recentFiles: sessionState?.filesEdited,
					} satisfies CompactionCardDetails,
				},
			);
		}

		// Full restoration context for the agent (not displayed)
		// Always send this — cycle_memory onComplete will add its own,
		// but for manual /compact this is the only restoration message.
		if (!cycleMemoryActive) {
			pi.sendMessage(
				{
					customType: "memory-restored",
					content: parts.join("\n"),
					display: false,
				},
				{ deliverAs: "nextTurn" },
			);
		}
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

			ctx.ui.notify("Memory Cycle: Step 1/3 — Compacting...", "info");

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
						ctx.ui.notify(`Compaction failed: ${err.message}`, "error");
						resolve(null);
					},
				});
			});

			if (!compactionSummary) {
				ctx.ui.notify("Memory Cycle aborted — compaction produced no summary.", "error");
				return;
			}

			ctx.ui.notify("Memory Cycle: Step 2/3 — Creating fresh session...", "info");

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

			ctx.ui.notify("Memory Cycle complete — fresh context with full memory.", "success");
		},
	});

	// ── Deferred compaction via agent_end hook ────────────────────
	// The cycle_memory tool CANNOT call ctx.compact() directly because
	// compact() calls abort() which waits for the agent to be idle,
	// but the agent is blocked waiting for the tool to return → deadlock.
	//
	// Instead: tool sets a flag → returns immediately → agent_end fires
	// when the agent loop finishes → we compact from there (agent is idle).

	let pendingCycleMemory: { instructions?: string } | null = null;

	pi.on("agent_end", async (_event, ctx) => {
		if (!pendingCycleMemory) return;

		const request = pendingCycleMemory;
		pendingCycleMemory = null;

		// Signal to session_before_compact and session_compact hooks
		// to suppress their redundant UI — we show a single clean card.
		cycleMemoryActive = true;

		ctx.ui.setStatus("memory-cycle", "Compacting context...");

		ctx.compact({
			customInstructions: request.instructions
				?? "Create a comprehensive summary preserving all goals, decisions, progress, file changes, and context needed to continue work seamlessly.",
			onComplete: () => {
				cycleMemoryActive = false;

				const postUsage = ctx.getContextUsage();
				const postPercent = postUsage?.percent ? Math.round(postUsage.percent) : 0;

				// Read restored context for the agent
				const sessionState = readSessionState(ctx.cwd);
				const recentLogs = readRecentLogs();
				const parts = buildRestorationContent(sessionState);
				if (recentLogs) parts.push("", recentLogs);

				const resumeContent = [
					"Memory cycle complete — context compacted and restored.",
					`Context usage now at ${postPercent}%.`,
					"",
					...parts,
					"",
					"Continue where you left off. Resume the task you were working on before compaction. Do NOT ask the user what to do — just keep working.",
				].join("\n");

				ctx.ui.setStatus("memory-cycle", undefined);

				// Single clean display card — no separate notify() to avoid
				// duplicate text noise in the terminal.
				pi.sendMessage(
					{
						customType: "memory-cycle-resume",
						content: `Memory cycle complete -- context compacted and restored.\nContext usage now at ${postPercent}%.`,
						display: true,
						details: {
							source: "cycle",
							postPercent,
							task: sessionState?.currentTask,
							recentFiles: sessionState?.filesEdited,
						} satisfies CompactionCardDetails,
					},
				);

				// Full restoration context for the agent (not displayed)
				pi.sendMessage(
					{
						customType: "memory-cycle-resume",
						content: resumeContent,
						display: false,
					},
					{ deliverAs: "followUp", triggerTurn: true },
				);
			},
			onError: (err: Error) => {
				cycleMemoryActive = false;
				ctx.ui.setStatus("memory-cycle", undefined);
				ctx.ui.notify(`Memory Cycle failed: ${err.message}. Try /compact manually.`, "error");
			},
		});
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
			"The tool returns immediately — compaction happens after the current turn ends. You will be resumed automatically with restored context.",
		],
		parameters: CycleParams,

		renderCall(args, theme) {
			const hint = (args as any).instructions as string | undefined;
			const preview = hint
				? hint.length > 50 ? hint.slice(0, 47) + "..." : hint
				: "";
			const text = theme.fg("dim", "cycle_memory") +
				(preview ? theme.fg("dim", "  ") + theme.fg("muted", preview) : "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as { status?: string } | undefined;
			const status = details?.status ?? "done";
			const msg = status === "scheduled"
				? theme.fg("dim", "Memory cycle scheduled — compacting after this turn")
				: theme.fg("dim", "Memory cycle complete");
			return new Text(msg, 0, 0);
		},

		async execute(_toolCallId, params: { instructions?: string }, _signal, _onUpdate, ctx) {
			const customInstructions = params.instructions?.trim() || undefined;

			// Schedule compaction for after this agent turn ends (avoids deadlock).
			// The agent_end hook above picks this up and fires ctx.compact().
			pendingCycleMemory = { instructions: customInstructions };

			return {
				content: [
					{
						type: "text",
						text: "Memory cycle scheduled. Compaction will run automatically after this turn completes. You will be resumed with full memory context. Do not call any more tools — just finish this turn.",
					},
				],
				details: { status: "scheduled", instructions: params.instructions },
			};
		},
	});
}
