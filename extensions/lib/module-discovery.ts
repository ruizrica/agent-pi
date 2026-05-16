// ABOUTME: Module discovery for test generation — scans a project to find testable modules, APIs, routes, and components.
// ABOUTME: Performs static analysis of source files plus runtime enrichment from test coverage data.

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, relative, basename, extname, dirname } from "path";

// ── Types ────────────────────────────────────────────────────────────

export type ModuleType =
	| "api-route"
	| "component"
	| "utility"
	| "model"
	| "middleware"
	| "hook"
	| "screen"
	| "service"
	| "config";

export type Priority = "high" | "medium" | "low";
export type CoverageStatus = "none" | "partial" | "full";

export interface DiscoveredModule {
	name: string;
	filePath: string;
	relativePath: string;
	type: ModuleType;
	exports: string[];
	dependencies: string[];
	complexity: "low" | "medium" | "high";
	coverageStatus: CoverageStatus;
	suggestedPriority: Priority;
	estimatedTestCount: number;
}

export interface TestCoverageEntry {
	testFiles: string[];
	testCount: number;
	lastRun?: string;
}

export interface TestCoverageMap {
	[modulePath: string]: TestCoverageEntry;
}

export interface ModuleManifest {
	projectName: string;
	projectType: string;
	framework: string;
	modules: DiscoveredModule[];
	existingTests: TestCoverageMap;
	scanTimestamp: number;
	totalModules: number;
	coverageGaps: number;
}

// ── Framework Detection ──────────────────────────────────────────────

/**
 * Detect the project type and framework from manifest files.
 */
export function detectFramework(cwd: string): { projectType: string; framework: string; projectName: string } {
	let projectName = basename(cwd);
	let projectType = "unknown";
	let framework = "unknown";

	// Check package.json
	const pkgPath = join(cwd, "package.json");
	if (existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
			projectName = pkg.name || projectName;
			const deps = { ...pkg.dependencies, ...pkg.devDependencies };

			// Detect framework from dependencies
			if (deps["next"]) {
				projectType = "node";
				framework = "next";
			} else if (deps["expo"] || deps["expo-router"]) {
				projectType = "react-native";
				framework = deps["expo-router"] ? "expo-router" : "expo";
			} else if (deps["react-native"]) {
				projectType = "react-native";
				framework = "react-native";
			} else if (deps["react"]) {
				projectType = "node";
				framework = deps["vite"] ? "react-vite" : "react";
			} else if (deps["express"]) {
				projectType = "node";
				framework = "express";
			} else if (deps["fastify"]) {
				projectType = "node";
				framework = "fastify";
			} else if (deps["hono"]) {
				projectType = "node";
				framework = "hono";
			} else if (deps["@nestjs/core"]) {
				projectType = "node";
				framework = "nestjs";
			} else if (deps["vue"]) {
				projectType = "node";
				framework = "vue";
			} else if (deps["svelte"] || deps["@sveltejs/kit"]) {
				projectType = "node";
				framework = deps["@sveltejs/kit"] ? "sveltekit" : "svelte";
			} else if (pkg.dependencies || pkg.devDependencies) {
				projectType = "node";
				framework = "node";
			}
		} catch {}
	}

	// Check for Python
	if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
		projectType = "python";
		if (existsSync(join(cwd, "manage.py"))) framework = "django";
		else {
			try {
				const req = readFileSync(join(cwd, "requirements.txt"), "utf-8");
				if (req.includes("fastapi")) framework = "fastapi";
				else if (req.includes("flask")) framework = "flask";
				else framework = "python";
			} catch {
				framework = "python";
			}
		}
	}

	// Check for Go
	if (existsSync(join(cwd, "go.mod"))) {
		projectType = "go";
		framework = "go";
	}

	// Check for Rust
	if (existsSync(join(cwd, "Cargo.toml"))) {
		projectType = "rust";
		framework = "rust";
	}

	return { projectType, framework, projectName };
}

// ── Source File Scanner ──────────────────────────────────────────────

