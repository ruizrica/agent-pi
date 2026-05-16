// ABOUTME: Interactive Test Viewer — opens a browser GUI for reviewing generated Gherkin specs and Playwright test code.
// ABOUTME: Split-panel layout with syntax highlighting, inline editing, approve/decline flow.
// ABOUTME: Uses shared viewer server factory for HTTP server boilerplate.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename, dirname, resolve, extname } from "node:path";
import { homedir } from "node:os";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";
import type { Server } from "node:http";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateTestViewerHTML, type TestFeature } from "./lib/viewers/test-viewer-html.ts";
import { saveStandaloneExport } from "./lib/viewer-standalone-export.ts";
import { upsertPersistedReport } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { isCommanderAvailable, openAndWaitInCommander } from "./lib/commander/commander-viewer.ts";

// ── Types ────────────────────────────────────────────────────────────

interface TestViewerResult {
	action: "approved" | "declined";
	features: TestFeature[];
	modified: boolean;
}

// ── Standalone Export ────────────────────────────────────────────────

function createTestViewerStandaloneExport(opts: { title: string; features: TestFeature[] }): string {
	const { title, features } = opts;

	// Build a read-only version of the test viewer HTML
	const escapedFeatures = JSON.stringify(features).replace(/<\//g, '<\\/');

	// We generate a simplified standalone HTML with the same styling but no server interaction
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Test Report (Read-Only)</title>
<style>
  :root {
    --bg: #1a1d23; --surface: #1e2228; --surface2: #252a32; --border: #2e343e;
    --text: #e2e8f0; --text-muted: #8892a0; --text-dim: #555d6e;
    --accent: #2980b9; --accent-dim: rgba(41,128,185,0.12);
    --success: #48d889; --gherkin-keyword: #c678dd; --gherkin-step: #61afef;
    --gherkin-string: #98c379; --gherkin-tag: #e5c07b; --gherkin-comment: #5c6370;
    --gherkin-table: #56b6c2; --gherkin-variable: #e06c75;
    --pw-keyword: #c678dd; --pw-string: #98c379; --pw-function: #61afef;
    --pw-comment: #5c6370; --pw-number: #d19a66; --pw-type: #e5c07b;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 15px; line-height: 1.65; padding: 20px; }
  .report-header { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--success); border-radius: 6px; padding: 16px 24px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
  .report-header .badge { color: var(--success); font-size: 11px; font-weight: 700; padding: 3px 10px; border: 1px solid var(--success); border-radius: 4px; font-family: var(--mono); text-transform: uppercase; letter-spacing: 1px; }
  .report-header .title { font-size: 18px; font-weight: 600; flex: 1; }
  .report-header .date { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
  .feature-section { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 24px; overflow: hidden; }
  .feature-title { padding: 14px 20px; font-size: 15px; font-weight: 600; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .feature-title .num { background: var(--accent); color: var(--bg); width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; font-family: var(--mono); }
  .code-panels { display: flex; }
  .code-panel { flex: 1; }
  .code-panel + .code-panel { border-left: 1px solid var(--border); }
  .code-panel-label { padding: 8px 16px; font-size: 11px; font-weight: 600; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.15); }
  .code-panel-label.gherkin { color: var(--gherkin-keyword); }
  .code-panel-label.playwright { color: var(--pw-function); }
  pre { padding: 16px; margin: 0; font-family: var(--mono); font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-x: auto; }
  .gh-keyword { color: var(--gherkin-keyword); font-weight: 600; }
  .gh-step { color: var(--gherkin-step); font-weight: 500; }
  .gh-string { color: var(--gherkin-string); }
  .gh-tag { color: var(--gherkin-tag); font-style: italic; }
  .gh-comment { color: var(--gherkin-comment); font-style: italic; }
  .gh-table { color: var(--gherkin-table); }
  .gh-variable { color: var(--gherkin-variable); }
  .gh-scenario-name { color: var(--text); font-weight: 500; }
  .pw-keyword { color: var(--pw-keyword); font-weight: 600; }
  .pw-string { color: var(--pw-string); }
  .pw-function { color: var(--pw-function); }
  .pw-comment { color: var(--pw-comment); font-style: italic; }
  .pw-number { color: var(--pw-number); }
  .pw-type { color: var(--pw-type); }
  @media (max-width: 800px) { .code-panels { flex-direction: column; } .code-panel + .code-panel { border-left: none; border-top: 1px solid var(--border); } }
</style>
</head>
<body>
<div class="report-header">
  <span class="badge">READ-ONLY</span>
  <span class="title">${title}</span>
  <span class="date">${new Date().toISOString().slice(0, 16).replace('T', ' ')}</span>
</div>
<div id="content"></div>
<script>
(function() {
  var features = ${escapedFeatures};
  function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function highlightGherkin(text) {
    return text.split('\\n').map(function(line) {
      var t = line.trim();
      if (!t) return '';
      if (t.startsWith('#')) return '<span class="gh-comment">' + escapeHtml(line) + '</span>';
      if (t.startsWith('@')) return escapeHtml(line).replace(/(@\\S+)/g, '<span class="gh-tag">$1</span>');
      if (t.startsWith('|')) return '<span class="gh-table">' + escapeHtml(line) + '</span>';
      var kw = t.match(/^(Feature|Background|Scenario Outline|Scenario Template|Scenario|Examples|Rule):/);
      if (kw) return escapeHtml(line.slice(0,line.indexOf(t))) + '<span class="gh-keyword">' + escapeHtml(kw[1]) + ':</span><span class="gh-scenario-name">' + escapeHtml(t.slice(kw[1].length+1)) + '</span>';
      var st = t.match(/^(Given|When|Then|And|But|\\*)/);
      if (st) return escapeHtml(line.slice(0,line.indexOf(t))) + '<span class="gh-step">' + escapeHtml(st[1]) + '</span>' + escapeHtml(t.slice(st[1].length));
      return escapeHtml(line);
    }).join('\\n');
  }
  var html = '';
  features.forEach(function(f, i) {
    html += '<div class="feature-section"><div class="feature-title"><span class="num">' + (i+1) + '</span>' + escapeHtml(f.name) + '</div>';
    html += '<div class="code-panels">';
    html += '<div class="code-panel"><div class="code-panel-label gherkin">Gherkin</div><pre>' + highlightGherkin(f.gherkin) + '</pre></div>';
    html += '<div class="code-panel"><div class="code-panel-label playwright">Playwright</div><pre>' + escapeHtml(f.playwrightCode) + '</pre></div>';
    html += '</div></div>';
  });
  document.getElementById('content').innerHTML = html;
})();
<\/script>
</body>
</html>`;
}

// ── Load features from directory ─────────────────────────────────────

function loadFeaturesFromDirectory(dirPath: string): TestFeature[] {
	const features: TestFeature[] = [];
	const resolvedDir = resolve(dirPath);

	if (!existsSync(resolvedDir)) return features;

	const files = readdirSync(resolvedDir);
	const featureFiles = files.filter(f => f.endsWith('.feature'));

	for (const featureFile of featureFiles) {
		const featurePath = join(resolvedDir, featureFile);
		const gherkin = readFileSync(featurePath, 'utf-8');
		const baseName = featureFile.replace('.feature', '');

		// Try to find matching playwright test file
		const possibleTestFiles = [
			baseName + '.spec.ts',
			baseName + '.test.ts',
			baseName + '.spec.js',
			baseName + '.test.js',
		];

		let playwrightCode = '';
		for (const testFile of possibleTestFiles) {
			const testPath = join(resolvedDir, testFile);
			if (existsSync(testPath)) {
				playwrightCode = readFileSync(testPath, 'utf-8');
				break;
			}
		}

		// Extract feature name from Gherkin
		const nameMatch = gherkin.match(/^Feature:\s*(.+)/m);
		const featureName = nameMatch ? nameMatch[1].trim() : baseName;

		features.push({
			name: featureName,
			gherkin,
			playwrightCode: playwrightCode || `// Playwright tests for: ${featureName}\n// No matching test file found\n`,
			filePath: featurePath,
		});
	}

	return features;
}

