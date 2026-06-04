// ABOUTME: QA Reco Viewer — opens a browser GUI for configuring QA test runs and viewing results with screenshot galleries.
// ABOUTME: Two-phase flow: setup page for test config, then rich QA report with pass/fail results and screenshot lightbox.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { QA_RECO_PRERELEASE_SECTIONS, getQARecoSectionLabel, normalizeQARecoSectionIds } from "./lib/qa-reco-prerelease.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateQARecoSetupHTML, generateQARecoReportHTML, type QAReportData } from "./lib/viewers/qa-reco-html.ts";
import { upsertPersistedReport } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { isCommanderAvailable, openAndWaitInCommander } from "./lib/commander/commander-viewer.ts";

// ── Types ────────────────────────────────────────────────────────────

type ViewerMode = "setup" | "report";

interface SetupConfig {
	runUnit: boolean;
	runE2E: boolean;
	e2eSuites: string[];
	platform: "ios" | "android" | "both";
	captureScreenshots: boolean;
	generateCoverage: boolean;
}

interface SetupResult {
	action: "run" | "cancelled";
	config?: SetupConfig;
}

interface ReportResult {
	action: "done" | "closed";
}

// ── Screenshot Resolver ──────────────────────────────────────────────

/**
 * Find all screenshot directories from recent test runs.
 */
function findScreenshotDirs(): string[] {
const dirs: string[] = [];
const addDir = (fullPath: string) => {
try {
const stat = statSync(fullPath);
if (stat.isDirectory() && !dirs.includes(fullPath)) dirs.push(fullPath);
} catch {}
};

// Current QA automation output layout: /tmp/qa-tests/{ios,android}/...
addDir("/tmp/qa-tests");
addDir("/tmp/qa-tests/ios");
addDir("/tmp/qa-tests/android");

// Legacy reco temp runs are still searched so older reports can resolve screenshots.
try {
const tmpEntries = readdirSync("/tmp").filter(e => e.startsWith("reco-test-"));
for (const entry of tmpEntries) {
addDir(join("/tmp", entry));
}
} catch {}
return dirs;
}

/**
 * Try to resolve a screenshot filename to its absolute path.
 * Searches in known screenshot directories.
 */
function resolveScreenshotPath(filename: string, screenshotDirs: string[]): string | null {
	// Direct absolute path
	if (filename.startsWith("/") && existsSync(filename)) return filename;

	// Search in known directories
	for (const dir of screenshotDirs) {
		const candidate = join(dir, filename);
		if (existsSync(candidate)) return candidate;
	}

	// Search recursively in known QA output directories
	for (const dir of screenshotDirs) {
		try {
			const entries = readdirSync(dir, { recursive: true }) as string[];
			for (const entry of entries) {
				if (basename(entry as string) === filename) {
					const candidate = join(dir, entry as string);
					if (existsSync(candidate)) return candidate;
				}
			}
		} catch {}
	}

	return null;
}

// ── HTTP Server: Setup Mode ──────────────────────────────────────────

function startSetupServer(
	title: string,
): Promise<{ port: number; server: Server; waitForResult: () => Promise<SetupResult> }> {
	return new Promise((resolveSetup) => {
		let resolveResult: (result: SetupResult) => void;
		const resultPromise = new Promise<SetupResult>((res) => {
			resolveResult = res;
		});

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");

			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || "/", `http://localhost`);

			// Serve the setup HTML page
			if (req.method === "GET" && url.pathname === "/") {
				const port = (server.address() as any)?.port || 0;
				const html = generateQARecoSetupHTML({ port, title });
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			// Serve the logo image
			if (req.method === "GET" && url.pathname === "/logo.png") {
				try {
					const logoPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "agent-logo.png");
					const logoData = readFileSync(logoPath);
					res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
					res.end(logoData);
				} catch {
					res.writeHead(404);
					res.end();
				}
				return;
			}

			// Handle result (run or cancel)
			if (req.method === "POST" && url.pathname === "/result") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
						resolveResult!({
							action: data.action || "cancelled",
							config: data.config,
						});
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Invalid JSON" }));
					}
				});
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as any;
			resolveSetup({
				port: addr.port,
				server,
				waitForResult: () => resultPromise,
			});
		});
	});
}