const SKIP_DIRS = new Set([
	"node_modules", ".git", "dist", "build", ".next", ".expo",
	".turbo", "coverage", "__pycache__", ".venv", "venv",
	"target", "vendor", ".pi", ".gopher", ".context",
]);

const SOURCE_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
	".py", ".go", ".rs",
]);

const TEST_PATTERNS = [
	/\.test\.[tj]sx?$/,
	/\.spec\.[tj]sx?$/,
	/__tests__\//,
	/_test\.go$/,
	/_test\.py$/,
	/test_.*\.py$/,
];

function isTestFile(filePath: string): boolean {
	return TEST_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Recursively collect all source files in a directory.
 */
function collectSourceFiles(dir: string, maxDepth = 8, depth = 0): string[] {
	if (depth > maxDepth) return [];
	const files: string[] = [];

	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".") && entry.name !== ".") continue;
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				files.push(...collectSourceFiles(fullPath, maxDepth, depth + 1));
			} else if (entry.isFile()) {
				const ext = extname(entry.name);
				if (SOURCE_EXTENSIONS.has(ext) && !isTestFile(fullPath)) {
					files.push(fullPath);
				}
			}
		}
	} catch {}

	return files;
}

// ── Export Scanner ────────────────────────────────────────────────────

/**
 * Extract exported names from a TypeScript/JavaScript file using regex patterns.
 * This is intentionally simple — no AST parsing needed for discovery.
 */
export function scanExports(content: string): string[] {
	const exports: string[] = [];
	const seen = new Set<string>();

	const patterns = [
		// export function name(
		/export\s+(?:async\s+)?function\s+(\w+)/g,
		// export const/let/var name
		/export\s+(?:const|let|var)\s+(\w+)/g,
		// export class name
		/export\s+class\s+(\w+)/g,
		// export interface name
		/export\s+interface\s+(\w+)/g,
		// export type name
		/export\s+type\s+(\w+)/g,
		// export enum name
		/export\s+enum\s+(\w+)/g,
		// export default function name(
		/export\s+default\s+(?:async\s+)?function\s+(\w+)/g,
		// export default class name
		/export\s+default\s+class\s+(\w+)/g,
		// module.exports = { name }
		/module\.exports\s*=\s*\{([^}]+)\}/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(content)) !== null) {
			const name = match[1].trim();
			// For module.exports, split by comma
			if (pattern.source.includes("module")) {
				for (const part of name.split(",")) {
					const clean = part.trim().split(":")[0].trim();
					if (clean && !seen.has(clean)) {
						seen.add(clean);
						exports.push(clean);
					}
				}
			} else if (!seen.has(name)) {
				seen.add(name);
				exports.push(name);
			}
		}
	}

	return exports;
}

// ── Module Type Classification ───────────────────────────────────────

/**
 * Classify a source file into a module type based on its path and content.
 */
