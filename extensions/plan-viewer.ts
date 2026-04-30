// ABOUTME: Interactive Plan Viewer — opens a GUI browser window for markdown plan review.
// ABOUTME: Supports plan mode (approve/edit/reorder) and questions mode (inline answers). Markdown-driven UI.
// ABOUTME: Prefers Commander's native viewer when it is healthy, then falls back to the local browser viewer.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";
import { openAndWaitInCommander } from "./lib/commander-viewer.ts";
import type { Server } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from "node:fs";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generatePlanViewerHTML } from "./lib/plan-viewer-html.ts";
import { createPlanStandaloneExport, saveStandaloneExport } from "./lib/viewer-standalone-export.ts";
import { upsertPersistedReport } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { getPlanTargetMode } from "./lib/plan-complexity.ts";

// ── Types ────────────────────────────────────────────────────────────

type ViewerPurpose = "plan" | "questions";

interface ViewerResult {
	action: "approved" | "changes_requested" | "declined" | "submitted";
	markdown: string;
	modified: boolean;
	answers?: string;
	answerMap?: Record<string, string>;
	feedback?: string;
}

// ── HTTP Server for GUI Window ───────────────────────────────────────

async function startViewerServer(
	markdown: string,
	title: string,
	purpose: ViewerPurpose,
	filePath?: string,
): Promise<{ port: number; server: Server; waitForResult: () => Promise<any>; waitForFeedback: () => Promise<any> }> {
	const routes = [
		{
			method: "POST" as const,
			path: "/save",
			handler: (req: any, res: any) => {
				let body = "";
				req.on("data", (chunk: string) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						const desktop = join(homedir(), "Desktop");
						if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
						const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
						const fileName = `plan-${ts}.md`;
						const filePath = join(desktop, fileName);
						writeFileSync(filePath, data.markdown, "utf-8");
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, message: `Saved to ~/Desktop/${fileName}` }));
					} catch (err: any) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err.message }));
					}
				});
			},
		},
		{
			method: "POST" as const,
			path: "/export-standalone",
			handler: (req: any, res: any) => {
				let body = "";
				req.on("data", (chunk: string) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						const html = createPlanStandaloneExport({
							title,
							markdown: data.markdown || markdown,
							mode: purpose,
						});
						const saved = saveStandaloneExport({ filePrefix: "plan-readonly", html });
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, message: `Standalone export saved to ~/Desktop/${saved.fileName}` }));
					} catch (err: any) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err.message }));
					}
				});
			},
		},
	];

	let roundTripState = {
		status: "idle",
		feedback: "",
		revision: 0,
		changeSummary: [] as string[],
		payload: { markdown },
	};
	let lastKnownMarkdown = markdown;

	const handle = await createViewerServer({
		getHtml: (port) => generatePlanViewerHTML({ markdown, title, mode: purpose, port, roundTripEnabled: purpose === "plan" }),
		routes,
		onFeedback: async (body) => {
			roundTripState = {
				status: "feedback_submitted",
				feedback: body?.feedback || "",
				revision: roundTripState.revision,
				changeSummary: [],
				payload: { markdown: lastKnownMarkdown },
			};
		},
		getRoundTripState: () => {
			if (purpose === "plan" && filePath && existsSync(filePath)) {
				try {
					const latestMarkdown = readFileSync(filePath, "utf-8");
					if (roundTripState.status === "feedback_submitted" && latestMarkdown !== lastKnownMarkdown) {
						lastKnownMarkdown = latestMarkdown;
						roundTripState = {
							status: "updated",
							feedback: roundTripState.feedback,
							revision: roundTripState.revision + 1,
							changeSummary: ["Applied requested plan updates", "Refreshed viewer content"],
							payload: { markdown: latestMarkdown },
						};
					}
				} catch {}
			}
			return roundTripState;
		},
	});

	return {
		port: handle.port,
		server: handle.server,
		waitForResult: handle.waitForResult,
		waitForFeedback: handle.waitForFeedback,
	};
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowPlanParams = Type.Object({
	file_path: Type.String({ description: "Path to the markdown plan file (e.g. .context/todo.md)" }),
	title: Type.Optional(Type.String({ description: "Title to display in the viewer header" })),
	mode: Type.Optional(Type.String({ description: "Viewer mode: 'plan' (default) for plan review/approval, or 'questions' for follow-up questions with inline answers" })),
	force_browser: Type.Optional(Type.Boolean({ description: "Bypass Commander and open the local browser viewer directly. Useful for testing browser fallback and Needs Changes feedback." })),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let piRef = pi;

	// Track active servers so we can clean them up
	let activeServer: Server | null = null;
	let activeSession: { kind: ViewerPurpose; title: string; url: string; server: Server; onClose: () => void } | null = null;

	function cleanupServer() {
		const server = activeServer;
		activeServer = null;
		if (server) {
			try { server.close(); } catch {}
		}
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	function saveModifiedMarkdown(filePath: string, result: ViewerResult) {
		if (!result.modified || !result.markdown) return;
		try {
			writeFileSync(filePath, result.markdown, "utf-8");
		} catch {
			// Silently fail
		}
	}

	function persistViewerResult(filePath: string, title: string, purpose: ViewerPurpose, result: ViewerResult) {
		try {
			upsertPersistedReport({
				category: purpose,
				title,
				summary: result.answers || result.markdown,
				content: result.markdown,
				sourcePath: filePath,
				viewerPath: filePath,
				viewerLabel: title,
				tags: [purpose, "markdown"],
				metadata: {
					action: result.action,
					modified: result.modified,
				},
			});
		} catch {
			// Persistence is best-effort; viewer result should still return.
		}
	}

	function triggerApprovalModeSwitch(planText: string, ctx: ExtensionContext) {
		try {
			const { mode: targetMode, reason } = getPlanTargetMode(planText);
			// Only switch if targetMode is not null (i.e., plan is complete/multi-phase).
			if (targetMode) {
				const setModeCallback = (globalThis as any).__piSetModeForApproval;
				if (typeof setModeCallback === "function") {
					setModeCallback(targetMode, ctx);
					ctx.ui.notify(`Mode switched to ${targetMode} on plan approval. ${reason}`, "info");
				}
			}
		} catch {
			// Never fail the tool because of an auto-mode switch.
		}
	}

	// ── Core viewer logic (shared by tool + command) ─────────────────

	async function runViewer(
		ctx: ExtensionContext,
		markdown: string,
		filePath: string,
		title: string,
		purpose: ViewerPurpose,
		signal?: AbortSignal,
		options: { forceBrowser?: boolean } = {},
	): Promise<ViewerResult> {
		// Clean up any previous server
		cleanupServer();

		// Try Commander first for plan mode, but only treat it as approved once
		// Commander reports a real user action. Otherwise fall back to browser.
		if (purpose === "plan" && !options.forceBrowser) {
			const commanderResult = await openAndWaitInCommander(
				{
					content: markdown,
					title: title || "Plan Viewer",
					reportType: "plan",
					mode: "approve",
					format: "markdown",
				},
				ctx,
				{ signal, includeContent: true },
			);

			if (commanderResult.inCommander) {
				const updatedMarkdown = commanderResult.content || markdown;
				const result: ViewerResult = {
					action: commanderResult.action === "approved" ? "approved" : "declined",
					markdown: updatedMarkdown,
					modified: updatedMarkdown !== markdown,
				};
				saveModifiedMarkdown(filePath, result);
				persistViewerResult(filePath, title, purpose, result);
				return result;
			}
			// Fall through to browser if Commander is unavailable, unhealthy, or times out.
		}

		// Start HTTP server
		const { port, server, waitForResult } = await startViewerServer(markdown, title, purpose, filePath);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: purpose,
			title: purpose === "questions" ? "Questions viewer" : "Plan viewer",
			url,
			server,
			onClose: () => {
				activeServer = null;
				activeSession = null;
			},
		};
		registerActiveViewer(activeSession);

		// Open the browser
		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		// Wait for user action in the browser (or abort). Changes-requested is
		// returned through the same /result path as approve/decline so the active
		// show_plan call always unblocks and can revise the plan.

		try {
			const abortPromise = signal
				? new Promise<ViewerResult>((_, reject) => {
					if (signal.aborted) reject(new Error("Aborted"));
					signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
				})
				: null;

			const rawResult = await (abortPromise
				? Promise.race([waitForResult(), abortPromise])
				: waitForResult());
			const result: ViewerResult = {
				action: rawResult?.action || "declined",
				markdown: rawResult?.markdown || markdown,
				modified: rawResult?.modified || false,
				answers: rawResult?.answers,
				answerMap: rawResult?.answerMap,
				feedback: rawResult?.feedback,
			};

			saveModifiedMarkdown(filePath, result);
			persistViewerResult(filePath, title, purpose, result);

			return result;
		} finally {
			// Clean up server after result
			cleanupServer();
		}
	}

	// ── show_plan tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "show_plan",
		label: "Show Plan",
		description:
			"Open an interactive markdown viewer overlay. Two modes:\n\n" +
			"**Plan mode** (default): Renders a markdown plan for review. User can edit, " +
			"reorder, toggle checkboxes, and approve or decline. If approved, an approval " +
			"message is automatically sent to continue the conversation.\n\n" +
			"**Questions mode** (mode='questions'): Renders markdown containing follow-up " +
			"questions. User can navigate questions, type answers inline, and submit. " +
			"Questions are auto-detected (lines ending with '?' or containing 'Default:'). " +
			"Returns formatted answers.\n\n" +
			"The markdown file IS the UI — update it to change what the user sees. " +
			"Set force_browser=true to bypass Commander and test the local browser feedback flow.",
		parameters: ShowPlanParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { file_path, title, mode: modeStr, force_browser: forceBrowser } = params as {
				file_path: string;
				title?: string;
				mode?: string;
				force_browser?: boolean;
			};

			const purpose: ViewerPurpose = modeStr === "questions" ? "questions" : "plan";

			// Read the file
			let markdown: string;
			try {
				markdown = readFileSync(file_path, "utf-8");
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Error reading file: ${err.message}` }],
				};
			}

			const displayTitle = title || basename(file_path, ".md");

			// Open viewer and wait for result
			let result: ViewerResult;
			try {
				result = await runViewer(ctx, markdown, file_path, displayTitle, purpose, signal, { forceBrowser: !!forceBrowser });
			} catch (err: any) {
				// Handle user cancellation / abort gracefully
				if (err?.message === "Aborted" || signal?.aborted) {
					return {
						content: [{ type: "text" as const, text: "Plan viewer was cancelled by user. Ask if they want to re-open it or proceed differently." }],
						details: { action: "declined" as const, purpose, modified: false, filePath: file_path },
					};
				}
				throw err;
			}

			// ── Questions mode result ────────────────────────────────
			if (purpose === "questions") {
				if (result.action === "approved") {
					const answerText = result.answers || "(no answers provided)";

					piRef.sendMessage(
						{
							customType: "plan-viewer-answers",
							content: `Here are my answers:\n\n${answerText}`,
							display: true,
						},
						{ deliverAs: "followUp" as any, triggerTurn: true },
					);

					return {
						content: [{
							type: "text" as const,
							text: `User submitted answers to follow-up questions:\n\n${answerText}`,
						}],
						details: {
							action: "submitted" as const,
							purpose: "questions",
							answers: answerText,
							answerMap: result.answerMap || {},
						},
					};
				}

				return {
					content: [{
						type: "text" as const,
						text: "User closed the questions viewer without submitting answers.",
					}],
					details: {
						action: "declined" as const,
						purpose: "questions",
					},
				};
			}

			// ── Plan mode result ─────────────────────────────────────
			if (result.action === "approved") {
				const modifiedNote = result.modified
					? " (plan was edited by user — use the updated version)"
					: "";

				// Auto-switch mode only for complete/multi-phase plans.
				// Simple plans remain in PLAN mode.
				triggerApprovalModeSwitch(result.markdown || markdown, ctx);

				// In tool mode, the returned tool result is the continuation signal.
				// Do not also enqueue a follow-up turn, or it can surface later as a
				// stale redundant [plan-approved] message after implementation finishes.
				return {
					content: [{
						type: "text" as const,
						text: `Plan approved by user.${modifiedNote} The updated plan has been saved to ${file_path}.`,
					}],
					details: {
						action: "approved" as const,
						purpose: "plan",
						modified: result.modified,
						filePath: file_path,
					},
				};
			}

			if (result.action === "changes_requested") {
				const feedbackText = (result.feedback || "").trim() || "(no change details provided)";
				const modifiedNote = result.modified
					? "\n\nNote: The plan was also edited in the viewer — use the updated file contents."
					: "";

				piRef.sendMessage(
					{
						customType: "plan-changes-requested",
						content: `Changes requested on the plan. Here is the requested feedback:\n\n${feedbackText}${modifiedNote}`,
						display: true,
					},
					{ deliverAs: "followUp" as any, triggerTurn: true },
				);
				ctx.ui.notify("Plan changes requested — reviewing feedback...", "info");

				return {
					content: [{
						type: "text" as const,
						text: `User requested changes to the plan:\n\n${feedbackText}${modifiedNote}\n\nThe latest plan has been saved to ${file_path}.`,
					}],
					details: {
						action: "changes_requested" as const,
						purpose: "plan",
						modified: result.modified,
						filePath: file_path,
						feedback: feedbackText,
					},
				};
			}

			return {
				content: [{
					type: "text" as const,
					text: "User closed the plan viewer without approving. Ask if they want changes or have feedback.",
				}],
				details: {
					action: "declined" as const,
					purpose: "plan",
					modified: result.modified,
					filePath: file_path,
				},
			};
		},

		renderCall(args, theme) {
			const filePath = (args as any).file_path || "?";
			const titleArg = (args as any).title || "";
			const modeArg = (args as any).mode || "plan";
			const modeLabel = modeArg === "questions" ? "questions" : "plan";
			const text =
				theme.fg("toolTitle", theme.bold("show_plan ")) +
				theme.fg("accent", filePath) +
				theme.fg("dim", ` [${modeLabel}]`) +
				(titleArg ? theme.fg("dim", ` — ${titleArg}`) : "");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.purpose === "questions") {
				if (details.action === "submitted") {
					return new Text(
						outputLine(theme, "success", "Answers submitted"),
						0, 0,
					);
				}
				return new Text(
					outputLine(theme, "warning", "Questions closed without answers"),
					0, 0,
				);
			}

			if (details.action === "approved") {
				const modNote = details.modified ? " (edited)" : "";
				return new Text(
					outputLine(theme, "success", `Plan approved${modNote}`),
					0, 0,
				);
			}

			if (details.action === "changes_requested") {
				return new Text(
					outputLine(theme, "warning", "Plan changes requested"),
					0, 0,
				);
			}

			return new Text(
				outputLine(theme, "warning", "Plan viewer closed without approval"),
				0, 0,
			);
		},
	});

	// ── /plan command ────────────────────────────────────────────────

	pi.registerCommand("plan", {
		description: "Open the plan viewer for .context/todo.md or a given file",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/plan requires interactive mode", "error");
				return;
			}

			const filePath = args.trim() || join(ctx.cwd, ".context", "todo.md");

			let markdown: string;
			try {
				markdown = readFileSync(filePath, "utf-8");
			} catch {
				ctx.ui.notify(`Cannot read: ${filePath}`, "error");
				return;
			}

			const displayTitle = basename(filePath, ".md");

			const result = await runViewer(ctx, markdown, filePath, displayTitle, "plan");

			if (result.action === "approved") {
				try {
					const planText = result.markdown || markdown;
					const { mode: targetMode } = getPlanTargetMode(planText);

					// Only switch if targetMode is not null (i.e., plan is complete/multi-phase).
					if (targetMode) {
						const setModeTool = (piRef as any)?.tools?.get?.("set_mode");
						if (setModeTool?.execute) {
							await setModeTool.execute("plan-approval-auto", { mode: targetMode, reason: "Auto-switched on plan approval" }, ctx);
						} else if ((piRef as any)?.callTool) {
							await (piRef as any).callTool("set_mode", { mode: targetMode, reason: "Auto-switched on plan approval" }, ctx);
						}
					}
				} catch {
					// Never fail the /plan command because of an auto-mode switch.
				}

				const { mode: targetMode } = getPlanTargetMode(result.markdown || markdown);
				const modeNote = targetMode ? ` Mode switched to ${targetMode}.` : "";

				piRef.sendMessage(
					{
						customType: "plan-approved",
						content: `Plan approved! Proceed with implementation.${result.modified ? " (plan was edited)" : ""}${modeNote}`,
						display: true,
					},
					{ deliverAs: "followUp" as any, triggerTurn: true },
				);
				ctx.ui.notify("Plan approved — continuing...", "info");
			} else if (result.action === "changes_requested") {
				const feedbackText = (result.feedback || "").trim() || "(no change details provided)";
				piRef.sendMessage(
					{
						customType: "plan-changes-requested",
						content: `Changes requested on the plan. Here is the requested feedback:\n\n${feedbackText}${result.modified ? "\n\nNote: The plan was also edited in the viewer — use the updated file contents." : ""}`,
						display: true,
					},
					{ deliverAs: "followUp" as any, triggerTurn: true },
				);
				ctx.ui.notify("Plan changes requested — reviewing feedback...", "info");
			} else if (result.modified) {
				ctx.ui.notify("Plan was modified but not approved.", "info");
			}
		},
	});

	// ── Session lifecycle ────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanupServer();
	});
}