// ── HTTP Server: Report Mode ─────────────────────────────────────────

function startReportServer(
	report: QAReportData,
): Promise<{ port: number; server: Server; waitForResult: () => Promise<ReportResult> }> {
	return new Promise((resolveSetup) => {
		let resolveResult: (result: ReportResult) => void;
		let settled = false;
		const settle = (result: ReportResult) => {
			if (settled) return;
			settled = true;
			resolveResult!(result);
		};
		const resultPromise = new Promise<ReportResult>((res) => {
			resolveResult = res;
		});

		// Gather all screenshot directories for resolving
		const screenshotDirs = findScreenshotDirs();
		// Also add any suite-specific screenshot dirs
		for (const suite of report.suites) {
			if (suite.screenshotDir && !screenshotDirs.includes(suite.screenshotDir)) {
				screenshotDirs.push(suite.screenshotDir);
			}
		}

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");

			if (req.method === "OPTIONS") {
				res.writeHead(204);
				res.end();
				return;
			}

			const url = new URL(req.url || "/", `http://localhost`);

			// Serve the report HTML page
			if (req.method === "GET" && url.pathname === "/") {
				const port = (server.address() as any)?.port || 0;
				const html = generateQARecoReportHTML({ report, port });
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(html);
				return;
			}

			// Serve the logo
			if (req.method === "GET" && url.pathname === "/logo.png") {
				try {
					const logoPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "agent-logo.png");
					const logoData = readFileSync(logoPath);
					res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
					res.end(logoData);
				} catch {
					res.writeHead(404);
					res.end();
				}
				return;
			}

			// ── Screenshot serving ──────────────────────────────────
			if (req.method === "GET" && url.pathname.startsWith("/screenshots/")) {
				const filename = decodeURIComponent(url.pathname.slice("/screenshots/".length));
				const resolvedPath = resolveScreenshotPath(filename, screenshotDirs);

				if (resolvedPath) {
					try {
						const imgData = readFileSync(resolvedPath);
						const ext = resolvedPath.toLowerCase().split(".").pop();
						const mimeTypes: Record<string, string> = {
							png: "image/png",
							jpg: "image/jpeg",
							jpeg: "image/jpeg",
							gif: "image/gif",
							webp: "image/webp",
						};
						const mime = mimeTypes[ext || "png"] || "image/png";
						res.writeHead(200, {
							"Content-Type": mime,
							"Cache-Control": "public, max-age=60",
						});
						res.end(imgData);
						return;
					} catch {
						res.writeHead(404);
						res.end("Screenshot not found");
						return;
					}
				}

				res.writeHead(404);
				res.end("Screenshot not found");
				return;
			}

			// Handle result (done)
			if (req.method === "POST" && url.pathname === "/result") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true }));
						settle({
							action: data.action || "closed",
						});
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Invalid JSON" }));
					}
				});
				return;
			}

			// Save to desktop (JSON)
			if (req.method === "POST" && url.pathname === "/save") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						const desktop = join(homedir(), "Desktop");
						if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
						const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
						const fileName = `qa-report-${ts}.json`;
						const filePath = join(desktop, fileName);
						writeFileSync(filePath, JSON.stringify(data.report, null, 2), "utf-8");
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, message: `Saved to ~/Desktop/${fileName}` }));
					} catch (err: any) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err.message }));
					}
				});
				return;
			}

			// Export standalone HTML
			if (req.method === "POST" && url.pathname === "/export-standalone") {
				let body = "";
				req.on("data", (chunk) => { body += chunk; });
				req.on("end", () => {
					try {
						const data = JSON.parse(body || "{}");
						const exportReport = data.report || report;
						const html = generateQARecoReportHTML({ report: exportReport, port: 0 });
						const desktop = join(homedir(), "Desktop");
						if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
						const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
						const fileName = `qa-report-${ts}.html`;
						const filePath = join(desktop, fileName);
						writeFileSync(filePath, html, "utf-8");
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, message: `Standalone export saved to ~/Desktop/${fileName}` }));
					} catch (err: any) {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: err.message }));
					}
				});
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

		server.on("close", () => {
			settle({ action: "closed" });
		});

		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as any;
			resolveSetup({
				port: addr.port,
				server,
				waitForResult: () => resultPromise,
			});
		});
	});
}