export function classifyModule(filePath: string, content: string, framework: string): ModuleType {
	const lower = filePath.toLowerCase();
	const name = basename(filePath, extname(filePath)).toLowerCase();

	// API routes
	if (lower.includes("/api/") || lower.includes("/routes/") || lower.includes("/route.")) {
		return "api-route";
	}
	if (framework === "express" || framework === "fastify" || framework === "hono") {
		if (content.includes("router.") || content.includes("app.get") || content.includes("app.post")) {
			return "api-route";
		}
	}
	if (framework === "next" || framework === "expo-router") {
		if (lower.includes("/app/") && (name === "route" || name === "api")) {
			return "api-route";
		}
	}

	// Middleware
	if (lower.includes("/middleware/") || name.includes("middleware")) {
		return "middleware";
	}

	// Models (check BEFORE hooks — "User" in /models/ should not match "use*" hook pattern)
	if (lower.includes("/models/") || lower.includes("/model/") || lower.includes("/schema/") || lower.includes("/entities/")) {
		return "model";
	}
	if (content.includes("@Entity") || content.includes("prisma.") || content.includes("Schema(") || content.includes("@Table")) {
		return "model";
	}

	// Hooks (must be in /hooks/ dir OR filename starts with "use" followed by uppercase)
	if (lower.includes("/hooks/")) {
		return "hook";
	}
	if (/^use[A-Z]/.test(basename(filePath, extname(filePath)))) {
		return "hook";
	}

	// Screens (React Native)
	if (lower.includes("/screens/") || lower.includes("/screen/") || name.endsWith("screen")) {
		return "screen";
	}

	// Components
	if (lower.includes("/components/") || lower.includes("/component/")) {
		return "component";
	}
	// JSX/TSX files with capitalized export names are likely components
	if ((filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) && /export\s+(?:default\s+)?function\s+[A-Z]/.test(content)) {
		return "component";
	}
	if (content.includes("@Entity") || content.includes("prisma.") || content.includes("Schema(") || content.includes("@Table")) {
		return "model";
	}

	// Services
	if (lower.includes("/services/") || lower.includes("/service/") || name.endsWith("service")) {
		return "service";
	}

	// Config
	if (name.includes("config") || name.includes("settings") || lower.includes("/config/")) {
		return "config";
	}

	// Default: utility
	return "utility";
}


// ── Import Scanner ───────────────────────────────────────────────────

/**
 * Extract import paths from a TypeScript/JavaScript file.
 */
function scanImports(content: string): string[] {
	const imports: string[] = [];
	const patterns = [
		/import\s+.*?from\s+['"]([^'"]+)['"]/g,
		/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(content)) !== null) {
			const path = match[1];
			// Only track relative imports (local dependencies)
			if (path.startsWith(".") || path.startsWith("/")) {
				imports.push(path);
			}
		}
	}

	return imports;
}

// ── Complexity Estimation ────────────────────────────────────────────

/**
 * Estimate module complexity based on line count, export count, and patterns.
 */
function estimateComplexity(content: string, exports: string[]): "low" | "medium" | "high" {
	const lines = content.split("\n").length;
	const exportCount = exports.length;

	// High complexity indicators
	if (lines > 500 || exportCount > 20) return "high";
	if (content.includes("async") && content.includes("try") && lines > 200) return "high";
	if ((content.match(/if\s*\(/g) || []).length > 15) return "high";

	// Medium complexity
	if (lines > 100 || exportCount > 5) return "medium";

	return "low";
}

// ── Priority Calculation ─────────────────────────────────────────────

/**
 * Calculate testing priority for a module.
 */
export function calculatePriority(
	module: Pick<DiscoveredModule, "type" | "complexity" | "coverageStatus" | "exports">,
): Priority {
	let score = 0;

	// No coverage = high priority
	if (module.coverageStatus === "none") score += 3;
	else if (module.coverageStatus === "partial") score += 1;

	// API routes and services are high priority
	if (module.type === "api-route") score += 3;
	if (module.type === "service") score += 2;
	if (module.type === "middleware") score += 2;
	if (module.type === "model") score += 1;

	// Complexity needs testing
	if (module.complexity === "high") score += 2;
	else if (module.complexity === "medium") score += 1;

	// Components with any gaps are worth testing
	if (module.type === "component" && module.coverageStatus !== "full") score += 1;
	if (module.type === "hook" && module.coverageStatus !== "full") score += 1;

	// More exports = more surface area
	if (module.exports.length > 10) score += 1;

	if (score >= 5) return "high";
	if (score >= 3) return "medium";
	return "low";
}

// ── Test Coverage Scanner ────────────────────────────────────────────

/**
 * Scan for existing test files and map them to source modules.
 */
export function scanTestCoverage(cwd: string): TestCoverageMap {
	const coverage: TestCoverageMap = {};
	const testFiles: string[] = [];

	// Collect test files
	function findTests(dir: string, depth = 0) {
		if (depth > 6) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (SKIP_DIRS.has(entry.name)) continue;
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					findTests(fullPath, depth + 1);
				} else if (entry.isFile() && isTestFile(fullPath)) {
					testFiles.push(fullPath);
				}
			}
		} catch {}
	}

	findTests(cwd);

	// Map test files to source modules
	for (const testFile of testFiles) {
		const relPath = relative(cwd, testFile);
		// Try to match test file to source file
		// e.g., foo.test.ts -> foo.ts, __tests__/foo.test.ts -> ../foo.ts
		const possibleSources = guessSourceFromTest(testFile, cwd);

		// Count test cases in file
		let testCount = 0;
		try {
			const content = readFileSync(testFile, "utf-8");
			const itMatches = content.match(/(?:it|test)\s*\(/g);
			testCount = itMatches ? itMatches.length : 0;
		} catch {}

		for (const source of possibleSources) {
			const key = relative(cwd, source);
			if (!coverage[key]) {
				coverage[key] = { testFiles: [], testCount: 0 };
			}
			coverage[key].testFiles.push(relPath);
			coverage[key].testCount += testCount;
		}
	}

	return coverage;
}

