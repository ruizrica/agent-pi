// Mock implementation of @earendil-works/pi-coding-agent for testing

export class DynamicBorder {
	constructor(private renderer: (s: string) => string) {}

	render(width: number): string[] {
		const content = "─".repeat(Math.max(1, width - 2));
		return [this.renderer(content)];
	}
}

export function getMarkdownTheme() {
	return {
		h1: (s: string) => s,
		h2: (s: string) => s,
		h3: (s: string) => s,
		p: (s: string) => s,
		text: (s: string) => s,
		em: (s: string) => s,
		strong: (s: string) => s,
		code: (s: string) => s,
		codeBlock: (s: string) => s,
		link: (s: string) => s,
		blockquote: (s: string) => s,
		list: (s: string) => s,
		listItem: (s: string) => s,
		table: (s: string) => s,
		tableRow: (s: string) => s,
		tableCell: (s: string) => s,
	};
}

export interface ExtensionAPI {
	registerTool: (config: any) => void;
	on: (event: string, handler: any) => void;
}

export interface ExtensionContext {
	hasUI: boolean;
	ui: {
		setTheme: (name: string) => { success: boolean };
		setTitle: (title: string) => void;
		custom: (fn: any) => Promise<any>;
		input: (prompt: string, placeholder?: string) => Promise<string | undefined>;
		confirm: (prompt: string, detail?: string, options?: any) => Promise<boolean>;
		requestRender: () => void;
	};
}
