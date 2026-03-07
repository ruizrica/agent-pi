// ABOUTME: /secure command extension — comprehensive AI security sweep and protection installer.
// ABOUTME: Scans projects for AI vulnerabilities (prompt injection, credential exposure) and installs portable security guards.
/**
 * /secure — AI Security Sweep & Protection Installer
 *
 * Subcommands:
 *   /secure           — Run full security sweep (scans project for AI vulnerabilities)
 *   /secure sweep     — Same as above
 *   /secure install   — Install AI protection files into current project
 *   /secure status    — Show current project's security posture (quick check)
 *   /secure report    — View last security report
 *
 * The sweep detects:
 *   - AI service usage (OpenAI, Anthropic, Cohere, LangChain, etc.)
 *   - Prompt injection vulnerabilities (unsanitized user input → AI)
 *   - Credential exposure (hardcoded API keys, unignored .env files)
 *   - System prompt leakage (prompts in client code or API responses)
 *   - Missing rate limiting on AI endpoints
 *   - Unsafe eval of AI outputs
 *   - Missing output filtering (XSS via AI responses)
 *
 * The installer generates:
 *   - Portable AI security guard (JS/TS/Python)
 *   - Security policy YAML
 *   - Framework-specific middleware (Express, Fastify, Next.js, Hono)
 *   - CI/CD security check workflow
 *   - .env.example with secure defaults
 *
 * Usage: Loaded via packages in agent/settings.json
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	runSweep,
	profileProject,
	formatSweepReport,
	type SweepResult,
} from "./lib/secure-engine.ts";
import {
	installProtections,
	formatInstallReport,
} from "./lib/secure-installer.ts";

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

let lastSweepResult: SweepResult | null = null;

// ═══════════════════════════════════════════════════════════════════
// Extension Entry Point
// ═══════════════════════════════════════════════════════════════════

export default function secure(pi: ExtensionAPI) {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	// ================================================================
	// /secure command
	// ================================================================

	pi.registerCommand("secure", {
		description: "AI Security — sweep for vulnerabilities, install protections [sweep|install|status|report]",
		handler: async (args, ctx) => {
			const subcommand = (args || "sweep").trim().toLowerCase().split(/\s+/)[0];
			const subArgs = (args || "").trim().slice(subcommand.length).trim();
			const cwd = ctx?.cwd || process.cwd();

			switch (subcommand) {
				case "sweep":
				case "scan":
					return handleSweep(cwd, ctx, pi);

				case "install":
				case "protect":
					return handleInstall(cwd, ctx, subArgs, pi);

				case "status":
				case "check":
					return handleStatus(cwd, ctx);

				case "report":
				case "last":
					return handleReport(ctx, pi);

				case "help":
					ctx.ui.notify(
						[
							"🛡️ /secure — AI Security Sweep & Protection",
							"",
							"Commands:",
							"  /secure              Run full security sweep",
							"  /secure sweep        Same as above",
							"  /secure install      Install AI protections into project",
							"  /secure install --overwrite  Overwrite existing files",
							"  /secure status       Quick security posture check",
							"  /secure report       View last sweep report",
							"  /secure help         Show this help",
						].join("\n"),
						"info",
					);
					break;

				default:
					// If unrecognized, treat as sweep with scope
					return handleSweep(cwd, ctx, pi);
			}
		},
	});

	// ================================================================
	// Session Lifecycle
	// ================================================================

	pi.on("session_start", async (_event, _ctx) => {
		lastSweepResult = null;
	});
}

// ═══════════════════════════════════════════════════════════════════
// Command Handlers
// ═══════════════════════════════════════════════════════════════════

async function handleSweep(cwd: string, ctx: any, pi: ExtensionAPI) {
	ctx.ui.notify("🔍 Running AI security sweep...", "info");

	try {
		const result = runSweep(cwd);
		lastSweepResult = result;

		// Generate and save report
		const report = formatSweepReport(result);
		const reportDir = join(cwd, ".pi");
		if (!existsSync(reportDir)) {
			try { mkdirSync(reportDir, { recursive: true }); } catch {}
		}
		const reportPath = join(reportDir, "security-sweep-report.md");
		writeFileSync(reportPath, report, "utf-8");

		// Summary notification
		const counts = { critical: 0, high: 0, medium: 0, low: 0 };
		for (const f of result.findings) {
			if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
		}

		const scoreIcon = result.score >= 80 ? "🟢" : result.score >= 60 ? "🟡" : result.score >= 40 ? "🟠" : "🔴";
		const summaryLines = [
			`🛡️ Security Sweep Complete`,
			``,
			`Score: ${scoreIcon} ${result.score}/100`,
			`Files scanned: ${result.profile.totalFiles}`,
			`AI services: ${result.profile.aiServices.map((s) => s.name).join(", ") || "None"}`,
			``,
			`Findings:`,
			`  🔴 Critical: ${counts.critical}`,
			`  🟠 High: ${counts.high}`,
			`  🟡 Medium: ${counts.medium}`,
			`  🔵 Low: ${counts.low}`,
			``,
			`Report saved to: ${reportPath}`,
		];

		ctx.ui.notify(summaryLines.join("\n"), counts.critical > 0 ? "error" : counts.high > 0 ? "warning" : "success");

		// Inject report as message so the agent can discuss findings
		pi.sendMessage(
			{
				customType: "security-sweep-result",
				content: report,
				display: true,
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	} catch (err) {
		ctx.ui.notify(`Security sweep failed: ${err}`, "error");
	}
}

async function handleInstall(cwd: string, ctx: any, args: string, pi: ExtensionAPI) {
	const overwrite = args.includes("--overwrite") || args.includes("-f");
	const dryRun = args.includes("--dry-run") || args.includes("-n");

	ctx.ui.notify(
		dryRun
			? "🛡️ Running dry-run installation (no files will be written)..."
			: "🛡️ Installing AI security protections...",
		"info",
	);

	try {
		const profile = profileProject(cwd);
		const result = installProtections(cwd, profile, { overwrite, dryRun });

		// Generate install report
		const report = formatInstallReport(result);

		// Save report
		const reportDir = join(cwd, ".pi");
		if (!existsSync(reportDir)) {
			try { mkdirSync(reportDir, { recursive: true }); } catch {}
		}
		const reportPath = join(reportDir, "security-install-report.md");
		writeFileSync(reportPath, report, "utf-8");

		const created = result.files.filter((f) => f.created).length;
		const skipped = result.files.filter((f) => !f.created).length;

		const summaryLines = [
			`🛡️ AI Security Protection ${dryRun ? "(Dry Run)" : "Installed"}`,
			``,
			`Files ${dryRun ? "would be " : ""}created: ${created}`,
			`Files skipped: ${skipped}`,
			`Warnings: ${result.warnings.length}`,
			``,
			`Report saved to: ${reportPath}`,
		];

		if (result.warnings.length > 0) {
			summaryLines.push(``, `Warnings:`);
			for (const w of result.warnings.slice(0, 5)) {
				summaryLines.push(`  ⚠️ ${w}`);
			}
		}

		ctx.ui.notify(summaryLines.join("\n"), result.warnings.length > 0 ? "warning" : "success");

		// Inject report
		pi.sendMessage(
			{
				customType: "security-install-result",
				content: report,
				display: true,
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	} catch (err) {
		ctx.ui.notify(`Installation failed: ${err}`, "error");
	}
}

async function handleStatus(cwd: string, ctx: any) {
	try {
		const profile = profileProject(cwd);

		const checks: Array<{ label: string; pass: boolean; detail: string }> = [];

		// AI services
		checks.push({
			label: "AI Services",
			pass: profile.aiServices.length > 0,
			detail: profile.aiServices.length > 0
				? profile.aiServices.map((s) => s.name).join(", ")
				: "None detected",
		});

		// .gitignore
		checks.push({
			label: ".gitignore",
			pass: profile.hasGitIgnore,
			detail: profile.hasGitIgnore ? "Present" : "MISSING — secrets may be committed!",
		});

		// .env check
		const gitignorePath = join(cwd, ".gitignore");
		let envIgnored = false;
		if (existsSync(gitignorePath)) {
			const gi = readFileSync(gitignorePath, "utf-8");
			envIgnored = /\.env/m.test(gi);
		}
		checks.push({
			label: ".env in .gitignore",
			pass: envIgnored,
			detail: envIgnored ? "Properly ignored" : ".env NOT in .gitignore — keys may leak!",
		});

		// Security guard presence
		const hasGuard = existsSync(join(cwd, "lib", "security", "ai-security-guard.ts"))
			|| existsSync(join(cwd, "lib", "security", "ai-security-guard.js"))
			|| existsSync(join(cwd, "lib", "security", "ai_security_guard.py"));
		checks.push({
			label: "AI Security Guard",
			pass: hasGuard,
			detail: hasGuard ? "Installed" : "Not installed — run /secure install",
		});

		// Security policy
		const hasPolicy = existsSync(join(cwd, ".ai-security-policy.yaml"));
		checks.push({
			label: "Security Policy",
			pass: hasPolicy,
			detail: hasPolicy ? "Present" : "Not found — run /secure install",
		});

		// CI checks
		checks.push({
			label: "CI Security Checks",
			pass: profile.hasCIConfig,
			detail: profile.hasCIConfig ? "Present" : "No CI pipeline detected",
		});

		// Rate limiting
		if (profile.languages.some((l) => l.includes("JavaScript"))) {
			const pkgPath = join(cwd, "package.json");
			let hasRateLimit = false;
			if (existsSync(pkgPath)) {
				try {
					const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
					const deps = { ...pkg.dependencies, ...pkg.devDependencies };
					hasRateLimit = !!(deps["express-rate-limit"] || deps["rate-limiter-flexible"]
						|| deps["bottleneck"] || deps["@upstash/ratelimit"]);
				} catch {}
			}
			checks.push({
				label: "Rate Limiting",
				pass: hasRateLimit,
				detail: hasRateLimit ? "Library detected" : "No rate limiting library found",
			});
		}

		// Format output
		const passCount = checks.filter((c) => c.pass).length;
		const totalChecks = checks.length;
		const score = Math.round((passCount / totalChecks) * 100);
		const scoreIcon = score >= 80 ? "🟢" : score >= 60 ? "🟡" : score >= 40 ? "🟠" : "🔴";

		const lines = [
			`🛡️ Security Status — ${profile.name}`,
			``,
			`Posture: ${scoreIcon} ${score}% (${passCount}/${totalChecks} checks passing)`,
			``,
		];

		for (const check of checks) {
			const icon = check.pass ? "✅" : "❌";
			lines.push(`${icon} ${check.label}: ${check.detail}`);
		}

		if (lastSweepResult) {
			lines.push(``);
			lines.push(`Last sweep: ${lastSweepResult.timestamp} — Score: ${lastSweepResult.score}/100, ${lastSweepResult.findings.length} findings`);
		}

		ctx.ui.notify(lines.join("\n"), score >= 80 ? "success" : score >= 60 ? "warning" : "error");
	} catch (err) {
		ctx.ui.notify(`Status check failed: ${err}`, "error");
	}
}

async function handleReport(ctx: any, pi: ExtensionAPI) {
	if (lastSweepResult) {
		const report = formatSweepReport(lastSweepResult);
		pi.sendMessage(
			{
				customType: "security-sweep-result",
				content: report,
				display: true,
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
		return;
	}

	// Try to load from file
	const cwd = ctx?.cwd || process.cwd();
	const reportPath = join(cwd, ".pi", "security-sweep-report.md");

	if (existsSync(reportPath)) {
		const content = readFileSync(reportPath, "utf-8");
		pi.sendMessage(
			{
				customType: "security-sweep-result",
				content,
				display: true,
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	} else {
		ctx.ui.notify("No security report found. Run /secure sweep first.", "info");
	}
}
