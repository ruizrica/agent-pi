// ABOUTME: Session Recap extension — automatic periodic summaries every N user messages.
// ABOUTME: Counts user messages, extracts recent exchanges, auto-categorizes work type.
// ABOUTME: Stores recaps in Obsidian (organized by project/date) + local .context/recaps/.
// ABOUTME: Tracks work threads across recaps and maintains a running session narrative.

/**
 * Session Recap — Periodic auto-summaries with intelligent organization
 *
 * Every N user messages (default: 5), this extension:
 * 1. Extracts the last N user↔assistant exchanges from the session branch
 * 2. Auto-categorizes the work (coding, debugging, research, planning, etc.)
 * 3. Detects continuing work threads across recaps
 * 4. Builds a structured, categorized markdown recap
 * 5. Stores it locally in .context/recaps/ with descriptive names
 * 6. Ingests it into Obsidian organized by project/date hierarchy
 * 7. Updates a running session-story.md narrative
 * 8. Injects a hidden context message so the agent stays grounded
 *
 * Also provides:
 *   /recap          — Manual trigger for an immediate recap
 *   /recap list     — Show all recaps for the current session
 *   /recap status   — Show message count and next recap timing
 *   /recap story    — Show the running session narrative
 *   /recap widget   — Show the recap widget
 *   /recap pin      — Pin the widget so it doesn't auto-dismiss
 *   /recap unpin    — Unpin and resume auto-dismiss
 *   /recap dismiss  — Manually dismiss the widget
 *   session_recap   — LLM-callable tool for on-demand recaps
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Box, Text } from "@mariozechner/pi-tui";
import {
	DEFAULT_RECAP_INTERVAL,
	extractRecentExchanges,
	detectCategory,
	detectThreads,
	buildRecapMarkdown,
	buildRecapSummary,
	buildRecapInjection,
	buildObsidianRecap,
	writeLocalRecap,
	updateRecapIndex,
	updateSessionStory,
	readRecapIndex,
	persistMessageCount,
	shouldSkipRecap,
	getProjectName,
	getTimestamp,
	CATEGORY_EMOJI,
	CATEGORY_LABEL,
	SESSION_STORY_FILE,
	RECAP_WIDGET_BG,
	renderRecapWidget,
	type RecapWidgetState,
	type WorkCategory,
} from "./lib/session-recap-helpers.ts";
import { obsidianExec } from "./lib/obsidian-cli.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ────────────────────────────────────────────────────────────

interface RecapCardDetails {
	recapNumber: number;
	exchangeCount: number;
	project: string;
	summary: string;
	category: WorkCategory;
}

// ── Tool Parameters ──────────────────────────────────────────────────

const RecapToolParams = Type.Object({
	reason: Type.Optional(
		Type.String({ description: "Why this recap is being triggered (e.g., 'before context switch', 'milestone reached')" }),
	),
});

// ── Recap Card Renderer ──────────────────────────────────────────────

function renderRecapCard(
	message: any,
	_options: any,
	theme: any,
) {
	const details = message.details as RecapCardDetails | undefined;
	const num = details?.recapNumber ?? 0;
	const count = details?.exchangeCount ?? 0;
	const summary = details?.summary ?? "";
	const category = details?.category ?? "mixed";

	const label = CATEGORY_LABEL[category] ?? "Work";

	const title = theme.fg("muted", `Session Recap #${num} — ${label}`);
	const info = theme.fg("dim", `${count} exchanges captured`);

	const lines: string[] = [title, info];

	if (summary) {
		const truncated = summary.length > 80
			? summary.slice(0, 77) + "..."
			: summary;
		lines.push("");
		lines.push(theme.fg("dim", truncated));
	}

	const body = lines.join("\n");

	// Dark blue-gray card background — subtle "system checkpoint" feel
	const cardBg = (text: string) => `\x1b[48;2;28;38;48m${text}\x1b[49m`;
	const box = new Box(3, 1, cardBg);
	box.addChild(new Text(body, 0, 0));
	return box;
}

// ── Extension State (module-level) ───────────────────────────────────

let messageCount = 0;
let recapPending = false;
let sessionCwd = "";

// ── Widget State (single recap widget — latest only) ─────────────────

let widgetCtx: any = null;
let widgetInvalidate: (() => void) | null = null;
let widgetDismissTimer: ReturnType<typeof setTimeout> | null = null;
let widgetPinned = false;

let recapWidgetState: RecapWidgetState | null = null;

const RESET_BG = "\x1b[49m";
const WHITE_BOLD = "\x1b[1;97m";
const RESET_ALL = "\x1b[0m";

function registerRecapWidget(state: RecapWidgetState) {
	if (!widgetCtx) return;
	if ((globalThis as any).__piSummaryModeActive) return;

	// Clear any existing dismiss timer
	if (widgetDismissTimer !== null) {
		clearTimeout(widgetDismissTimer);
		widgetDismissTimer = null;
	}

	// Store current state
	recapWidgetState = state;

	widgetCtx.ui.setWidget("recap", (_tui: any, theme: any) => {
		const bgKey = state.pinned ? "pinned" : "saved";
		const bg = RECAP_WIDGET_BG[bgKey] ?? RECAP_WIDGET_BG.saved;
		const bgFn = (text: string): string =>
			`${bg}${WHITE_BOLD}${text}${RESET_ALL}${RESET_BG}`;

		const box = new Box(1, 1, bgFn);
		const content = new Text("", 0, 0);
		box.addChild(content);

		widgetInvalidate = () => box.invalidate();

		return {
			render(width: number): string[] {
				// Refresh bg in case pin state changed
				const activeBgKey = recapWidgetState?.pinned ? "pinned" : "saved";
				const activeBg = RECAP_WIDGET_BG[activeBgKey] ?? RECAP_WIDGET_BG.saved;
				box.setBgFn((text: string): string =>
					`${activeBg}${WHITE_BOLD}${text}${RESET_ALL}${RESET_BG}`,
				);

				const liveState = recapWidgetState ?? state;
				const result = renderRecapWidget(liveState, width, theme);
				content.setText(result.lines.join("\n"));
				return box.render(width);
			},

			invalidate() {
				box.invalidate();
			},
		};
	});

	// Auto-dismiss after 25s (unless pinned)
	scheduleDismiss();
}

function scheduleDismiss() {
	if (widgetDismissTimer !== null) {
		clearTimeout(widgetDismissTimer);
	}
	if (widgetPinned) return; // Don't auto-dismiss if pinned
	widgetDismissTimer = setTimeout(() => {
		if (widgetPinned) return; // Double-check pin state
		dismissRecapWidget();
	}, 25_000);
}

function dismissRecapWidget() {
	if (widgetDismissTimer !== null) {
		clearTimeout(widgetDismissTimer);
		widgetDismissTimer = null;
	}
	if (widgetCtx) {
		widgetCtx.ui.setWidget("recap", undefined);
	}
	widgetInvalidate = null;
	recapWidgetState = null;
}

function pinRecapWidget() {
	widgetPinned = true;
	if (widgetDismissTimer !== null) {
		clearTimeout(widgetDismissTimer);
		widgetDismissTimer = null;
	}
	if (recapWidgetState) {
		recapWidgetState = { ...recapWidgetState, pinned: true };
		widgetInvalidate?.();
	}
}

function unpinRecapWidget() {
	widgetPinned = false;
	if (recapWidgetState) {
		recapWidgetState = { ...recapWidgetState, pinned: false };
		widgetInvalidate?.();
	}
	scheduleDismiss(); // Restart auto-dismiss timer
}

// ── Core Recap Logic ─────────────────────────────────────────────────

async function generateRecap(
	pi: ExtensionAPI,
	ctx: any,
	options: { manual?: boolean; reason?: string } = {},
): Promise<{ success: boolean; recapNumber: number; error?: string }> {
	const cwd = ctx.cwd;
	const project = getProjectName(cwd);
	const timestamp = getTimestamp();
	const entries = ctx.sessionManager.getBranch();

	// Read existing state
	const existingIndex = readRecapIndex(cwd);
	const recapNumber = (existingIndex?.recaps.length ?? 0) + 1;
	const existingThreads = existingIndex?.threads ?? [];

	// Dedup check
	if (!options.manual && shouldSkipRecap(cwd, messageCount)) {
		return { success: false, recapNumber, error: "Recap already exists for this message range" };
	}

	// Extract recent exchanges
	const interval = DEFAULT_RECAP_INTERVAL;
	const exchanges = extractRecentExchanges(entries, interval);

	if (exchanges.length === 0) {
		return { success: false, recapNumber, error: "No exchanges found to recap" };
	}

	// Smart categorization
	const category = detectCategory(exchanges);

	// Thread detection
	const { threads, activeThreadIds } = detectThreads(
		exchanges,
		existingThreads,
		recapNumber,
		timestamp.iso,
	);
	const activeThreads = threads.filter((t) => activeThreadIds.includes(t.id));

	// Build recap markdown
	const markdown = buildRecapMarkdown(
		exchanges, recapNumber, project, timestamp, category, activeThreads,
	);
	const summary = buildRecapSummary(exchanges);

	// 1. Write locally (organized by category)
	const localPath = writeLocalRecap(cwd, recapNumber, markdown, category, timestamp);

	// 2. Update local index with threads
	const allFilesModified = [...new Set(exchanges.flatMap((e) => e.filesModified))];
	const updatedIndex = updateRecapIndex(
		cwd,
		recapNumber,
		{
			project,
			timestamp: timestamp.iso,
			messageRange: { from: (recapNumber - 1) * interval + 1, to: recapNumber * interval },
			exchangeCount: exchanges.length,
			summary,
			category,
			filesModified: allFilesModified,
			threads: activeThreadIds,
			localPath,
		},
		messageCount,
		threads,
	);

	// 3. Update session story — the running narrative
	updateSessionStory(
		cwd, recapNumber, summary, category, timestamp,
		activeThreads, updatedIndex.recaps,
	);

	// 4. Ingest to Obsidian (non-blocking, graceful failure)
	let obsidianPath: string | undefined;
	try {
		const obsRecap = buildObsidianRecap(
			markdown, project, recapNumber, timestamp, category, activeThreads,
		);
		const result = await obsidianExec("create", {
			path: obsRecap.path,
			content: obsRecap.content,
		});
		if (result.success) {
			obsidianPath = obsRecap.path;
		}
	} catch (err) {
		// Obsidian is best-effort — don't fail the recap
		console.error(
			`[session-recap] Obsidian ingest failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// 5. Inject hidden context message (the agent grounding)
	const injection = buildRecapInjection(
		exchanges, recapNumber, project, category, activeThreads,
	);
	pi.sendMessage({
		customType: "session-recap",
		content: injection,
		display: false,
	});

	// 6. Show visible card
	pi.sendMessage({
		customType: "session-recap-card",
		content: `Session Recap #${recapNumber} — ${exchanges.length} exchanges captured`,
		display: true,
		details: {
			recapNumber,
			exchangeCount: exchanges.length,
			project,
			summary,
			category,
		} satisfies RecapCardDetails,
	});

	// 7. Register the live recap widget (subagent-widget style)
	registerRecapWidget({
		recapNumber,
		category,
		summary,
		threadCount: activeThreads.length,
		filesModified: allFilesModified,
		exchangeCount: exchanges.length,
		createdAt: Date.now(),
		pinned: widgetPinned,
	});

	return { success: true, recapNumber };
}

// ── Extension Entry Point ────────────────────────────────────────────

export default function sessionRecap(pi: ExtensionAPI) {
	// ── Message Renderers ────────────────────────────────────────
	pi.registerMessageRenderer<RecapCardDetails>("session-recap-card", renderRecapCard);

	// ── Input Event — Count User Messages ────────────────────────
	pi.on("input", async (event, _ctx) => {
		// Only count genuine user messages
		if (event.source !== "user") return;

		messageCount++;

		// Check if we've hit the recap interval
		if (messageCount > 0 && messageCount % DEFAULT_RECAP_INTERVAL === 0) {
			recapPending = true;
		}

		return {};
	});

	// ── Agent End — Generate Recap ───────────────────────────────
	// Runs after the agent finishes responding. If a recap is pending,
	// generate it here (agent is idle, safe to read branch / send messages).
	pi.on("agent_end", async (_event, ctx) => {
		if (!recapPending) return;
		recapPending = false;

		try {
			const result = await generateRecap(pi, ctx);
			if (result.success) {
				ctx.ui.notify(
					`Session Recap #${result.recapNumber} saved`,
					"info",
				);
			}
		} catch (err) {
			console.error(
				`[session-recap] Recap generation failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	});

	// ── Session Start — Restore Counter ──────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		sessionCwd = ctx.cwd;

		const index = readRecapIndex(ctx.cwd);
		if (index) {
			messageCount = index.messageCount;
		} else {
			messageCount = 0;
		}
		recapPending = false;
	});

	// ── Session Switch — Persist & Reset ─────────────────────────
	pi.on("session_switch", async (_event, ctx) => {
		// Persist current count before switching
		if (sessionCwd) {
			try {
				persistMessageCount(sessionCwd, messageCount);
			} catch { /* best effort */ }
		}

		sessionCwd = ctx.cwd;

		// Reset message count for the new session.
		// The index file tracks recaps/threads per session, but the
		// message counter is session-local to ensure proper 5-message
		// interval alignment for automatic recap generation.
		messageCount = 0;
		recapPending = false;
	});

	// ── Session Compact — Counter persists via index.json ────────
	pi.on("session_compact", async (_event, _ctx) => {
		// No action needed — counter lives in index.json, not session history
	});

	// ── /recap Command ───────────────────────────────────────────
	pi.registerCommand("recap", {
		description: "Session recaps: /recap (generate now), /recap list, /recap status, /recap story, /recap widget, /recap pin|unpin|dismiss",
		handler: async (args, ctx) => {
			widgetCtx = ctx; // Capture for widget operations
			const subcommand = args?.trim().toLowerCase();

			if (subcommand === "list") {
				const index = readRecapIndex(ctx.cwd);
				if (!index || index.recaps.length === 0) {
					ctx.ui.notify("No recaps yet for this session.", "info");
					return;
				}

				const lines = [
					`Session Recaps for ${index.project} (${index.recaps.length} total):`,
					"",
				];

				for (const recap of index.recaps) {
					const label = CATEGORY_LABEL[recap.category] ?? "Work";
					const time = recap.timestamp.split("T")[1]?.slice(0, 5) ?? "";
					lines.push(
						`  #${recap.recapNumber} — ${time} — ${label} — ${recap.exchangeCount} exchanges`,
					);
					lines.push(`    ${recap.summary}`);
					lines.push("");
				}

				// Show active threads
				const activeThreads = index.threads.filter(
					(t) => t.recapNumbers.length > 1,
				);
				if (activeThreads.length > 0) {
					lines.push("Active Threads:");
					for (const thread of activeThreads) {
						lines.push(`  [thread] ${thread.label} (spans recaps: ${thread.recapNumbers.join(", ")})`);
					}
					lines.push("");
				}

				lines.push(`Messages: ${messageCount} | Next recap at: ${Math.ceil((messageCount + 1) / DEFAULT_RECAP_INTERVAL) * DEFAULT_RECAP_INTERVAL}`);

				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			if (subcommand === "widget") {
			// Show the recap widget if one exists
			if (!recapWidgetState) {
				ctx.ui.notify("No recap widget yet — generate a recap first with /recap.", "info");
				return;
			}
			registerRecapWidget(recapWidgetState);
			ctx.ui.notify("Recap widget shown.", "info");
			return;
		}

		if (subcommand === "pin") {
			pinRecapWidget();
			ctx.ui.notify("Recap widget pinned — will not auto-dismiss.", "info");
			return;
		}

		if (subcommand === "unpin") {
			unpinRecapWidget();
			ctx.ui.notify("Recap widget unpinned — will auto-dismiss in 25s.", "info");
			return;
		}

		if (subcommand === "dismiss") {
			dismissRecapWidget();
			ctx.ui.notify("Recap widget dismissed.", "info");
			return;
		}

		if (subcommand === "status") {
				const nextAt = Math.ceil((messageCount + 1) / DEFAULT_RECAP_INTERVAL) * DEFAULT_RECAP_INTERVAL;
				const remaining = nextAt - messageCount;
				const index = readRecapIndex(ctx.cwd);
				const totalRecaps = index?.recaps.length ?? 0;
				const threadCount = index?.threads.length ?? 0;

				ctx.ui.notify(
					[
						`Messages: ${messageCount} | Next recap in: ${remaining} messages`,
						`Total recaps: ${totalRecaps} | Active threads: ${threadCount}`,
						`Interval: every ${DEFAULT_RECAP_INTERVAL} messages`,
					].join("\n"),
					"info",
				);
				return;
			}

			if (subcommand === "story") {
				const storyPath = join(ctx.cwd, SESSION_STORY_FILE);

				if (!existsSync(storyPath)) {
					ctx.ui.notify("No session story yet — recaps will build it automatically.", "info");
					return;
				}

				const story = readFileSync(storyPath, "utf-8");
				ctx.ui.notify(story, "info");
				return;
			}

			// Manual recap trigger
			ctx.ui.notify("Generating session recap...", "info");

			try {
				const result = await generateRecap(pi, ctx, { manual: true });
				if (result.success) {
					ctx.ui.notify(`Session Recap #${result.recapNumber} generated and saved.`, "success");
				} else {
					ctx.ui.notify(result.error ?? "Recap generation failed", "warning");
				}
			} catch (err) {
				ctx.ui.notify(
					`Recap failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
	});

	// ── session_recap Tool (LLM-callable) ────────────────────────
	pi.registerTool({
		name: "session_recap",
		label: "Session Recap",
		description: "Generate a session recap summarizing recent work. Auto-categorizes work type, tracks threads, stores in Obsidian and locally. Use at natural break points.",
		promptSnippet: "Summarize recent session activity and store the recap",
		promptGuidelines: [
			"Use session_recap when you notice a natural break point in the conversation.",
			"The tool automatically captures the last 5 exchanges and stores them.",
			"Recaps are auto-categorized (coding, debugging, research, planning, etc.).",
			"Work threads that span multiple recaps are tracked automatically.",
			"A running session narrative (session-story.md) is updated each recap.",
		],
		parameters: RecapToolParams,

		renderCall(args, theme) {
			const reason = (args as any).reason as string | undefined;
			const preview = reason
				? reason.length > 50 ? reason.slice(0, 47) + "..." : reason
				: "";
			const text = theme.fg("dim", "session_recap") +
				(preview ? theme.fg("dim", "  ") + theme.fg("muted", preview) : "");
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as { recapNumber?: number; success?: boolean; category?: string } | undefined;
			const num = details?.recapNumber ?? 0;
			const success = details?.success ?? false;
			const msg = success
				? theme.fg("dim", `Session Recap #${num} saved`)
				: theme.fg("warning", "Recap generation failed");
			return new Text(msg, 0, 0);
		},

		async execute(_toolCallId, params: { reason?: string }, _signal, _onUpdate, ctx) {
			widgetCtx = ctx; // Capture for widget registration
			try {
				const result = await generateRecap(pi, ctx, { reason: params.reason });
				return {
					content: [
						{
							type: "text",
							text: result.success
								? `Session Recap #${result.recapNumber} generated and saved. ${result.recapNumber} recaps total for this session.`
								: `Recap failed: ${result.error ?? "unknown error"}`,
						},
					],
					details: {
						success: result.success,
						recapNumber: result.recapNumber,
					},
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Recap generation error: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: { success: false },
				};
			}
		},
	});
}
