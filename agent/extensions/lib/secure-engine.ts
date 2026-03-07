// ABOUTME: Security sweep engine — scans projects for AI security vulnerabilities, prompt injection risks, and credential exposure.
// ABOUTME: Stateless detection functions for AI service identification, input validation gaps, and protection coverage analysis.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
	| "prompt_injection"
	| "credential_exposure"
	| "system_prompt_leakage"
	| "missing_input_validation"
	| "missing_output_filtering"
	| "missing_rate_limiting"
	| "insecure_ai_config"
	| "dependency_risk"
	| "data_exfiltration"
	| "missing_auth"
	| "unsafe_eval";

export interface SecurityFinding {
	severity: FindingSeverity;
	category: FindingCategory;
	title: string;
	description: string;
	file: string;
	line?: number;
	evidence?: string;
	recommendation: string;
}

export interface AIServiceInfo {
	name: string;
	sdk: string;
	files: string[];
	version?: string;
}

export interface ProjectProfile {
	name: string;
	root: string;
	languages: string[];
	frameworks: string[];
	aiServices: AIServiceInfo[];
	hasEnvFile: boolean;
	hasGitIgnore: boolean;
	hasCIConfig: boolean;
	entryPoints: string[];
	totalFiles: number;
}

export interface SweepResult {
	profile: ProjectProfile;
	findings: SecurityFinding[];
	score: number; // 0-100, higher = more secure
	timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════
// AI Service Detection
// ═══════════════════════════════════════════════════════════════════

interface AIServicePattern {
	name: string;
	sdk: string;
	importPattern: RegExp;
	envPattern: RegExp;
	callPattern: RegExp;
}

const AI_SERVICE_PATTERNS: AIServicePattern[] = [
	{
		name: "OpenAI",
		sdk: "openai",
		importPattern: /(?:require\s*\(\s*['"]openai['"]\)|from\s+['"]openai['"]|import\s+.*openai)/i,
		envPattern: /OPENAI_API_KEY|OPENAI_ORG/i,
		callPattern: /(?:openai\.(?:chat|completions|embeddings|images|audio|moderation)|ChatCompletion\.create|\.chat\.completions\.create)/i,
	},
	{
		name: "Anthropic",
		sdk: "@anthropic-ai/sdk",
		importPattern: /(?:require\s*\(\s*['"]@anthropic-ai\/sdk['"]\)|from\s+['"]@anthropic-ai\/sdk['"]|import\s+.*anthropic)/i,
		envPattern: /ANTHROPIC_API_KEY/i,
		callPattern: /(?:anthropic\.(?:messages|completions)|\.messages\.create|\.complete)/i,
	},
	{
		name: "Google AI / Gemini",
		sdk: "@google/generative-ai",
		importPattern: /(?:require\s*\(\s*['"]@google\/generative-ai['"]\)|from\s+['"]@google\/generative-ai['"]|import\s+.*generative.?ai)/i,
		envPattern: /GOOGLE_AI_KEY|GOOGLE_API_KEY|GEMINI_API_KEY/i,
		callPattern: /(?:generateContent|getGenerativeModel|gemini)/i,
	},
	{
		name: "Cohere",
		sdk: "cohere-ai",
		importPattern: /(?:require\s*\(\s*['"]cohere-ai['"]\)|from\s+['"]cohere-ai['"]|import\s+.*cohere)/i,
		envPattern: /COHERE_API_KEY|CO_API_KEY/i,
		callPattern: /(?:cohere\.(?:generate|chat|embed|classify|rerank))/i,
	},
	{
		name: "Hugging Face",
		sdk: "@huggingface/inference",
		importPattern: /(?:require\s*\(\s*['"]@huggingface\/inference['"]\)|from\s+['"]@huggingface\/inference['"]|huggingface)/i,
		envPattern: /HF_TOKEN|HUGGINGFACE_API_KEY|HF_API_KEY/i,
		callPattern: /(?:HfInference|textGeneration|chatCompletion)/i,
	},
	{
		name: "Mistral",
		sdk: "@mistralai/mistralai",
		importPattern: /(?:require\s*\(\s*['"]@mistralai['"]\)|from\s+['"]@mistralai['"]|import\s+.*mistral)/i,
		envPattern: /MISTRAL_API_KEY/i,
		callPattern: /(?:mistral\.(?:chat|complete|embed)|MistralClient)/i,
	},
	{
		name: "LangChain",
		sdk: "langchain",
		importPattern: /(?:require\s*\(\s*['"]langchain['"]\)|from\s+['"]langchain|from\s+['"]@langchain)/i,
		envPattern: /LANGCHAIN_API_KEY|LANGSMITH_API_KEY/i,
		callPattern: /(?:ChatOpenAI|ChatAnthropic|LLMChain|ConversationChain|AgentExecutor|RetrievalQA)/i,
	},
	{
		name: "Vercel AI SDK",
		sdk: "ai",
		importPattern: /(?:require\s*\(\s*['"]ai['"]\)|from\s+['"]ai['"]|from\s+['"]@ai-sdk)/i,
		envPattern: /OPENAI_API_KEY|ANTHROPIC_API_KEY/i,
		callPattern: /(?:generateText|streamText|generateObject|streamObject|useChat|useCompletion)/i,
	},
	{
		name: "Azure OpenAI",
		sdk: "@azure/openai",
		importPattern: /(?:require\s*\(\s*['"]@azure\/openai['"]\)|from\s+['"]@azure\/openai['"])/i,
		envPattern: /AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/i,
		callPattern: /(?:AzureOpenAI|getChatCompletions|getCompletions)/i,
	},
	{
		name: "Replicate",
		sdk: "replicate",
		importPattern: /(?:require\s*\(\s*['"]replicate['"]\)|from\s+['"]replicate['"])/i,
		envPattern: /REPLICATE_API_TOKEN/i,
		callPattern: /(?:replicate\.run|replicate\.predictions)/i,
	},
	// Python-specific
	{
		name: "OpenAI (Python)",
		sdk: "openai",
		importPattern: /(?:import\s+openai|from\s+openai\s+import)/i,
		envPattern: /OPENAI_API_KEY/i,
		callPattern: /(?:openai\.ChatCompletion|client\.chat\.completions|openai\.Completion)/i,
	},
	{
		name: "Anthropic (Python)",
		sdk: "anthropic",
		importPattern: /(?:import\s+anthropic|from\s+anthropic\s+import)/i,
		envPattern: /ANTHROPIC_API_KEY/i,
		callPattern: /(?:anthropic\.Anthropic|client\.messages\.create)/i,
	},
];

// ═══════════════════════════════════════════════════════════════════
// Vulnerability Patterns
// ═══════════════════════════════════════════════════════════════════

interface VulnPattern {
	pattern: RegExp;
	severity: FindingSeverity;
	category: FindingCategory;
	title: string;
	description: string;
	recommendation: string;
}

const VULN_PATTERNS: VulnPattern[] = [
	// ── Prompt Injection Vulnerabilities ──────────────────────
	{
		pattern: /(?:user(?:Input|Message|Content|Text|Prompt|Query)|req\.(?:body|query|params)\.[a-zA-Z]+|request\.[a-zA-Z]+).*(?:content|messages|prompt|system)/is,
		severity: "high",
		category: "prompt_injection",
		title: "Unsanitized user input in AI prompt",
		description: "User-controlled input appears to flow directly into an AI prompt without sanitization or validation.",
		recommendation: "Sanitize and validate all user inputs before including them in AI prompts. Use a dedicated input filter to strip injection patterns.",
	},
	{
		pattern: /(?:messages\s*[=:]\s*\[)[^]*?(?:role\s*[=:]\s*['"]user['"])[^]*?(?:\$\{|` ?\+|\.concat|f['"])/is,
		severity: "high",
		category: "prompt_injection",
		title: "Template injection in AI message construction",
		description: "AI messages are constructed using string interpolation/concatenation with potentially untrusted data.",
		recommendation: "Use parameterized message construction. Never interpolate raw user input into AI messages.",
	},
	{
		pattern: /(?:eval|Function|new\s+Function)\s*\(.*(?:response|completion|output|result|content|text)/is,
		severity: "critical",
		category: "unsafe_eval",
		title: "AI output passed to eval/Function constructor",
		description: "AI-generated output is being evaluated as code via eval() or the Function constructor. This is extremely dangerous — a prompt injection could lead to arbitrary code execution.",
		recommendation: "Never eval() AI outputs. Use structured output parsing (JSON.parse with validation) instead.",
	},
	{
		pattern: /(?:exec|execSync|spawn|spawnSync|execFile)\s*\(.*(?:response|completion|output|result|content|generated)/is,
		severity: "critical",
		category: "unsafe_eval",
		title: "AI output passed to shell execution",
		description: "AI-generated output is being passed to a shell command execution function. Prompt injection could lead to arbitrary command execution.",
		recommendation: "Never execute AI outputs as shell commands. If code execution is needed, use a sandboxed environment.",
	},

	// ── Credential Exposure ──────────────────────────────────
	{
		pattern: /(?:(?:api[_-]?key|secret|token|password|credential|auth)\s*[=:]\s*['"][A-Za-z0-9+/=_-]{20,}['"])/i,
		severity: "critical",
		category: "credential_exposure",
		title: "Hardcoded API key or secret",
		description: "A credential or API key appears to be hardcoded in the source code.",
		recommendation: "Move all secrets to environment variables. Use a secrets manager for production. Never commit secrets to version control.",
	},
	{
		pattern: /(?:sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9]{20,})/,
		severity: "critical",
		category: "credential_exposure",
		title: "OpenAI API key in source code",
		description: "An OpenAI API key (sk-...) is hardcoded in the source code.",
		recommendation: "Remove the key immediately, rotate it in the OpenAI dashboard, and use OPENAI_API_KEY environment variable instead.",
	},
	{
		pattern: /(?:sk-ant-[a-zA-Z0-9]{20,})/,
		severity: "critical",
		category: "credential_exposure",
		title: "Anthropic API key in source code",
		description: "An Anthropic API key (sk-ant-...) is hardcoded in the source code.",
		recommendation: "Remove the key immediately, rotate it, and use ANTHROPIC_API_KEY environment variable instead.",
	},
	{
		pattern: /(?:ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})/,
		severity: "critical",
		category: "credential_exposure",
		title: "GitHub token in source code",
		description: "A GitHub personal access token or OAuth token is hardcoded in the source code.",
		recommendation: "Remove the token, rotate it on GitHub, and use environment variables.",
	},

	// ── System Prompt Leakage ────────────────────────────────
	{
		pattern: /(?:system\s*(?:prompt|message|instruction)\s*[=:]).{50,}/is,
		severity: "medium",
		category: "system_prompt_leakage",
		title: "System prompt defined in client-accessible code",
		description: "A system prompt is defined in code that may be accessible to clients (frontend, API response, etc.).",
		recommendation: "Store system prompts server-side only. Never expose them in client bundles, API responses, or source maps.",
	},
	{
		pattern: /(?:(?:res|response)\.(?:json|send|write)\s*\([^)]*(?:system.*prompt|instruction|systemMessage))/is,
		severity: "high",
		category: "system_prompt_leakage",
		title: "System prompt potentially exposed in API response",
		description: "A system prompt or instruction may be included in an API response sent to clients.",
		recommendation: "Never include system prompts in API responses. Filter them from any data sent to clients.",
	},

	// ── Missing Input Validation ─────────────────────────────
	{
		pattern: /(?:req\.body\.[a-zA-Z]+|request\.json|request\.form)\s*(?:\)|\])?(?:\s*[,;)]|\s*$)/im,
		severity: "medium",
		category: "missing_input_validation",
		title: "Request input used without validation",
		description: "Request body data is used without apparent validation or sanitization.",
		recommendation: "Validate all request inputs using a schema validator (Zod, Joi, etc.) before processing.",
	},

	// ── Missing Rate Limiting ────────────────────────────────
	{
		pattern: /(?:app\.(?:post|get|put|patch|delete)|router\.(?:post|get|put|patch|delete))\s*\(\s*['"][^'"]*(?:ai|chat|completion|generate|llm|gpt|claude|prompt)[^'"]*['"]/i,
		severity: "medium",
		category: "missing_rate_limiting",
		title: "AI endpoint without apparent rate limiting",
		description: "An API endpoint that handles AI/LLM requests does not appear to have rate limiting middleware.",
		recommendation: "Add rate limiting to all AI endpoints to prevent abuse and cost overruns. Use express-rate-limit, bottleneck, or similar.",
	},

	// ── Missing Output Filtering ─────────────────────────────
	{
		pattern: /(?:innerHTML|dangerouslySetInnerHTML|v-html)\s*[=:]\s*(?:.*(?:response|completion|output|result|content|generated|aiResponse|llmOutput))/is,
		severity: "high",
		category: "missing_output_filtering",
		title: "AI output rendered as raw HTML",
		description: "AI-generated output is being rendered as raw HTML without sanitization. An injection attack could produce malicious HTML/JS.",
		recommendation: "Always sanitize AI outputs before rendering as HTML. Use DOMPurify or a similar library. Prefer text rendering over HTML.",
	},

	// ── Insecure AI Configuration ────────────────────────────
	{
		pattern: /(?:temperature\s*[=:]\s*(?:1\.?\d*|2))/i,
		severity: "low",
		category: "insecure_ai_config",
		title: "High temperature setting in AI configuration",
		description: "AI model temperature is set very high, which increases output randomness and unpredictability.",
		recommendation: "Use lower temperature (0.0-0.7) for tasks requiring consistency and safety. Reserve high temperature for creative tasks only.",
	},
	{
		pattern: /(?:max_tokens\s*[=:]\s*(?:[0-9]{5,}))/i,
		severity: "low",
		category: "insecure_ai_config",
		title: "Very high max_tokens setting",
		description: "Max tokens is set very high, which could lead to excessive costs or enable large prompt injection responses.",
		recommendation: "Set max_tokens to the minimum needed for your use case. Monitor token usage and set billing limits.",
	},

	// ── Data Exfiltration ────────────────────────────────────
	{
		pattern: /(?:function_call|tool_use|tools)\s*[=:][^]*?(?:url|fetch|http|request|axios|got\s*\()/is,
		severity: "high",
		category: "data_exfiltration",
		title: "AI tool/function calling with network access",
		description: "AI function calling or tool use configuration allows network requests. A prompt injection could instruct the AI to exfiltrate data via tool calls.",
		recommendation: "Restrict AI tool capabilities to a minimum. Validate all tool call parameters. Block network-accessing tools or whitelist allowed URLs.",
	},
];

// ═══════════════════════════════════════════════════════════════════
// File Scanning Helpers
// ═══════════════════════════════════════════════════════════════════

const SCAN_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
	".py", ".pyw",
	".rb",
	".go",
	".rs",
	".java", ".kt", ".kts",
	".swift",
	".php",
	".yaml", ".yml",
	".json",
	".env",
	".toml",
	".cfg", ".ini", ".conf",
]);

const SKIP_DIRS = new Set([
	"node_modules", ".git", ".next", ".nuxt", "dist", "build",
	"__pycache__", ".pytest_cache", "venv", ".venv", "env",
	".tox", "target", "vendor", ".bundle", "Pods",
	".gradle", ".idea", ".vscode", "coverage", ".nyc_output",
	".turbo", ".cache", ".parcel-cache",
]);

const MAX_FILE_SIZE = 512 * 1024; // 512KB - skip very large files
const MAX_FILES = 5000; // Safety limit

/**
 * Walk a directory tree, yielding file paths that should be scanned.
 */
export function* walkProjectFiles(root: string, maxFiles = MAX_FILES): Generator<string> {
	let count = 0;

	function* walk(dir: string): Generator<string> {
		if (count >= maxFiles) return;

		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (count >= maxFiles) return;

			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
				yield* walk(fullPath);
			} else if (entry.isFile()) {
				const ext = extname(entry.name).toLowerCase();
				if (!SCAN_EXTENSIONS.has(ext) && !entry.name.startsWith(".env")) continue;

				try {
					const stat = statSync(fullPath);
					if (stat.size > MAX_FILE_SIZE) continue;
				} catch {
					continue;
				}

				count++;
				yield fullPath;
			}
		}
	}

	yield* walk(root);
}

/**
 * Read a file safely, returning null on error.
 */
function safeRead(path: string): string | null {
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return null;
	}
}

// ═══════════════════════════════════════════════════════════════════
// Project Profiling
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect the project's languages, frameworks, and AI services.
 */
export function profileProject(root: string): ProjectProfile {
	const profile: ProjectProfile = {
		name: root.split("/").pop() || "unknown",
		root,
		languages: [],
		frameworks: [],
		aiServices: [],
		hasEnvFile: false,
		hasGitIgnore: false,
		hasCIConfig: false,
		entryPoints: [],
		totalFiles: 0,
	};

	// Check for manifest files
	const packageJsonPath = join(root, "package.json");
	const pyprojectPath = join(root, "pyproject.toml");
	const requirementsPath = join(root, "requirements.txt");
	const goModPath = join(root, "go.mod");
	const cargoTomlPath = join(root, "Cargo.toml");

	if (existsSync(packageJsonPath)) {
		profile.languages.push("JavaScript/TypeScript");
		try {
			const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			profile.name = pkg.name || profile.name;
			const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

			// Detect frameworks
			if (allDeps["next"]) profile.frameworks.push("Next.js");
			if (allDeps["express"]) profile.frameworks.push("Express");
			if (allDeps["fastify"]) profile.frameworks.push("Fastify");
			if (allDeps["react"]) profile.frameworks.push("React");
			if (allDeps["vue"]) profile.frameworks.push("Vue");
			if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) profile.frameworks.push("Svelte");
			if (allDeps["hono"]) profile.frameworks.push("Hono");
			if (allDeps["nestjs"] || allDeps["@nestjs/core"]) profile.frameworks.push("NestJS");

			// Detect AI SDKs from dependencies
			for (const svc of AI_SERVICE_PATTERNS) {
				if (allDeps[svc.sdk]) {
					const existing = profile.aiServices.find((s) => s.name === svc.name);
					if (!existing) {
						profile.aiServices.push({
							name: svc.name,
							sdk: svc.sdk,
							files: [],
							version: allDeps[svc.sdk],
						});
					}
				}
			}
		} catch {}
	}

	if (existsSync(pyprojectPath) || existsSync(requirementsPath)) {
		profile.languages.push("Python");
	}
	if (existsSync(goModPath)) profile.languages.push("Go");
	if (existsSync(cargoTomlPath)) profile.languages.push("Rust");

	// Check for env file, gitignore, CI
	profile.hasEnvFile = existsSync(join(root, ".env")) || existsSync(join(root, ".env.local"));
	profile.hasGitIgnore = existsSync(join(root, ".gitignore"));
	profile.hasCIConfig = existsSync(join(root, ".github/workflows")) || existsSync(join(root, ".gitlab-ci.yml"));

	// Detect entry points
	for (const candidate of [
		"src/index.ts", "src/index.js", "src/main.ts", "src/main.js",
		"src/app.ts", "src/app.js", "src/server.ts", "src/server.js",
		"index.ts", "index.js", "main.ts", "main.js",
		"app.ts", "app.js", "server.ts", "server.js",
		"app/page.tsx", "app/layout.tsx", "pages/index.tsx",
		"main.py", "app.py", "server.py", "manage.py",
		"main.go", "cmd/main.go",
	]) {
		if (existsSync(join(root, candidate))) {
			profile.entryPoints.push(candidate);
		}
	}

	return profile;
}

// ═══════════════════════════════════════════════════════════════════
// Security Scanning
// ═══════════════════════════════════════════════════════════════════

/**
 * Scan a single file for AI security vulnerabilities.
 */
export function scanFile(filePath: string, content: string, profile: ProjectProfile): SecurityFinding[] {
	const findings: SecurityFinding[] = [];
	const relPath = relative(profile.root, filePath);

	// ── Detect AI service imports in this file ────────────────
	for (const svc of AI_SERVICE_PATTERNS) {
		if (svc.importPattern.test(content) || svc.callPattern.test(content)) {
			const existing = profile.aiServices.find((s) => s.name === svc.name);
			if (existing) {
				if (!existing.files.includes(relPath)) existing.files.push(relPath);
			} else {
				profile.aiServices.push({ name: svc.name, sdk: svc.sdk, files: [relPath] });
			}
		}
	}

	// ── Scan for vulnerability patterns ──────────────────────
	const lines = content.split("\n");

	for (const vuln of VULN_PATTERNS) {
		const match = vuln.pattern.exec(content);
		if (match) {
			// Find the line number
			const beforeMatch = content.slice(0, match.index);
			const lineNum = beforeMatch.split("\n").length;

			// Extract evidence (the matching line and surrounding context)
			const evidenceStart = Math.max(0, lineNum - 2);
			const evidenceEnd = Math.min(lines.length, lineNum + 2);
			const evidence = lines.slice(evidenceStart, evidenceEnd).join("\n");

			findings.push({
				severity: vuln.severity,
				category: vuln.category,
				title: vuln.title,
				description: vuln.description,
				file: relPath,
				line: lineNum,
				evidence: truncateEvidence(evidence, 300),
				recommendation: vuln.recommendation,
			});
		}
	}

	// ── Check for env vars with AI keys in .env files ────────
	if (filePath.includes(".env")) {
		for (const svc of AI_SERVICE_PATTERNS) {
			if (svc.envPattern.test(content)) {
				// Check if value is actually present (not just a placeholder)
				const envMatch = content.match(new RegExp(`${svc.envPattern.source}\\s*=\\s*(.+)`, "im"));
				if (envMatch && envMatch[1]) {
					const value = envMatch[1].trim();
					// Skip obvious placeholders
					if (value && !value.match(/^(your[_-]?|xxx|placeholder|changeme|TODO|FIXME|<|"|')/i) && value.length > 10) {
						// Check if .env is in .gitignore
						const gitignorePath = join(profile.root, ".gitignore");
						let envIgnored = false;
						if (existsSync(gitignorePath)) {
							const gitignore = safeRead(gitignorePath) || "";
							envIgnored = /\.env/m.test(gitignore);
						}

						if (!envIgnored) {
							findings.push({
								severity: "critical",
								category: "credential_exposure",
								title: `${svc.name} API key in unignored .env file`,
								description: `.env file contains a ${svc.name} API key but .env is not in .gitignore. This key will be committed to version control.`,
								file: relPath,
								recommendation: "Add .env to .gitignore immediately. Rotate the exposed key. Use a secrets manager for production.",
							});
						}
					}
				}
			}
		}
	}

	return findings;
}

/**
 * Run a full security sweep on a project.
 */
export function runSweep(root: string): SweepResult {
	const profile = profileProject(root);
	const allFindings: SecurityFinding[] = [];

	let fileCount = 0;
	for (const filePath of walkProjectFiles(root)) {
		fileCount++;
		const content = safeRead(filePath);
		if (!content) continue;

		const findings = scanFile(filePath, content, profile);
		allFindings.push(...findings);
	}

	profile.totalFiles = fileCount;

	// ── Structural checks (project-level findings) ───────────
	addStructuralFindings(profile, allFindings);

	// ── Calculate security score ─────────────────────────────
	const score = calculateScore(allFindings);

	// ── Deduplicate findings ─────────────────────────────────
	const dedupedFindings = deduplicateFindings(allFindings);

	// Sort by severity
	const severityOrder: Record<FindingSeverity, number> = {
		critical: 0, high: 1, medium: 2, low: 3, info: 4,
	};
	dedupedFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

	return {
		profile,
		findings: dedupedFindings,
		score,
		timestamp: new Date().toISOString(),
	};
}

// ═══════════════════════════════════════════════════════════════════
// Structural Analysis
// ═══════════════════════════════════════════════════════════════════

function addStructuralFindings(profile: ProjectProfile, findings: SecurityFinding[]) {
	// Check if project uses AI but has no apparent security measures
	if (profile.aiServices.length > 0) {
		// No .gitignore
		if (!profile.hasGitIgnore) {
			findings.push({
				severity: "high",
				category: "credential_exposure",
				title: "No .gitignore file in AI project",
				description: "This project uses AI services but has no .gitignore. API keys and .env files could be committed to version control.",
				file: ".gitignore",
				recommendation: "Create a .gitignore that excludes .env*, *.pem, *.key, and other sensitive files.",
			});
		}

		// No CI security checks
		if (!profile.hasCIConfig) {
			findings.push({
				severity: "low",
				category: "dependency_risk",
				title: "No CI/CD pipeline for security checks",
				description: "No CI configuration detected. Automated security scanning is recommended for AI projects.",
				file: ".github/workflows/",
				recommendation: "Add a CI pipeline with dependency auditing, secret scanning, and security linting.",
			});
		}

		// Check if rate limiting libraries are present
		if (profile.languages.includes("JavaScript/TypeScript")) {
			const pkgPath = join(profile.root, "package.json");
			if (existsSync(pkgPath)) {
				try {
					const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
					const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
					const hasRateLimiting = allDeps["express-rate-limit"] || allDeps["rate-limiter-flexible"]
						|| allDeps["bottleneck"] || allDeps["p-limit"] || allDeps["@upstash/ratelimit"];

					if (!hasRateLimiting && (profile.frameworks.includes("Express") || profile.frameworks.includes("Fastify") || profile.frameworks.includes("Next.js"))) {
						findings.push({
							severity: "medium",
							category: "missing_rate_limiting",
							title: "No rate limiting library detected",
							description: "This AI-powered web project doesn't appear to use a rate limiting library. AI endpoints are vulnerable to abuse.",
							file: "package.json",
							recommendation: "Install a rate limiting library (express-rate-limit, @upstash/ratelimit, bottleneck) and apply it to AI endpoints.",
						});
					}
				} catch {}
			}
		}
	}
}

// ═══════════════════════════════════════════════════════════════════
// Scoring
// ═══════════════════════════════════════════════════════════════════

function calculateScore(findings: SecurityFinding[]): number {
	let score = 100;

	for (const f of findings) {
		switch (f.severity) {
			case "critical": score -= 20; break;
			case "high": score -= 10; break;
			case "medium": score -= 5; break;
			case "low": score -= 2; break;
			case "info": break;
		}
	}

	return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════════
// Deduplication
// ═══════════════════════════════════════════════════════════════════

function deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
	const seen = new Set<string>();
	const result: SecurityFinding[] = [];

	for (const f of findings) {
		const key = `${f.category}::${f.title}::${f.file}::${f.line || 0}`;
		if (!seen.has(key)) {
			seen.add(key);
			result.push(f);
		}
	}

	return result;
}

// ═══════════════════════════════════════════════════════════════════
// Report Formatting
// ═══════════════════════════════════════════════════════════════════

const SEVERITY_ICONS: Record<FindingSeverity, string> = {
	critical: "🔴",
	high: "🟠",
	medium: "🟡",
	low: "🔵",
	info: "ℹ️",
};

/**
 * Format a sweep result as a markdown report.
 */
export function formatSweepReport(result: SweepResult): string {
	const { profile, findings, score, timestamp } = result;
	const lines: string[] = [];

	lines.push(`# Security Sweep Report`);
	lines.push(``);
	lines.push(`**Project:** ${profile.name}`);
	lines.push(`**Root:** \`${profile.root}\``);
	lines.push(`**Languages:** ${profile.languages.join(", ") || "Unknown"}`);
	lines.push(`**Frameworks:** ${profile.frameworks.join(", ") || "None detected"}`);
	lines.push(`**Files Scanned:** ${profile.totalFiles}`);
	lines.push(`**Date:** ${timestamp}`);
	lines.push(``);

	// Score
	const scoreLabel = score >= 80 ? "Good" : score >= 60 ? "Needs Work" : score >= 40 ? "At Risk" : "Critical";
	const scoreIcon = score >= 80 ? "🟢" : score >= 60 ? "🟡" : score >= 40 ? "🟠" : "🔴";
	lines.push(`## Security Score: ${scoreIcon} ${score}/100 (${scoreLabel})`);
	lines.push(``);

	// AI Services
	if (profile.aiServices.length > 0) {
		lines.push(`## AI Services Detected`);
		lines.push(``);
		for (const svc of profile.aiServices) {
			lines.push(`- **${svc.name}** (\`${svc.sdk}\`${svc.version ? ` v${svc.version}` : ""})`);
			if (svc.files.length > 0) {
				for (const f of svc.files.slice(0, 5)) {
					lines.push(`  - \`${f}\``);
				}
				if (svc.files.length > 5) {
					lines.push(`  - ... and ${svc.files.length - 5} more`);
				}
			}
		}
		lines.push(``);
	} else {
		lines.push(`## AI Services: None detected`);
		lines.push(``);
	}

	// Summary
	const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
	for (const f of findings) counts[f.severity]++;

	lines.push(`## Findings Summary`);
	lines.push(``);
	lines.push(`| Severity | Count |`);
	lines.push(`|----------|-------|`);
	lines.push(`| ${SEVERITY_ICONS.critical} Critical | ${counts.critical} |`);
	lines.push(`| ${SEVERITY_ICONS.high} High | ${counts.high} |`);
	lines.push(`| ${SEVERITY_ICONS.medium} Medium | ${counts.medium} |`);
	lines.push(`| ${SEVERITY_ICONS.low} Low | ${counts.low} |`);
	lines.push(``);

	// Findings detail
	if (findings.length > 0) {
		lines.push(`## Findings`);
		lines.push(``);

		let counter = 1;
		for (const f of findings) {
			const id = `SEC-${String(counter).padStart(3, "0")}`;
			lines.push(`### ${id}: ${SEVERITY_ICONS[f.severity]} ${f.title}`);
			lines.push(``);
			lines.push(`- **Severity:** ${f.severity.toUpperCase()}`);
			lines.push(`- **Category:** ${f.category.replace(/_/g, " ")}`);
			lines.push(`- **File:** \`${f.file}${f.line ? `:${f.line}` : ""}\``);
			lines.push(`- **Description:** ${f.description}`);
			if (f.evidence) {
				lines.push(`- **Evidence:**`);
				lines.push(`  \`\`\``);
				lines.push(`  ${f.evidence}`);
				lines.push(`  \`\`\``);
			}
			lines.push(`- **Recommendation:** ${f.recommendation}`);
			lines.push(``);
			counter++;
		}
	} else {
		lines.push(`## No Security Findings`);
		lines.push(``);
		lines.push(`No AI security vulnerabilities were detected. Your project's security posture looks good.`);
		lines.push(``);
	}

	return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function truncateEvidence(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + "...";
}
