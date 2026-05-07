// ABOUTME: Spec Viewer — opens a multi-page browser GUI for reviewing, commenting, and approving specifications.
// ABOUTME: Wizard-style navigation between spec docs, inline comment threads, visual asset gallery, markdown editing.
// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, basename, dirname, extname, resolve, relative } from "node:path";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { discoverSpecDocuments } from "./lib/spec-documents.ts";
import { ensureKiroSpecScaffold, type SpecScaffoldResult } from "./lib/spec-scaffold.ts";
import { generateSpecViewerHTML, type SpecDocument } from "./lib/spec-viewer-html.ts";
import { createSpecStandaloneExport, loadVisualAsExportAsset, saveStandaloneExport, type SpecExportDocument } from "./lib/viewer-standalone-export.ts";
import { upsertPersistedReport } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { createViewerServer, openBrowser, type ViewerServerHandle } from "./lib/viewer-server.ts";
import { isCommanderAvailable, openAndWaitInCommander } from "./lib/commander/commander-viewer.ts";
import { getProjectContext } from "./lib/project-context.ts";

// ── Types ────────────────────────────────────────────────────────────

interface SpecComment {
	id: string;
	document: string;
	sectionId: string;
	sectionText: string;
	text: string;
	timestamp: string;
}

interface SpecViewerResult {
	action: "approved" | "changes_requested" | "declined";
	comments: SpecComment[];
	markdownChanges: Record<string, string>;
	modified: boolean;
	feedback?: string;
}

// ── MIME Types ────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".html": "text/html",
	".htm": "text/html",
	".md": "text/markdown",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
};

// ── HTTP Server ──────────────────────────────────────────────────────

function buildStandaloneSpecDocuments(folderPath: string, documents: SpecDocument[], markdownChanges?: Record<string, string>): SpecExportDocument[] {
	return documents.map((doc) => {
		if (doc.isVisuals) {
			return {
				label: doc.label,
				filePath: doc.filePath,
				isVisuals: true,
				visuals: (doc.visualFiles || []).map((file) => loadVisualAsExportAsset(folderPath, file)),
			};
		}

		return {
			label: doc.label,
			filePath: doc.filePath,
			markdown: markdownChanges?.[doc.filePath] ?? doc.markdown,
		};
	});
}

