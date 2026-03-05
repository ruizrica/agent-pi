// ABOUTME: Pure logic for parsing, editing, and serializing markdown plan documents.
// ABOUTME: Supports sections, checkbox items, questions with answers, reorder, inline edit, add — no UI dependencies.

// ── Types ────────────────────────────────────────────────────────────

export type ItemKind = "checkbox" | "bullet" | "text" | "heading" | "numbered";

export interface PlanItem {
	id: number;
	kind: ItemKind;
	/** Heading level (1-6) for heading items, 0 for others */
	level: number;
	/** The raw markdown line */
	raw: string;
	/** Display text (without markdown prefix like `- [ ]`, `## `, etc.) */
	text: string;
	/** Whether checkbox is checked (only meaningful for checkbox items) */
	checked: boolean;
	/** Indentation level (number of leading spaces) */
	indent: number;
	/** Numbered list index (e.g. 1, 2, 3) for numbered items, 0 for others */
	number: number;
}

export interface PlanDocument {
	items: PlanItem[];
	nextId: number;
}

// ── Question / Answer tracking ───────────────────────────────────────

/** Tracks user answers to question items, keyed by item ID. */
export type AnswerMap = Map<number, string>;

/** Detect whether an item looks like a question (ends with ? or contains _Default:_). */
export function isQuestionItem(item: PlanItem): boolean {
	if (item.kind === "text" && item.text.trim() === "") return false;
	const t = item.text.trim();
	return t.endsWith("?") || /\b_?Default:?\s/i.test(t);
}

/** Get all question item IDs from a document. */
export function getQuestionIds(doc: PlanDocument): number[] {
	return doc.items.filter(isQuestionItem).map((i) => i.id);
}

/** Extract a default value from a question string, e.g. "_Default: React_" → "React". */
export function extractDefault(text: string): string | null {
	const m = text.match(/_?Default:\s*([^_]+)_?/i);
	return m ? m[1].trim() : null;
}

/**
 * Build a formatted summary of questions and answers for returning to the agent.
 * Example:
 *   1. What framework? → React
 *   2. Auth provider? → (default: OAuth)
 */
export function formatAnswers(doc: PlanDocument, answers: AnswerMap): string {
	const lines: string[] = [];
	for (const item of doc.items) {
		if (!isQuestionItem(item)) continue;
		const answer = answers.get(item.id);
		const defaultVal = extractDefault(item.text);
		if (answer && answer.trim().length > 0) {
			lines.push(`${item.text.trim()} → ${answer.trim()}`);
		} else if (defaultVal) {
			lines.push(`${item.text.trim()} → (default: ${defaultVal})`);
		} else {
			lines.push(`${item.text.trim()} → (no answer)`);
		}
	}
	return lines.join("\n");
}

/** Check if all questions have been answered (or have defaults). */
export function allQuestionsAnswered(doc: PlanDocument, answers: AnswerMap): boolean {
	for (const item of doc.items) {
		if (!isQuestionItem(item)) continue;
		const answer = answers.get(item.id);
		const hasAnswer = answer && answer.trim().length > 0;
		const hasDefault = extractDefault(item.text) !== null;
		if (!hasAnswer && !hasDefault) return false;
	}
	return true;
}

// ── Parsing ──────────────────────────────────────────────────────────

