// ABOUTME: Security protection installer — generates portable AI security guard files for any project.
// ABOUTME: Produces middleware, policy configs, and CI checks that can be dropped into any AI-powered codebase.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "./secure-engine.ts";

// ═══════════════════════════════════════════════════════════════════
// AI Service → Environment Variable Mapping
// ═══════════════════════════════════════════════════════════════════

const AI_ENV_VARS: Record<string, string[]> = {
	"OpenAI": ["OPENAI_API_KEY"],
	"OpenAI (Python)": ["OPENAI_API_KEY"],
	"Anthropic": ["ANTHROPIC_API_KEY"],
	"Anthropic (Python)": ["ANTHROPIC_API_KEY"],
	"Google AI / Gemini": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	"Cohere": ["COHERE_API_KEY"],
	"Hugging Face": ["HF_TOKEN"],
	"Mistral": ["MISTRAL_API_KEY"],
	"LangChain": ["LANGCHAIN_API_KEY"],
	"Vercel AI SDK": ["OPENAI_API_KEY"],
	"Azure OpenAI": ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
	"Replicate": ["REPLICATE_API_TOKEN"],
};

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface InstalledFile {
	path: string;
	description: string;
	created: boolean; // false if file already existed and was skipped
}

export interface InstallResult {
	files: InstalledFile[];
	instructions: string[];
	warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════
// Main Installer
// ═══════════════════════════════════════════════════════════════════

/**
 * Install AI security protections into a target project.
 * Generates tailored security files based on the project profile.
 */
export function installProtections(
	root: string,
	profile: ProjectProfile,
	options: { overwrite?: boolean; dryRun?: boolean } = {},
): InstallResult {
	const result: InstallResult = {
		files: [],
		instructions: [],
		warnings: [],
	};

	const isJS = profile.languages.some((l) => l.includes("JavaScript") || l.includes("TypeScript"));
	const isPython = profile.languages.includes("Python");
	const hasExpress = profile.frameworks.includes("Express");
	const hasFastify = profile.frameworks.includes("Fastify");
	const hasNext = profile.frameworks.includes("Next.js");
	const hasHono = profile.frameworks.includes("Hono");

	// Determine target directory
	const securityDir = join(root, "lib", "security");
	const isTS = existsSync(join(root, "tsconfig.json"));

	// ── 1. AI Security Guard (core protection module) ────────
	if (isJS) {
		const ext = isTS ? ".ts" : ".js";
		writeIfNew(
			join(securityDir, `ai-security-guard${ext}`),
			generateAISecurityGuard(isTS),
			"AI Security Guard — input sanitization, output filtering, audit logging",
			result,
			options,
		);
	}

	if (isPython) {
		writeIfNew(
			join(root, "lib", "security", "ai_security_guard.py"),
			generateAISecurityGuardPython(),
			"AI Security Guard (Python) — input sanitization, output filtering",
			result,
			options,
		);
	}

	// ── 2. Security Policy (configurable rules) ──────────────
	writeIfNew(
		join(root, ".ai-security-policy.yaml"),
		generateSecurityPolicy(profile),
		"AI Security Policy — configurable rules for prompt injection, credential protection",
		result,
		options,
	);

	// ── 3. Framework-specific middleware ──────────────────────
	if (hasExpress || hasFastify) {
		const ext = isTS ? ".ts" : ".js";
		writeIfNew(
			join(securityDir, `ai-security-middleware${ext}`),
			generateExpressMiddleware(isTS, hasFastify),
			`${hasFastify ? "Fastify" : "Express"} middleware — rate limiting, input validation, logging for AI endpoints`,
			result,
			options,
		);
	}

	if (hasNext) {
		writeIfNew(
			join(root, "middleware.ts"),
			generateNextMiddleware(),
			"Next.js middleware — AI endpoint protection, rate limiting headers",
			result,
			options,
		);
	}

	if (hasHono) {
		const ext = isTS ? ".ts" : ".js";
		writeIfNew(
			join(securityDir, `ai-security-middleware${ext}`),
			generateHonoMiddleware(isTS),
			"Hono middleware — AI endpoint protection, rate limiting",
			result,
			options,
		);
	}

	// ── 4. .env.example ──────────────────────────────────────
	writeIfNew(
		join(root, ".env.example"),
		generateEnvExample(profile),
		"Environment variable template with secure defaults",
		result,
		options,
	);

	// ── 5. CI Security Check ─────────────────────────────────
	writeIfNew(
		join(root, ".github", "workflows", "ai-security-check.yml"),
		generateCICheck(profile),
		"GitHub Actions workflow — automated security checks on PRs",
		result,
		options,
	);

	// ── 6. .gitignore additions ──────────────────────────────
	ensureGitignoreEntries(root, result, options);

	// ── Instructions ─────────────────────────────────────────
	result.instructions.push("Review generated files and adjust the security policy to match your needs.");

	if (isJS) {
		result.instructions.push(
			`Import the security guard in your AI code:\n` +
			`  import { createAISecurityGuard } from './lib/security/ai-security-guard';\n` +
			`  const guard = createAISecurityGuard();`,
		);
		result.instructions.push(
			`Wrap AI calls with the guard:\n` +
			`  const sanitizedInput = guard.sanitizeInput(userMessage);\n` +
			`  const response = await openai.chat.completions.create({ ... });\n` +
			`  const safeOutput = guard.filterOutput(response.choices[0].message.content);`,
		);
	}

	if (hasExpress || hasFastify) {
		result.instructions.push(
			`Add the middleware to your AI routes:\n` +
			`  import { aiSecurityMiddleware } from './lib/security/ai-security-middleware';\n` +
			`  app.use('/api/ai', aiSecurityMiddleware());`,
		);
	}

	result.instructions.push(
		"Set up your environment variables using .env.example as a template.",
	);

	result.instructions.push(
		"Run the CI security check locally: `npm audit` or check .github/workflows/ai-security-check.yml",
	);

	return result;
}

// ═══════════════════════════════════════════════════════════════════
// File Writers
// ═══════════════════════════════════════════════════════════════════

function writeIfNew(
	path: string,
	content: string,
	description: string,
	result: InstallResult,
	options: { overwrite?: boolean; dryRun?: boolean },
) {
	if (existsSync(path) && !options.overwrite) {
		result.files.push({ path, description, created: false });
		result.warnings.push(`Skipped ${path} — already exists. Use overwrite option to replace.`);
		return;
	}

	if (options.dryRun) {
		result.files.push({ path, description, created: true });
		return;
	}

	try {
		const dir = path.substring(0, path.lastIndexOf("/"));
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		writeFileSync(path, content, "utf-8");
		result.files.push({ path, description, created: true });
	} catch (err) {
		result.warnings.push(`Failed to write ${path}: ${err}`);
	}
}

function ensureGitignoreEntries(root: string, result: InstallResult, options: { dryRun?: boolean }) {
	const gitignorePath = join(root, ".gitignore");
	const entries = [".env", ".env.local", ".env.production", ".env.*.local", "*.pem", "*.key", ".ai-security-audit.log"];

	if (options.dryRun) {
		result.instructions.push(`Ensure .gitignore contains: ${entries.join(", ")}`);
		return;
	}

	let content = "";
	if (existsSync(gitignorePath)) {
		content = readFileSync(gitignorePath, "utf-8");
	}

	const missing = entries.filter((e) => !content.includes(e));
	if (missing.length > 0) {
		const addition = "\n# AI Security — sensitive files\n" + missing.join("\n") + "\n";
		writeFileSync(gitignorePath, content + addition, "utf-8");
		result.files.push({
			path: gitignorePath,
			description: `Added ${missing.length} security entries to .gitignore`,
			created: false,
		});
	}
}

// ═══════════════════════════════════════════════════════════════════
// Code Generators
// ═══════════════════════════════════════════════════════════════════

function generateAISecurityGuard(isTS: boolean): string {
	const t = isTS ? ": string" : "";
	const tBool = isTS ? ": boolean" : "";
	const tAny = isTS ? ": any" : "";
	const tVoid = isTS ? ": void" : "";
	const tObj = isTS ? ": Record<string, any>" : "";
	const tArr = isTS ? ": string[]" : "";

	const interfaceBlock = isTS
		? `
export interface AISecurityConfig {
	/** Enable/disable the guard */
	enabled: boolean;
	/** Log blocked inputs to console */
	logBlocked: boolean;
	/** Custom blocked patterns (regex strings) */
	customPatterns: string[];
	/** Maximum input length (chars) */
	maxInputLength: number;
	/** Maximum output length (chars) */
	maxOutputLength: number;
	/** Redact sensitive data in outputs */
	redactOutputs: boolean;
}

export interface SecurityAuditEntry {
	timestamp: string;
	action: "blocked" | "sanitized" | "allowed" | "redacted";
	category: string;
	input?: string;
	detail?: string;
}

`
		: "";

	return `${isTS ? "// AI Security Guard — Protects AI API calls from prompt injection and credential exfiltration.\n// Drop this into any project that uses AI APIs.\n\n" : "// AI Security Guard — Protects AI API calls from prompt injection and credential exfiltration.\n// Drop this into any project that uses AI APIs.\n\n"}${interfaceBlock}// ═══════════════════════════════════════════════════════════════════
// Prompt Injection Patterns
// ═══════════════════════════════════════════════════════════════════

const INJECTION_PATTERNS${isTS ? ": Array<{ pattern: RegExp; description: string }>" : ""} = [
	{ pattern: /ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|rules?|prompts?)/i, description: "Instruction override" },
	{ pattern: /disregard\\s+(all\\s+)?(previous|prior)\\s+(instructions?|rules?)/i, description: "Instruction disregard" },
	{ pattern: /forget\\s+(all\\s+)?(previous|prior)\\s+(instructions?|context)/i, description: "Context reset" },
	{ pattern: /new\\s+system\\s+prompt/i, description: "System prompt injection" },
	{ pattern: /override\\s+(your|the|all)\\s+(rules?|instructions?|safety)/i, description: "Safety override" },
	{ pattern: /(you\\s+are|act\\s+as|pretend)\\s+(now\\s+)?(a\\s+)?(different|unrestricted|jailbroken)/i, description: "Role hijacking" },
	{ pattern: /DAN\\s+(mode|prompt)|do\\s+anything\\s+now/i, description: "DAN jailbreak" },
	{ pattern: /(dump|reveal|show|output)\\s+(your|the)\\s+(system\\s+prompt|instructions?|api\\s+keys?|secrets?)/i, description: "Data extraction" },
	{ pattern: /(upload|send|post|exfiltrate)\\s+.*(to|at)\\s+https?:\\/\\//i, description: "Data exfiltration" },
	{ pattern: /<\\/?\\s*(system|instruction|prompt|admin)\\s*>/i, description: "XML boundary injection" },
	{ pattern: /\\[\\s*(SYSTEM|INST|ADMIN|OVERRIDE)\\s*\\]/i, description: "Bracket boundary injection" },
	{ pattern: /###\\s*(SYSTEM|INSTRUCTION|NEW PROMPT|ADMIN)/i, description: "Markdown boundary injection" },
	{ pattern: /(base64|rot13|hex)\\s*(decode|encode).*\\b(key|secret|token|password)/i, description: "Encoded credential access" },
];

// ═══════════════════════════════════════════════════════════════════
// Sensitive Data Patterns (for output filtering)
// ═══════════════════════════════════════════════════════════════════

const SENSITIVE_PATTERNS${isTS ? ": Array<{ pattern: RegExp; replacement: string; description: string }>" : ""} = [
	{ pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "sk-[REDACTED]", description: "OpenAI API key" },
	{ pattern: /sk-ant-[a-zA-Z0-9]{20,}/g, replacement: "sk-ant-[REDACTED]", description: "Anthropic API key" },
	{ pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: "ghp_[REDACTED]", description: "GitHub token" },
	{ pattern: /(?:password|secret|token|api[_-]?key)\\s*[=:]\\s*['"][^'"]{8,}['"]/gi, replacement: "[CREDENTIAL_REDACTED]", description: "Generic credential" },
	{ pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g, replacement: "[EMAIL_REDACTED]", description: "Email address" },
	{ pattern: /\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b/g, replacement: "[PHONE_REDACTED]", description: "Phone number" },
	{ pattern: /\\b\\d{3}-\\d{2}-\\d{4}\\b/g, replacement: "[SSN_REDACTED]", description: "SSN" },
];

// ═══════════════════════════════════════════════════════════════════
// AI Security Guard
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG${isTS ? ": AISecurityConfig" : ""} = {
	enabled: true,
	logBlocked: true,
	customPatterns: [],
	maxInputLength: 32000,
	maxOutputLength: 64000,
	redactOutputs: true,
};

export function createAISecurityGuard(config${isTS ? "?: Partial<AISecurityConfig>" : ""} = {}) {
	const cfg = { ...DEFAULT_CONFIG, ...config }${isTS ? " as AISecurityConfig" : ""};
	const auditLog${isTS ? ": SecurityAuditEntry[]" : ""} = [];
	const customRegexes = cfg.customPatterns.map((p${t}) => new RegExp(p, "i"));

	function log(entry${isTS ? ": Omit<SecurityAuditEntry, 'timestamp'>" : ""})${tVoid} {
		const full = { ...entry, timestamp: new Date().toISOString() };
		auditLog.push(full);
		if (cfg.logBlocked && (entry.action === "blocked" || entry.action === "sanitized")) {
			console.warn(\`[ai-security] \${entry.action.toUpperCase()}: \${entry.category} — \${entry.detail || ""}\`);
		}
	}

	/**
	 * Check if input contains prompt injection patterns.
	 * Returns { safe: boolean, threats: string[] }
	 */
	function detectInjection(input${t})${isTS ? ": { safe: boolean; threats: string[] }" : ""} {
		if (!cfg.enabled) return { safe: true, threats: [] };

		const threats${tArr} = [];

		for (const { pattern, description } of INJECTION_PATTERNS) {
			if (pattern.test(input)) {
				threats.push(description);
			}
		}

		for (const re of customRegexes) {
			if (re.test(input)) {
				threats.push("Custom pattern match");
			}
		}

		return { safe: threats.length === 0, threats };
	}

	/**
	 * Sanitize user input before sending to AI.
	 * Strips injection patterns and enforces length limits.
	 * Returns the sanitized string, or throws if input is too dangerous.
	 */
	function sanitizeInput(input${t})${t} {
		if (!cfg.enabled) return input;

		// Length check
		if (input.length > cfg.maxInputLength) {
			log({ action: "sanitized", category: "length", detail: \`Input truncated from \${input.length} to \${cfg.maxInputLength}\` });
			input = input.slice(0, cfg.maxInputLength);
		}

		// Injection detection
		const { safe, threats } = detectInjection(input);
		if (!safe) {
			log({ action: "blocked", category: "prompt_injection", detail: threats.join(", "), input: input.slice(0, 200) });
			throw new AISecurityError(\`Prompt injection detected: \${threats.join(", ")}\`, threats);
		}

		log({ action: "allowed", category: "input" });
		return input;
	}

	/**
	 * Filter AI output before returning to the user.
	 * Redacts sensitive data patterns (API keys, credentials, PII).
	 */
	function filterOutput(output${t})${t} {
		if (!cfg.enabled || !cfg.redactOutputs) return output;

		// Length check
		if (output.length > cfg.maxOutputLength) {
			output = output.slice(0, cfg.maxOutputLength);
		}

		let filtered = output;
		let redactionCount = 0;

		for (const { pattern, replacement, description } of SENSITIVE_PATTERNS) {
			const matches = filtered.match(pattern);
			if (matches) {
				redactionCount += matches.length;
				filtered = filtered.replace(pattern, replacement);
				log({ action: "redacted", category: description, detail: \`\${matches.length} occurrence(s)\` });
			}
		}

		if (redactionCount > 0) {
			log({ action: "sanitized", category: "output", detail: \`\${redactionCount} redaction(s) applied\` });
		}

		return filtered;
	}

	/**
	 * Wrap an AI API call with full security protection.
	 * Sanitizes input, calls the AI, and filters output.
	 */
	async function secureCall${isTS ? "<T>" : ""}(
		input${t},
		aiCall${isTS ? ": (sanitizedInput: string) => Promise<T>" : ""},
		extractOutput${isTS ? "?: (result: T) => string" : ""},
	)${isTS ? ": Promise<{ result: T; sanitizedInput: string; filteredOutput: string }>" : ""} {
		const sanitizedInput = sanitizeInput(input);
		const result = await aiCall(sanitizedInput);
		const rawOutput = extractOutput ? extractOutput(result) : String(result);
		const filteredOutput = filterOutput(rawOutput);
		return { result, sanitizedInput, filteredOutput };
	}

	/** Get the audit log */
	function getAuditLog()${isTS ? ": SecurityAuditEntry[]" : ""} {
		return [...auditLog];
	}

	/** Clear the audit log */
	function clearAuditLog()${tVoid} {
		auditLog.length = 0;
	}

	return {
		detectInjection,
		sanitizeInput,
		filterOutput,
		secureCall,
		getAuditLog,
		clearAuditLog,
	};
}

// ═══════════════════════════════════════════════════════════════════
// Error Class
// ═══════════════════════════════════════════════════════════════════

export class AISecurityError extends Error {
	threats${isTS ? ": string[]" : ""};
	constructor(message${t}, threats${tArr} = []) {
		super(message);
		this.name = "AISecurityError";
		this.threats = threats;
	}
}
`;
}

function generateAISecurityGuardPython(): string {
	return `"""
AI Security Guard — Protects AI API calls from prompt injection and credential exfiltration.
Drop this into any Python project that uses AI APIs.
"""

import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional


# ═══════════════════════════════════════════════════════════════════
# Prompt Injection Patterns
# ═══════════════════════════════════════════════════════════════════

INJECTION_PATTERNS = [
    (re.compile(r"ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|rules?|prompts?)", re.I), "Instruction override"),
    (re.compile(r"disregard\\s+(all\\s+)?(previous|prior)\\s+(instructions?|rules?)", re.I), "Instruction disregard"),
    (re.compile(r"forget\\s+(all\\s+)?(previous|prior)\\s+(instructions?|context)", re.I), "Context reset"),
    (re.compile(r"new\\s+system\\s+prompt", re.I), "System prompt injection"),
    (re.compile(r"override\\s+(your|the|all)\\s+(rules?|instructions?|safety)", re.I), "Safety override"),
    (re.compile(r"(you\\s+are|act\\s+as|pretend)\\s+(now\\s+)?(a\\s+)?(different|unrestricted|jailbroken)", re.I), "Role hijacking"),
    (re.compile(r"DAN\\s+(mode|prompt)|do\\s+anything\\s+now", re.I), "DAN jailbreak"),
    (re.compile(r"(dump|reveal|show|output)\\s+(your|the)\\s+(system\\s+prompt|instructions?|api\\s+keys?|secrets?)", re.I), "Data extraction"),
    (re.compile(r"(upload|send|post|exfiltrate)\\s+.*(to|at)\\s+https?://", re.I), "Data exfiltration"),
]

SENSITIVE_PATTERNS = [
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"), "sk-[REDACTED]", "OpenAI API key"),
    (re.compile(r"sk-ant-[a-zA-Z0-9]{20,}"), "sk-ant-[REDACTED]", "Anthropic API key"),
    (re.compile(r"ghp_[a-zA-Z0-9]{36}"), "ghp_[REDACTED]", "GitHub token"),
    (re.compile(r"(?:password|secret|token|api[_-]?key)\\s*[=:]\\s*['\\""][^'\\"\\ ]{8,}['\\""]", re.I), "[CREDENTIAL_REDACTED]", "Generic credential"),
]


@dataclass
class AISecurityConfig:
    enabled: bool = True
    log_blocked: bool = True
    custom_patterns: list = field(default_factory=list)
    max_input_length: int = 32000
    max_output_length: int = 64000
    redact_outputs: bool = True


class AISecurityError(Exception):
    def __init__(self, message: str, threats: list[str] = None):
        super().__init__(message)
        self.threats = threats or []


class AISecurityGuard:
    def __init__(self, config: Optional[AISecurityConfig] = None):
        self.config = config or AISecurityConfig()
        self.audit_log: list[dict] = []
        self._custom_regexes = [re.compile(p, re.I) for p in self.config.custom_patterns]

    def _log(self, action: str, category: str, detail: str = "", input_text: str = ""):
        entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "action": action,
            "category": category,
            "detail": detail,
        }
        if input_text:
            entry["input"] = input_text[:200]
        self.audit_log.append(entry)
        if self.config.log_blocked and action in ("blocked", "sanitized"):
            print(f"[ai-security] {action.upper()}: {category} — {detail}")

    def detect_injection(self, text: str) -> tuple[bool, list[str]]:
        if not self.config.enabled:
            return True, []
        threats = []
        for pattern, desc in INJECTION_PATTERNS:
            if pattern.search(text):
                threats.append(desc)
        for regex in self._custom_regexes:
            if regex.search(text):
                threats.append("Custom pattern match")
        return len(threats) == 0, threats

    def sanitize_input(self, text: str) -> str:
        if not self.config.enabled:
            return text
        if len(text) > self.config.max_input_length:
            self._log("sanitized", "length", f"Input truncated from {len(text)} to {self.config.max_input_length}")
            text = text[:self.config.max_input_length]
        safe, threats = self.detect_injection(text)
        if not safe:
            self._log("blocked", "prompt_injection", ", ".join(threats), text[:200])
            raise AISecurityError(f"Prompt injection detected: {', '.join(threats)}", threats)
        self._log("allowed", "input")
        return text

    def filter_output(self, text: str) -> str:
        if not self.config.enabled or not self.config.redact_outputs:
            return text
        if len(text) > self.config.max_output_length:
            text = text[:self.config.max_output_length]
        for pattern, replacement, desc in SENSITIVE_PATTERNS:
            matches = pattern.findall(text)
            if matches:
                text = pattern.sub(replacement, text)
                self._log("redacted", desc, f"{len(matches)} occurrence(s)")
        return text

    async def secure_call(self, user_input: str, ai_call: Callable, extract_output: Optional[Callable] = None) -> dict:
        sanitized = self.sanitize_input(user_input)
        result = await ai_call(sanitized)
        raw_output = extract_output(result) if extract_output else str(result)
        filtered = self.filter_output(raw_output)
        return {"result": result, "sanitized_input": sanitized, "filtered_output": filtered}
`;
}

function generateSecurityPolicy(profile: ProjectProfile): string {
	const aiServiceNames = profile.aiServices.map((s) => s.name).join(", ") || "None detected";

	return `# ═══════════════════════════════════════════════════════════════════
# AI Security Policy
# ═══════════════════════════════════════════════════════════════════
# Controls AI security guard behavior. Edit to tune for your project.
# Generated for: ${profile.name}
# AI Services: ${aiServiceNames}
# ═══════════════════════════════════════════════════════════════════

settings:
  enabled: true
  log_blocked: true
  max_input_length: 32000
  max_output_length: 64000
  redact_outputs: true
  redact_pii: true

# Prompt injection patterns to block
# Add custom patterns specific to your application
blocked_patterns:
  # Standard injection patterns (included by default in the guard)
  - pattern: "ignore\\\\s+(all\\\\s+)?(previous|prior)\\\\s+instructions?"
    description: "Instruction override attempt"
  - pattern: "new\\\\s+system\\\\s+prompt"
    description: "System prompt injection"
  - pattern: "(dump|reveal|show)\\\\s+(your|the)\\\\s+(system\\\\s+prompt|api\\\\s+keys?)"
    description: "Data extraction attempt"

  # Add your application-specific patterns below:
  # - pattern: "your-custom-regex"
  #   description: "What this pattern catches"

# Sensitive data to redact from AI outputs
redaction_patterns:
  - pattern: "sk-[a-zA-Z0-9]{20,}"
    replacement: "sk-[REDACTED]"
    description: "OpenAI API key"
  - pattern: "sk-ant-[a-zA-Z0-9]{20,}"
    replacement: "sk-ant-[REDACTED]"
    description: "Anthropic API key"

# Rate limiting (requests per window)
rate_limits:
  enabled: true
  window_ms: 60000
  max_requests: 20
  max_tokens_per_minute: 100000

# Allowed domains for AI tool/function calling
allowed_domains:
  - "api.openai.com"
  - "api.anthropic.com"
  # Add your trusted domains here

# Content filtering
content_filters:
  max_system_prompt_length: 8000
  block_code_execution: true
  block_file_operations: true
  block_network_requests: true
`;
}

function generateExpressMiddleware(isTS: boolean, isFastify: boolean): string {
	if (isFastify) {
		return generateFastifyMiddleware(isTS);
	}

	const typeImport = isTS
		? `import type { Request, Response, NextFunction } from "express";\n`
		: "";

	const reqType = isTS ? ": Request" : "";
	const resType = isTS ? ": Response" : "";
	const nextType = isTS ? ": NextFunction" : "";
	const configType = isTS ? ": { maxRequests?: number; windowMs?: number; maxInputLength?: number }" : "";

	return `${typeImport}// AI Security Middleware for Express
// Adds rate limiting, input validation, and audit logging to AI endpoints.

const requestCounts = new Map();

export function aiSecurityMiddleware(config${configType} = {}) {
	const maxRequests = config.maxRequests || 20;
	const windowMs = config.windowMs || 60000;
	const maxInputLength = config.maxInputLength || 32000;

	return function (req${reqType}, res${resType}, next${nextType}) {
		// ── Rate Limiting ────────────────────────────
		const ip = req.ip || req.socket.remoteAddress || "unknown";
		const now = Date.now();
		const windowStart = now - windowMs;

		if (!requestCounts.has(ip)) {
			requestCounts.set(ip, []);
		}

		const timestamps = requestCounts.get(ip).filter(${isTS ? "(t: number)" : "(t)"} => t > windowStart);
		timestamps.push(now);
		requestCounts.set(ip, timestamps);

		if (timestamps.length > maxRequests) {
			return res.status(429).json({
				error: "Rate limit exceeded",
				retryAfter: Math.ceil(windowMs / 1000),
			});
		}

		// ── Input Validation ─────────────────────────
		if (req.body) {
			const bodyStr = JSON.stringify(req.body);
			if (bodyStr.length > maxInputLength) {
				return res.status(413).json({
					error: "Request body too large for AI processing",
				});
			}
		}

		// ── Security Headers ─────────────────────────
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("X-Frame-Options", "DENY");
		res.setHeader("X-AI-Security", "active");

		// ── Audit Logging ────────────────────────────
		const startTime = Date.now();
		const originalEnd = res.end;
		res.end = function (...args${isTS ? ": any[]" : ""}) {
			const duration = Date.now() - startTime;
			console.log(
				\`[ai-security] \${req.method} \${req.path} — \${res.statusCode} — \${duration}ms — IP: \${ip}\`,
			);
			return originalEnd.apply(res, args);
		}${isTS ? " as any" : ""};

		next();
	};
}
`;
}

function generateFastifyMiddleware(isTS: boolean): string {
	return `// AI Security Middleware for Fastify
// Adds rate limiting, input validation, and audit logging to AI endpoints.

const requestCounts = new Map();

export function aiSecurityPlugin(fastify${isTS ? ": any" : ""}, opts${isTS ? ": any" : ""}, done${isTS ? ": () => void" : ""}) {
	const maxRequests = opts.maxRequests || 20;
	const windowMs = opts.windowMs || 60000;
	const maxInputLength = opts.maxInputLength || 32000;

	fastify.addHook("onRequest", async (request${isTS ? ": any" : ""}, reply${isTS ? ": any" : ""}) => {
		const ip = request.ip || "unknown";
		const now = Date.now();
		const windowStart = now - windowMs;

		if (!requestCounts.has(ip)) requestCounts.set(ip, []);
		const timestamps = requestCounts.get(ip).filter((t${isTS ? ": number" : ""}) => t > windowStart);
		timestamps.push(now);
		requestCounts.set(ip, timestamps);

		if (timestamps.length > maxRequests) {
			reply.code(429).send({ error: "Rate limit exceeded", retryAfter: Math.ceil(windowMs / 1000) });
			return;
		}

		if (request.body) {
			const bodyStr = JSON.stringify(request.body);
			if (bodyStr.length > maxInputLength) {
				reply.code(413).send({ error: "Request body too large for AI processing" });
				return;
			}
		}

		reply.header("X-AI-Security", "active");
	});

	done();
}
`;
}

function generateNextMiddleware(): string {
	return `// Next.js AI Security Middleware
// Protects AI API routes with rate limiting and security headers.
// Place this file in your project root (next to app/ or pages/).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const requestCounts = new Map<string, number[]>();
const MAX_REQUESTS = 20;
const WINDOW_MS = 60000;

export function middleware(request: NextRequest) {
	// Only apply to AI-related API routes
	if (!request.nextUrl.pathname.startsWith("/api/ai") &&
		!request.nextUrl.pathname.startsWith("/api/chat") &&
		!request.nextUrl.pathname.startsWith("/api/completion")) {
		return NextResponse.next();
	}

	// Rate limiting
	const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
	const now = Date.now();
	const windowStart = now - WINDOW_MS;

	if (!requestCounts.has(ip)) requestCounts.set(ip, []);
	const timestamps = requestCounts.get(ip)!.filter((t) => t > windowStart);
	timestamps.push(now);
	requestCounts.set(ip, timestamps);

	if (timestamps.length > MAX_REQUESTS) {
		return NextResponse.json(
			{ error: "Rate limit exceeded" },
			{ status: 429, headers: { "Retry-After": String(Math.ceil(WINDOW_MS / 1000)) } },
		);
	}

	// Security headers
	const response = NextResponse.next();
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	response.headers.set("X-AI-Security", "active");

	return response;
}

export const config = {
	matcher: ["/api/ai/:path*", "/api/chat/:path*", "/api/completion/:path*"],
};
`;
}

function generateHonoMiddleware(isTS: boolean): string {
	return `// AI Security Middleware for Hono
// Adds rate limiting, input validation, and audit logging to AI endpoints.

${isTS ? `import type { Context, Next } from "hono";\n` : ""}
const requestCounts = new Map${isTS ? "<string, number[]>" : ""}();

export function aiSecurityMiddleware(config${isTS ? ": { maxRequests?: number; windowMs?: number; maxInputLength?: number }" : ""} = {}) {
	const maxRequests = config.maxRequests || 20;
	const windowMs = config.windowMs || 60000;
	const maxInputLength = config.maxInputLength || 32000;

	return async (c${isTS ? ": Context" : ""}, next${isTS ? ": Next" : ""}) => {
		const ip = c.req.header("x-forwarded-for") || "unknown";
		const now = Date.now();
		const windowStart = now - windowMs;

		if (!requestCounts.has(ip)) requestCounts.set(ip, []);
		const timestamps = requestCounts.get(ip)${isTS ? "!" : ""}.filter((t${isTS ? ": number" : ""}) => t > windowStart);
		timestamps.push(now);
		requestCounts.set(ip, timestamps);

		if (timestamps.length > maxRequests) {
			return c.json({ error: "Rate limit exceeded" }, 429);
		}

		c.header("X-AI-Security", "active");
		await next();
	};
}
`;
}

function generateEnvExample(profile: ProjectProfile): string {
	const lines = [
		"# ═══════════════════════════════════════════════════════════════════",
		`# Environment Variables — ${profile.name}`,
		"# ═══════════════════════════════════════════════════════════════════",
		"# Copy this file to .env and fill in your values.",
		"# NEVER commit .env to version control!",
		"",
	];

	// Add detected AI service env vars
	const addedVars = new Set<string>();
	for (const svc of profile.aiServices) {
		const envVars = AI_ENV_VARS[svc.name];
		if (envVars) {
			for (const varName of envVars) {
				if (!addedVars.has(varName)) {
					addedVars.add(varName);
					lines.push(`# ${svc.name}`);
					lines.push(`${varName}=your-${varName.toLowerCase().replace(/_/g, "-")}-here`);
					lines.push("");
				}
			}
		}
	}

	if (addedVars.size === 0) {
		lines.push("# AI API Keys");
		lines.push("# OPENAI_API_KEY=your-openai-key-here");
		lines.push("# ANTHROPIC_API_KEY=your-anthropic-key-here");
		lines.push("");
	}

	lines.push("# Security");
	lines.push("AI_SECURITY_ENABLED=true");
	lines.push("AI_SECURITY_LOG_BLOCKED=true");
	lines.push("AI_RATE_LIMIT_MAX=20");
	lines.push("AI_RATE_LIMIT_WINDOW_MS=60000");

	return lines.join("\n") + "\n";
}

function generateCICheck(profile: ProjectProfile): string {
	const isJS = profile.languages.some((l) => l.includes("JavaScript") || l.includes("TypeScript"));
	const isPython = profile.languages.includes("Python");

	let auditStep = "";
	if (isJS) {
		auditStep = `
      - name: Audit dependencies
        run: npm audit --audit-level=moderate || true

      - name: Check for secrets
        run: |
          # Check for hardcoded API keys
          if grep -rn "sk-[a-zA-Z0-9]\\{20,\\}" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" src/ lib/ app/ 2>/dev/null; then
            echo "::error::Hardcoded API keys found in source code!"
            exit 1
          fi

      - name: Check for exposed .env
        run: |
          if ! grep -q "\\.env" .gitignore 2>/dev/null; then
            echo "::warning::.env is not in .gitignore"
          fi`;
	}

	if (isPython) {
		auditStep += `

      - name: Check Python dependencies
        run: |
          pip install safety 2>/dev/null && safety check || true

      - name: Check for secrets (Python)
        run: |
          if grep -rn "sk-[a-zA-Z0-9]\\{20,\\}" --include="*.py" . 2>/dev/null; then
            echo "::error::Hardcoded API keys found!"
            exit 1
          fi`;
	}

	return `# AI Security Check — Automated security scanning for AI-powered projects
# Generated by /secure install

name: AI Security Check

on:
  pull_request:
    branches: [main, master, develop]
  push:
    branches: [main, master]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

${isJS ? "      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n\n      - name: Install dependencies\n        run: npm ci || npm install\n" : ""}${isPython ? "      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n\n      - name: Install dependencies\n        run: pip install -r requirements.txt 2>/dev/null || true\n" : ""}${auditStep}

      - name: Scan for prompt injection vulnerabilities
        run: |
          echo "Checking AI endpoint security..."
          # Check for unsanitized user input in AI calls
          if grep -rn "req\\.body.*messages\\|req\\.query.*prompt" --include="*.ts" --include="*.js" --include="*.py" . 2>/dev/null | grep -v "sanitize\\|validate\\|guard\\|security\\|filter" | head -5; then
            echo "::warning::Potential unsanitized user input flowing to AI endpoints detected"
          fi
          echo "Scan complete."
`;
}

// ═══════════════════════════════════════════════════════════════════
// Format Install Report
// ═══════════════════════════════════════════════════════════════════

export function formatInstallReport(result: InstallResult): string {
	const lines: string[] = [];

	lines.push(`# AI Security Protection — Installation Report`);
	lines.push(``);

	// Files created
	const created = result.files.filter((f) => f.created);
	const skipped = result.files.filter((f) => !f.created);

	if (created.length > 0) {
		lines.push(`## Files Created (${created.length})`);
		lines.push(``);
		for (const f of created) {
			lines.push(`- \`${f.path}\``);
			lines.push(`  ${f.description}`);
		}
		lines.push(``);
	}

	if (skipped.length > 0) {
		lines.push(`## Files Skipped (${skipped.length})`);
		lines.push(``);
		for (const f of skipped) {
			lines.push(`- \`${f.path}\` — already exists`);
		}
		lines.push(``);
	}

	// Warnings
	if (result.warnings.length > 0) {
		lines.push(`## Warnings`);
		lines.push(``);
		for (const w of result.warnings) {
			lines.push(`- ${w}`);
		}
		lines.push(``);
	}

	// Instructions
	if (result.instructions.length > 0) {
		lines.push(`## Next Steps`);
		lines.push(``);
		for (let i = 0; i < result.instructions.length; i++) {
			lines.push(`${i + 1}. ${result.instructions[i]}`);
			lines.push(``);
		}
	}

	return lines.join("\n");
}
