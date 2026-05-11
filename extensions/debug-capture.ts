// ABOUTME: VHS-based debug capture tool that screenshots Pi's TUI for visual inspection.
// ABOUTME: Registers /debug-capture command and debug_capture tool to generate PNGs the agent can Read.
/**
 * Debug Capture — Visual TUI debugging via charmbracelet/vhs
 *
 * Generates VHS .tape files, runs them to produce PNG screenshots,
 * and returns paths so the agent can `Read` the images to see what
 * the user sees. Bridges the gap between code-level understanding
 * and visual rendering.
 *
 * Commands:
 *   /debug-capture <scenario>   — capture a predefined or custom scenario
 *
 * Tool:
 *   debug_capture               — programmatic capture (agent can call during work)
 *
 * Scenarios:
 *   tasks          — Pi with sample task list widget
 *   modes          — Each operational mode screenshot
 *   footer         — Footer status bar
 *   theme <name>   — Pi with a specific theme
 *   custom <cmds>  — Arbitrary shell commands
 *   pi <prompt>    — Run Pi with a prompt and capture its output
 *
 * Prerequisites: vhs, ttyd, ffmpeg on PATH
 *
 * Usage: pi -e extensions/debug-capture.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { type AutocompleteItem } from "@earendil-works/pi-tui";
import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Text } from "@earendil-works/pi-tui";

// ── Constants ────────────────────────────────────

const CAPTURE_DIR_NAME = "debug-captures";
const DEFAULT_WIDTH = 1400;
const DEFAULT_HEIGHT = 900;
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_THEME = "Dracula";
const VHS_WAIT_TIMEOUT = "30s";

// ── Types ────────────────────────────────────────

interface CaptureOptions {
	width?: number;
	height?: number;
	fontSize?: number;
	theme?: string;
	waitPattern?: string;
	waitTimeout?: string;
}

interface CaptureResult {
	screenshots: string[];
	gif?: string;
	error?: string;
	tapePath: string;
	elapsed: number;
}

// ── Tape Generation ──────────────────────────────

function timestamp(): string {
	const now = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, "0");
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function tapeHeader(captureDir: string, ts: string, opts: CaptureOptions): string {
	const w = opts.width ?? DEFAULT_WIDTH;
	const h = opts.height ?? DEFAULT_HEIGHT;
	const fs = opts.fontSize ?? DEFAULT_FONT_SIZE;
	const theme = opts.theme ?? DEFAULT_THEME;

	return [
		`Output ${captureDir}/capture-${ts}.gif`,
		"",
		`Set Shell "bash"`,
		`Set FontSize ${fs}`,
		`Set Width ${w}`,
		`Set Height ${h}`,
		`Set Theme "${theme}"`,
		`Set TypingSpeed 20ms`,
		"",
	].join("\n");
}

function screenshotCmd(captureDir: string, name: string): string {
	return `Screenshot ${captureDir}/${name}.png`;
}

function waitForScreen(pattern: string, timeout?: string): string {
	const t = timeout ?? VHS_WAIT_TIMEOUT;
	return `Wait+Screen@${t} /${pattern}/`;
}

// ── Scenario Generators ──────────────────────────

/**
 * Write a helper bash script to the capture dir and return its relative path.
 * This avoids typing long ANSI-laden echo commands into VHS which garbles output.
 */
function writeHelperScript(captureDir: string, absCaptureDir: string, name: string, scriptContent: string): string {
	const relPath = `${captureDir}/${name}.sh`;
	const absPath = join(absCaptureDir, `${name}.sh`);
	writeFileSync(absPath, scriptContent, { mode: 0o755 });
	return relPath;
}

function scenarioCustom(commands: string, captureDir: string, ts: string, opts: CaptureOptions): string {
	const lines = [tapeHeader(captureDir, ts, opts)];

	// Split commands by semicolons or newlines
	const cmds = commands.split(/[;\n]/).map(c => c.trim()).filter(Boolean);

	for (const cmd of cmds) {
		lines.push(`Type "${cmd.replace(/"/g, '\\"')}"`);
		lines.push("Enter");
		lines.push("Sleep 1s");
	}

	lines.push("Sleep 2s");
	lines.push(screenshotCmd(captureDir, `custom-${ts}`));
	lines.push("Sleep 500ms");

	return lines.join("\n");
}