const CHECKBOX_RE = /^(\s*)- \[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const NUMBERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

function parseLine(raw: string, id: number): PlanItem {
	// Checkbox: `- [ ] text` or `- [x] text`
	const cbMatch = raw.match(CHECKBOX_RE);
	if (cbMatch) {
		return {
			id,
			kind: "checkbox",
			level: 0,
			raw,
			text: cbMatch[3],
			checked: cbMatch[2].toLowerCase() === "x",
			indent: cbMatch[1].length,
			number: 0,
		};
	}

	// Heading: `## text`
	const headingMatch = raw.match(HEADING_RE);
	if (headingMatch) {
		return {
			id,
			kind: "heading",
			level: headingMatch[1].length,
			raw,
			text: headingMatch[2],
			checked: false,
			indent: 0,
			number: 0,
		};
	}

	// Numbered: `1. text` or `1) text`
	const numberedMatch = raw.match(NUMBERED_RE);
	if (numberedMatch) {
		return {
			id,
			kind: "numbered",
			level: 0,
			raw,
			text: numberedMatch[3],
			checked: false,
			indent: numberedMatch[1].length,
			number: parseInt(numberedMatch[2], 10),
		};
	}

	// Bullet: `- text` or `* text`
	const bulletMatch = raw.match(BULLET_RE);
	if (bulletMatch) {
		return {
			id,
			kind: "bullet",
			level: 0,
			raw,
			text: bulletMatch[2],
			checked: false,
			indent: bulletMatch[1].length,
			number: 0,
		};
	}

	// Plain text line
	return {
		id,
		kind: "text",
		level: 0,
		raw,
		text: raw,
		checked: false,
		indent: 0,
		number: 0,
	};
}

/** Parse a markdown string into a PlanDocument with individually-addressable items. */
export function parseMarkdown(markdown: string): PlanDocument {
	const lines = markdown.split("\n");
	const items: PlanItem[] = [];
	let nextId = 1;

	for (const line of lines) {
		items.push(parseLine(line, nextId++));
	}

	return { items, nextId };
}

// ── Serialization ────────────────────────────────────────────────────

function itemToMarkdown(item: PlanItem): string {
	switch (item.kind) {
		case "checkbox": {
			const prefix = " ".repeat(item.indent);
			const check = item.checked ? "x" : " ";
			return `${prefix}- [${check}] ${item.text}`;
		}
		case "heading":
			return `${"#".repeat(item.level)} ${item.text}`;
		case "numbered": {
			const prefix = " ".repeat(item.indent);
			return `${prefix}${item.number}. ${item.text}`;
		}
		case "bullet": {
			const prefix = " ".repeat(item.indent);
			return `${prefix}- ${item.text}`;
		}
		case "text":
			return item.text;
	}
}

/** Serialize a PlanDocument back to a markdown string. */
export function serializeMarkdown(doc: PlanDocument): string {
	return doc.items.map(itemToMarkdown).join("\n");
}

// ── Editing Operations ───────────────────────────────────────────────

/** Toggle a checkbox item's checked state. Returns new doc (immutable). */
export function toggleCheckbox(doc: PlanDocument, itemId: number): PlanDocument {
	const items = doc.items.map((item) => {
		if (item.id !== itemId || item.kind !== "checkbox") return item;
		const checked = !item.checked;
		return {
			...item,
			checked,
			raw: itemToMarkdown({ ...item, checked }),
		};
	});
	return { ...doc, items };
}

/** Update the text content of an item. Returns new doc (immutable). */
export function editItemText(doc: PlanDocument, itemId: number, newText: string): PlanDocument {
	const items = doc.items.map((item) => {
		if (item.id !== itemId) return item;
		const updated = { ...item, text: newText };
		return { ...updated, raw: itemToMarkdown(updated) };
	});
	return { ...doc, items };
}

/** Move an item up by one position. Returns new doc (immutable). */
export function moveItemUp(doc: PlanDocument, itemId: number): PlanDocument {
	const idx = doc.items.findIndex((i) => i.id === itemId);
	if (idx <= 0) return doc;
	const items = [...doc.items];
	[items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
	return { ...doc, items };
}

/** Move an item down by one position. Returns new doc (immutable). */
export function moveItemDown(doc: PlanDocument, itemId: number): PlanDocument {
	const idx = doc.items.findIndex((i) => i.id === itemId);
	if (idx < 0 || idx >= doc.items.length - 1) return doc;
	const items = [...doc.items];
	[items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
	return { ...doc, items };
}

/** Insert a new heading section at a given position. Returns new doc (immutable). */
export function addSection(doc: PlanDocument, afterItemId: number | null, title: string, level: number = 2): PlanDocument {
	const newItem: PlanItem = {
		id: doc.nextId,
		kind: "heading",
		level,
		raw: `${"#".repeat(level)} ${title}`,
		text: title,
		checked: false,
		indent: 0,
	};

	const blankLine: PlanItem = {
		id: doc.nextId + 1,
		kind: "text",
		level: 0,
		raw: "",
		text: "",
		checked: false,
		indent: 0,
	};

	let items: PlanItem[];
	if (afterItemId === null) {
		// Insert at beginning
		items = [blankLine, newItem, { ...blankLine, id: doc.nextId + 2 }, ...doc.items];
		return { items, nextId: doc.nextId + 3 };
	}

	const idx = doc.items.findIndex((i) => i.id === afterItemId);
	if (idx < 0) {
		items = [...doc.items, blankLine, newItem, { ...blankLine, id: doc.nextId + 2 }];
	} else {
		items = [
			...doc.items.slice(0, idx + 1),
			blankLine,
			newItem,
			{ ...blankLine, id: doc.nextId + 2 },
			...doc.items.slice(idx + 1),
		];
	}

	return { items, nextId: doc.nextId + 3 };
}

/** Insert a new checkbox item at a given position. Returns new doc (immutable). */
export function addItem(doc: PlanDocument, afterItemId: number | null, text: string, kind: ItemKind = "checkbox"): PlanDocument {
	const newItem: PlanItem = {
		id: doc.nextId,
		kind,
		level: 0,
		raw: "",
		text,
		checked: false,
		indent: 0,
	};
	newItem.raw = itemToMarkdown(newItem);

	let items: PlanItem[];
	if (afterItemId === null) {
		items = [newItem, ...doc.items];
	} else {
		const idx = doc.items.findIndex((i) => i.id === afterItemId);
		if (idx < 0) {
			items = [...doc.items, newItem];
		} else {
			items = [
				...doc.items.slice(0, idx + 1),
				newItem,
				...doc.items.slice(idx + 1),
			];
		}
	}

	return { items, nextId: doc.nextId + 1 };
}

/** Remove an item by ID. Returns new doc (immutable). */
export function removeItem(doc: PlanDocument, itemId: number): PlanDocument {
	const items = doc.items.filter((i) => i.id !== itemId);
	return { ...doc, items };
}

// ── Navigation helpers ───────────────────────────────────────────────

/** Get indices of all "navigable" items (headings, checkboxes, bullets — not blank lines). */
export function getNavigableIndices(doc: PlanDocument): number[] {
	return doc.items
		.map((item, idx) => ({ item, idx }))
		.filter(({ item }) => item.kind !== "text" || item.text.trim().length > 0)
		.map(({ idx }) => idx);
}

/** Get indices of all checkbox items. */
export function getCheckboxIndices(doc: PlanDocument): number[] {
	return doc.items
		.map((item, idx) => ({ item, idx }))
		.filter(({ item }) => item.kind === "checkbox")
		.map(({ idx }) => idx);
}