// ── HTTP Server for GUI Window ───────────────────────────────────────

async function startTestViewerServer(
	features: TestFeature[],
	title: string,
): Promise<{ port: number; server: Server; waitForResult: () => Promise<TestViewerResult> }> {
	let resolveResult: (result: TestViewerResult) => void;
	const resultPromise = new Promise<TestViewerResult>((res) => {
		resolveResult = res;
	});

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

						// Save each feature's gherkin and playwright code
						const savedFiles: string[] = [];
						for (const feature of data.features) {
							const baseName = feature.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
							const gherkinFile = `${baseName}-${ts}.feature`;
							const pwFile = `${baseName}-${ts}.spec.ts`;

							writeFileSync(join(desktop, gherkinFile), feature.gherkin, "utf-8");
							writeFileSync(join(desktop, pwFile), feature.playwrightCode, "utf-8");
							savedFiles.push(gherkinFile, pwFile);
						}

						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ ok: true, message: `Saved ${savedFiles.length} files to ~/Desktop/` }));
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
						const html = createTestViewerStandaloneExport({
							title,
							features: data.features || features,
						});
						const saved = saveStandaloneExport({ filePrefix: "test-report-readonly", html });
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

	const handle = await createViewerServer({
		getHtml: (port) => generateTestViewerHTML({ features, title, port }),
		routes,
		onResult: (data) => {
			resolveResult!({
				action: data.action || "declined",
				features: data.features || features,
				modified: data.modified || false,
			});
		},
	});

	return {
		port: handle.port,
		server: handle.server,
		waitForResult: handle.waitForResult,
	};
}

