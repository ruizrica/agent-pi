import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const EXTENSIONS_DIR = join(__dirname, "..");
const IGNORE_ROOT_FILES = new Set(["package-lock.json", "package.json", "WEB_TEST_QUICKSTART.md", "sounds-config.json"]);

function rootExtensionFiles(): string[] {
	return readdirSync(EXTENSIONS_DIR)
		.filter((name) => name.endsWith(".ts"))
		.filter((name) => statSync(join(EXTENSIONS_DIR, name)).isFile())
		.sort();
}

function extractToolNames(source: string): string[] {
	const names: string[] = [];
	const callPattern = /\.registerTool\s*\(\s*\{/g;
	let match: RegExpExecArray | null;
	while ((match = callPattern.exec(source)) !== null) {
		const chunk = source.slice(match.index, match.index + 600);
		const nameMatch = chunk.match(/\bname\s*:\s*["']([^"']+)["']/);
		if (nameMatch) names.push(nameMatch[1]);
	}
	return names;
}

function extractCommandNames(source: string): string[] {
	return [...source.matchAll(/\.registerCommand\s*\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function duplicates(entries: Array<{ name: string; file: string }>): Map<string, string[]> {
	const seen = new Map<string, string[]>();
	for (const entry of entries) {
		seen.set(entry.name, [...(seen.get(entry.name) ?? []), entry.file]);
	}
	return new Map([...seen.entries()].filter(([, files]) => files.length > 1));
}

describe("extension inventory guard", () => {
	it("keeps top-level extension modules discoverable", () => {
		const files = rootExtensionFiles();
		expect(files.length).toBeGreaterThan(40);
		expect(files).toContain("agent-chain.ts");
		expect(files).toContain("commander-mcp.ts");
		expect(files).toContain("tool-registry.ts");
	});

	it("does not expose duplicate active tool names from root extensions", () => {
		const toolEntries = rootExtensionFiles().flatMap((file) => {
			const source = readFileSync(join(EXTENSIONS_DIR, file), "utf8");
			return extractToolNames(source).map((name) => ({ name, file }));
		});

		expect(toolEntries.length).toBeGreaterThan(30);
		expect(Object.fromEntries(duplicates(toolEntries))).toEqual({});
	});

	it("does not expose duplicate active command names from root extensions", () => {
		const commandEntries = rootExtensionFiles().flatMap((file) => {
			const source = readFileSync(join(EXTENSIONS_DIR, file), "utf8");
			return extractCommandNames(source).map((name) => ({ name, file }));
		});

		expect(commandEntries.length).toBeGreaterThan(30);
		expect(Object.fromEntries(duplicates(commandEntries))).toEqual({});
	});

	it("keeps generated and support directories out of the root extension module list", () => {
		const rootEntries = readdirSync(EXTENSIONS_DIR).filter((name) => !IGNORE_ROOT_FILES.has(name));
		const sourceFiles = new Set(rootExtensionFiles().map((file) => basename(file)));

		expect(sourceFiles.has("package.json")).toBe(false);
		expect(rootEntries).toContain("lib");
		expect(rootEntries).toContain("__tests__");
	});
});
