// ABOUTME: User Question — Rich interactive UI tool for agent-to-user communication
// ABOUTME: Split-panel overlay with selectable options (left) and live markdown preview (right)

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@mariozechner/pi-coding-agent";
import {
	Container, Key, Markdown, Spacer, Text,
	matchesKey, truncateToWidth, visibleWidth,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { outputLine } from "./lib/output-box.ts";
import { buildAskUserDetails, type AskUserDetails } from "./lib/ask-user-details.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { renderPanelBackdrop } from "./lib/panel-backdrop.ts";

// ── Types ──────────────────────────────────────────────────────────────

interface OptionDef {
	label: string;
	markdown?: string;
}

// ── Text helpers ──────────────────────────────────────────────────────

function wordWrap(text: string, width: number): string[] {
	if (visibleWidth(text) <= width) return [text];
	const words = text.split(/(\s+)/);
	const lines: string[] = [];
	let cur = "";
	for (const w of words) {
		if (visibleWidth(cur + w) > width && cur.length > 0) {
			lines.push(cur);
			cur = w.trimStart();
		} else {
			cur += w;
		}
	}
	if (cur.length > 0) lines.push(cur);
	return lines;
}

function padRight(s: string, width: number): string {
	const vis = visibleWidth(s);
	if (vis >= width) return truncateToWidth(s, width, "");
	return s + " ".repeat(width - vis);
}

function sideBySide(
	left: string[], right: string[],
	leftW: number, rightW: number,
	divider: string,
): string[] {
	const max = Math.max(left.length, right.length);
	const result: string[] = [];
	for (let i = 0; i < max; i++) {
		const l = i < left.length ? padRight(left[i], leftW) : " ".repeat(leftW);
		const r = i < right.length ? truncateToWidth(right[i], rightW, "") : "";
		result.push(l + divider + r);
	}
	return result;
}

// ── QuestionUI ─────────────────────────────────────────────────────────

class QuestionUI {
	private selectedIndex = 0;
	private contentScrollOffset = 0;

	constructor(
		private question: string,
		private options: OptionDef[],
		private onSelect: (label: string) => void,
		private onCancel: () => void,
	) {}

	handleInput(data: string, tui: any): void {
		if (matchesKey(data, Key.up)) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else if (matchesKey(data, Key.down)) {
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
		} else if (matchesKey(data, Key.enter)) {
			this.onSelect(this.options[this.selectedIndex].label);
			return;
		} else if (matchesKey(data, Key.escape)) {
			this.onCancel();
			return;
		}
		tui.requestRender();
	}

	render(width: number, height: number, theme: any): string[] {
		const container = new Container();
		const mdTheme = getPiMdTheme();

		// Panel is 90% of terminal width, centered
		const panelW = Math.min(width, Math.max(40, Math.floor(width * 0.9)));

		// Header
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(
			`${theme.fg("accent", theme.bold(" ASK USER"))} ${theme.fg("dim", "|")} ${theme.fg("success", this.question)}`,
			1, 0,
		));
		container.addChild(new Spacer(1));

		// Split panel dimensions
		const innerWidth = panelW - 2;
		const leftW = Math.max(20, Math.floor(innerWidth * 0.3));
		const rightW = innerWidth - leftW - 3; // 3 for " │ "

		// Chrome lines: 2 borders + header + 2 spacers + footer = 6
		const chromeLines = 6;
		const minPadding = 2;
		const maxContentLines = Math.max(1, height - chromeLines - minPadding);

		// Left panel: option labels (word-wrapped), tracking line offsets
		const leftLines: string[] = [];
		const optionLineOffsets: number[] = [];
		const labelW = leftW - 3; // 3 for indicator prefix
		for (let i = 0; i < this.options.length; i++) {
			optionLineOffsets.push(leftLines.length);
			const selected = i === this.selectedIndex;
			const indicator = selected ? theme.fg("accent", " ▸ ") : "   ";
			const wrapped = wordWrap(this.options[i].label, labelW);
			for (let j = 0; j < wrapped.length; j++) {
				const prefix = j === 0 ? indicator : "   ";
				const text = selected
					? theme.bold(theme.fg("accent", wrapped[j]))
					: theme.fg("dim", wrapped[j]);
				leftLines.push(prefix + text);
			}
		}

		// Right panel: markdown preview of highlighted option
		const opt = this.options[this.selectedIndex];
		const mdContent = opt.markdown || opt.label;
		const rightContainer = new Container();
		rightContainer.addChild(new Markdown(mdContent, 1, 0, mdTheme));
		const rightLines = rightContainer.render(rightW);

		// Combine side by side
		const divider = theme.fg("dim", " │ ");
		const combined = sideBySide(leftLines, rightLines, leftW, rightW, divider);

		// Clamp content to available height with auto-scroll
		let visibleCombined: string[];
		let scrollInfo = "";
		if (combined.length > maxContentLines) {
			const selectedStart = optionLineOffsets[this.selectedIndex] ?? 0;
			if (selectedStart < this.contentScrollOffset) {
				this.contentScrollOffset = selectedStart;
			} else if (selectedStart >= this.contentScrollOffset + maxContentLines) {
				this.contentScrollOffset = selectedStart - maxContentLines + 1;
			}
			this.contentScrollOffset = Math.max(0, Math.min(
				this.contentScrollOffset,
				combined.length - maxContentLines,
			));
			visibleCombined = combined.slice(
				this.contentScrollOffset,
				this.contentScrollOffset + maxContentLines,
			);
			const end = this.contentScrollOffset + visibleCombined.length;
			scrollInfo = ` (${this.contentScrollOffset + 1}-${end}/${combined.length})`;
		} else {
			this.contentScrollOffset = 0;
			visibleCombined = combined;
		}

		for (const line of visibleCombined) {
			container.addChild(new Text(line, 1, 0));
		}

		// Footer
		container.addChild(new Spacer(1));
		container.addChild(new Text(
			theme.fg("dim", ` ↑/↓ Navigate • Enter Select • Esc Cancel${scrollInfo}`),
			1, 0,
		));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		const panelLines = container.render(panelW);

		return renderPanelBackdrop(panelLines, panelW, width, height);
	}
}

