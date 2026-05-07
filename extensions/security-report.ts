// ABOUTME: Dedicated browser viewer for network/security analysis reports.
// ABOUTME: Renders structured defensive security assessments with findings, mitigations, and source sections.
// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { type Server } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateSecurityReportHTML, type SecurityReportData, type SecurityReportFinding } from "./lib/security/security-report-html.ts";
import { upsertPersistedReport } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { isCommanderAvailable, openAndWaitInCommander } from "./lib/commander/commander-viewer.ts";
import { saveScanSnapshot, loadHistoryForReport } from "./lib/security/security-history.ts";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";

function parseList(value?: string): string[] {
	if (!value) return [];
	return value.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
}

function ensureSectionContent(value: string | undefined, fallback: string): string {
	const normalized = (value || "").trim();
	return normalized.length > 0 ? normalized : fallback;
}

function parseFindings(markdown: string): SecurityReportFinding[] {
	const lines = markdown.split(/\r?\n/);
	const findings: SecurityReportFinding[] = [];
	let current: SecurityReportFinding | null = null;

	for (const line of lines) {
		const findingMatch = line.match(/^[-*]\s+\[(critical|high|medium|low|info)\]\s+(.+)$/i);
		if (findingMatch) {
			if (current) findings.push(current);
			current = {
				severity: findingMatch[1].toLowerCase() as SecurityReportFinding["severity"],
				title: findingMatch[2].trim(),
				category: "general",
			};
			continue;
		}

		if (!current) continue;

		const categoryMatch = line.match(/^\s*category:\s*(.+)$/i);
		if (categoryMatch) {
			current.category = categoryMatch[1].trim();
			continue;
		}

		const evidenceMatch = line.match(/^\s*evidence:\s*(.+)$/i);
		if (evidenceMatch) {
			current.evidence = evidenceMatch[1].trim();
			continue;
		}

		const recMatch = line.match(/^\s*recommendation:\s*(.+)$/i);
		if (recMatch) {
			current.recommendation = recMatch[1].trim();
			continue;
		}
	}

	if (current) findings.push(current);
	return findings;
}

function startServer(report: SecurityReportData): Promise<{ port: number; server: Server; waitForClose: () => Promise<void> }> {
	return new Promise(async (resolveSetup) => {
		let serverPort = 0;
		let resolveResult!: () => void;
		const resultPromise = new Promise<void>((resolve) => { resolveResult = resolve; });

		const { port, server, waitForResult } = await createViewerServer({
			getHtml: (port) => {
				serverPort = port;
				return generateSecurityReportHTML(report, port);
			},
			routes: [
				{
					method: "POST",
					path: "/save",
					handler: async (_req, res) => {
						const desktop = join(homedir(), "Desktop");
						if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
						const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
						const filePath = join(desktop, `security-report-${ts}.html`);
						writeFileSync(filePath, generateSecurityReportHTML(report, serverPort), "utf-8");
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, path: filePath }));
					},
				},
			],
			onResult: () => {
				resolveResult();
			},
		});

		// Hook the result promise
		waitForResult().then(() => {
			resolveResult();
		}).catch(() => {
			resolveResult();
		});

		resolveSetup({ port, server, waitForClose: () => resultPromise });
	});
}