function scenarioPi(prompt: string, captureDir: string, ts: string, opts: CaptureOptions): string {
	const extDir = dirname(fileURLToPath(import.meta.url));
	const lines = [tapeHeader(captureDir, ts, opts)];

	// Run Pi in print mode with the prompt
	const escaped = prompt.replace(/"/g, '\\"').replace(/'/g, "'\\''");
	lines.push(`Type "pi -p '${escaped}'"`);
	lines.push("Enter");
	lines.push("");
	lines.push("# Wait for Pi to finish (look for shell prompt return)");
	lines.push(`Sleep 15s`);
	lines.push("");
	lines.push(screenshotCmd(captureDir, `pi-output-${ts}`));
	lines.push("Sleep 500ms");

	return lines.join("\n");
}

// IMPORTANT: this is a visual mock of the persistent `aboveEditor` task widget
// rendered by extensions/lib/task-list-render.ts:renderTaskList. The real widget
// (a) shows a `Mission Brief:` block when the list has a description,
// (b) does NOT render inline task rows (those live in the Ctrl+Alt+T overlay),
// (c) ends with the hotkey hint `ctrl+alt+t or /tasks to view tasks`.
// Keep this mock in lockstep with renderTaskList. The behaviour is also pinned
// by extensions/__tests__/task-list-widget.test.ts.
function scenarioTasks(captureDir: string, ts: string, opts: CaptureOptions, absCaptureDir: string): string {
	const lines = [tapeHeader(captureDir, ts, opts)];

	// Write a helper script that renders the task list with proper ANSI colors
	const script = `#!/bin/bash
# Simulated Pi task list widget — must match renderTaskList output
BG="\\033[48;5;236m"
RST="\\033[0m"
ACCENT="\\033[38;5;117m"
BOLD="\\033[1m"
MUTED="\\033[38;5;245m"
DIM="\\033[38;5;243m"
TEXT="\\033[38;5;253m"
PAD="                                                          "

echo ""
# Empty padding row (matches agent-team.ts emptyPad)
echo -e "\${BG}\${PAD}\${RST}"
# Header: bold title + done/total
echo -e "\${BG}  \${BOLD}\${TEXT}Tasks 2/5\${RST}\${BG}                                               \${RST}"
# Mission Brief block
echo -e "\${BG}  \${ACCENT}Mission Brief:\${RST}\${BG}                                          \${RST}"
echo -e "\${BG}    \${MUTED}Investigate the VHS-based debug capture extension,\${RST}\${BG}     \${RST}"
echo -e "\${BG}    \${MUTED}build the helper scripts, and verify the rendered\${RST}\${BG}      \${RST}"
echo -e "\${BG}    \${MUTED}widget matches the live Pi UI.\${RST}\${BG}                          \${RST}"
# Blank line then hotkey hint
echo -e "\${BG}\${PAD}\${RST}"
echo -e "\${BG}  \${DIM}ctrl+alt+t or /tasks to view tasks\${RST}\${BG}                      \${RST}"
# Trailing empty padding row
echo -e "\${BG}\${PAD}\${RST}"
echo ""
`;

	const scriptPath = writeHelperScript(captureDir, absCaptureDir, `tasks-${ts}`, script);

	lines.push("Hide");
	lines.push(`Type "clear && bash ${scriptPath}"`);
	lines.push("Enter");
	lines.push("Show");
	lines.push("Sleep 1s");
	lines.push(screenshotCmd(captureDir, `tasks-${ts}`));
	lines.push("Sleep 500ms");

	return lines.join("\n");
}

function scenarioModes(captureDir: string, ts: string, opts: CaptureOptions, absCaptureDir: string): string {
	const modes = ["NORMAL", "PLAN", "SPEC", "PIPELINE", "TEAM", "CHAIN"];
	const lines = [tapeHeader(captureDir, ts, opts)];

	// Write a helper script that shows all mode banners
	const script = `#!/bin/bash
BG_BLUE="\\033[44m"
FG_WHITE="\\033[1;97m"
RST="\\033[0m"
PAD="                                                            "

echo ""
echo -e "\${FG_WHITE}Mode: NORMAL (no banner)\${RST}"
echo ""
echo -e "\${BG_BLUE}\${FG_WHITE} PLAN \${PAD}\${RST}"
echo ""
echo -e "\${BG_BLUE}\${FG_WHITE} SPEC \${PAD}\${RST}"
echo ""
echo -e "\${BG_BLUE}\${FG_WHITE} PIPELINE \${PAD}\${RST}"
echo ""
echo -e "\${BG_BLUE}\${FG_WHITE} TEAM \${PAD}\${RST}"
echo ""
echo -e "\${BG_BLUE}\${FG_WHITE} CHAIN \${PAD}\${RST}"
echo ""
echo -e "\\033[48;2;180;90;0m\${FG_WHITE} PLAN + CLAUDE \${PAD}\${RST}"
echo ""
`;

	const scriptPath = writeHelperScript(captureDir, absCaptureDir, `modes-${ts}`, script);

	lines.push("Hide");
	lines.push(`Type "clear && bash ${scriptPath}"`);
	lines.push("Enter");
	lines.push("Show");
	lines.push("Sleep 1s");
	lines.push(screenshotCmd(captureDir, `modes-${ts}`));
	lines.push("Sleep 500ms");

	return lines.join("\n");
}

