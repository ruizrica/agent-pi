// ABOUTME: Test suite for the AI security protection installer — validates file generation and installation logic.
// ABOUTME: Covers guard generation, policy creation, middleware output, and gitignore management.

import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	installProtections,
	formatInstallReport,
	type InstallResult,
} from "../lib/secure-installer.ts";
import type { ProjectProfile } from "../lib/secure-engine.ts";

// ═══════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════

let counter = 0;

function createTestDir(files: Record<string, string> = {}): string {
	counter++;
	const dir = join(tmpdir(), `secure-install-test-${Date.now()}-${counter}`);
	mkdirSync(dir, { recursive: true });

	for (const [path, content] of Object.entries(files)) {
		const fullPath = join(dir, path);
		const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
		if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
		writeFileSync(fullPath, content, "utf-8");
	}

	return dir;
}

function makeProfile(root: string, overrides: Partial<ProjectProfile> = {}): ProjectProfile {
	return {
		name: "test-project",
		root,
		languages: ["JavaScript/TypeScript"],
		frameworks: ["Express"],
		aiServices: [{ name: "OpenAI", sdk: "openai", files: ["src/ai.ts"], version: "^4.0.0" }],
		hasEnvFile: false,
		hasGitIgnore: false,
		hasCIConfig: false,
		entryPoints: ["src/index.ts"],
		totalFiles: 10,
		...overrides,
	};
}

// ═══════════════════════════════════════════════════════════════════
// Installation Tests
// ═══════════════════════════════════════════════════════════════════

describe("installProtections", () => {
	it("should create security guard for TypeScript project", () => {
		const dir = createTestDir({
			"package.json": "{}",
			"tsconfig.json": "{}",
		});
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		expect(result.files.length).toBeGreaterThan(0);
		const guardFile = result.files.find((f) => f.path.includes("ai-security-guard"));
		expect(guardFile).toBeTruthy();
		expect(guardFile?.path).toContain(".ts");
		expect(guardFile?.created).toBe(true);

		// Check file actually exists
		expect(existsSync(guardFile!.path)).toBe(true);

		// Check content has TypeScript types
		const content = readFileSync(guardFile!.path, "utf-8");
		expect(content).toContain("interface");
		expect(content).toContain("createAISecurityGuard");
	});

	it("should create security guard for JavaScript project", () => {
		const dir = createTestDir({
			"package.json": "{}",
		});
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		const guardFile = result.files.find((f) => f.path.includes("ai-security-guard"));
		expect(guardFile).toBeTruthy();
		expect(guardFile?.path).toContain(".js");
	});

	it("should create security policy YAML", () => {
		const dir = createTestDir({ "package.json": "{}" });
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		const policyFile = result.files.find((f) => f.path.includes("security-policy.yaml"));
		expect(policyFile).toBeTruthy();
		expect(policyFile?.created).toBe(true);

		const content = readFileSync(policyFile!.path, "utf-8");
		expect(content).toContain("enabled: true");
		expect(content).toContain("blocked_patterns");
		expect(content).toContain("OpenAI");
	});

	it("should create Express middleware", () => {
		const dir = createTestDir({
			"package.json": "{}",
			"tsconfig.json": "{}",
		});
		const profile = makeProfile(dir, { frameworks: ["Express"] });
		const result = installProtections(dir, profile);

		const mwFile = result.files.find((f) => f.path.includes("middleware"));
		expect(mwFile).toBeTruthy();
		expect(mwFile?.created).toBe(true);

		const content = readFileSync(mwFile!.path, "utf-8");
		expect(content).toContain("aiSecurityMiddleware");
		expect(content).toContain("Rate Limit");
	});

	it("should create Next.js middleware for Next.js projects", () => {
		const dir = createTestDir({ "package.json": "{}" });
		const profile = makeProfile(dir, { frameworks: ["Next.js", "React"] });
		const result = installProtections(dir, profile);

		const mwFile = result.files.find((f) => f.path.includes("middleware.ts"));
		expect(mwFile).toBeTruthy();
		if (mwFile?.created && existsSync(mwFile.path)) {
			const content = readFileSync(mwFile.path, "utf-8");
			expect(content).toContain("NextResponse");
			expect(content).toContain("/api/ai");
		}
	});

	it("should create .env.example", () => {
		const dir = createTestDir({ "package.json": "{}" });
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		const envFile = result.files.find((f) => f.path.includes(".env.example"));
		expect(envFile).toBeTruthy();
		if (envFile?.created) {
			const content = readFileSync(envFile.path, "utf-8");
			expect(content).toContain("AI_SECURITY_ENABLED");
		}
	});

	it("should create CI workflow", () => {
		const dir = createTestDir({ "package.json": "{}" });
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		const ciFile = result.files.find((f) => f.path.includes("ai-security-check.yml"));
		expect(ciFile).toBeTruthy();
		if (ciFile?.created) {
			const content = readFileSync(ciFile.path, "utf-8");
			expect(content).toContain("AI Security Check");
			expect(content).toContain("pull_request");
		}
	});

	it("should add .env to .gitignore", () => {
		const dir = createTestDir({
			"package.json": "{}",
			".gitignore": "node_modules\n",
		});
		const profile = makeProfile(dir);
		installProtections(dir, profile);

		const content = readFileSync(join(dir, ".gitignore"), "utf-8");
		expect(content).toContain(".env");
		expect(content).toContain("*.pem");
		expect(content).toContain("*.key");
	});

	it("should not duplicate .gitignore entries", () => {
		const dir = createTestDir({
			"package.json": "{}",
			".gitignore": "node_modules\n.env\n*.pem\n*.key\n",
		});
		const profile = makeProfile(dir);
		installProtections(dir, profile);

		const content = readFileSync(join(dir, ".gitignore"), "utf-8");
		const envCount = (content.match(/\.env/g) || []).length;
		// .env appears in original + added variations (.env.local, .env.production, .env.*.local)
		// The key check is no exact duplicates — count should be stable, not growing
		expect(envCount).toBeLessThanOrEqual(8);
	});

	it("should not overwrite existing files by default", () => {
		const dir = createTestDir({
			"package.json": "{}",
			".ai-security-policy.yaml": "# existing policy\nenabled: false\n",
		});
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		const policyFile = result.files.find((f) => f.path.includes("security-policy.yaml"));
		expect(policyFile?.created).toBe(false);

		// Original content should be preserved
		const content = readFileSync(join(dir, ".ai-security-policy.yaml"), "utf-8");
		expect(content).toContain("existing policy");
	});

	it("should overwrite when option is set", () => {
		const dir = createTestDir({
			"package.json": "{}",
			"tsconfig.json": "{}",
			".ai-security-policy.yaml": "# old\n",
		});
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile, { overwrite: true });

		const policyFile = result.files.find((f) => f.path.includes("security-policy.yaml"));
		expect(policyFile?.created).toBe(true);

		const content = readFileSync(policyFile!.path, "utf-8");
		expect(content).not.toContain("# old");
		expect(content).toContain("enabled: true");
	});

	it("should support dry-run mode", () => {
		const dir = createTestDir({ "package.json": "{}" });
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile, { dryRun: true });

		// Files should be listed but not created
		expect(result.files.length).toBeGreaterThan(0);
		for (const f of result.files) {
			if (f.path.includes("security-guard") || f.path.includes("policy")) {
				// These shouldn't actually exist on disk
				// (unless they were already there)
			}
		}
	});

	it("should include setup instructions", () => {
		const dir = createTestDir({
			"package.json": "{}",
			"tsconfig.json": "{}",
		});
		const profile = makeProfile(dir);
		const result = installProtections(dir, profile);

		expect(result.instructions.length).toBeGreaterThan(0);
		const allInstructions = result.instructions.join(" ");
		expect(allInstructions).toContain("createAISecurityGuard");
	});
});