export default function (pi: ExtensionAPI) {
	let activeServer: Server | null = null;
	let activeSession: { kind: "report"; title: string; url: string; server: Server; onClose: () => void } | null = null;

	function cleanup() {
		if (activeServer) {
			try { activeServer.close(); } catch {}
			activeServer = null;
		}
		if (activeSession) {
			clearActiveViewer(activeSession);
			activeSession = null;
		}
	}

	pi.registerTool({
		name: "show_security_report",
		label: "Show Security Report",
		description: "Open a dedicated security analysis report viewer for defensive local/network assessments. Supports a summary, findings, mitigations, and sections for intelligence, inspection, and scan results.",
		parameters: Type.Object({
			title: Type.Optional(Type.String({ description: "Report title" })),
			summary: Type.String({ description: "Executive summary for the report" }),
			scope: Type.Optional(Type.String({ description: "Scope of the assessment" })),
			findings_markdown: Type.Optional(Type.String({ description: "Structured findings in markdown bullets like '- [high] Open service exposure' with optional category/evidence/recommendation lines." })),
			mitigations: Type.Optional(Type.String({ description: "Mitigation list separated by newlines or semicolons" })),
			intelligence: Type.Optional(Type.String({ description: "Threat intelligence section text" })),
			inspection: Type.Optional(Type.String({ description: "Passive inspection section text" })),
			scan: Type.Optional(Type.String({ description: "Port analysis section text" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const p = params as any;
			const parsedFindings = parseFindings(p.findings_markdown || "");
			const parsedMitigations = parseList(p.mitigations);
			const report: SecurityReportData = {
				title: p.title || "Security Analysis Report",
				summary: ensureSectionContent(p.summary, "Security assessment completed. Review the structured findings, mitigations, and analysis sections below for the current defensive posture."),
				generatedAt: new Date().toISOString(),
				scope: ensureSectionContent(p.scope, "Scope not explicitly provided; report reflects the active local security assessment context."),
				intelligence: ensureSectionContent(p.intelligence, parsedFindings.length > 0
					? `Threat intelligence summary: ${parsedFindings.length} structured findings were captured and prioritized for review based on severity and defensive impact.`
					: "Threat intelligence summary: no structured findings were supplied, so no external or code-derived threats were identified in this report."),
				inspection: ensureSectionContent(p.inspection, parsedFindings.length > 0
					? "Passive inspection summary: evidence was captured for the reported findings and should be reviewed alongside file paths, categories, and recommendations."
					: "Passive inspection summary: no structured evidence was supplied, so this section records that no additional passive inspection artifacts were available."),
				scan: ensureSectionContent(p.scan, parsedFindings.length > 0
					? `Scan analysis summary: ${parsedFindings.length} findings and ${parsedMitigations.length} mitigations were provided to this report renderer.`
					: "Scan analysis summary: no scan findings were provided to the renderer; maintain monitoring and rerun the assessment when new data is available."),
				findings: parsedFindings,
				mitigations: parsedMitigations.length > 0 ? parsedMitigations : [parsedFindings.length > 0 ? "Review each finding in severity order and apply the recommended remediation or compensating control." : "No mitigations were provided because no actionable findings were supplied to the report."],
			};

			// Load history BEFORE saving the current scan so delta compares against the previous one
			try {
				const history = loadHistoryForReport(report);
				report.history = history;
			} catch {}

			// Persist current scan to history
			try {
				saveScanSnapshot(report);
			} catch {}

			// Try Commander first (read-only view)
			if (isCommanderAvailable()) {
				const findingsList = report.findings
					.map((f) => `- **[${f.severity}]** ${f.title}${f.detail ? ` — ${f.detail}` : ""}`)
					.join("\n");
				const mitigationsList = report.mitigations.map((m) => `- ${m}`).join("\n");
				const markdownContent = [
					`# ${report.title}`,
					"",
					`**Scope:** ${report.scope}`,
					"",
					"## Summary",
					"",
					report.summary,
					"",
					report.findings.length > 0 ? `## Findings (${report.findings.length})\n\n${findingsList}` : "",
					"",
					report.mitigations.length > 0 ? `## Mitigations\n\n${mitigationsList}` : "",
					"",
					report.intelligence ? `## Threat Intelligence\n\n${report.intelligence}` : "",
					"",
					report.inspection ? `## Passive Inspection\n\n${report.inspection}` : "",
					"",
					report.scan ? `## Scan Analysis\n\n${report.scan}` : "",
				].filter(Boolean).join("\n");

				const commanderResult = await openAndWaitInCommander(
					{
						content: markdownContent,
						title: report.title,
						reportType: "security",
						mode: "view",
						format: "markdown",
					},
					ctx,
				);

				if (commanderResult.inCommander) {
					try {
						upsertPersistedReport({
							category: "security",
							title: report.title,
							summary: report.summary,
							content: report.summary,
							sourcePath: join(ctx.cwd || process.cwd(), ".context", "network-security-chain-design.md"),
							viewerPath: join(ctx.cwd || process.cwd(), ".context", "network-security-chain-design.md"),
							viewerLabel: report.title,
							tags: ["security", "report", "network"],
							metadata: {
								scope: report.scope,
								findings: report.findings.length,
								mitigations: report.mitigations.length,
							},
						});
					} catch {}

					return {
						content: [{ type: "text" as const, text: "Security analysis report viewed in Commander." }],
						details: { findings: report.findings.length, mitigations: report.mitigations.length },
					};
				}
				// Fall through to browser if Commander unavailable or failed
			}

			cleanup();
			const { port, server, waitForClose } = await startServer(report);
			activeServer = server;
			const url = `http://127.0.0.1:${port}`;
			activeSession = {
				kind: "report",
				title: report.title,
				url,
				server,
				onClose: () => {
					activeServer = null;
					activeSession = null;
				},
			};
			registerActiveViewer(activeSession);
			openBrowser(url);
			notifyViewerOpen(ctx, activeSession);

			try {
				await waitForClose();
				try {
					upsertPersistedReport({
						category: "security",
						title: report.title,
						summary: report.summary,
						content: report.summary,
						sourcePath: join(ctx.cwd || process.cwd(), ".context", "network-security-chain-design.md"),
						viewerPath: join(ctx.cwd || process.cwd(), ".context", "network-security-chain-design.md"),
						viewerLabel: report.title,
						tags: ["security", "report", "network"],
						metadata: {
							scope: report.scope,
							findings: report.findings.length,
							mitigations: report.mitigations.length,
						},
					});
				} catch {}

				return {
					content: [{ type: "text" as const, text: "Security analysis report acknowledged." }],
					details: { findings: report.findings.length, mitigations: report.mitigations.length },
				};
			} finally {
				cleanup();
			}
		},
		renderCall(args, theme) {
			const p = args as any;
			const text = theme.fg("toolTitle", theme.bold("show_security_report ")) + theme.fg("accent", p.title || "Security Analysis Report");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as any;
			return new Text(outputLine(theme, "success", `Security report acknowledged — ${details?.findings ?? 0} findings`), 0, 0);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});

	pi.on("session_shutdown", async () => {
		cleanup();
	});
}