function scenarioFooter(captureDir: string, ts: string, opts: CaptureOptions, absCaptureDir: string): string {
	const lines = [tapeHeader(captureDir, ts, opts)];

	// Write a helper script that renders a footer bar
	const script = `#!/bin/bash
DIM="\\033[90m"
ACCENT="\\033[38;5;117m\\033[1m"
RST="\\033[0m"

clear
echo ""
echo -e " \${ACCENT}opus 4\${RST} \${DIM}|\${RST} \${DIM}42%\${RST} \${DIM}|\${RST} \${DIM}Github-Work/pi-agent\${RST}"
`;

	const scriptPath = writeHelperScript(captureDir, absCaptureDir, `footer-${ts}`, script);

	lines.push("Hide");
	lines.push(`Type "clear && bash ${scriptPath}"`);
	lines.push("Enter");
	lines.push("Show");
	lines.push("Sleep 1s");
	lines.push(screenshotCmd(captureDir, `footer-${ts}`));
	lines.push("Sleep 500ms");

	return lines.join("\n");
}

function scenarioTheme(themeName: string, captureDir: string, ts: string, opts: CaptureOptions, absCaptureDir: string): string {
	const themedOpts = { ...opts, theme: themeName };
	const lines = [tapeHeader(captureDir, ts, themedOpts)];
	const safeName = themeName.toLowerCase().replace(/\s+/g, "-");

	// Write a helper script that shows colorful output
	const script = `#!/bin/bash
echo ""
echo "Theme: ${themeName}"
echo ""
echo -e "\\033[31mRed \\033[32mGreen \\033[33mYellow \\033[34mBlue \\033[35mMagenta \\033[36mCyan \\033[37mWhite\\033[0m"
echo -e "\\033[1;31mBold Red \\033[1;32mBold Green \\033[1;34mBold Blue \\033[1;36mBold Cyan\\033[0m"
echo -e "\\033[90mDim text \\033[0m| \\033[4mUnderlined\\033[0m | \\033[7mInverse\\033[0m"
echo ""
ls --color=auto
`;

	const scriptPath = writeHelperScript(captureDir, absCaptureDir, `theme-${safeName}-${ts}`, script);

	lines.push("Hide");
	lines.push(`Type "clear && bash ${scriptPath}"`);
	lines.push("Enter");
	lines.push("Show");
	lines.push("Sleep 2s");
	lines.push(screenshotCmd(captureDir, `theme-${safeName}-${ts}`));
	lines.push("Sleep 500ms");

	return lines.join("\n");
}

// ── VHS Runner ───────────────────────────────────

function ensureCaptureDir(cwd: string): string {
	const captureDir = join(cwd, ".pi", CAPTURE_DIR_NAME);
	if (!existsSync(captureDir)) {
		mkdirSync(captureDir, { recursive: true });
	}
	return captureDir;
}