// ── ConfirmUI ─────────────────────────────────────────────────────────

class ConfirmUI {
	private selectedIndex = 0; // 0 = Yes, 1 = No
	private scrollOffset = 0;

	constructor(
		private question: string,
		private detail: string,
		private onConfirm: (yes: boolean) => void,
		private onCancel: () => void,
	) {}

	handleInput(data: string, tui: any): void {
		if (matchesKey(data, Key.left)) {
			this.selectedIndex = 0;
		} else if (matchesKey(data, Key.right)) {
			this.selectedIndex = 1;
		} else if (matchesKey(data, Key.up)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
		} else if (matchesKey(data, Key.down)) {
			this.scrollOffset += 1; // clamped during render
		} else if (matchesKey(data, Key.enter)) {
			this.onConfirm(this.selectedIndex === 0);
			return;
		} else if (matchesKey(data, Key.escape)) {
			this.onCancel();
			return;
		}
		tui.requestRender();
	}

	render(width: number, height: number, theme: any): string[] {
		const mdTheme = getPiMdTheme();

		// Compact panel: 60% width, capped at 80 cols, min 40
		const panelW = Math.min(width, Math.max(40, Math.min(80, Math.floor(width * 0.6))));

		// Chrome budget: top border + header + spacer + spacer + buttons + spacer + help + bottom border = 8
		// With detail present, add 1 more spacer after detail body
		const chromeLines = this.detail ? 9 : 8;
		const minPadding = 2;
		const maxBodyLines = Math.max(1, height - chromeLines - minPadding);

		// Pre-render detail markdown to measure and clamp it
		let bodyLines: string[] = [];
		if (this.detail) {
			const bodyContainer = new Container();
			bodyContainer.addChild(new Markdown(this.detail, 1, 0, mdTheme));
			bodyLines = bodyContainer.render(panelW);
		}

		// Scroll support for long detail content
		let visibleBody: string[];
		let scrollInfo = "";
		if (bodyLines.length > maxBodyLines) {
			this.scrollOffset = Math.max(0, Math.min(
				this.scrollOffset,
				bodyLines.length - maxBodyLines,
			));
			visibleBody = bodyLines.slice(
				this.scrollOffset,
				this.scrollOffset + maxBodyLines,
			);
			const end = this.scrollOffset + visibleBody.length;
			scrollInfo = ` (${this.scrollOffset + 1}-${end}/${bodyLines.length})`;
		} else {
			this.scrollOffset = 0;
			visibleBody = bodyLines;
		}

		// Assemble final panel with clamped content
		const container = new Container();

		// Header
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(
			`${theme.fg("accent", theme.bold(" CONFIRM"))} ${theme.fg("dim", "|")} ${theme.fg("success", this.question)}`,
			1, 0,
		));
		container.addChild(new Spacer(1));

		// Body: height-clamped, scrollable detail text
		if (this.detail) {
			for (const line of visibleBody) {
				container.addChild(new Text(line, 0, 0));
			}
			container.addChild(new Spacer(1));
		}

		// Centered Yes / No buttons
		const labels = ["Yes", "No"];
		const optParts = labels.map((label, i) => {
			const selected = i === this.selectedIndex;
			const indicator = selected ? theme.fg("accent", "▸ ") : "  ";
			const text = selected
				? theme.bold(theme.fg("accent", label))
				: theme.fg("dim", label);
			return indicator + text;
		});
		const btnRow = "  " + optParts.join("      ") + "  ";
		container.addChild(new Text(btnRow, 1, 0));