// ── Browser Helper ───────────────────────────────────────────────────

function openBrowser(url: string): void {
	try {
		execSync(`open "${url}"`, { stdio: "ignore" });
	} catch {
		try {
			execSync(`xdg-open "${url}"`, { stdio: "ignore" });
		} catch {
			try {
				execSync(`start "${url}"`, { stdio: "ignore" });
			} catch {}
		}
	}
}

function countBlockedChecks(report: QAReportData): number {
	return (report.sections || []).reduce((total, section) => total + (section.checks || []).filter((check) => check.status === "failed" || check.status === "blocked").length, 0);
}

function getReleaseGateLabel(report: QAReportData): string | undefined {
	if (report.releaseGate?.label) return report.releaseGate.label;
	if (report.releaseGate?.status === "ready") return "READY FOR RELEASE";
	if (report.releaseGate?.status === "blocked") return "RELEASE BLOCKED";
	if (report.releaseGate?.status === "review") return "NEEDS REVIEW";
	if ((report.sections || []).length === 0) return undefined;
	return countBlockedChecks(report) > 0 ? "RELEASE BLOCKED" : "READY FOR RELEASE";
}

function reportMetadata(report: QAReportData) {
	const platforms = new Set<string>();
	if (report.config?.platform) platforms.add(report.config.platform);
	for (const suite of report.suites || []) if (suite.platform) platforms.add(suite.platform);
	for (const section of report.sections || []) if (section.platform) platforms.add(section.platform);
	return {
		suiteCount: report.suites?.length || 0,
		screenshotCount: report.screenshots?.length || 0,
		sectionCount: report.sections?.length || 0,
		blockedCount: countBlockedChecks(report),
		releaseGate: getReleaseGateLabel(report),
		platforms: [...platforms],
	};
}