/**
 * Guess which source file a test file corresponds to.
 */
function guessSourceFromTest(testFile: string, cwd: string): string[] {
	const dir = dirname(testFile);
	const name = basename(testFile);
	const candidates: string[] = [];

	// Remove test suffix
	const sourceName = name
		.replace(/\.test\.(ts|tsx|js|jsx)$/, ".$1")
		.replace(/\.spec\.(ts|tsx|js|jsx)$/, ".$1");

	// Same directory
	const sameDir = join(dir, sourceName);
	if (existsSync(sameDir)) candidates.push(sameDir);

	// Parent directory (for __tests__/)
	if (basename(dir) === "__tests__") {
		const parentDir = join(dirname(dir), sourceName);
		if (existsSync(parentDir)) candidates.push(parentDir);
	}

	// src/ directory mapping (tests/ -> src/)
	const relDir = relative(cwd, dir);
	if (relDir.startsWith("tests") || relDir.startsWith("test")) {
		const srcEquiv = join(cwd, "src", relDir.replace(/^tests?/, ""), sourceName);
		if (existsSync(srcEquiv)) candidates.push(srcEquiv);
	}

	return candidates;
}

// ── Estimated Test Count ─────────────────────────────────────────────

function estimateTestCount(module: Pick<DiscoveredModule, "type" | "complexity" | "exports">): number {
	const base = module.exports.length;
	const multiplier =
		module.complexity === "high" ? 4 :
		module.complexity === "medium" ? 3 : 2;

	const typeBonus =
		module.type === "api-route" ? 2 :
		module.type === "component" ? 1.5 :
		module.type === "service" ? 1.5 : 1;

	return Math.max(1, Math.round(base * multiplier * typeBonus * 0.5));
}

// ── Main Discovery Function ──────────────────────────────────────────

/**
 * Discover all testable modules in a project.
 */
export function discoverModules(cwd: string): ModuleManifest {
	const { projectType, framework, projectName } = detectFramework(cwd);
	const sourceFiles = collectSourceFiles(cwd);
	const testCoverage = scanTestCoverage(cwd);

	const modules: DiscoveredModule[] = [];

	for (const filePath of sourceFiles) {
		try {
			const content = readFileSync(filePath, "utf-8");
			const exports = scanExports(content);

			// Skip files with no exports (not a public module)
			if (exports.length === 0) continue;

			const relPath = relative(cwd, filePath);
			const type = classifyModule(filePath, content, framework);
			const dependencies = scanImports(content);
			const complexity = estimateComplexity(content, exports);

			// Check test coverage
			const coverageEntry = testCoverage[relPath];
			let coverageStatus: CoverageStatus = "none";
			if (coverageEntry) {
				coverageStatus = coverageEntry.testCount >= exports.length ? "full" : "partial";
			}

			const moduleInfo: DiscoveredModule = {
				name: basename(filePath, extname(filePath)),
				filePath,
				relativePath: relPath,
				type,
				exports,
				dependencies,
				complexity,
				coverageStatus,
				suggestedPriority: "medium", // calculated below
				estimatedTestCount: 0, // calculated below
			};

			moduleInfo.suggestedPriority = calculatePriority(moduleInfo);
			moduleInfo.estimatedTestCount = estimateTestCount(moduleInfo);

			modules.push(moduleInfo);
		} catch {
			// Skip files that can't be read
		}
	}

	// Sort by priority (high first), then by type
	const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
	modules.sort((a, b) => {
		const pDiff = priorityOrder[a.suggestedPriority] - priorityOrder[b.suggestedPriority];
		if (pDiff !== 0) return pDiff;
		return a.type.localeCompare(b.type);
	});

	const coverageGaps = modules.filter(m => m.coverageStatus === "none").length;

	return {
		projectName,
		projectType,
		framework,
		modules,
		existingTests: testCoverage,
		scanTimestamp: Date.now(),
		totalModules: modules.length,
		coverageGaps,
	};
}