function startSpecViewerServer(
	folderPath: string,
	documents: SpecDocument[],
	title: string,
	projectContext: ReturnType<typeof getProjectContext>,
	existingComments: SpecComment[],
): Promise<ViewerServerHandle> {
	let roundTripState = {
		status: "idle",
		feedback: "",
		revision: 0,
		changeSummary: [] as string[],
		payload: {
			documents: documents.map((doc) => ({ key: doc.key, markdown: doc.markdown })),
		},
	};
	let lastKnownDocuments = documents.map((doc) => ({ key: doc.key, markdown: doc.markdown, filePath: doc.filePath, isVisuals: doc.isVisuals }));

	return createViewerServer({
		getHtml: (port) => generateSpecViewerHTML({
			documents,
			title,
			port,
			existingComments: JSON.stringify(existingComments),
			roundTripEnabled: true,
			projectContext,
		}),
		onFeedback: async (body) => {
			roundTripState = {
				status: "feedback_submitted",
				feedback: body?.feedback || "",
				revision: roundTripState.revision,
				changeSummary: [],
				payload: {
					documents: lastKnownDocuments.map((doc) => ({ key: doc.key, markdown: doc.markdown })),
				},
			};
		},
		getRoundTripState: () => {
			if (roundTripState.status === "feedback_submitted") {
				try {
					const refreshed = documents.map((doc) => {
						if (doc.isVisuals) return { key: doc.key, markdown: doc.markdown };
						const latest = readFileSync(resolve(folderPath, doc.filePath), "utf-8");
						return { key: doc.key, markdown: latest };
					});
					const changed = refreshed.some((doc, index) => doc.markdown !== lastKnownDocuments[index]?.markdown);
					if (changed) {
						lastKnownDocuments = refreshed.map((doc, index) => ({
							key: doc.key,
							markdown: doc.markdown,
							filePath: documents[index]?.filePath,
							isVisuals: documents[index]?.isVisuals,
						}));
						roundTripState = {
							status: "updated",
							feedback: roundTripState.feedback,
							revision: roundTripState.revision + 1,
							changeSummary: ["Applied requested spec updates", "Refreshed viewer content"],
							payload: { documents: refreshed },
						};
					}
				} catch {}
			}
			return roundTripState;
		},
		routes: [
			{
				method: "GET",
				path: "/file",
				handler: async (req, res, url) => {
					const relPath = url.searchParams.get("path");
					if (!relPath) {
						res.writeHead(400);
						res.end("Missing path parameter");
						return;
					}

					// Security: prevent directory traversal
					const absPath = resolve(folderPath, relPath);
					const normalizedFolder = resolve(folderPath);
					if (!absPath.startsWith(normalizedFolder)) {
						res.writeHead(403);
						res.end("Access denied");
						return;
					}

					try {
						const data = readFileSync(absPath);
						const ext = extname(absPath).toLowerCase();
						const contentType = MIME_TYPES[ext] || "application/octet-stream";
						res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=300" });
						res.end(data);
					} catch {
						res.writeHead(404);
						res.end("File not found");
					}
				},
			},
			{
				method: "POST",
				path: "/save",
				handler: async (req, res) => {
					let body = "";
					req.on("data", (chunk) => { body += chunk; });
					req.on("end", () => {
						try {
							const data = JSON.parse(body);
							const commentsPath = join(folderPath, "spec-comments.json");
							writeFileSync(commentsPath, JSON.stringify({ comments: data.comments || [] }, null, 2), "utf-8");
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true }));
						} catch (err: any) {
							res.writeHead(500, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: err.message }));
						}
					});
				},
			},
			{
				method: "POST",
				path: "/export-standalone",
				handler: async (req, res) => {
					let body = "";
					req.on("data", (chunk) => { body += chunk; });
					req.on("end", () => {
						try {
							const data = JSON.parse(body || "{}");
							const exportDocs = buildStandaloneSpecDocuments(folderPath, documents, data.markdownChanges || {});
							const html = createSpecStandaloneExport({ title, documents: exportDocs });
							const saved = saveStandaloneExport({ filePrefix: "spec-readonly", html });
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ ok: true, message: `Standalone export saved to ~/Desktop/${saved.fileName}` }));
						} catch (err: any) {
							res.writeHead(500, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ error: err.message }));
						}
					});
				},
			},
		],
	});
}

// ── Comment Formatting ───────────────────────────────────────────────

function formatCommentsForAgent(comments: SpecComment[]): string {
	if (comments.length === 0) return "(no comments)";

	const lines: string[] = [];
	for (const c of comments) {
		const docLabel = c.document.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
		lines.push(`[${docLabel}] ${c.sectionText}`);
		lines.push(`  → ${c.text}`);
		lines.push("");
	}
	return lines.join("\n").trim();
}

function formatRequestedChanges(commentSummary: string, feedback?: string): string {
	const trimmedFeedback = (feedback || "").trim();
	const sections: string[] = [];

	if (trimmedFeedback) {
		sections.push(`Requested changes:\n${trimmedFeedback}`);
	}

	if (commentSummary !== "(no comments)") {
		sections.push(`Inline comments:\n${commentSummary}`);
	}

	if (sections.length === 0) return "(no change details provided)";
	return sections.join("\n\n");
}

