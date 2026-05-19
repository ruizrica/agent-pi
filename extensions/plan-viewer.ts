// ABOUTME: Interactive Plan Viewer — opens a GUI browser window for markdown plan review.
// ABOUTME: Supports plan mode (approve/edit/reorder) and questions mode (inline answers). Markdown-driven UI.
// ABOUTME: Prefers Commander's native viewer when it is healthy, then falls back to the local browser viewer.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";
import { openAndWaitInCommander } from "./lib/commander/commander-viewer.ts";
import type { Server } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from "node:fs";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generatePlanViewerHTML } from "./lib/viewers/plan-viewer-html.ts";
import { createPlanStandaloneExport, saveStandaloneExport } from "./lib/viewer-standalone-export.ts";
import { getNextReportRevision, upsertPersistedReport, readRawPayload } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { getPlanTargetMode } from "./lib/plan-complexity.ts";
import { materializeApprovedTasksToCommander, summarizeMaterialization, type CommanderTaskMaterializationResult } from "./lib/approval-task-materialization.ts";
import { getProjectContext } from "./lib/project-context.ts";
import { buildPlanSnapshot, buildQuestionsSnapshot, loadValidatedSnapshot, validateSnapshot, synthesizeSnapshotFromEntry } from "./lib/viewer-snapshots.ts";
import type { PlanSnapshot, QuestionsSnapshot } from "./lib/viewer-snapshots.ts";

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
	projectContext: ReturnType<typeof getProjectContext>,
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
		getHtml: (port) => generatePlanViewerHTML({ markdown, title, mode: purpose, port, roundTripEnabled: purpose === "plan", projectContext }),
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

// ── Task Parsing ──────────────────────────────────────────────────────────────

interface TaskNode {
	id: string;
	level: number;
	text: string;
	checked: boolean;
	children?: TaskNode[];
}