// ── Formatting Helpers ───────────────────────────────────────────────

const TYPE_LABELS: Record<ModuleType, string> = {
	"api-route": "API Routes",
	"component": "Components",
	"utility": "Utilities",
	"model": "Models",
	"middleware": "Middleware",
	"hook": "Hooks",
	"screen": "Screens",
	"service": "Services",
	"config": "Config",
};

/**
 * Group modules by type for display.
 */
export function groupModulesByType(modules: DiscoveredModule[]): Map<ModuleType, DiscoveredModule[]> {
	const groups = new Map<ModuleType, DiscoveredModule[]>();
	for (const mod of modules) {
		const existing = groups.get(mod.type) || [];
		existing.push(mod);
		groups.set(mod.type, existing);
	}
	return groups;
}

/**
 * Format module groups for terminal select UI.
 */
export function formatModuleGroups(manifest: ModuleManifest): string[] {
	const groups = groupModulesByType(manifest.modules);
	const options: string[] = [];

	for (const [type, mods] of groups) {
		const label = TYPE_LABELS[type] || type;
		const uncovered = mods.filter(m => m.coverageStatus === "none").length;
		const header = `--- ${label} (${mods.length} modules, ${uncovered} uncovered) ---`;
		options.push(header);
		for (const mod of mods) {
			const coverage = mod.coverageStatus === "none" ? "[NO TESTS]" :
				mod.coverageStatus === "partial" ? "[PARTIAL]" : "[COVERED]";
			const priority = mod.suggestedPriority === "high" ? "[HIGH]" :
				mod.suggestedPriority === "medium" ? "[MED]" : "[LOW]";
			options.push(`  ${priority} ${coverage} ${mod.name} (${mod.exports.length} exports) — ${mod.relativePath}`);
		}
	}

	return options;
}

/**
 * Format selected modules as structured input for the chain.
 */
export function formatSelectedModulesForChain(
	modules: DiscoveredModule[],
	manifest: ModuleManifest,
): string {
	const lines: string[] = [];
	lines.push(`# Selected Modules for Test Generation`);
	lines.push(`Project: ${manifest.projectName} (${manifest.framework})`);
	lines.push(`Total selected: ${modules.length} modules`);
	lines.push(``);

	for (const mod of modules) {
		lines.push(`## Module: ${mod.name}`);
		lines.push(`- **Path:** ${mod.relativePath}`);
		lines.push(`- **Type:** ${mod.type}`);
		lines.push(`- **Exports:** ${mod.exports.join(", ")}`);
		lines.push(`- **Dependencies:** ${mod.dependencies.length > 0 ? mod.dependencies.join(", ") : "none"}`);
		lines.push(`- **Complexity:** ${mod.complexity}`);
		lines.push(`- **Current Test Coverage:** ${mod.coverageStatus}`);
		lines.push(`- **Priority:** ${mod.suggestedPriority}`);
		lines.push(`- **Estimated Tests:** ${mod.estimatedTestCount}`);
		lines.push(``);
	}

	return lines.join("\n");
}