function buildSpecRevisionGuidance(commentSummary: string, feedback?: string): string {
	const requestedChanges = formatRequestedChanges(commentSummary, feedback);
	return `Revise the spec based on the requested changes below. Preserve approved sections that were not challenged, update the affected documents, and reopen the spec review flow once the revisions are applied.\n\n${requestedChanges}`;
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowSpecParams = Type.Object({
	folder_path: Type.String({ description: "Path to the spec folder (e.g. .kiro/specs/feature-name/)" }),
	title: Type.Optional(Type.String({ description: "Title to display in the viewer header" })),
	feature_idea: Type.Optional(Type.String({ description: "Optional raw feature idea used to scaffold Kiro spec documents when the folder is empty" })),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let piRef = pi;
	let activeServer: any = null;
	let activeSession: { kind: "spec"; title: string; url: string; server: any; onClose: () => void } | null = null;

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

	// ── Core viewer logic ────────────────────────────────────────────

	function prepareSpecFolder(
		folderPath: string,
		title: string,
		featureIdea?: string,
	): SpecScaffoldResult {
		return ensureKiroSpecScaffold({
			folderPath,
			title,
			featureIdea,
		});
	}

	function parseSpecCommandArgs(args: string): { folderPath: string; featureIdea?: string } {
		const trimmedArgs = args.trim();
		const ideaFlag = " --idea ";
		const ideaIndex = trimmedArgs.indexOf(ideaFlag);
		if (ideaIndex === -1) {
			return { folderPath: trimmedArgs };
		}

		const folderPath = trimmedArgs.slice(0, ideaIndex).trim();
		const featureIdea = trimmedArgs.slice(ideaIndex + ideaFlag.length).trim();
		return {
			folderPath,
			featureIdea: featureIdea || undefined,
		};
	}

	async function runSpecViewer(
		ctx: ExtensionContext,
		folderPath: string,
		title: string,
	): Promise<SpecViewerResult> {
		cleanupServer();

		// Discover documents
		const documents = discoverSpecDocuments(folderPath);
		if (documents.length === 0) {
			throw new Error(`No spec documents found in ${folderPath}`);
		}

		// Load existing comments
		let existingComments: SpecComment[] = [];
		const commentsPath = join(folderPath, "spec-comments.json");
		if (existsSync(commentsPath)) {
			try {
				const data = JSON.parse(readFileSync(commentsPath, "utf-8"));
				existingComments = data.comments || [];
			} catch {}
		}

		// Try Commander first (multi-page spec viewer in native UI), but only
		// treat it as approved/declined after Commander reports a real user action.
		if (isCommanderAvailable()) {
			const content = JSON.stringify({
				folderPath,
				pages: documents.map((doc) => ({
					name: doc.label,
					filePath: doc.filePath,
					content: doc.markdown,
				})),
			});

			const result = await openAndWaitInCommander({
				content,
				title: title || "Spec Viewer",
				reportType: "spec",
				mode: "approve",
				format: "markdown",
			}, ctx, {
				includeContent: true,
			});

			if (result.inCommander) {
				return {
					action: result.action === "approved" ? "approved" : "declined",
					comments: existingComments,
					markdownChanges: {},
					modified: false,
					feedback: undefined,
				};
			}
			// Fall through to browser if Commander is unavailable, times out, or disconnects
		}

		// Start browser-based server
		const projectContext = getProjectContext(ctx.cwd || process.cwd(), 1);
		const handle = await startSpecViewerServer(
			folderPath,
			documents,
			title,
			projectContext,
			existingComments,
		);
		activeServer = handle.server;

		const url = `http://127.0.0.1:${handle.port}`;
		activeSession = {
			kind: "spec",
			title: "Spec viewer",
			url,
			server: handle.server,
			onClose: () => {
				activeServer = null;
				activeSession = null;
			},
		};
		registerActiveViewer(activeSession);
		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		try {
			const result = await handle.waitForResult();

			// Save any markdown changes back to files
			if (result.modified && result.markdownChanges) {
				for (const [relPath, content] of Object.entries(result.markdownChanges)) {
					try {
						const absPath = resolve(folderPath, relPath);
						// Security check
						if (absPath.startsWith(resolve(folderPath))) {
							writeFileSync(absPath, content, "utf-8");
						}
					} catch {}
				}
			}

			// Save final comments
			if (result.comments && result.comments.length > 0) {
				try {
					writeFileSync(commentsPath, JSON.stringify({ comments: result.comments }, null, 2), "utf-8");
				} catch {}
			}

			try {
				const editedDocCount = result.markdownChanges ? Object.keys(result.markdownChanges).length : 0;
				const specContent = documents.map((doc) => `# ${doc.label}\n\n${doc.markdown}`).join("\n\n");
				upsertPersistedReport({
					category: "spec",
					title,
					summary: `${documents.length} document(s) reviewed${result.comments.length ? `, ${result.comments.length} comment(s)` : ""}`,
					content: specContent,
					sourcePath: folderPath,
					viewerPath: folderPath,
					viewerLabel: title,
					tags: ["spec", "review"],
					metadata: {
						action: result.action,
						modified: result.modified,
						commentCount: result.comments.length,
						editedDocCount,
						documentCount: documents.length,
					},
				});
			} catch {}

			return {
				action: result.action || "declined",
				comments: result.comments || [],
				markdownChanges: result.markdownChanges || {},
				modified: result.modified || false,
				feedback: result.feedback,
			};
		} finally {
			cleanupServer();
		}
	}

	// ── show_spec tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "show_spec",
		label: "Show Spec",
		description:
			"Open a multi-page spec viewer in the browser. Displays all spec documents " +
			"(Kiro-style requirements.md, design.md, tasks.md, plus visuals and legacy spec layouts) " +
			"as wizard steps with inline comment threads and markdown editing. Takes a spec folder path, auto-discovers documents, and scaffolds missing Kiro docs for empty spec folders.\n\n" +
			"The user can:\n" +
			"- Navigate between documents using wizard steps\n" +
			"- Add inline comments on any section (Google Docs-style)\n" +
			"- Edit markdown in raw mode\n" +
			"- View visual assets in a gallery\n" +
			"- Approve the spec or request changes with comment feedback",
		parameters: ShowSpecParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { folder_path, title: titleParam, feature_idea } = params as {
				folder_path: string;
				title?: string;
				feature_idea?: string;
			};

			const folderPath = resolve(folder_path);
			if (existsSync(folderPath) && !statSync(folderPath).isDirectory()) {
				return {
					content: [{ type: "text" as const, text: `Error: path is not a folder: ${folder_path}` }],
				};
			}

			const displayTitle = titleParam || basename(folderPath);
			const scaffoldResult = prepareSpecFolder(folderPath, displayTitle, feature_idea);
			const scaffoldedNote = scaffoldResult.createdFiles.length > 0
				? ` Scaffolded: ${scaffoldResult.createdFiles.join(", ")}.`
				: "";

			try {
				const result = await runSpecViewer(ctx, folderPath, displayTitle);

				if (result.action === "approved") {
					const modifiedNote = result.modified
						? " (spec was edited by user — use the updated version)"
						: "";

					piRef.sendMessage(
						{
							customType: "spec-approved",
							content: `Spec approved! Proceed with implementation.${modifiedNote}`,
							display: true,
						},
						{ deliverAs: "followUp" as any, triggerTurn: true },
					);

					return {
						content: [{
							type: "text" as const,
							text: `Spec approved by user.${modifiedNote} Modified files have been saved.${scaffoldedNote}`,
						}],
						details: {
							action: "approved" as const,
							modified: result.modified,
							folderPath: folder_path,
							scaffoldedFiles: scaffoldResult.createdFiles,
						},
					};
				}

				if (result.action === "changes_requested") {
					const commentSummary = formatCommentsForAgent(result.comments);
					const requestedChanges = formatRequestedChanges(commentSummary, result.feedback);
					const revisionGuidance = buildSpecRevisionGuidance(commentSummary, result.feedback);
					const modifiedNote = result.modified
						? "\n\nNote: Some documents were also edited inline — check the updated files."
						: "";

					piRef.sendMessage(
						{
							customType: "spec-changes-requested",
							content: `Changes requested on the spec. Here are the requested updates:\n\n${requestedChanges}${modifiedNote}\n\n${revisionGuidance}`,
							display: true,
						},
						{ deliverAs: "followUp" as any, triggerTurn: true },
					);

					return {
						content: [{
							type: "text" as const,
							text: `User requested changes to the spec:\n\n${requestedChanges}${modifiedNote}${scaffoldedNote}`,
						}],
						details: {
							action: "changes_requested" as const,
							comments: result.comments,
							modified: result.modified,
							folderPath: folder_path,
							scaffoldedFiles: scaffoldResult.createdFiles,
							feedback: result.feedback,
						},
					};
				}

				return {
					content: [{
						type: "text" as const,
						text: `User closed the spec viewer without approving. Ask if they want changes or have feedback.${scaffoldedNote}`,
					}],
					details: {
						action: "declined" as const,
						folderPath: folder_path,
						scaffoldedFiles: scaffoldResult.createdFiles,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Spec viewer error: ${err.message}` }],
				};
			}
		},

		renderCall(args, theme) {
			const folderPath = (args as any).folder_path || "?";
			const titleArg = (args as any).title || "";
			const text =
				theme.fg("toolTitle", theme.bold("show_spec ")) +
				theme.fg("accent", folderPath) +
				(titleArg ? theme.fg("dim", ` — ${titleArg}`) : "");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.action === "approved") {
				const modNote = details.modified ? " (edited)" : "";
				return new Text(
					outputLine(theme, "success", `Spec approved${modNote}`),
					0, 0,
				);
			}

			if (details.action === "changes_requested") {
				const count = details.comments?.length || 0;
				return new Text(
					outputLine(theme, "warning", `Changes requested (${count} comment${count !== 1 ? "s" : ""})`),
					0, 0,
				);
			}

			return new Text(
				outputLine(theme, "warning", "Spec viewer closed without action"),
				0, 0,
			);
		},
	});

	// ── /spec command ────────────────────────────────────────────────

	pi.registerCommand("spec", {
		description: "Open the spec viewer for a spec folder (e.g. /spec .kiro/specs/feature-name/ --idea add a checkout flow). Empty folders are scaffolded with Kiro spec documents.",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/spec requires interactive mode", "error");
				return;
			}

			const { folderPath, featureIdea } = parseSpecCommandArgs(args);
			if (!folderPath) {
				ctx.ui.notify("Usage: /spec <folder-path> [--idea <feature idea>]", "error");
				return;
			}

			const resolved = resolve(folderPath);
			if (existsSync(resolved) && !statSync(resolved).isDirectory()) {
				ctx.ui.notify(`Not a folder: ${folderPath}`, "error");
				return;
			}

			const displayTitle = basename(resolved);
			const scaffoldResult = prepareSpecFolder(resolved, displayTitle, featureIdea);
			if (scaffoldResult.createdFiles.length > 0) {
				ctx.ui.notify(`Scaffolded Kiro spec docs: ${scaffoldResult.createdFiles.join(", ")}`, "info");
			}

			try {
				const result = await runSpecViewer(ctx, resolved, displayTitle);

				if (result.action === "approved") {
					piRef.sendMessage(
						{
							customType: "spec-approved",
							content: `Spec approved! Proceed with implementation.${result.modified ? " (spec was edited)" : ""}`,
							display: true,
						},
						{ deliverAs: "followUp" as any, triggerTurn: true },
					);
					ctx.ui.notify("Spec approved — continuing...", "info");
				} else if (result.action === "changes_requested") {
					const commentSummary = formatCommentsForAgent(result.comments);
					const requestedChanges = formatRequestedChanges(commentSummary, result.feedback);
					const revisionGuidance = buildSpecRevisionGuidance(commentSummary, result.feedback);
					piRef.sendMessage(
						{
							customType: "spec-changes-requested",
							content: `Changes requested:\n\n${requestedChanges}\n\n${revisionGuidance}`,
							display: true,
						},
						{ deliverAs: "followUp" as any, triggerTurn: true },
					);
					ctx.ui.notify("Changes requested — reviewing feedback...", "info");
				} else if (result.modified) {
					ctx.ui.notify("Spec was modified but no action taken.", "info");
				}
			} catch (err: any) {
				ctx.ui.notify(`Error: ${err.message}`, "error");
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
