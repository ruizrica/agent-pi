// ABOUTME: Tests for module-discovery.ts — framework detection, export scanning, module classification, and priority calculation.

import { describe, it, expect } from "vitest";
import {
	detectFramework,
	scanExports,
	classifyModule,
	calculatePriority,
	scanTestCoverage,
	discoverModules,
	groupModulesByType,
	formatModuleGroups,
	formatSelectedModulesForChain,
	type DiscoveredModule,
	type ModuleManifest,
} from "../lib/module-discovery.ts";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── Test Fixtures ────────────────────────────────────────────────────

function createTempProject(structure: Record<string, string>): string {
	const dir = join(tmpdir(), `test-discovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });

	for (const [path, content] of Object.entries(structure)) {
		const fullPath = join(dir, path);
		mkdirSync(join(fullPath, ".."), { recursive: true });
		writeFileSync(fullPath, content, "utf-8");
	}

	return dir;
}

function cleanupTempProject(dir: string): void {
	if (existsSync(dir)) {
		try { rmSync(dir, { recursive: true, force: true }); } catch {}
	}
}

// ── Framework Detection ──────────────────────────────────────────────

describe("detectFramework", () => {
	it("detects Express project", () => {
		const dir = createTempProject({
			"package.json": JSON.stringify({
				name: "my-api",
				dependencies: { express: "^4.18.0" },
			}),
		});
		try {
			const result = detectFramework(dir);
			expect(result.framework).toBe("express");
			expect(result.projectType).toBe("node");
			expect(result.projectName).toBe("my-api");
		} finally {
			cleanupTempProject(dir);
		}
	});

	it("detects Next.js project", () => {
		const dir = createTempProject({
			"package.json": JSON.stringify({
				name: "my-app",
				dependencies: { next: "^14.0.0", react: "^18.0.0" },
			}),
		});
		try {
			const result = detectFramework(dir);
			expect(result.framework).toBe("next");
			expect(result.projectType).toBe("node");
		} finally {
			cleanupTempProject(dir);
		}
	});

	it("detects Expo project", () => {
		const dir = createTempProject({
			"package.json": JSON.stringify({
				name: "my-mobile",
				dependencies: { expo: "~51.0.0", "expo-router": "^3.0.0" },
			}),
		});
		try {
			const result = detectFramework(dir);
			expect(result.framework).toBe("expo-router");
			expect(result.projectType).toBe("react-native");
		} finally {
			cleanupTempProject(dir);
		}
	});

	it("detects React project", () => {
		const dir = createTempProject({
			"package.json": JSON.stringify({
				name: "my-spa",
				dependencies: { react: "^18.0.0" },
				devDependencies: { vite: "^5.0.0" },
			}),
		});
		try {
			const result = detectFramework(dir);
			expect(result.framework).toBe("react-vite");
		} finally {
			cleanupTempProject(dir);
		}
	});

	it("returns unknown for empty directory", () => {
		const dir = createTempProject({});
		try {
			const result = detectFramework(dir);
			expect(result.projectType).toBe("unknown");
			expect(result.framework).toBe("unknown");
		} finally {
			cleanupTempProject(dir);
		}
	});
});

// ── Export Scanner ────────────────────────────────────────────────────

describe("scanExports", () => {
	it("finds exported functions", () => {
		const content = `
export function hello() {}
export async function fetchData() {}
export default function main() {}
		`;
		const exports = scanExports(content);
		expect(exports).toContain("hello");
		expect(exports).toContain("fetchData");
		expect(exports).toContain("main");
	});

	it("finds exported constants and classes", () => {
		const content = `
export const API_KEY = "abc";
export let count = 0;
export class UserService {}
export interface UserProps {}
export type UserId = string;
export enum Status { Active, Inactive }
		`;
		const exports = scanExports(content);
		expect(exports).toContain("API_KEY");
		expect(exports).toContain("count");
		expect(exports).toContain("UserService");
		expect(exports).toContain("UserProps");
		expect(exports).toContain("UserId");
		expect(exports).toContain("Status");
	});

	it("handles CommonJS exports", () => {
		const content = `
module.exports = { foo, bar, baz };
		`;
		const exports = scanExports(content);
		expect(exports).toContain("foo");
		expect(exports).toContain("bar");
		expect(exports).toContain("baz");
	});

	it("returns empty array for no exports", () => {
		const content = `const internal = 42;\nfunction helper() {}`;
		const exports = scanExports(content);
		expect(exports).toEqual([]);
	});

	it("deduplicates exports", () => {
		const content = `
export function foo() {}
export const foo = 1;
		`;
		const exports = scanExports(content);
		const fooCount = exports.filter(e => e === "foo").length;
		expect(fooCount).toBe(1);
	});
});

// ── Module Classification ────────────────────────────────────────────

describe("classifyModule", () => {
	it("classifies API routes by path", () => {
		expect(classifyModule("/app/api/users/route.ts", "", "next")).toBe("api-route");
		expect(classifyModule("/src/routes/auth.ts", "", "express")).toBe("api-route");
	});

	it("classifies Express routes by content", () => {
		const content = `router.get("/users", getUsers); router.post("/users", createUser);`;
		expect(classifyModule("/src/user.ts", content, "express")).toBe("api-route");
	});

	it("classifies hooks", () => {
		expect(classifyModule("/src/hooks/useAuth.ts", "", "react")).toBe("hook");
		expect(classifyModule("/src/useForm.ts", "", "react")).toBe("hook");
	});

	it("classifies components by path", () => {
		expect(classifyModule("/src/components/Button.tsx", "", "react")).toBe("component");
	});

	it("classifies components by content (TSX with capital export)", () => {
		const content = `export default function UserCard() { return <div>...</div>; }`;
		expect(classifyModule("/src/UserCard.tsx", content, "react")).toBe("component");
	});

	it("classifies screens", () => {
		expect(classifyModule("/src/screens/HomeScreen.tsx", "", "react-native")).toBe("screen");
	});

	it("classifies models", () => {
		expect(classifyModule("/src/models/User.ts", "", "node")).toBe("model");
	});

	it("classifies middleware", () => {
		expect(classifyModule("/src/middleware/auth.ts", "", "express")).toBe("middleware");
	});

	it("classifies services", () => {
		expect(classifyModule("/src/services/emailService.ts", "", "node")).toBe("service");
	});

	it("defaults to utility", () => {
		expect(classifyModule("/src/lib/helpers.ts", "export function formatDate() {}", "node")).toBe("utility");
	});
});

// ── Priority Calculation ─────────────────────────────────────────────

describe("calculatePriority", () => {
	it("returns high for uncovered API routes", () => {
		const priority = calculatePriority({
			type: "api-route",
			complexity: "medium",
			coverageStatus: "none",
			exports: ["getUser", "createUser", "deleteUser"],
		});
		expect(priority).toBe("high");
	});

	it("returns low for covered simple utilities", () => {
		const priority = calculatePriority({
			type: "utility",
			complexity: "low",
			coverageStatus: "full",
			exports: ["formatDate"],
		});
		expect(priority).toBe("low");
	});

	it("returns medium for partially covered components", () => {
		const priority = calculatePriority({
			type: "component",
			complexity: "medium",
			coverageStatus: "partial",
			exports: ["Button", "ButtonProps"],
		});
		expect(priority).toBe("medium");
	});

	it("returns high for complex uncovered services", () => {
		const priority = calculatePriority({
			type: "service",
			complexity: "high",
			coverageStatus: "none",
			exports: Array.from({ length: 15 }, (_, i) => `method${i}`),
		});
		expect(priority).toBe("high");
	});
});

// ── Full Discovery ───────────────────────────────────────────────────

describe("discoverModules", () => {
	it("discovers modules in a simple project", () => {
		const dir = createTempProject({
			"package.json": JSON.stringify({
				name: "test-project",
				dependencies: { express: "^4.18.0" },
			}),
			"src/routes/users.ts": `
export function getUsers(req, res) { res.json([]); }
export function createUser(req, res) { res.json({}); }
			`,
			"src/lib/helpers.ts": `
export function formatDate(d) { return d.toISOString(); }
export function slugify(s) { return s.toLowerCase().replace(/ /g, '-'); }
			`,
			"src/lib/helpers.test.ts": `
import { formatDate } from './helpers';
it('formats dates', () => { expect(formatDate(new Date())).toBeTruthy(); });
			`,
		});

		try {
			const manifest = discoverModules(dir);
			expect(manifest.projectName).toBe("test-project");
			expect(manifest.framework).toBe("express");
			expect(manifest.modules.length).toBeGreaterThanOrEqual(2);

			const routeModule = manifest.modules.find(m => m.name === "users");
			expect(routeModule).toBeDefined();
			expect(routeModule!.type).toBe("api-route");
			expect(routeModule!.exports).toContain("getUsers");
			expect(routeModule!.exports).toContain("createUser");

			const helperModule = manifest.modules.find(m => m.name === "helpers");
			expect(helperModule).toBeDefined();
			expect(helperModule!.exports).toContain("formatDate");
		} finally {
			cleanupTempProject(dir);
		}
	});

	it("returns empty manifest for empty project", () => {
		const dir = createTempProject({
			"package.json": JSON.stringify({ name: "empty" }),
		});

		try {
			const manifest = discoverModules(dir);
			expect(manifest.modules).toEqual([]);
			expect(manifest.totalModules).toBe(0);
		} finally {
			cleanupTempProject(dir);
		}
	});
});

// ── Grouping and Formatting ──────────────────────────────────────────

describe("groupModulesByType", () => {
	it("groups modules correctly", () => {
		const modules: DiscoveredModule[] = [
			{ name: "users", filePath: "", relativePath: "", type: "api-route", exports: ["get"], dependencies: [], complexity: "low", coverageStatus: "none", suggestedPriority: "high", estimatedTestCount: 2 },
			{ name: "Button", filePath: "", relativePath: "", type: "component", exports: ["Button"], dependencies: [], complexity: "low", coverageStatus: "full", suggestedPriority: "low", estimatedTestCount: 1 },
			{ name: "auth", filePath: "", relativePath: "", type: "api-route", exports: ["login"], dependencies: [], complexity: "medium", coverageStatus: "none", suggestedPriority: "high", estimatedTestCount: 3 },
		];

		const groups = groupModulesByType(modules);
		expect(groups.get("api-route")!.length).toBe(2);
		expect(groups.get("component")!.length).toBe(1);
	});
});

describe("formatSelectedModulesForChain", () => {
	it("produces structured chain input", () => {
		const modules: DiscoveredModule[] = [
			{ name: "users", filePath: "/src/routes/users.ts", relativePath: "src/routes/users.ts", type: "api-route", exports: ["getUsers", "createUser"], dependencies: ["./helpers"], complexity: "medium", coverageStatus: "none", suggestedPriority: "high", estimatedTestCount: 6 },
		];
		const manifest: ModuleManifest = {
			projectName: "my-api",
			projectType: "node",
			framework: "express",
			modules,
			existingTests: {},
			scanTimestamp: Date.now(),
			totalModules: 1,
			coverageGaps: 1,
		};

		const output = formatSelectedModulesForChain(modules, manifest);
		expect(output).toContain("my-api");
		expect(output).toContain("users");
		expect(output).toContain("api-route");
		expect(output).toContain("getUsers");
		expect(output).toContain("createUser");
		expect(output).toContain("high");
	});
});
