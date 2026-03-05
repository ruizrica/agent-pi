// ABOUTME: Rendering helpers for the Plan Viewer overlay.
// ABOUTME: Rendered markdown view, cursor highlighting, raw view, questions mode, footer keybind bar.

import { Container, Spacer, Markdown, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@mariozechner/pi-coding-agent";
import type { PlanDocument, PlanItem, AnswerMap } from "./plan-viewer-editor.ts";
import { isQuestionItem, extractDefault } from "./plan-viewer-editor.ts";

// ── Types ────────────────────────────────────────────────────────────

export type ViewMode = "rendered" | "raw" | "reorder";

/** The purpose of the viewer — affects footer actions and title badge. */
export type ViewerPurpose = "plan" | "questions";

// ── ANSI helpers ─────────────────────────────────────────────────────

const DIM_BG = "\x1b[48;2;10;10;15m";
const CURSOR_BG = "\x1b[48;2;30;40;65m";
const REORDER_BG = "\x1b[48;2;50;35;15m";
const ANSWER_BG = "\x1b[48;2;20;35;20m";
const ANSWERED_BG = "\x1b[48;2;15;30;15m";
const RESET = "\x1b[0m";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function padRight(s: string, width: number): string {
	const vis = visibleWidth(s);
	if (vis >= width) return truncateToWidth(s, width, "");
	return s + " ".repeat(width - vis);
}

// ── Rendered Markdown View ───────────────────────────────────────────

/**
 * Render the plan as formatted markdown using Pi's Markdown component.
 * Returns an array of ANSI-colored strings, one per line.
 */
export function renderMarkdownView(
	doc: PlanDocument,
	contentWidth: number,
	cursorItemIdx: number,
	mode: ViewMode,
	theme: any,
): string[] {
	const mdTheme = getPiMdTheme();
	const container = new Container();

	// Title bar
	container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
	container.addChild(new Spacer(1));

	// Render the markdown as a single block
	const markdownStr = doc.items.map((item) => item.raw).join("\n");
	const md = new Markdown(markdownStr, 1, 0, mdTheme);
	container.addChild(md);
	container.addChild(new Spacer(1));

	const allLines = container.render(contentWidth);

	// For rendered view, we can't easily map lines back to items for cursor
	// So we return the rendered lines as-is — cursor is handled differently
	return allLines;
}

// ── Interactive List View (with cursor) ──────────────────────────────

/**
 * Render plan items as an interactive list with cursor selection.
 * Each item gets its own line with proper formatting and cursor highlight.
 * In questions mode, answer fields are shown beneath question items.
 */
export function renderInteractiveView(
	doc: PlanDocument,
	contentWidth: number,
	cursorIdx: number,
	mode: ViewMode,
	theme: any,
	purpose: ViewerPurpose = "plan",
	answers?: AnswerMap,
): string[] {
	const lines: string[] = [];

	for (let i = 0; i < doc.items.length; i++) {
		const item = doc.items[i];
		const isCursor = i === cursorIdx;
		const bg = isCursor ? (mode === "reorder" ? REORDER_BG : CURSOR_BG) : "";

		const formatted = formatItem(item, theme, isCursor);
		const padded = padRight(formatted, contentWidth);
		
		if (bg) {
			lines.push(bg + padded + RESET);
		} else {
			lines.push(padded);
		}

		// In questions mode, show answer field beneath question items
		if (purpose === "questions" && answers && isQuestionItem(item)) {
			const answer = answers.get(item.id) ?? "";
			const defaultVal = extractDefault(item.text);
			const answerLine = renderAnswerField(answer, defaultVal, contentWidth, isCursor, theme);
			lines.push(answerLine);
		}
	}

	return lines;
}

function formatItem(item: PlanItem, theme: any, isCursor: boolean): string {
	const indent = " ".repeat(item.indent);

	switch (item.kind) {
		case "heading": {
			const prefix = isCursor ? "› " : "  ";
			const hashes = "#".repeat(item.level);
			return `${prefix}${theme.fg("accent", theme.bold(`${hashes} ${item.text}`))}`;
		}
		case "checkbox": {
			const cursor = isCursor ? "› " : "  ";
			const box = item.checked
				? theme.fg("success", "[✓]")
				: theme.fg("dim", "[ ]");
			const text = item.checked
				? theme.fg("dim", item.text)
				: theme.fg("muted", item.text);
			return `${cursor}${indent}${box} ${text}`;
		}
		case "numbered": {
			const cursor = isCursor ? "› " : "  ";
			const num = theme.fg("accent", `${item.number}.`);
			return `${cursor}${indent}${num} ${theme.fg("muted", item.text)}`;
		}
		case "bullet": {
			const cursor = isCursor ? "› " : "  ";
			const bullet = theme.fg("accent", "•");
			return `${cursor}${indent}${bullet} ${theme.fg("muted", item.text)}`;
		}
		case "text": {
			if (item.text.trim() === "") return "";
			const cursor = isCursor ? "› " : "  ";
			return `${cursor}${theme.fg("muted", item.text)}`;
		}
	}
}

// ── Answer Field Rendering ───────────────────────────────────────────

function renderAnswerField(
	answer: string,
	defaultVal: string | null,
	width: number,
	isCursorOnQuestion: boolean,
	theme: any,
): string {
	const bg = answer.trim().length > 0 ? ANSWERED_BG : ANSWER_BG;
	const prefix = "     ";  // indent to align under question text

	if (answer.trim().length > 0) {
		// Answered — show the answer
		const label = theme.fg("success", "→ ");
		const text = theme.fg("success", answer);
		const line = `${prefix}${label}${text}`;
		return bg + padRight(line, width) + RESET;
	}

	if (defaultVal) {
		// Unanswered but has default — show placeholder
		const label = isCursorOnQuestion
			? theme.fg("dim", "→ ") + theme.fg("dim", `(${defaultVal}) `) + theme.fg("accent", "Enter to answer")
			: theme.fg("dim", "→ ") + theme.fg("dim", `(default: ${defaultVal})`);
		const line = `${prefix}${label}`;
		return bg + padRight(line, width) + RESET;
	}

	// Unanswered, no default
	const label = isCursorOnQuestion
		? theme.fg("dim", "→ ") + theme.fg("accent", "Enter to answer")
		: theme.fg("dim", "→ ") + theme.fg("dim", "(no answer yet)");
	const line = `${prefix}${label}`;
	return bg + padRight(line, width) + RESET;
}

// ── Raw Markdown View ────────────────────────────────────────────────

/**
 * Render raw markdown with line numbers and cursor highlight.
 */
export function renderRawView(
	doc: PlanDocument,
	contentWidth: number,
	cursorIdx: number,
	theme: any,
): string[] {
	const lines: string[] = [];
	const gutterW = String(doc.items.length).length + 1;

	for (let i = 0; i < doc.items.length; i++) {
		const item = doc.items[i];
		const isCursor = i === cursorIdx;
		const bg = isCursor ? CURSOR_BG : "";

		const lineNum = theme.fg("dim", String(i + 1).padStart(gutterW));
		const sep = theme.fg("dim", " │ ");
		const text = theme.fg("muted", item.raw);

		const line = `${lineNum}${sep}${text}`;
		const padded = padRight(line, contentWidth);

		if (bg) {
			lines.push(bg + padded + RESET);
		} else {
			lines.push(padded);
		}
	}

	return lines;
}

// ── Footer Bar ───────────────────────────────────────────────────────

export interface FooterAction {
	key: string;
	label: string;
}

export function getFooterActions(
	mode: ViewMode,
	cursorItem: PlanItem | null,
	purpose: ViewerPurpose = "plan",
	isAnswering: boolean = false,
): FooterAction[] {
	const actions: FooterAction[] = [];

	// Answering a question — minimal footer
	if (isAnswering) {
		actions.push(
			{ key: "Enter", label: "Submit" },
			{ key: "Esc", label: "Cancel" },
		);
		return actions;
	}

	if (mode === "reorder") {
		actions.push(
			{ key: "↑/↓", label: "Move" },
			{ key: "Enter", label: "Done" },
			{ key: "Esc", label: "Cancel" },
		);
		return actions;
	}

	// Questions mode — different actions
	if (purpose === "questions") {
		const isQuestion = cursorItem ? isQuestionItem(cursorItem) : false;
		if (isQuestion) {
			actions.push({ key: "Enter", label: "Answer" });
		}
		actions.push(
			{ key: "↑/↓", label: "Navigate" },
			{ key: "m", label: mode === "rendered" ? "Raw" : "Rendered" },
			{ key: "c", label: "Copy" },
		);
		actions.push(
			{ key: "Ctrl+Enter", label: "Submit All" },
			{ key: "Esc", label: "Close" },
		);
		return actions;
	}

	// Plan mode — full actions
	if (cursorItem?.kind === "checkbox") {
		actions.push({ key: "Space", label: "Toggle" });
	}
	actions.push(
		{ key: "e", label: "Edit" },
		{ key: "a", label: "Add" },
	);
	if (cursorItem && cursorItem.kind !== "text") {
		actions.push({ key: "r", label: "Reorder" });
	}
	actions.push(
		{ key: "d", label: "Delete" },
		{ key: "m", label: mode === "rendered" ? "Raw" : "Rendered" },
		{ key: "s", label: "Save" },
		{ key: "c", label: "Copy" },
		{ key: "Enter", label: "Approve" },
		{ key: "Esc", label: "Close" },
	);

	return actions;
}

/**
 * Render the footer bar with keybind hints.
 */
export function renderFooter(actions: FooterAction[], width: number, theme: any): string {
	const parts = actions.map((a) =>
		theme.fg("accent", `[${a.key}]`) + " " + theme.fg("dim", a.label)
	);
	const joined = parts.join("  ");
	return truncateToWidth(joined, width, "");
}

// ── Scroll Info ──────────────────────────────────────────────────────

export function renderScrollInfo(
	scrollOffset: number,
	visibleLines: number,
	totalLines: number,
	theme: any,
): string {
	if (totalLines <= visibleLines) return "";
	const from = scrollOffset + 1;
	const to = Math.min(scrollOffset + visibleLines, totalLines);
	return theme.fg("dim", ` ${from}-${to}/${totalLines}`);
}

// ── Title Bar ────────────────────────────────────────────────────────

export function renderTitleBar(
	title: string,
	mode: ViewMode,
	modified: boolean,
	width: number,
	theme: any,
	purpose: ViewerPurpose = "plan",
	answeredCount?: number,
	totalQuestions?: number,
): string {
	const purposeLabel = purpose === "questions"
		? theme.fg("accent", " QUESTIONS ")
		: mode === "reorder"
			? theme.fg("warning", " REORDER ")
			: mode === "raw"
				? theme.fg("dim", " RAW ")
				: theme.fg("accent", " PLAN ");
	
	const modifiedLabel = modified ? theme.fg("warning", " [modified]") : "";
	const titleText = theme.fg("accent", theme.bold(` ${title} `));
	
	// Progress indicator for questions mode
	const progressLabel = (purpose === "questions" && answeredCount !== undefined && totalQuestions !== undefined)
		? theme.fg("dim", ` (${answeredCount}/${totalQuestions} answered)`)
		: "";

	const line = `${theme.fg("borderMuted", "─── ")}${purposeLabel}${theme.fg("borderMuted", " ─ ")}${titleText}${modifiedLabel}${progressLabel}`;
	return truncateToWidth(padRight(line, width), width, "");
}
