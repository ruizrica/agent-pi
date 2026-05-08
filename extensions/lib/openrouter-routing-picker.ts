// ABOUTME: Interactive fuzzy model picker and ranking helpers for the OpenRouter routing extension.
// ABOUTME: Provides a lightweight TUI overlay for selecting models to preview or enrich.

import { visibleWidth, fuzzyFilter, matchesKey, decodeKittyPrintable } from "@earendil-works/pi-tui";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import type { OpenRouterModel } from "./openrouter-routing-types.ts";

const VIEWPORT_ROWS = 10;
const SUMMARY_ROWS = 2;

function sanitizeText(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function searchableText(model: OpenRouterModel): string {
	const id = model.id;
	const provider = id.split("/")[0] || "openrouter";
	const tokenizedId = id.replace(/[/:_.-]+/g, " ");
	const name = model.name || "";
	return `${id} ${provider} ${provider}/${id} ${provider} ${id} ${tokenizedId} ${name}`;
}

function sortModels(models: OpenRouterModel[]): OpenRouterModel[] {
	return [...models].sort((a, b) => a.id.localeCompare(b.id));
}

function queryTokens(query: string): string[] {
	return sanitizeText(query).toLowerCase().split(/\s+/).filter(Boolean);
}

function containsAllTokens(text: string, tokens: string[]): boolean {
	const lower = sanitizeText(text).toLowerCase();
	return tokens.every((token) => lower.includes(token));
}

export function rankModelsForQuery(models: OpenRouterModel[], query: string): OpenRouterModel[] {
	const trimmed = sanitizeText(query);
	if (!trimmed) return sortModels(models);

	const tokens = queryTokens(trimmed);
	const sorted = sortModels(models);
	const exactId = sorted.filter((m) => containsAllTokens(m.id, tokens));
	const exactName = sorted.filter((m) => !exactId.includes(m) && containsAllTokens(m.name || "", tokens));
	const exactTokenizedId = sorted.filter((m) => !exactId.includes(m) && !exactName.includes(m) && containsAllTokens(m.id.replace(/[/:_.-]+/g, " "), tokens));
	const remaining = sorted.filter((m) => !exactId.includes(m) && !exactName.includes(m) && !exactTokenizedId.includes(m));
	const fuzzy = fuzzyFilter(remaining, trimmed, searchableText);
	return [...exactId, ...exactName, ...exactTokenizedId, ...fuzzy];
}

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b_[^\x07]*\x07/g, "");
}

function pad(text: string, len: number): string {
	return text + " ".repeat(Math.max(0, len - visibleWidth(stripAnsi(text))));
}

function truncateVisible(text: string, width: number): string {
	if (width <= 0) return "";
	const normalized = sanitizeText(text);
	const plain = stripAnsi(normalized);
	if (visibleWidth(plain) <= width) return normalized;
	const target = Math.max(1, width - 1);
	let out = "";
	for (const ch of plain) {
		if (visibleWidth(out + ch) > target) break;
		out += ch;
	}
	return out + "…";
}

function row(theme: any, width: number, content = ""): string {
	const inner = Math.max(1, width - 2);
	const clipped = truncateVisible(content, inner);
	return `${theme.fg("border", "│")}${pad(clipped, inner)}${theme.fg("border", "│")}`;
}

function header(theme: any, width: number, text: string): string {
	const inner = Math.max(1, width - 2);
	const clipped = truncateVisible(text, inner);
	const padLen = Math.max(0, inner - visibleWidth(stripAnsi(clipped)));
	const left = Math.floor(padLen / 2);
	const right = padLen - left;
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", clipped) + theme.fg("border", "─".repeat(right) + "╮");
}

function footer(theme: any, width: number, text: string): string {
	const inner = Math.max(1, width - 2);
	const clipped = truncateVisible(text, inner);
	const padLen = Math.max(0, inner - visibleWidth(stripAnsi(clipped)));
	const left = Math.floor(padLen / 2);
	const right = padLen - left;
	return theme.fg("border", "╰" + "─".repeat(left)) + theme.fg("dim", clipped) + theme.fg("border", "─".repeat(right) + "╯");
}