function parsePlainTasksFromMarkdown(markdown: string): TaskNode[] {
	const lines = markdown.split('\n');
	const tasks: TaskNode[] = [];
	let taskId = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^(\s*)- \[([\sxX])\]\s+(.*)/);
		if (!match) continue;

		const indent = match[1].length;
		const checked = match[2].toLowerCase() === 'x';
		const text = match[3].trim();
		const level = Math.floor(indent / 2);

		const task: TaskNode = {
			id: `task-${taskId++}`,
			level,
			text,
			checked,
		};

		tasks.push(task);
	}

	return tasks;
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowPlanParams = Type.Object({
	file_path: Type.String({ description: "Path to the markdown plan file (e.g. .context/todo.md)" }),
	title: Type.Optional(Type.String({ description: "Title to display in the viewer header" })),
	mode: Type.Optional(Type.String({ description: "Viewer mode: 'plan' (default) for plan review/approval, or 'questions' for follow-up questions with inline answers" })),
	force_browser: Type.Optional(Type.Boolean({ description: "Bypass Commander and open the local browser viewer directly. Useful for testing browser fallback and Needs Changes feedback." })),
	readonly: Type.Optional(Type.Boolean({ description: "Open the viewer in read-only mode. Hides approve/decline UI; shows a banner with toggle to enter interactive mode." })),
	payload_id: Type.Optional(Type.String({ description: "ID of a persisted report snapshot to load instead of file_path. Used by the /reports browser to re-open previous viewers." })),
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

	function persistViewerResult(filePath: string, title: string, purpose: ViewerPurpose, result: ViewerResult, markdownContent?: string, revision = 1) {
		try {
			const actualMarkdown = markdownContent ?? result.markdown;
			const parsedTasks = purpose === "plan" ? parsePlainTasksFromMarkdown(actualMarkdown) : [];

			const actionResult = {
				action: result.action,
				note: result.modified ? "Plan was modified before closing" : undefined,
			};

			let payload: unknown;
			if (purpose === "questions") {
				const questionsHtml = "";
				payload = buildQuestionsSnapshot({
					title,
					summary: result.answers || actualMarkdown,
					sourcePath: filePath,
					markdownContent: actualMarkdown,
					questionsHtml,
					actionResult,
				});
			} else {
				payload = buildPlanSnapshot({
					title,
					summary: actualMarkdown,
					sourcePath: filePath,
					markdownContent: actualMarkdown,
					parsedTasks,
					actionResult,
				});
			}

			upsertPersistedReport({
				category: purpose,
				title,
				summary: result.answers || actualMarkdown,
				content: actualMarkdown,
				sourcePath: filePath,
				viewerPath: filePath,
				viewerLabel: title,
				tags: [purpose, "markdown"],
				metadata: {
					action: result.action,
					modified: result.modified,
					revision,
				},
				payload,
			});
		} catch {
			// Persistence is best-effort; viewer result should still return.
		}
	}

	function triggerApprovalModeSwitch(planText: string, ctx: ExtensionContext, materialization: CommanderTaskMaterializationResult) {
		try {
			const { mode: targetMode, reason } = getPlanTargetMode(planText);
			// Only switch if targetMode is not null (i.e., plan is complete/multi-phase)
			// and Commander source-of-truth tasks were created first.
			if (targetMode) {
				if (!materialization.ok) {
					ctx.ui.notify(`IMPLEMENT handoff blocked until Commander tasks are created: ${materialization.warning || "task materialization failed"}`, "warning");
					return;
				}
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

	async function materializePlanApprovalTasks(markdown: string, filePath: string, title: string, ctx: ExtensionContext): Promise<CommanderTaskMaterializationResult> {
		const isDebugReport = /debug/i.test(title) || /##\s+(Runtime Feedback Loop|Recommendation)/i.test(markdown);
		const isInvestigation = !isDebugReport && (/investigation|remediation|root cause|findings/i.test(title) || /##\s+(Remediation|Next Steps|Remediation \/ Next Steps)/i.test(markdown));
		return materializeApprovedTasksToCommander({
			title,
			sourceKind: isDebugReport ? "debug" : isInvestigation ? "investigation" : "plan",
			sourcePath: filePath,
			markdown,
			cwd: ctx.cwd || process.cwd(),
			labels: isDebugReport ? ["debug-remediation"] : isInvestigation ? ["investigation-remediation"] : ["plan-approval"],
			sectionHint: isDebugReport || isInvestigation ? /^##\s+(Remediation|Next Steps|Remediation \/ Next Steps)/i : undefined,
		});
	}

	// ── Core viewer logic (shared by tool + command) ─────────────────

	async function runViewer(
		ctx: ExtensionContext,
		markdown: string,
		filePath: string,
		title: string,
		purpose: ViewerPurpose,
		signal?: AbortSignal,
		options: { forceBrowser?: boolean; readonly?: boolean } = {},
	): Promise<ViewerResult> {
		// Clean up any previous server
		cleanupServer();

		// Try Commander first for plan mode, but only treat it as approved once
		// Commander reports a real user action. Otherwise fall back to browser.
		// In readonly (snapshot-replay) mode we skip Commander because there is no
		// pending action — we're just showing an immutable historical record.
		if (purpose === "plan" && !options.forceBrowser && !options.readonly) {
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
				const revision = getNextReportRevision({ category: purpose, title, sourcePath: filePath, viewerPath: filePath });
				saveModifiedMarkdown(filePath, result);
				persistViewerResult(filePath, title, purpose, result, undefined, revision);
				return result;
			}
			// Fall through to browser if Commander is unavailable, unhealthy, or times out.
		}

		// Start HTTP server
		const revision = getNextReportRevision({ category: purpose, title, sourcePath: filePath, viewerPath: filePath });
		const projectContext = getProjectContext(ctx.cwd || process.cwd(), revision);
		const { port, server, waitForResult } = await startViewerServer(markdown, title, purpose, projectContext, filePath);
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

			// In readonly snapshot-replay mode we never write back to the source
			// file (the live .context/todo.md belongs to whatever plan is current)
			// and we don't re-persist as a new report entry.
			if (!options.readonly) {
				saveModifiedMarkdown(filePath, result);
				persistViewerResult(filePath, title, purpose, result, undefined, revision);
			}

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
			const { file_path, title, mode: modeStr, force_browser: forceBrowser, payload_id: payloadId, readonly: readonlyFlag } = params as {
				file_path: string;
				title?: string;
				mode?: string;
				force_browser?: boolean;
				payload_id?: string;
				readonly?: boolean;
			};

			const purpose: ViewerPurpose = modeStr === "questions" ? "questions" : "plan";

			// When a payload_id is provided we render the persisted snapshot
			// rather than re-reading the live source file. This is what /reports
			// re-opens use — without it every historical plan ends up showing
			// the current contents of .context/todo.md, since that's the path
			// almost every plan writes to.
			let markdown: string;
			let effectiveFilePath = file_path;
			let displayTitle: string;
			const fromSnapshot = !!payloadId;

			if (fromSnapshot) {
				const snapshot = loadValidatedSnapshot(payloadId);
				if (!snapshot || (snapshot.mode !== "plan" && snapshot.mode !== "questions")) {
					return {
						content: [{ type: "text" as const, text: `No persisted snapshot found for payload_id=${payloadId}.` }],
					};
				}
				markdown = snapshot.markdownContent;
				effectiveFilePath = snapshot.sourcePath || file_path || "";
				displayTitle = title || snapshot.title;
			} else {
				try {
					markdown = readFileSync(file_path, "utf-8");
				} catch (err: any) {
					return {
						content: [{ type: "text" as const, text: `Error reading file: ${err.message}` }],
					};
				}
				displayTitle = title || basename(file_path, ".md");
			}

			// Open viewer and wait for result. Snapshot replays are always
			// readonly — they must not overwrite the live source file or be
			// re-persisted as new report entries.
			let result: ViewerResult;
			try {
				const viewerOptions = { forceBrowser: !!forceBrowser };
				result = await runViewer(ctx, markdown, effectiveFilePath, displayTitle, purpose, signal, {
					...viewerOptions,
					readonly: fromSnapshot || !!readonlyFlag,
				});
			} catch (err: any) {
				// Handle user cancellation / abort gracefully
				if (err?.message === "Aborted" || signal?.aborted) {
					return {
						content: [{ type: "text" as const, text: "Plan viewer was cancelled by user. Ask if they want to re-open it or proceed differently." }],
						details: { action: "declined" as const, purpose, modified: false, filePath: effectiveFilePath },
					};
				}
				throw err;
			}

			// Snapshot replays are display-only: never dispatch follow-ups
			// (approve/changes-requested) for a historical viewer.
			if (fromSnapshot) {
				return {
					content: [{ type: "text" as const, text: "Historical plan snapshot closed." }],
					details: { action: "declined" as const, purpose, modified: false, filePath: effectiveFilePath, fromSnapshot: true },
				};
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

				const approvedMarkdown = result.markdown || markdown;
				const materialization = await materializePlanApprovalTasks(approvedMarkdown, file_path, displayTitle, ctx);

				// Auto-switch mode only for complete/multi-phase plans after
				// Commander source-of-truth tasks have been created.
				// Simple plans remain in PLAN mode.
				triggerApprovalModeSwitch(approvedMarkdown, ctx, materialization);

				// In tool mode the tool result is the continuation signal. Do not
				// also enqueue a plan-approved follow-up, or one approval can trigger
				// a second stale planning turn after implementation has already begun.
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
						commanderTaskMaterialization: materialization,
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
		description: "Open the plan viewer for .context/todo.md or a given file. Supports --payload-id <id> --readonly --mode questions for /reports re-opens.",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/plan requires interactive mode", "error");
				return;
			}

			// Parse: [file_path] [--readonly] [--payload-id ID]
			// When --payload-id is given the viewer purpose (plan vs questions)
			// is taken from the persisted snapshot, not from a CLI flag.
			const parts = args.trim().split(/\s+/).filter(Boolean);
			let cliFilePath = "";
			let payloadId = "";
			let readonlyFlag = false;
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part === "--readonly") readonlyFlag = true;
				else if (part === "--payload-id" && i + 1 < parts.length) payloadId = parts[++i];
				else if (part === "--mode" && i + 1 < parts.length) i++;
				else if (!part.startsWith("--")) cliFilePath = part;
			}

			const fromSnapshot = !!payloadId;
			let purpose: ViewerPurpose = "plan";
			let markdown: string;
			let filePath: string;
			let displayTitle: string;

			if (fromSnapshot) {
				const snapshot = loadValidatedSnapshot(payloadId);
				if (!snapshot || (snapshot.mode !== "plan" && snapshot.mode !== "questions")) {
					ctx.ui.notify(`No persisted snapshot for payload_id=${payloadId}`, "error");
					return;
				}
				purpose = snapshot.mode;
				markdown = snapshot.markdownContent;
				filePath = snapshot.sourcePath || cliFilePath || join(ctx.cwd, ".context", "todo.md");
				displayTitle = snapshot.title || basename(filePath, ".md");
			} else {
				filePath = cliFilePath || join(ctx.cwd, ".context", "todo.md");
				try {
					markdown = readFileSync(filePath, "utf-8");
				} catch {
					ctx.ui.notify(`Cannot read: ${filePath}`, "error");
					return;
				}
				displayTitle = basename(filePath, ".md");
			}

			const result = await runViewer(ctx, markdown, filePath, displayTitle, purpose, undefined, {
				readonly: fromSnapshot || readonlyFlag,
			});

			// Snapshot replays are display-only: no follow-up dispatch.
			if (fromSnapshot) return;

			if (result.action === "approved") {
				const planText = result.markdown || markdown;
				const materialization = await materializePlanApprovalTasks(planText, filePath, displayTitle, ctx);
				const commanderNote = summarizeMaterialization(materialization);
				try {
					const { mode: targetMode } = getPlanTargetMode(planText);

					// Only switch if targetMode is not null (i.e., plan is complete/multi-phase)
					// and Commander source-of-truth tasks were created first.
					if (targetMode && materialization.ok) {
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

				const { mode: targetMode } = getPlanTargetMode(planText);
				const modeNote = targetMode
					? materialization.ok
						? ` Mode switched to ${targetMode}.`
						: " IMPLEMENT handoff is blocked until Commander tasks are created."
					: "";

				piRef.sendMessage(
					{
						customType: "plan-approved",
						content: `Plan approved! ${materialization.ok ? "Proceed with IMPLEMENT mode." : "IMPLEMENT handoff is blocked until Commander tasks are created."}${result.modified ? " (plan was edited)" : ""}${modeNote}${commanderNote}`,
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
