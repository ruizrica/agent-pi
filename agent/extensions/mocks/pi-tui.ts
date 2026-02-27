// Mock implementation of @mariozechner/pi-tui for testing

export class Container {
	private children: any[] = [];

	addChild(child: any): void {
		this.children.push(child);
	}

	render(width: number): string[] {
		return this.children.flatMap(
			(c) => (c.render ? c.render(width) : [])
		);
	}
}

export class Text {
	constructor(
		public content: string,
		public indent: number,
		public offset: number
	) {}

	render(width: number): string[] {
		return [this.content];
	}
}

export class Spacer {
	constructor(public height: number) {}

	render(width: number): string[] {
		return Array(this.height).fill("");
	}
}

export class Markdown {
	constructor(
		public content: string,
		public indent: number,
		public offset: number,
		public theme: any
	) {}

	render(width: number): string[] {
		// Simple markdown rendering: split on newlines and limit to ~30 chars per line
		return this.content
			.split("\n")
			.slice(0, Math.max(1, Math.ceil(width / 30)))
			.map((line) => line.substring(0, width));
	}
}

export const Key = {
	up: "up",
	down: "down",
	enter: "enter",
	escape: "escape",
	left: "left",
	right: "right",
	tab: "tab",
	backspace: "backspace",
	delete: "delete",
	home: "home",
	end: "end",
	pageup: "pageup",
	pagedown: "pagedown",
};

export function matchesKey(data: string, key: string): boolean {
	return data === key;
}

export function truncateToWidth(
	s: string,
	w: number,
	suffix: string
): string {
	const visible = visibleWidth(s);
	if (visible <= w) return s;

	// Count visible characters and truncate at the right position
	let result = "";
	let visCount = 0;
	for (const char of s) {
		const charWidth = isAnsiCode(char) ? 0 : 1;
		if (visCount + charWidth + suffix.length > w) break;
		result += char;
		visCount += charWidth;
	}
	return result + suffix;
}

export function visibleWidth(s: string): number {
	// Remove ANSI escape codes and count actual visible characters
	return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function isAnsiCode(char: string): boolean {
	return char === "\x1b";
}
