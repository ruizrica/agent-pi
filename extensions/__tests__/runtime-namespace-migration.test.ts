import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");

const rootsToScan = [
	"README.md",
	"README-v2.md",
	"README-v3.md",
	"package.json",
	"install.sh",
	"commands",
	"docs",
	"extensions",
	"agents",
];

const ignoredSegments = new Set([
	".context",
	".git",
	"coverage",
	"node_modules",
	"web-test-worker",
]);

const ignoredFiles = new Set([
	"extensions/lib/marked.min.js",
	"extensions/package-lock.json",
]);

const textFilePattern = /\.(ts|tsx|js|cjs|mjs|json|md|sh|yaml|yml)$/;

function shouldSkip(path: string): boolean {
	const normalized = path.split(/[\\/]+/);
	return normalized.some((segment) => ignoredSegments.has(segment));
}

function collectFiles(path: string): string[] {
	const absolutePath = join(repoRoot, path);
	if (!existsSync(absolutePath)) return [];
	const relativePath = relative(repoRoot, absolutePath);
	if (ignoredFiles.has(relativePath) || shouldSkip(relativePath)) return [];
	const stats = statSync(absolutePath);
	if (stats.isFile()) {
		return textFilePattern.test(absolutePath) ? [absolutePath] : [];
	}
	return readdirSync(absolutePath).flatMap((entry) => collectFiles(join(path, entry)));
}

function activeFiles(): string[] {
	return rootsToScan.flatMap(collectFiles);
}

const oldScope = `@${"mariozechner"}`;
const newScope = `@${"earendil-works"}`;
const oldRuntimeRefs = [
	`${oldScope}/pi-coding-agent`,
	`${oldScope}/pi-tui`,
	`${oldScope}/pi-ai`,
	`${oldScope}/pi-agent-core`,
];
const oldPiRepo = `github.com/${"badlogic"}/pi-mono`;
const newCodingAgentPackage = `${newScope}/pi-coding-agent`;

describe("runtime namespace migration", () => {
	it("uses the Earendil Works Pi package namespace in active source", () => {
		const offenders = activeFiles().flatMap((file) => {
			const content = readFileSync(file, "utf-8");
			return oldRuntimeRefs
				.filter((needle) => content.includes(needle))
				.map((needle) => `${relative(repoRoot, file)} contains ${needle}`);
		});

		expect(offenders).toEqual([]);
	});

	it("points active upstream Pi docs to earendil-works/pi", () => {
		const offenders = activeFiles().flatMap((file) => {
			const content = readFileSync(file, "utf-8");
			return content.includes(oldPiRepo) ? [`${relative(repoRoot, file)} contains ${oldPiRepo}`] : [];
		});

		expect(offenders).toEqual([]);
	});

	it("installs the Earendil Works Pi CLI when bootstrapping", () => {
		const installScript = readFileSync(join(repoRoot, "install.sh"), "utf-8");
		expect(installScript).toContain(newCodingAgentPackage);
		expect(installScript).not.toContain(`${oldScope}/pi-coding-agent`);
	});
});