		// Footer help
		container.addChild(new Spacer(1));
		const scrollHint = bodyLines.length > maxBodyLines ? "↑/↓ Scroll • " : "";
		container.addChild(new Text(
			theme.fg("dim", ` ${scrollHint}←/→ Toggle • Enter Confirm • Esc Cancel${scrollInfo}`),
			1, 0,
		));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		const panelLines = container.render(panelW);

		return renderPanelBackdrop(panelLines, panelW, width, height);
	}
}

// ── Tool Parameters ────────────────────────────────────────────────────

const AskUserParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	mode: StringEnum(["select", "input", "confirm"] as const),
	options: Type.Optional(Type.Array(Type.Object({
		label: Type.String({ description: "Option label shown in the list" }),
		markdown: Type.Optional(Type.String({ description: "Markdown preview shown when this option is highlighted" })),
	}), { description: "Options for select mode (required)" })),
	placeholder: Type.Optional(Type.String({ description: "Placeholder text for input mode" })),
	detail: Type.Optional(Type.String({ description: "Detail text for confirm mode" })),
});

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user a question with rich interactive UI. " +
			"Three modes: 'select' shows a split-panel overlay with options on the left and a live markdown preview on the right — " +
			"use markdown to describe layouts, wireframes, or design elements for each option. " +
			"'input' prompts for free-text entry. 'confirm' asks a yes/no question. " +
			"For select mode, provide options[] with label and optional markdown for each.",
		parameters: AskUserParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { question, mode, options, placeholder, detail } = params;

			if (mode === "select") {
				if (!options || options.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: options[] required for select mode" }],
					};
				}

				const result = await ctx.ui.custom((tui, theme, _kb, done) => {
					const ui = new QuestionUI(
						question,
						options,
						(label) => done(label),
						() => done(undefined),
					);
					return {
						render: (w) => ui.render(w, process.stdout.rows || 24, theme),
						handleInput: (data) => ui.handleInput(data, tui),
						invalidate: () => {},
					};
				});

				if (result == null) {
					return {
						content: [{ type: "text" as const, text: "[User cancelled]" }],
						details: buildAskUserDetails({ mode, question, cancelled: true }),
					};
				}
				const opt = options.find((o) => o.label === result);
				return {
					content: [{ type: "text" as const, text: `User selected: ${result}` }],
					details: buildAskUserDetails({
						mode, question, answer: result,
						selectedMarkdown: opt?.markdown,
					}),
				};
			}

			if (mode === "input") {
				const answer = await ctx.ui.input(question, placeholder || "");
				if (!answer) {
					return {
						content: [{ type: "text" as const, text: "[User cancelled]" }],
						details: buildAskUserDetails({ mode, question, cancelled: true }),
					};
				}
				return {
					content: [{ type: "text" as const, text: `User answered: ${answer}` }],
					details: buildAskUserDetails({ mode, question, answer }),
				};
			}

			if (mode === "confirm") {
				const confirmed = await ctx.ui.custom((tui, theme, _kb, done) => {
					const ui = new ConfirmUI(
						question,
						detail || "",
						(yes) => done(yes),
						() => done(false),
					);
					return {
						render: (w) => ui.render(w, process.stdout.rows || 24, theme),
						handleInput: (data) => ui.handleInput(data, tui),
						invalidate: () => {},
					};
				});
				return {
					content: [{ type: "text" as const, text: confirmed ? "User confirmed: Yes" : "User declined: No" }],
					details: buildAskUserDetails({ mode, question, answer: confirmed ? "Yes" : "No" }),
				};
			}

			return {
				content: [{ type: "text" as const, text: `Error: unknown mode '${mode}'` }],
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("ask_user "));
			text += theme.fg("muted", args.mode || "");
			text += theme.fg("dim", `  "${args.question}"`);
			if (args.mode === "select" && args.options?.length) {
				text += theme.fg("dim", `  ${args.options.length} options`);
			}
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as AskUserDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.cancelled) {
				return new Text(outputLine(theme, "dim", "[Cancelled]"), 0, 0);
			}

			if (details.mode === "confirm") {
				const color = details.answer === "Yes" ? "success" : "warning";
				const bar = details.answer === "Yes" ? "success" : "warning";
				const label = details.answer === "Yes" ? "Confirmed" : "Declined";
				return new Text(outputLine(theme, bar, label), 0, 0);
			}

			// select or input
			const summary = details.mode === "select"
				? `Selected: ${details.answer}`
				: `Answer: ${details.answer}`;

			if (expanded && details.selectedMarkdown) {
				// Show summary + markdown preview as plain text lines
				const preview = details.selectedMarkdown
					.split("\n")
					.slice(0, 8)
					.map((l) => theme.fg("muted", "  " + l))
					.join("\n");
				return new Text(
					outputLine(theme, "accent", summary) + "\n" + preview,
					0, 0,
				);
			}

			return new Text(outputLine(theme, "accent", summary), 0, 0);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