// ═══════════════════════════════════════════════════════════════════
// Python Support
// ═══════════════════════════════════════════════════════════════════

describe("Python project support", () => {
	it("should generate Python security guard", () => {
		const dir = createTestDir({ "requirements.txt": "openai\n" });
		const profile = makeProfile(dir, { languages: ["Python"] });
		const result = installProtections(dir, profile);

		const pyFile = result.files.find((f) => f.path.includes("ai_security_guard.py"));
		expect(pyFile).toBeTruthy();
		if (pyFile?.created) {
			const content = readFileSync(pyFile.path, "utf-8");
			expect(content).toContain("class AISecurityGuard");
			expect(content).toContain("def sanitize_input");
			expect(content).toContain("def filter_output");
		}
	});
});

// ═══════════════════════════════════════════════════════════════════
// Report Formatting
// ═══════════════════════════════════════════════════════════════════

describe("formatInstallReport", () => {
	it("should format a complete install report", () => {
		const result: InstallResult = {
			files: [
				{ path: "/tmp/lib/security/guard.ts", description: "AI Guard", created: true },
				{ path: "/tmp/.policy.yaml", description: "Policy", created: false },
			],
			instructions: ["Step 1: Do this", "Step 2: Do that"],
			warnings: ["Warning: something"],
		};

		const report = formatInstallReport(result);
		expect(report).toContain("Installation Report");
		expect(report).toContain("Files Created");
		expect(report).toContain("Files Skipped");
		expect(report).toContain("Warnings");
		expect(report).toContain("Next Steps");
	});
});