function runVhs(tapePath: string, cwd: string, ts: string): Promise<CaptureResult> {
	const startTime = Date.now();

	return new Promise((resolve) => {
		const proc = spawn("vhs", [tapePath], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout!.setEncoding("utf-8");
		proc.stdout!.on("data", (chunk: string) => { stdout += chunk; });
		proc.stderr!.setEncoding("utf-8");
		proc.stderr!.on("data", (chunk: string) => { stderr += chunk; });

		proc.on("close", (code) => {
			const elapsed = Date.now() - startTime;

			if (code !== 0) {
				resolve({
					screenshots: [],
					tapePath,
					elapsed,
					error: `VHS exited with code ${code}:\n${stderr || stdout}`,
				});
				return;
			}

			// Find PNGs and GIFs from THIS run only (matched by timestamp)
			const captureDir = join(cwd, ".pi", CAPTURE_DIR_NAME);
			const screenshots: string[] = [];
			let gif: string | undefined;

			try {
				const files = readdirSync(captureDir) as string[];
				for (const f of files) {
					if (!f.includes(ts)) continue; // Only this run's files
					const fullPath = join(captureDir, f);
					if (f.endsWith(".png")) screenshots.push(fullPath);
					if (f.endsWith(".gif")) gif = fullPath;
				}
				screenshots.sort();
			} catch {}

			resolve({ screenshots, gif, tapePath, elapsed });
		});

		proc.on("error", (err) => {
			resolve({
				screenshots: [],
				tapePath,
				elapsed: Date.now() - startTime,
				error: `Failed to spawn VHS: ${err.message}`,
			});
		});
	});
}

// ── Scenario Router ──────────────────────────────

function generateTape(
	scenario: string,
	cwd: string,
	opts: CaptureOptions = {},
): { tape: string; tapePath: string; captureDir: string; ts: string } {
	const captureDir = ensureCaptureDir(cwd);
	// Use relative path from cwd for VHS (it doesn't like absolute paths)
	const relCaptureDir = ".pi/" + CAPTURE_DIR_NAME;
	const ts = timestamp();

	const parts = scenario.trim().split(/\s+/);
	const command = parts[0]?.toLowerCase() || "custom";
	const args = parts.slice(1).join(" ");

	let tape: string;

	switch (command) {
		case "tasks":
			tape = scenarioTasks(relCaptureDir, ts, opts, captureDir);
			break;
		case "modes":
			tape = scenarioModes(relCaptureDir, ts, opts, captureDir);
			break;
		case "footer":
			tape = scenarioFooter(relCaptureDir, ts, opts, captureDir);
			break;
		case "theme":
			tape = scenarioTheme(args || DEFAULT_THEME, relCaptureDir, ts, opts, captureDir);
			break;
		case "pi":
			tape = scenarioPi(args || "Say hello", relCaptureDir, ts, opts);
			break;
		case "custom":
			tape = scenarioCustom(args || "echo 'No commands specified'", relCaptureDir, ts, opts);
			break;
		default:
			// Treat the entire input as custom commands
			tape = scenarioCustom(scenario, relCaptureDir, ts, opts);
			break;
	}

	const tapePath = join(captureDir, `tape-${ts}.tape`);
	writeFileSync(tapePath, tape, "utf-8");

	return { tape, tapePath, captureDir, ts };
}

// ── Format Results ───────────────────────────────

function formatResult(result: CaptureResult): string {
	const lines: string[] = [];

	if (result.error) {
		lines.push(`Error: ${result.error}`);
		lines.push(`Tape file: ${result.tapePath}`);
		return lines.join("\n");
	}

	lines.push(`Capture complete in ${Math.round(result.elapsed / 1000)}s`);
	lines.push("");

	if (result.screenshots.length > 0) {
		lines.push(`Screenshots (${result.screenshots.length}):`);
		for (const path of result.screenshots) {
			lines.push(`  ${path}`);
		}
		lines.push("");
		lines.push("Use Read on any screenshot path above to view the captured UI.");
	} else {
		lines.push("No screenshots were generated.");
	}

	if (result.gif) {
		lines.push("");
		lines.push(`GIF: ${result.gif}`);
	}

	lines.push("");
	lines.push(`Tape: ${result.tapePath}`);

	return lines.join("\n");
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {

	// ── Check prerequisites on load ──────────────

	function checkPrereqs(): string | null {
		try {
			execSync("which vhs", { stdio: "ignore" });
			execSync("which ttyd", { stdio: "ignore" });
			execSync("which ffmpeg", { stdio: "ignore" });
			return null;
		} catch {
			return "Missing prerequisites: vhs, ttyd, and ffmpeg must be on PATH. Install with: brew install vhs";
		}
	}

	// ── /debug-capture command ───────────────────

	const SCENARIOS = ["tasks", "modes", "footer", "theme", "pi", "custom"];

	pi.registerCommand("debug-capture", {
		description: "Capture a VHS screenshot of Pi's TUI for visual debugging",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = SCENARIOS.map(s => ({
				value: s,
				label: s === "tasks" ? "tasks — Task list widget with sample data"
					: s === "modes" ? "modes — Each operational mode banner"
					: s === "footer" ? "footer — Footer status bar"
					: s === "theme" ? "theme <name> — Pi with a specific VHS theme"
					: s === "pi" ? "pi <prompt> — Run Pi with a prompt and capture output"
					: "custom <cmds> — Run arbitrary shell commands",
			}));
			const filtered = items.filter(i => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, ctx) => {
			const scenario = args?.trim();
			if (!scenario) {
				ctx.ui.notify(
					"Usage: /debug-capture <scenario>\n" +
					"Scenarios: tasks, modes, footer, theme <name>, pi <prompt>, custom <cmds>",
					"warning",
				);
				return;
			}

			const prereqError = checkPrereqs();
			if (prereqError) {
				ctx.ui.notify(prereqError, "error");
				return;
			}

			ctx.ui.notify(`Capturing: ${scenario}...`, "info");

			const { tapePath, ts } = generateTape(scenario, ctx.cwd);
			const result = await runVhs(tapePath, ctx.cwd, ts);

			if (result.error) {
				ctx.ui.notify(`Capture failed: ${result.error}`, "error");
			} else {
				const count = result.screenshots.length;
				ctx.ui.notify(
					`Captured ${count} screenshot${count !== 1 ? "s" : ""} in ${Math.round(result.elapsed / 1000)}s. ` +
					`Use Read on the paths to inspect.`,
					"success",
				);
			}

			// Print full result to chat
			return formatResult(result);
		},
	});

	// ── debug_capture tool ───────────────────────

	pi.registerTool({
		name: "debug_capture",
		label: "Debug Capture",
		description: [
			"Capture a VHS screenshot of the terminal UI for visual debugging.",
			"Returns paths to PNG screenshots that can be viewed with the Read tool.",
			"",
			"Scenarios:",
			"  tasks          — Task list widget with sample data",
			"  modes          — Each operational mode banner",
			"  footer         — Footer status bar",
			"  theme <name>   — Terminal with a specific VHS theme (e.g. 'theme Dracula')",
			"  pi <prompt>    — Run Pi non-interactively and capture its output",
			"  custom <cmds>  — Run arbitrary shell commands (semicolon-separated)",
			"",
			"The resulting PNG paths can be passed to the Read tool to visually inspect the UI.",
		].join("\n"),
		parameters: Type.Object({
			scenario: Type.String({
				description: "Capture scenario: tasks, modes, footer, theme <name>, pi <prompt>, custom <cmds>",
			}),
			width: Type.Optional(Type.Number({ description: "Terminal width in pixels (default: 1400)" })),
			height: Type.Optional(Type.Number({ description: "Terminal height in pixels (default: 900)" })),
			fontSize: Type.Optional(Type.Number({ description: "Font size in pixels (default: 13)" })),
			theme: Type.Optional(Type.String({ description: "VHS terminal theme (default: Dracula)" })),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { scenario, width, height, fontSize, theme } =
				params as { scenario: string; width?: number; height?: number; fontSize?: number; theme?: string };

			const prereqError = checkPrereqs();
			if (prereqError) {
				return {
					content: [{ type: "text", text: prereqError }],
					details: { error: prereqError },
				};
			}

			if (onUpdate) {
				onUpdate({
					content: [{ type: "text", text: `Capturing: ${scenario}...` }],
					details: { scenario, status: "running" },
				});
			}

			const opts: CaptureOptions = { width, height, fontSize, theme };
			const { tapePath, ts } = generateTape(scenario, ctx.cwd, opts);
			const result = await runVhs(tapePath, ctx.cwd, ts);

			const output = formatResult(result);

			return {
				content: [{ type: "text", text: output }],
				details: {
					scenario,
					status: result.error ? "error" : "done",
					screenshots: result.screenshots,
					gif: result.gif,
					tapePath: result.tapePath,
					elapsed: result.elapsed,
				},
			};
		},

		renderCall(_params, _theme) {
			const p = _params as { scenario: string };
			const DIM = "\x1b[90m";
			const BRIGHT = "\x1b[1;97m";
			const RST = "\x1b[0m";
			return new Text(`${DIM}debug-capture:${RST} ${BRIGHT}${p.scenario}${RST}`, 0, 0);
		},

		renderResult(result, _options, _theme) {
			const details = result.details as any;
			const DIM = "\x1b[90m";
			const GREEN = "\x1b[32m";
			const RED = "\x1b[91m";
			const BRIGHT = "\x1b[1;97m";
			const RST = "\x1b[0m";

			if (details?.error) {
				return new Text(`${RED}capture failed${RST}`, 0, 0);
			}

			const count = details?.screenshots?.length ?? 0;
			const elapsed = details?.elapsed ? Math.round(details.elapsed / 1000) : 0;
			return new Text(
				`${GREEN}captured${RST} ${BRIGHT}${count}${RST} ${DIM}screenshot${count !== 1 ? "s" : ""} in ${elapsed}s${RST}`,
				0, 0,
			);
		},
	});

	// ── Session start ────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		// Ensure capture directory exists
		ensureCaptureDir(ctx.cwd);
	});
}