function buildQARecoRunInstructions(config: SetupConfig): string {
	const selectedSections = normalizeQARecoSectionIds(config.e2eSuites);
	const selectedLabels = selectedSections.map(getQARecoSectionLabel).join(", ");
	const unitInstruction = config.runUnit
		? `Run focused Reco/mobile unit tests when available, or skip with a clear reason if the current project has no matching Jest target. If coverage is requested, include the project coverage flag.`
		: "Skip unit tests";

	let e2eInstruction = "Skip pre-release E2E flows";
	if (config.runE2E) {
		const sectionArg = selectedSections.length === QA_RECO_PRERELEASE_SECTIONS.length
			? ""
			: ` --sections ${selectedSections.join(",")}`;
		const platformArg = config.platform === "both" ? "both" : config.platform;
		e2eInstruction = [
			`Run public Reco pre-release flows for: ${selectedLabels}.`,
			`Command: bash /Users/ricardo/Workshop/GitHub/reco/mobile/.pi/skills/qa-automation/qa-test-flows/run-all.sh reco-prerelease --platform ${platformArg}${sectionArg}`,
		].join("\n");
	}

	return [
		"User configured QA Reco pre-release automation. Execute the selected catalog-backed checks and then open the public QA Reco report.",
		"",
		"Selected configuration:",
		"```json",
		JSON.stringify({ ...config, e2eSuites: selectedSections }, null, 2),
		"```",
		"",
		"Instructions:",
		`1. ${unitInstruction}`,
		`2. ${e2eInstruction}`,
		"3. Assemble results with: node skills/qa-automation/qa-test-flows/lib/build-qa-reco-report.mjs --input /tmp/qa-tests --output /tmp/qa-tests/qa-reco-prerelease-report.json",
		"4. Call show_qa_reco with mode='report' and report_data set to the assembled QAReportData JSON.",
		"5. If auth/backend/simulator dependencies block liking or commenting, mark those checks blocked with concrete reasons rather than passing them.",
	].join("\n");
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowQARecoParams = Type.Object({
	mode: Type.Optional(Type.String({
		description: "Viewer mode: 'setup' (default) for test configuration page, or 'report' for displaying QA results with screenshots",
	})),
	title: Type.Optional(Type.String({
		description: "Title to display in the viewer header",
	})),
	report_data: Type.Optional(Type.String({
		description: "JSON string of QAReportData for report mode. Required when mode is 'report'.",
	})),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let piRef = pi;
	let activeServer: Server | null = null;
	let activeSession: { kind: "setup" | "qa"; title: string; url: string; server: Server; onClose: () => void } | null = null;

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

	// ── Setup Viewer ─────────────────────────────────────────────────

	async function runSetupViewer(
		ctx: ExtensionContext,
		title: string,
		signal?: AbortSignal,
	): Promise<SetupResult> {
		cleanupServer();

		const { port, server, waitForResult } = await startSetupServer(title);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "setup" as const,
			title: "QA Reco Setup",
			url,
			server,
			onClose: () => { activeServer = null; activeSession = null; },
		};
		registerActiveViewer(activeSession);
		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		try {
			const abortPromise = signal
				? new Promise<SetupResult>((_, reject) => {
					if (signal.aborted) reject(new Error("Aborted"));
					signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
				})
				: null;

			const result = await (abortPromise
				? Promise.race([waitForResult(), abortPromise])
				: waitForResult());

			try {
				const selectedSections = result.config?.runE2E ? normalizeQARecoSectionIds(result.config.e2eSuites) : [];
				upsertPersistedReport({
					category: "qa",
					title,
					summary: result.action === "run"
						? `QA configured: ${result.config?.runUnit ? "Unit" : ""}${result.config?.runUnit && result.config?.runE2E ? " + " : ""}${result.config?.runE2E ? "Pre-release (" + selectedSections.length + " sections)" : ""}`
						: "QA setup cancelled",
					sourcePath: "qa-reco-setup",
					viewerPath: "qa-reco-setup",
					viewerLabel: title,
					tags: ["qa", "setup", "reco"],
					metadata: { action: result.action, config: result.config ? { ...result.config, e2eSuites: selectedSections } : undefined, sectionCount: selectedSections.length },
				});
			} catch {}

			return result;
		} finally {
			cleanupServer();
		}
	}

	// ── Report Viewer ────────────────────────────────────────────────

	async function runReportViewer(
		ctx: ExtensionContext,
		report: QAReportData,
		signal?: AbortSignal,
	): Promise<ReportResult> {
		cleanupServer();

		// Try Commander first for report mode (read-only view)
		if (isCommanderAvailable()) {
			const meta = reportMetadata(report);
			const suitesSummary = (report.suites || []).map((s: any) =>
				`- **${s.name}**: ${s.passed ?? 0} passed, ${s.failed ?? 0} failed`
			).join("\n");
			const sectionSummary = (report.sections || []).map((section) => {
				const checks = section.checks || [];
				const passed = checks.filter((check) => check.status === "passed").length;
				const blocked = checks.filter((check) => check.status === "failed" || check.status === "blocked").length;
				return `- **${section.name}** (${section.priority || "P1"} / ${section.risk || "medium"}): ${section.status}, ${passed}/${checks.length} checks passed${blocked ? `, ${blocked} blocked/failed` : ""}`;
			}).join("\n");
			const markdownContent = [
				`# ${report.title}`,
				"",
				`**✅ ${report.totalPassed} passed** · **❌ ${report.totalFailed} failed**`,
				meta.releaseGate ? `**Release gate:** ${meta.releaseGate}` : "",
				"",
				(report.sections?.length || 0) > 0 ? `## Critical Features\n\n${sectionSummary}` : "",
				"",
				(report.suites?.length || 0) > 0 ? `## Suites\n\n${suitesSummary}` : "",
				"",
				(report.screenshots?.length || 0) > 0 ? `_${report.screenshots!.length} screenshot(s) captured (view in browser for gallery)_` : "",
			].filter(Boolean).join("\n");

			const commanderResult = await openAndWaitInCommander(
				{
					content: markdownContent,
					title: report.title,
					reportType: "qa",
					mode: "view",
					format: "markdown",
				},
				ctx,
				{ signal },
			);

			if (commanderResult.inCommander) {
				try {
					const meta = reportMetadata(report);
					upsertPersistedReport({
						category: "qa",
						title: report.title,
						summary: `${report.totalPassed} passed, ${report.totalFailed} failed — ${meta.sectionCount} section(s), ${meta.suiteCount} suite(s), ${meta.screenshotCount} screenshot(s)${meta.releaseGate ? " — " + meta.releaseGate : ""}`,
						sourcePath: "qa-reco-report",
						viewerPath: "qa-reco-report",
						viewerLabel: report.title,
						tags: ["qa", "report", "reco", "screenshots"],
						metadata: {
							action: "done",
							...meta,
							totalPassed: report.totalPassed,
							totalFailed: report.totalFailed,
						},
					});
				} catch {}

				return { action: "done" as const };
			}
			// Fall through to browser if Commander unavailable or failed
		}

		const { port, server, waitForResult } = await startReportServer(report);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "qa" as const,
			title: "QA Reco Report",
			url,
			server,
			onClose: () => { activeServer = null; activeSession = null; },
		};
		registerActiveViewer(activeSession);
		openBrowser(url);
		notifyViewerOpen(ctx, activeSession);

		try {
			const abortPromise = signal
				? new Promise<ReportResult>((_, reject) => {
					if (signal.aborted) reject(new Error("Aborted"));
					signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
				})
				: null;

			const result = await (abortPromise
				? Promise.race([waitForResult(), abortPromise])
				: waitForResult());

			try {
				const meta = reportMetadata(report);
				upsertPersistedReport({
					category: "qa",
					title: report.title,
					summary: `${report.totalPassed} passed, ${report.totalFailed} failed — ${meta.sectionCount} section(s), ${meta.suiteCount} suite(s), ${meta.screenshotCount} screenshot(s)${meta.releaseGate ? " — " + meta.releaseGate : ""}`,
					sourcePath: "qa-reco-report",
					viewerPath: "qa-reco-report",
					viewerLabel: report.title,
					tags: ["qa", "report", "reco", "screenshots"],
					metadata: {
						action: result.action,
						...meta,
						totalPassed: report.totalPassed,
						totalFailed: report.totalFailed,
					},
				});
			} catch {}

			return result;
		} finally {
			cleanupServer();
		}
	}

	// ── show_qa_reco tool ────────────────────────────────────────────

	pi.registerTool({
		name: "show_qa_reco",
		label: "Show QA Reco",
		description:
			"Open the public QA Reco pre-release viewer in the browser. Two modes:\n\n" +
			"**Setup mode** (default): Opens a configuration page where the user can select " +
			"Unit checks, catalog-backed critical sections, platform, and options like screenshot capture. " +
			"Returns the user's config when they click 'Run QA'.\n\n" +
			"**Report mode**: Displays a QA results report with release gate status, Critical Feature " +
			"sections, nested check rows, per-suite test results, screenshot galleries, and export controls. " +
			"Requires report_data as a JSON string.\n\n" +
			"The /qa-reco command always opens setup first, then report after test execution.",
		parameters: ShowQARecoParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { mode: modeStr, title: titleParam, report_data } = params as {
				mode?: string;
				title?: string;
				report_data?: string;
			};

			const viewerMode: ViewerMode = modeStr === "report" ? "report" : "setup";
			const displayTitle = titleParam || "QA Reco";

			// ── Report mode ──────────────────────────────────────────
			if (viewerMode === "report") {
				if (!report_data) {
					return {
						content: [{ type: "text" as const, text: "Error: report_data is required when mode is 'report'." }],
					};
				}

				let report: QAReportData;
				try {
					report = JSON.parse(report_data);
				} catch (err: any) {
					return {
						content: [{ type: "text" as const, text: `Error parsing report_data: ${err.message}` }],
					};
				}

				try {
					const result = await runReportViewer(ctx, report, signal);
					const meta = reportMetadata(report);
					return {
						content: [{
							type: "text" as const,
							text: `QA report viewer closed. ${report.totalPassed} passed, ${report.totalFailed} failed across ${meta.sectionCount} critical section(s) and ${meta.suiteCount} suite(s). ${meta.screenshotCount} screenshot(s) captured.${meta.releaseGate ? " Gate: " + meta.releaseGate + "." : ""}`,
						}],
						details: {
							action: result.action,
							mode: "report",
							title: report.title,
							totalPassed: report.totalPassed,
							totalFailed: report.totalFailed,
							...meta,
						},
					};
				} catch (err: any) {
					return {
						content: [{ type: "text" as const, text: `Report viewer error: ${err.message}` }],
					};
				}
			}

			// ── Setup mode (default) ────────────────────────────────
			try {
				const result = await runSetupViewer(ctx, displayTitle, signal);

				if (result.action === "run" && result.config) {
					// Build a descriptive message for pi to act on
					const selectedSections = normalizeQARecoSectionIds(result.config.e2eSuites);
					const testTypes: string[] = [];
					if (result.config.runUnit) testTypes.push("Unit Tests (Jest)");
					if (result.config.runE2E) testTypes.push(`Pre-release Sections (${selectedSections.map(getQARecoSectionLabel).join(", ")})`);
					const platformLabel = result.config.runE2E ? result.config.platform : "N/A";

					// @security-scan-suppress SAST-AI-INJ-002 — config values are from controlled UI selections (checkboxes/dropdowns), not free-text input
					piRef.sendMessage(
						{
							customType: "qa-reco-config",
							content: buildQARecoRunInstructions(result.config),
							display: true,
						},
						{ deliverAs: "followUp" as any, triggerTurn: true },
					);

					return {
						content: [{
							type: "text" as const,
							text: `QA Reco configured by user. Settings:\n- Test Types: ${testTypes.join(" + ")}\n- Platform: ${platformLabel}\n- Screenshots: ${result.config.captureScreenshots ? "Yes" : "No"}\n- Coverage: ${result.config.generateCoverage ? "Yes" : "No"}\n\nProceed with running the configured tests.`,
						}],
						details: {
							action: "run" as const,
							mode: "setup",
							config: { ...result.config, e2eSuites: selectedSections },
						},
					};
				}

				return {
					content: [{
						type: "text" as const,
						text: "User cancelled the QA Reco setup without running tests.",
					}],
					details: {
						action: "cancelled" as const,
						mode: "setup",
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Setup viewer error: ${err.message}` }],
				};
			}
		},

		renderCall(args, theme) {
			const modeArg = (args as any).mode || "setup";
			const titleArg = (args as any).title || "";
			const modeLabel = modeArg === "report" ? "report" : "setup";
			const text =
				theme.fg("toolTitle", theme.bold("show_qa_reco ")) +
				theme.fg("accent", `[${modeLabel}]`) +
				(titleArg ? theme.fg("dim", ` — ${titleArg}`) : "");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.mode === "setup") {
				if (details.action === "run") {
					return new Text(
						outputLine(theme, "success", "QA configured — running tests..."),
						0, 0,
					);
				}
				return new Text(
					outputLine(theme, "warning", "QA setup cancelled"),
					0, 0,
				);
			}

			if (details.mode === "report") {
				const passed = details.totalPassed ?? 0;
				const failed = details.totalFailed ?? 0;
				const statusColor = failed === 0 ? "success" : "error";
				return new Text(
					outputLine(theme, statusColor, `QA report closed — ${passed} passed, ${failed} failed`),
					0, 0,
				);
			}

			return new Text(
				outputLine(theme, "warning", "QA Reco viewer closed"),
				0, 0,
			);
		},
	});

	// ── /qa-reco command ─────────────────────────────────────────────

	pi.registerCommand("qa-reco", {
		description: "Open the public QA Reco pre-release runner — configure catalog-backed critical feature checks with screenshot capture",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/qa-reco requires interactive mode", "error");
				return;
			}

			const displayTitle = args.trim() || "QA Reco";

			// Always start with setup
			const setupResult = await runSetupViewer(ctx, displayTitle);

			if (setupResult.action === "run" && setupResult.config) {
				const selectedSections = normalizeQARecoSectionIds(setupResult.config.e2eSuites);
				const testTypes: string[] = [];
				if (setupResult.config.runUnit) testTypes.push("Unit Tests");
				if (setupResult.config.runE2E) testTypes.push(`Pre-release (${selectedSections.length} sections)`);
				const platformLabel = setupResult.config.runE2E ? setupResult.config.platform : "N/A";

				// @security-scan-suppress SAST-AI-INJ-002 — config values are from controlled UI selections (checkboxes/dropdowns), not free-text input
				piRef.sendMessage(
					{
						customType: "qa-reco-config",
						content: buildQARecoRunInstructions(setupResult.config),
						display: true,
					},
					{ deliverAs: "followUp" as any, triggerTurn: true },
				);
				ctx.ui.notify(`QA configured — ${testTypes.join(" + ")} on ${platformLabel}`, "info");
			} else {
				ctx.ui.notify("QA setup cancelled.", "info");
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