// ── Tool Parameters ──────────────────────────────────────────────────

const ShowTestViewerParams = Type.Object({
	features: Type.Array(
		Type.Object({
			name: Type.String({ description: "Feature name (e.g. 'User Authentication')" }),
			gherkin: Type.String({ description: "Gherkin feature file content (.feature format)" }),
			playwright_code: Type.String({ description: "Playwright test code (TypeScript)" }),
			file_path: Type.Optional(Type.String({ description: "Optional output file path for this feature" })),
		}),
		{ description: "Array of feature/test pairs to display" },
	),
	title: Type.Optional(Type.String({ description: "Title to display in the viewer header" })),
	output_dir: Type.Optional(Type.String({ description: "Directory where test files should be saved on approve" })),
});

// ── Extension ────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let piRef = pi;

	// Track active servers
	let activeServer: Server | null = null;
	let activeSession: { kind: "tests"; title: string; url: string; server: Server; onClose: () => void } | null = null;

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

	async function runViewer(
		ctx: ExtensionContext,
		features: TestFeature[],
		title: string,
		outputDir?: string,
		signal?: AbortSignal,
	): Promise<TestViewerResult> {
		cleanupServer();

		// Try Commander first (approve mode — tests can be approved to write to disk)
		if (isCommanderAvailable()) {
			const featuresSummary = features.map((f) => [
				`## ${f.name}`,
				"",
				"### Gherkin",
				"```gherkin",
				f.gherkin,
				"```",
				"",
				"### Playwright",
				"```typescript",
				f.playwrightCode,
				"```",
			].join("\n")).join("\n\n---\n\n");
			const markdownContent = `# ${title}\n\n${features.length} feature(s)\n\n${featuresSummary}`;

			const commanderResult = await openAndWaitInCommander(
				{
					content: markdownContent,
					title: title || "Generated Tests",
					reportType: "test",
					mode: "approve",
					format: "markdown",
				},
				ctx,
				{ signal, includeContent: true },
			);

			if (commanderResult.inCommander) {
				// Write files on approve
				if (commanderResult.action === "approved") {
					const dir = outputDir ? resolve(outputDir) : process.cwd();
					if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
					for (const feature of features) {
						const baseName = feature.filePath
							? basename(feature.filePath, extname(feature.filePath))
							: feature.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
						try {
							writeFileSync(join(dir, baseName + '.feature'), feature.gherkin, 'utf-8');
							writeFileSync(join(dir, baseName + '.spec.ts'), feature.playwrightCode, 'utf-8');
						} catch {}
					}
				}

				try {
					upsertPersistedReport({
						category: "tests",
						title,
						summary: `${features.length} feature(s) — ${commanderResult.action}`,
						sourcePath: outputDir || process.cwd(),
						viewerPath: outputDir || process.cwd(),
						viewerLabel: title,
						tags: ["tests", "gherkin", "playwright"],
						metadata: {
							action: commanderResult.action,
							modified: false,
							featureCount: features.length,
						},
					});
				} catch {}

				return {
					action: commanderResult.action === "approved" ? "approved" : "declined",
					features,
					modified: false,
				};
			}
			// Fall through to browser if Commander unavailable or failed
		}

		const { port, server, waitForResult } = await startTestViewerServer(features, title);
		activeServer = server;

		const url = `http://127.0.0.1:${port}`;
		activeSession = {
			kind: "tests",
			title: "Test viewer",
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
			const abortPromise = signal
				? new Promise<TestViewerResult>((_, reject) => {
					if (signal.aborted) reject(new Error("Aborted"));
					signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
				})
				: null;

			const result = await (abortPromise
				? Promise.race([waitForResult(), abortPromise])
				: waitForResult());

			// Write files on approve
			if (result.action === "approved" && result.features) {
				const dir = outputDir ? resolve(outputDir) : process.cwd();
				if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

				for (const feature of result.features) {
					const baseName = feature.filePath
						? basename(feature.filePath, extname(feature.filePath))
						: feature.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

					const gherkinPath = join(dir, baseName + '.feature');
					const pwPath = join(dir, baseName + '.spec.ts');

					try {
						writeFileSync(gherkinPath, feature.gherkin, 'utf-8');
						writeFileSync(pwPath, feature.playwrightCode, 'utf-8');
					} catch {
						// Silently fail on write errors
					}
				}
			}

			try {
				upsertPersistedReport({
					category: "tests",
					title,
					summary: `${result.features.length} feature(s) — ${result.action}`,
					sourcePath: outputDir || process.cwd(),
					viewerPath: outputDir || process.cwd(),
					viewerLabel: title,
					tags: ["tests", "gherkin", "playwright"],
					metadata: {
						action: result.action,
						modified: result.modified,
						featureCount: result.features.length,
					},
				});
			} catch {
				// Persistence is best-effort
			}

			return result;
		} finally {
			cleanupServer();
		}
	}

	// ── show_test_viewer tool ────────────────────────────────────────

	pi.registerTool({
		name: "show_test_viewer",
		label: "Show Test Viewer",
		description:
			"Open an interactive Gherkin & Playwright test viewer in the browser. " +
			"Displays generated .feature files with syntax highlighting alongside their Playwright test code. " +
			"Split-panel layout with tabbed navigation, inline editing, and approve/decline flow.\n\n" +
			"The user can:\n" +
			"- Navigate between features in the sidebar\n" +
			"- View Gherkin specs and Playwright tests side-by-side\n" +
			"- Switch between split, Gherkin-only, and Playwright-only views\n" +
			"- Edit both Gherkin and Playwright code inline\n" +
			"- Approve to save test files to disk, or decline to provide feedback\n" +
			"- Export as standalone HTML report\n\n" +
			"On approve, .feature and .spec.ts files are written to output_dir (or CWD).",
		parameters: ShowTestViewerParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { features: rawFeatures, title, output_dir } = params as {
				features: Array<{ name: string; gherkin: string; playwright_code: string; file_path?: string }>;
				title?: string;
				output_dir?: string;
			};

			// Map from tool parameter names to internal names
			const features: TestFeature[] = rawFeatures.map(f => ({
				name: f.name,
				gherkin: f.gherkin,
				playwrightCode: f.playwright_code,
				filePath: f.file_path,
			}));

			if (features.length === 0) {
				return {
					content: [{ type: "text" as const, text: "Error: No features provided. Pass at least one feature with gherkin and playwright_code." }],
				};
			}

			const displayTitle = title || "Generated Tests";

			const result = await runViewer(ctx, features, displayTitle, output_dir, signal);

			if (result.action === "approved") {
				const modifiedNote = result.modified
					? " (tests were edited by user — use the updated versions)"
					: "";

				piRef.sendMessage(
					{
						customType: "tests-approved",
						content: `Tests approved! Files have been saved.${modifiedNote}`,
						display: true,
					},
					{ deliverAs: "followUp" as any, triggerTurn: true },
				);

				return {
					content: [{
						type: "text" as const,
						text: `Tests approved by user.${modifiedNote} ${result.features.length} feature/test pair(s) saved to ${output_dir || "current directory"}.`,
					}],
					details: {
						action: "approved" as const,
						modified: result.modified,
						featureCount: result.features.length,
						outputDir: output_dir,
					},
				};
			}

			return {
				content: [{
					type: "text" as const,
					text: "User closed the test viewer without approving. Ask if they want changes or have feedback.",
				}],
				details: {
					action: "declined" as const,
					modified: result.modified,
				},
			};
		},

		renderCall(args, theme) {
			const featureCount = (args as any).features?.length || 0;
			const titleArg = (args as any).title || "";
			const text =
				theme.fg("toolTitle", theme.bold("show_test_viewer ")) +
				theme.fg("accent", `${featureCount} feature(s)`) +
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
					outputLine(theme, "success", `Tests approved${modNote} — ${details.featureCount} pair(s) saved`),
					0, 0,
				);
			}

			return new Text(
				outputLine(theme, "warning", "Test viewer closed without approval"),
				0, 0,
			);
		},
	});

	// ── /tests command ───────────────────────────────────────────────

	pi.registerCommand("tests", {
		description: "Open the test viewer for .feature files in a directory. Usage: /tests [directory]",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/tests requires interactive mode", "error");
				return;
			}

			const dirPath = args.trim() || ctx.cwd;
			const features = loadFeaturesFromDirectory(dirPath);

			if (features.length === 0) {
				ctx.ui.notify(`No .feature files found in ${dirPath}`, "error");
				return;
			}

			const displayTitle = `Tests — ${basename(resolve(dirPath))}`;

			const result = await runViewer(ctx, features, displayTitle, dirPath);

			if (result.action === "approved") {
				piRef.sendMessage(
					{
						customType: "tests-approved",
						content: `Tests approved! ${result.features.length} feature/test pair(s) saved.${result.modified ? " (edited by user)" : ""}`,
						display: true,
					},
					{ deliverAs: "followUp" as any, triggerTurn: true },
				);
				ctx.ui.notify("Tests approved — files saved.", "info");
			} else if (result.modified) {
				ctx.ui.notify("Tests were modified but not approved.", "info");
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