function wrapSummary(text: string, maxWidth: number, lines: number): string[] {
	const result: string[] = [];
	let remaining = sanitizeText(text);
	for (let i = 0; i < lines; i++) {
		if (!remaining) {
			result.push("");
			continue;
		}
		if (visibleWidth(remaining) <= maxWidth) {
			result.push(remaining);
			remaining = "";
			continue;
		}
		if (i === lines - 1) {
			result.push(truncateVisible(remaining, maxWidth));
			remaining = "";
			continue;
		}
		let cut = Math.min(remaining.length, maxWidth);
		const slice = remaining.slice(0, cut);
		const lastSpace = slice.lastIndexOf(" ");
		if (lastSpace > Math.floor(maxWidth / 3)) cut = lastSpace;
		result.push(remaining.slice(0, cut).trimEnd());
		remaining = remaining.slice(cut).trimStart();
	}
	return result;
}

function printableInput(data: string): string | undefined {
	const kitty = decodeKittyPrintable(data);
	if (kitty !== undefined) return kitty;
	if (data.length === 1) {
		const code = data.charCodeAt(0);
		if (code >= 32 && code !== 127) return data;
	}
	return undefined;
}

export class ModelPickerComponent implements Component, Focusable {
	focused = false;
	private readonly tui: any;
	private readonly theme: any;
	private readonly done: (result: string | null) => void;
	private readonly title: string;
	private readonly allModels: OpenRouterModel[];
	private filteredModels: OpenRouterModel[];
	private query = "";
	private selectedIndex = 0;

	constructor(tui: any, theme: any, _keybindings: any, done: (result: string | null) => void, models: OpenRouterModel[], title: string) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.title = title;
		this.allModels = sortModels(models);
		this.filteredModels = this.allModels;
		this.tui?.setShowHardwareCursor?.(false);
		this.tui?.setClearOnShrink?.(true);
		this.tui?.invalidate?.();
		this.tui?.requestRender?.(true);
	}

	private updateFilter(): void {
		this.filteredModels = rankModelsForQuery(this.allModels, this.query);
		this.selectedIndex = this.filteredModels.length === 0 ? 0 : Math.min(this.selectedIndex, this.filteredModels.length - 1);
	}

	private move(delta: number): void {
		if (this.filteredModels.length === 0) return;
		const len = this.filteredModels.length;
		this.selectedIndex = (this.selectedIndex + delta + len) % len;
	}

	private confirm(): void {
		const selected = this.filteredModels[this.selectedIndex];
		if (selected) this.done(selected.id);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done(null);
			return;
		}
		if (matchesKey(data, "return") || matchesKey(data, "enter")) {
			this.confirm();
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "ctrl+p")) {
			this.move(-1);
			this.tui.invalidate?.();
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) {
			this.move(1);
			this.tui.invalidate?.();
			return;
		}
		if (matchesKey(data, "backspace")) {
			this.query = this.query.slice(0, -1);
			this.updateFilter();
			this.tui.invalidate?.();
			return;
		}
		const printable = printableInput(data);
		if (printable) {
			this.query += printable;
			this.updateFilter();
			this.tui.invalidate?.();
		}
	}

	render(width: number): string[] {
		const innerWidth = Math.max(24, width);
		const selected = this.filteredModels[this.selectedIndex];
		const summaryText = selected?.description || selected?.name || selected?.id || "No results";
		const lines = [header(this.theme, innerWidth, this.title), row(this.theme, innerWidth, `Search: ${this.query || ""}`)];
		const start = Math.max(0, this.selectedIndex - Math.floor(VIEWPORT_ROWS / 2));
		const visible = this.filteredModels.slice(start, start + VIEWPORT_ROWS);
		for (const model of visible) {
			const isSelected = model === selected;
			const prefix = isSelected ? this.theme.fg("accent", "› ") : "  ";
			lines.push(row(this.theme, innerWidth, `${prefix}${model.id}`));
		}
		while (lines.length < 2 + VIEWPORT_ROWS) lines.push(row(this.theme, innerWidth, ""));
		for (const summaryLine of wrapSummary(summaryText, Math.max(1, innerWidth - 2), SUMMARY_ROWS)) {
			lines.push(row(this.theme, innerWidth, summaryLine));
		}
		lines.push(footer(this.theme, innerWidth, `${this.filteredModels.length} models • Enter select • Esc cancel`));
		return lines;
	}
}

export function createModelPicker(tui: any, theme: any, keybindings: any, done: (result: string | null) => void, models: OpenRouterModel[], title: string) {
	return new ModelPickerComponent(tui, theme, keybindings, done, models, title);
}
