// ABOUTME: Pure-function security detection engine — pattern matching for threats, injection, and exfiltration.
// ABOUTME: Loaded by security-guard.ts; all functions are stateless and testable in isolation.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type Severity = "block" | "warn" | "log";

export type ThreatCategory =
	| "destructive"
	| "permissions"
	| "remote_exec"
	| "exfiltration"
	| "credentials"
	| "prompt_injection"
	| "tampering"
	| "unknown";

export interface ThreatResult {
	severity: Severity;
	category: ThreatCategory;
	description: string;
	matched: string; // the text/pattern that triggered the detection
	rulePattern: string; // original regex pattern from policy
}

export interface PolicyRule {
	pattern: string;
	description: string;
	severity: Severity;
	category: ThreatCategory;
}

export interface SecurityPolicy {
	blocked_commands: PolicyRule[];
	exfiltration_patterns: PolicyRule[];
	protected_paths: PolicyRule[];
	prompt_injection_patterns: PolicyRule[];
	allowlist: {
		commands: string[];
		paths: string[];
	};
	settings: {
		enabled: boolean;
		audit_log_max_bytes: number;
		strip_injections: boolean;
		verbose_blocks: boolean;
	};
}

// ═══════════════════════════════════════════════════════════════════
// YAML Parser (minimal — avoids external dependency)
// ═══════════════════════════════════════════════════════════════════

/**
 * Minimal YAML parser that handles the specific structure of our policy file.
 * Supports: top-level keys, arrays of objects with string values, nested objects.
 * Does NOT handle: anchors, tags, multi-line strings, flow sequences/mappings.
 */
export function parseSecurityYaml(raw: string): SecurityPolicy {
	const lines = raw.split("\n");
	const result: any = {};

	let currentTopKey = "";
	let currentArray: any[] | null = null;
	let currentArrayItem: any = null;
	let currentSubKey = "";
	let nestedObject: any = null;

	// Depth tracking: 0 = top-level, 1 = under top-level, 2 = under sub-key
	let arrayDepth = 0; // 0 = array directly under top-level, 1 = array under sub-key

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Skip empty lines and comments
		if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

		// Top-level key (no indentation)
		const topMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
		if (topMatch) {
			// Save previous state
			if (currentArrayItem && currentArray) {
				currentArray.push(currentArrayItem);
				currentArrayItem = null;
			}

			currentTopKey = topMatch[1];
			const value = topMatch[2].trim();

			if (value && value !== "") {
				// Inline value (e.g., enabled: true)
				result[currentTopKey] = parseYamlValue(value);
			} else {
				// Container key — will be populated by children
				// Peek ahead to see if children are arrays or sub-objects
				const nextNonEmpty = lines.slice(i + 1).find((l) => !/^\s*$/.test(l) && !/^\s*#/.test(l));
				if (nextNonEmpty && /^  - /.test(nextNonEmpty)) {
					// Direct array under top-level key
					currentArray = [];
					result[currentTopKey] = currentArray;
					arrayDepth = 0;
				} else {
					result[currentTopKey] = {};
					currentArray = null;
				}
			}
			currentSubKey = "";
			nestedObject = null;
			continue;
		}

		// Array item at 2-space indent: "  - key: value" (directly under top-level key)
		const topArrayItemMatch = line.match(/^  - (\w[\w_]*):\s*(.*)$/);
		if (topArrayItemMatch && currentArray && arrayDepth === 0) {
			// Save previous array item
			if (currentArrayItem) {
				currentArray.push(currentArrayItem);
			}
			currentArrayItem = {};
			const key = topArrayItemMatch[1];
			const value = topArrayItemMatch[2].trim();
			currentArrayItem[key] = parseYamlValue(value);
			continue;
		}

		// Plain string array item at 2-space indent: "  - value" (directly under top-level key)
		const topPlainArrayMatch = line.match(/^  - (.+)$/);
		if (topPlainArrayMatch && currentArray && arrayDepth === 0) {
			if (currentArrayItem) {
				currentArray.push(currentArrayItem);
				currentArrayItem = null;
			}
			currentArray.push(parseYamlValue(topPlainArrayMatch[1].trim()));
			continue;
		}

		// Continuation of top-level array item object (4 spaces, "key: value")
		const topContMatch = line.match(/^    (\w[\w_]*):\s*(.*)$/);
		if (topContMatch && currentArrayItem && arrayDepth === 0) {
			const key = topContMatch[1];
			const value = topContMatch[2].trim();
			currentArrayItem[key] = parseYamlValue(value);
			continue;
		}

		// Second-level key (2 spaces) — nested object key or array container
		const subMatch = line.match(/^  (\w[\w_]*):\s*(.*)$/);
		if (subMatch) {
			// Save previous array item
			if (currentArrayItem && currentArray) {
				currentArray.push(currentArrayItem);
				currentArrayItem = null;
			}

			currentSubKey = subMatch[1];
			const value = subMatch[2].trim();

			if (!result[currentTopKey] || typeof result[currentTopKey] !== "object" || Array.isArray(result[currentTopKey])) {
				result[currentTopKey] = {};
			}

			if (value && value !== "") {
				result[currentTopKey][currentSubKey] = parseYamlValue(value);
				currentArray = null;
				nestedObject = null;
			} else {
				// Container — will be populated by children
				currentArray = [];
				result[currentTopKey][currentSubKey] = currentArray;
				arrayDepth = 1;
				nestedObject = null;
			}
			continue;
		}

		// Array item with key-value (4 spaces, "- key: value") under sub-key
		const arrayItemMatch = line.match(/^    - (\w[\w_]*):\s*(.*)$/);
		if (arrayItemMatch && arrayDepth === 1) {
			// Save previous array item
			if (currentArrayItem && currentArray) {
				currentArray.push(currentArrayItem);
			}
			currentArrayItem = {};
			const key = arrayItemMatch[1];
			const value = arrayItemMatch[2].trim();
			currentArrayItem[key] = parseYamlValue(value);
			continue;
		}

		// Plain string array item (4 spaces, "- value") under sub-key
		const plainArrayMatch = line.match(/^    - (.+)$/);
		if (plainArrayMatch && arrayDepth === 1) {
			if (currentArrayItem && currentArray) {
				currentArray.push(currentArrayItem);
				currentArrayItem = null;
			}
			if (currentArray) {
				currentArray.push(parseYamlValue(plainArrayMatch[1].trim()));
			}
			continue;
		}

		// Continuation of sub-level array item object (6 spaces, "key: value")
		const contMatch = line.match(/^      (\w[\w_]*):\s*(.*)$/);
		if (contMatch && currentArrayItem && arrayDepth === 1) {
			const key = contMatch[1];
			const value = contMatch[2].trim();
			currentArrayItem[key] = parseYamlValue(value);
			continue;
		}
	}

	// Flush last array item
	if (currentArrayItem && currentArray) {
		currentArray.push(currentArrayItem);
	}

	return normalizePolicy(result);
}

function parseYamlValue(val: string): any {
	// Remove surrounding quotes and process escape sequences
	if ((val.startsWith('"') && val.endsWith('"'))) {
		const inner = val.slice(1, -1);
		// Process YAML double-quote escape sequences
		return inner
			.replace(/\\\\/g, "\x00BACKSLASH\x00")  // protect \\
			.replace(/\\n/g, "\n")
			.replace(/\\t/g, "\t")
			.replace(/\\"/g, '"')
			.replace(/\x00BACKSLASH\x00/g, "\\");     // restore \\ as single \
	}
	if ((val.startsWith("'") && val.endsWith("'"))) {
		// YAML single quotes: no escape processing, '' becomes '
		return val.slice(1, -1).replace(/''/g, "'");
	}
	if (val === "true") return true;
	if (val === "false") return false;
	if (val === "null" || val === "~") return null;
	if (/^-?\d+$/.test(val)) return parseInt(val, 10);
	if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
	return val;
}

function normalizePolicy(raw: any): SecurityPolicy {
	return {
		blocked_commands: normalizeRules(raw.blocked_commands),
		exfiltration_patterns: normalizeRules(raw.exfiltration_patterns),
		protected_paths: normalizeRules(raw.protected_paths),
		prompt_injection_patterns: normalizeRules(raw.prompt_injection_patterns),
		allowlist: {
			commands: Array.isArray(raw.allowlist?.commands) ? raw.allowlist.commands : [],
			paths: Array.isArray(raw.allowlist?.paths) ? raw.allowlist.paths : [],
		},
		settings: {
			enabled: raw.settings?.enabled ?? true,
			audit_log_max_bytes: raw.settings?.audit_log_max_bytes ?? 1048576,
			strip_injections: raw.settings?.strip_injections ?? true,
			verbose_blocks: raw.settings?.verbose_blocks ?? true,
		},
	};
}

function normalizeRules(arr: any): PolicyRule[] {
	if (!Array.isArray(arr)) return [];
	return arr
		.filter((r: any) => r && typeof r === "object" && r.pattern)
		.map((r: any) => ({
			pattern: String(r.pattern),
			description: String(r.description || ""),
			severity: (["block", "warn", "log"].includes(r.severity) ? r.severity : "warn") as Severity,
			category: String(r.category || "unknown") as ThreatCategory,
		}));
}

// ═══════════════════════════════════════════════════════════════════
// Policy Loader
// ═══════════════════════════════════════════════════════════════════

/** Compiled regex cache to avoid recompiling on every scan */
const regexCache = new Map<string, RegExp>();

/** Clear the regex cache (called on policy reload to drop stale patterns) */
export function clearRegexCache(): void {
	regexCache.clear();
}

function getRegex(pattern: string, flags = "i"): RegExp {
	const key = `${pattern}::${flags}`;
	let re = regexCache.get(key);
	if (!re) {
		try {
			re = new RegExp(pattern, flags);
		} catch {
			// Invalid regex — fall back to literal match
			re = new RegExp(escapeRegex(pattern), flags);
		}
		regexCache.set(key, re);
	}
	return re;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Max input length for regex scanning — prevents ReDoS on huge inputs */
const MAX_SCAN_LENGTH = 50_000;

/**
 * Safe regex exec — truncates excessively long inputs to prevent ReDoS.
 * User-defined YAML patterns could theoretically cause catastrophic backtracking;
 * this limits the damage by capping input length.
 */
function safeExec(re: RegExp, text: string): RegExpExecArray | null {
	const input = text.length > MAX_SCAN_LENGTH ? text.slice(0, MAX_SCAN_LENGTH) : text;
	return re.exec(input);
}

function safeTest(re: RegExp, text: string): boolean {
	const input = text.length > MAX_SCAN_LENGTH ? text.slice(0, MAX_SCAN_LENGTH) : text;
	return re.test(input);
}

/**
 * Load security policy from the YAML file.
 * Searches: .pi/security-policy.yaml, then ~/.pi/agent/.pi/security-policy.yaml
 */
export function loadPolicy(projectRoot: string): SecurityPolicy {
	// Clear regex cache on reload to drop stale compiled patterns
	clearRegexCache();

	const candidates = [
		join(projectRoot, ".pi", "security-policy.yaml"),
		join(homedir(), ".pi", "agent", ".pi", "security-policy.yaml"),
	];

	for (const path of candidates) {
		if (existsSync(path)) {
			try {
				const raw = readFileSync(path, "utf-8");
				return parseSecurityYaml(raw);
			} catch (err) {
				console.error(`[security-engine] Failed to parse ${path}: ${err}`);
			}
		}
	}

	// Return a minimal default policy
	return getDefaultPolicy();
}

export function getDefaultPolicy(): SecurityPolicy {
	return {
		blocked_commands: [
			{ pattern: "rm\\s+(-[a-zA-Z]*r[a-zA-Z]*\\s+|--recursive)", description: "Recursive delete", severity: "block", category: "destructive" },
			{ pattern: "rm\\s+(-[a-zA-Z]*f[a-zA-Z]*\\s+)", description: "Force delete", severity: "block", category: "destructive" },
			{ pattern: "curl\\s+.*\\|\\s*(bash|sh|zsh)", description: "Pipe to shell", severity: "block", category: "remote_exec" },
			{ pattern: "sudo\\s+", description: "Sudo usage", severity: "block", category: "permissions" },
			{ pattern: "printenv", description: "Env dump", severity: "block", category: "exfiltration" },
		],
		exfiltration_patterns: [
			{ pattern: "curl\\s+.*(transfer\\.sh|pastebin|0x0\\.st)", description: "Upload to paste service", severity: "block", category: "exfiltration" },
		],
		protected_paths: [
			{ pattern: "\\.ssh/", description: "SSH directory", severity: "block", category: "credentials" },
			{ pattern: "\\.aws/credentials", description: "AWS credentials", severity: "block", category: "credentials" },
		],
		prompt_injection_patterns: [
			{ pattern: "ignore\\s+(all\\s+)?(previous|prior)\\s+instructions?", description: "Instruction override", severity: "block", category: "prompt_injection" },
			{ pattern: "new\\s+system\\s+prompt", description: "System prompt injection", severity: "block", category: "prompt_injection" },
		],
		allowlist: { commands: [], paths: [] },
		settings: {
			enabled: true,
			audit_log_max_bytes: 1048576,
			strip_injections: true,
			verbose_blocks: true,
		},
	};
}

// ═══════════════════════════════════════════════════════════════════
// Scanning Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a command matches any allowlist pattern.
 */
function isAllowlisted(text: string, allowlist: string[]): boolean {
	for (const pattern of allowlist) {
		try {
			if (safeTest(getRegex(`^${pattern}$`, "i"), text.trim())) return true;
		} catch {
			// Skip invalid patterns
		}
	}
	return false;
}

/**
 * Split a command string on shell chaining operators (; && || |).
 * Preserves pipes for pattern matching (curl|bash), but splits on
 * standalone semicolons and logical operators.
 * Returns individual sub-commands for separate scanning.
 */
function splitChainedCommands(cmd: string): string[] {
	// Split on ; && || but NOT on | alone (pipes are part of patterns like curl|bash)
	// Also handle newlines as command separators
	const parts = cmd.split(/\s*(?:;\s*|&&\s*|\|\|\s*|\n)\s*/);
	return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Scan a single command segment against all blocked/exfiltration patterns.
 */
function scanSingleCommand(trimmed: string, policy: SecurityPolicy): ThreatResult[] {
	const threats: ThreatResult[] = [];

	// Scan against blocked commands
	for (const rule of policy.blocked_commands) {
		const re = getRegex(rule.pattern, "i");
		const match = safeExec(re, trimmed);
		if (match) {
			threats.push({
				severity: rule.severity,
				category: rule.category,
				description: rule.description,
				matched: match[0],
				rulePattern: rule.pattern,
			});
		}
	}

	// Scan against exfiltration patterns
	for (const rule of policy.exfiltration_patterns) {
		const re = getRegex(rule.pattern, "i");
		const match = safeExec(re, trimmed);
		if (match) {
			threats.push({
				severity: rule.severity,
				category: rule.category,
				description: rule.description,
				matched: match[0],
				rulePattern: rule.pattern,
			});
		}
	}

	return threats;
}

/** Detect shell metacharacters that indicate command chaining or subshells */
const SHELL_CHAIN_PATTERN = /[;&|`\n]|\$\(/;

/**
 * Scan a bash command for dangerous patterns.
 * Splits on chain operators (; && ||) so "safe_cmd; rm -rf /" is caught.
 * CRITICAL: Commands containing shell chain operators are NEVER fully allowlisted —
 * each sub-command is checked independently. This prevents "cat foo; rm -rf /"
 * from being allowlisted by "cat .*".
 * Returns all matched threats (may be multiple per command).
 */
export function scanCommand(cmd: string, policy: SecurityPolicy): ThreatResult[] {
	if (!policy.settings.enabled) return [];

	const trimmed = cmd.trim();
	if (trimmed.length === 0) return [];

	const hasChainOps = SHELL_CHAIN_PATTERN.test(trimmed);

	// If command contains chain operators, ALWAYS split and scan each part.
	// Never allowlist compound commands — "cat foo; rm -rf /" must not be
	// bypassed by "cat .*" in the allowlist.
	if (hasChainOps) {
		// Still scan the FULL string for patterns that span pipes (curl ... | bash)
		const fullThreats = scanSingleCommand(trimmed, policy);
		if (fullThreats.length > 0) return fullThreats;

		// Split and scan each sub-command independently
		const parts = splitChainedCommands(trimmed);
		const allThreats: ThreatResult[] = [];
		for (const part of parts) {
			if (isAllowlisted(part, policy.allowlist.commands)) continue;
			const partThreats = scanSingleCommand(part, policy);
			allThreats.push(...partThreats);
		}
		return allThreats;
	}

	// Simple command (no chaining) — allowlist check is safe here
	if (isAllowlisted(trimmed, policy.allowlist.commands)) return [];

	return scanSingleCommand(trimmed, policy);
}

/**
 * Scan a file path for protected location patterns.
 * `operation` controls severity: write/edit = policy severity, read = downgraded to warn.
 */
export function scanFilePath(
	path: string,
	policy: SecurityPolicy,
	operation: "read" | "write" | "edit" = "write",
): ThreatResult[] {
	if (!policy.settings.enabled) return [];

	const threats: ThreatResult[] = [];
	const normalized = path.replace(/\\/g, "/");

	// Expand ~ to home directory for matching
	const expanded = normalized.startsWith("~")
		? join(homedir(), normalized.slice(1))
		: normalized;

	// Check path allowlist
	if (isAllowlisted(expanded, policy.allowlist.paths)) return [];

	for (const rule of policy.protected_paths) {
		const re = getRegex(rule.pattern, "i");
		if (safeTest(re, expanded) || safeTest(re, normalized) || safeTest(re, path)) {
			// Downgrade severity for reads — agent needs to read for context
			const severity: Severity =
				operation === "read"
					? "log" // reads of protected paths are just logged
					: rule.severity;

			threats.push({
				severity,
				category: rule.category,
				description: `${rule.description} (${operation})`,
				matched: path,
				rulePattern: rule.pattern,
			});
		}
	}

	return threats;
}

/**
 * Scan arbitrary text content for prompt injection patterns.
 * Used on tool results, file contents, user messages coming from external sources.
 */
export function scanContent(text: string, policy: SecurityPolicy): ThreatResult[] {
	if (!policy.settings.enabled) return [];
	if (!text || text.length === 0) return [];

	const threats: ThreatResult[] = [];

	for (const rule of policy.prompt_injection_patterns) {
		const re = getRegex(rule.pattern, "i");
		const match = safeExec(re, text);
		if (match) {
			threats.push({
				severity: rule.severity,
				category: rule.category,
				description: rule.description,
				matched: match[0],
				rulePattern: rule.pattern,
			});
		}
	}

	return threats;
}

/**
 * Scan a URL for known exfiltration endpoints.
 */
export function scanUrl(url: string, policy: SecurityPolicy): ThreatResult[] {
	if (!policy.settings.enabled) return [];

	const threats: ThreatResult[] = [];

	for (const rule of policy.exfiltration_patterns) {
		const re = getRegex(rule.pattern, "i");
		const match = safeExec(re, url);
		if (match) {
			threats.push({
				severity: rule.severity,
				category: rule.category,
				description: rule.description,
				matched: match[0],
				rulePattern: rule.pattern,
			});
		}
	}

	return threats;
}

/**
 * Strip prompt injection content from text, replacing matched sections
 * with a redaction notice. Returns the cleaned text and list of redactions.
 */
export function stripInjections(
	text: string,
	policy: SecurityPolicy,
): { cleaned: string; redactions: ThreatResult[] } {
	if (!policy.settings.enabled) return { cleaned: text, redactions: [] };

	const redactions: ThreatResult[] = [];
	let cleaned = text;

	for (const rule of policy.prompt_injection_patterns) {
		if (rule.severity !== "block") continue; // Only strip block-level injections

		const re = getRegex(rule.pattern, "gi");
		let match: RegExpExecArray | null;

		while ((match = safeExec(re, cleaned)) !== null) {
			redactions.push({
				severity: rule.severity,
				category: rule.category,
				description: rule.description,
				matched: match[0],
				rulePattern: rule.pattern,
			});
		}

		if (redactions.length > 0) {
			// Replace the entire line containing the injection
			const lines = cleaned.split("\n");
			const cleanedLines = lines.map((line) => {
				if (safeTest(re, line)) {
					return `[⚠️ REDACTED: ${rule.description}]`;
				}
				return line;
			});
			cleaned = cleanedLines.join("\n");
			// Reset regex lastIndex after line-level replacement
			re.lastIndex = 0;
		}
	}

	return { cleaned, redactions };
}

// ═══════════════════════════════════════════════════════════════════
// System Prompt Leakage Detection (OWASP #7)
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract distinctive fingerprint phrases from a system prompt.
 * Returns 5-10 phrases (lowercased) that are unlikely to appear in normal conversation.
 * Prefers sentences with security-related keywords.
 */
export function extractPromptFingerprints(systemPrompt: string): string[] {
	if (systemPrompt.length < 50) return [];

	// Split into sentences/phrases
	const sentences = systemPrompt
		.split(/[.!?\n]/)
		.map((s) => s.trim().toLowerCase())
		.filter((s) => s.length >= 20 && s.length <= 150);

	// Prioritize sentences with distinctive security vocabulary
	const securityKeywords = /\b(never|always|block|refuse|redact|strip|monitor|inject|exfiltrat|credential|security guard)\b/i;
	const scored = sentences.map((s) => ({
		text: s,
		score: (s.match(securityKeywords) || []).length,
	}));

	scored.sort((a, b) => b.score - a.score);

	// Take top 10 most distinctive
	return scored
		.filter((s) => s.score > 0)
		.slice(0, 10)
		.map((s) => s.text);
}

/**
 * Detect if assistant output contains system prompt content.
 * If 3+ fingerprints are found in a single response, it's likely leakage.
 * Returns a ThreatResult if leakage detected, null otherwise.
 */
export function detectSystemPromptLeakage(
	text: string,
	fingerprints: string[],
	threshold: number = 3,
): ThreatResult | null {
	if (fingerprints.length === 0) return null;

	const lowerText = text.toLowerCase();
	let matchCount = 0;
	const matched: string[] = [];

	for (const fp of fingerprints) {
		if (lowerText.includes(fp)) {
			matchCount++;
			matched.push(fp);
		}
		if (matchCount >= threshold) break;
	}

	if (matchCount >= threshold) {
		return {
			severity: "block",
			category: "prompt_injection",
			description: `System prompt leakage detected (${matchCount} fingerprints matched)`,
			matched: matched.slice(0, 3).join("; "),
			rulePattern: "detect_prompt_leakage",
		};
	}

	return null;
}

// ═══════════════════════════════════════════════════════════════════
// Secret/PII Scanning (OWASP #2 — Sensitive Information Disclosure)
// ═══════════════════════════════════════════════════════════════════

/** Default patterns for detecting secrets/credentials in output */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
	{ name: "Anthropic API key", pattern: /sk-ant-[a-zA-Z0-9]{20,}/g },
	{ name: "OpenAI API key", pattern: /sk-[a-zA-Z0-9]{20,}/g },
	{ name: "GitHub token", pattern: /ghp_[a-zA-Z0-9]{36}/g },
	{ name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g },
	{ name: "Private key", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
	{ name: "Secret assignment", pattern: /(password|secret|token|api_key)\s*=\s*"[^"]{4,}"/gi },
];

/**
 * Scan text for secrets/credentials and return a redacted version.
 * Returns { found, redacted, matchCount }.
 */
export function scanForSecrets(
	text: string,
	extraPatterns?: { name: string; pattern: RegExp }[],
): { found: boolean; redacted: string; matchCount: number } {
	const patterns = extraPatterns ? [...SECRET_PATTERNS, ...extraPatterns] : SECRET_PATTERNS;
	let redacted = text;
	let matchCount = 0;

	for (const { name, pattern } of patterns) {
		// Reset lastIndex for global regexes
		const re = new RegExp(pattern.source, pattern.flags);
		const matches = redacted.match(re);
		if (matches) {
			matchCount += matches.length;
			redacted = redacted.replace(re, `[REDACTED: ${name}]`);
		}
	}

	return {
		found: matchCount > 0,
		redacted,
		matchCount,
	};
}

// ═══════════════════════════════════════════════════════════════════
// Tool Call Budgeting (OWASP #6 — Excessive Agency)
// ═══════════════════════════════════════════════════════════════════

export interface ToolBudget {
	max_tool_calls_per_turn: number;    // 200, 0 = unlimited
	max_tool_calls_per_session: number; // 2000, 0 = unlimited
	max_bash_calls_per_turn: number;    // 100, 0 = unlimited
	warn_threshold_pct: number;         // 0.8
}

/**
 * Check whether a tool call exceeds the configured budget.
 * Returns a ThreatResult if budget is exceeded or near-exceeded, null otherwise.
 */
export function checkToolBudget(
	toolName: string,
	counters: { turn: number; session: number; bashTurn: number },
	budget: ToolBudget,
): ThreatResult | null {
	// Bash-specific turn limit
	if (toolName === "bash" && budget.max_bash_calls_per_turn > 0) {
		if (counters.bashTurn >= budget.max_bash_calls_per_turn) {
			return {
				severity: "block",
				category: "unknown",
				description: `Tool budget exceeded: ${counters.bashTurn} bash calls this turn (limit: ${budget.max_bash_calls_per_turn})`,
				matched: `bash:${counters.bashTurn}/${budget.max_bash_calls_per_turn}`,
				rulePattern: "tool_budget.max_bash_calls_per_turn",
			};
		}
		const bashWarn = Math.floor(budget.max_bash_calls_per_turn * budget.warn_threshold_pct);
		if (counters.bashTurn >= bashWarn) {
			return {
				severity: "warn",
				category: "unknown",
				description: `Tool budget warning: ${counters.bashTurn} bash calls this turn (limit: ${budget.max_bash_calls_per_turn})`,
				matched: `bash:${counters.bashTurn}/${budget.max_bash_calls_per_turn}`,
				rulePattern: "tool_budget.max_bash_calls_per_turn",
			};
		}
	}

	// Session limit
	if (budget.max_tool_calls_per_session > 0) {
		if (counters.session >= budget.max_tool_calls_per_session) {
			return {
				severity: "block",
				category: "unknown",
				description: `Tool budget exceeded: ${counters.session} calls this session (limit: ${budget.max_tool_calls_per_session})`,
				matched: `session:${counters.session}/${budget.max_tool_calls_per_session}`,
				rulePattern: "tool_budget.max_tool_calls_per_session",
			};
		}
		const sessionWarn = Math.floor(budget.max_tool_calls_per_session * budget.warn_threshold_pct);
		if (counters.session >= sessionWarn) {
			return {
				severity: "warn",
				category: "unknown",
				description: `Tool budget warning: ${counters.session} calls this session (limit: ${budget.max_tool_calls_per_session})`,
				matched: `session:${counters.session}/${budget.max_tool_calls_per_session}`,
				rulePattern: "tool_budget.max_tool_calls_per_session",
			};
		}
	}

	// Turn limit (general)
	if (budget.max_tool_calls_per_turn > 0) {
		if (counters.turn >= budget.max_tool_calls_per_turn) {
			return {
				severity: "block",
				category: "unknown",
				description: `Tool budget exceeded: ${counters.turn} calls this turn (limit: ${budget.max_tool_calls_per_turn})`,
				matched: `turn:${counters.turn}/${budget.max_tool_calls_per_turn}`,
				rulePattern: "tool_budget.max_tool_calls_per_turn",
			};
		}
		const turnWarn = Math.floor(budget.max_tool_calls_per_turn * budget.warn_threshold_pct);
		if (counters.turn >= turnWarn) {
			return {
				severity: "warn",
				category: "unknown",
				description: `Tool budget warning: ${counters.turn} calls this turn (limit: ${budget.max_tool_calls_per_turn})`,
				matched: `turn:${counters.turn}/${budget.max_tool_calls_per_turn}`,
				rulePattern: "tool_budget.max_tool_calls_per_turn",
			};
		}
	}

	return null;
}

// ═══════════════════════════════════════════════════════════════════
// Output Size Limits (OWASP #10 — Unbounded Consumption)
// ═══════════════════════════════════════════════════════════════════

/**
 * Truncate tool result text to prevent context exhaustion.
 * Returns the (possibly truncated) text, whether truncation occurred, and original length.
 * Set maxChars to 0 to disable truncation.
 */
export function truncateToolResult(
	text: string,
	maxChars: number,
): { text: string; truncated: boolean; originalLength: number } {
	const originalLength = text.length;

	if (maxChars <= 0 || originalLength <= maxChars) {
		return { text, truncated: false, originalLength };
	}

	const notice = `\n\n[TRUNCATED: Output was ${originalLength} chars, limit is ${maxChars}. Use offset/pagination to see more.]`;
	return {
		text: text.slice(0, maxChars) + notice,
		truncated: true,
		originalLength,
	};
}

// ═══════════════════════════════════════════════════════════════════
// Utility: Format threat for display
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate a security policy for common issues.
 * Returns a list of warnings (empty = valid).
 */
export function validatePolicy(policy: SecurityPolicy): string[] {
	const warnings: string[] = [];

	if (!policy.settings.enabled) {
		warnings.push("Security guard is DISABLED (settings.enabled = false)");
	}
	if (policy.blocked_commands.length === 0) {
		warnings.push("No blocked command rules defined");
	}
	if (policy.prompt_injection_patterns.length === 0) {
		warnings.push("No prompt injection patterns defined");
	}
	if (policy.protected_paths.length === 0) {
		warnings.push("No protected path rules defined");
	}

	// Check for regex compilation errors
	for (const rule of [...policy.blocked_commands, ...policy.exfiltration_patterns, ...policy.protected_paths, ...policy.prompt_injection_patterns]) {
		try {
			new RegExp(rule.pattern, "i");
		} catch {
			warnings.push(`Invalid regex in rule "${rule.description}": ${rule.pattern}`);
		}
	}

	// Check for overbroad allowlist entries
	for (const pattern of policy.allowlist.commands) {
		if (pattern === ".*" || pattern === ".+") {
			warnings.push(`Overbroad allowlist command pattern: "${pattern}" — matches everything`);
		}
	}

	return warnings;
}

export function formatThreat(threat: ThreatResult, verbose: boolean): string {
	const icon = threat.severity === "block" ? "🛑" : threat.severity === "warn" ? "⚠️" : "📝";
	const label = `${icon} [${threat.category.toUpperCase()}]`;

	if (verbose) {
		return `${label} ${threat.description}\n   Matched: "${threat.matched}"`;
	}
	return `${label} ${threat.description}`;
}

export function formatThreatsForBlock(threats: ThreatResult[], verbose: boolean): string {
	const header = "🛡️ SECURITY GUARD — Blocked";
	const details = threats.map((t) => formatThreat(t, verbose)).join("\n");
	return `${header}\n\n${details}\n\nThis action was blocked by security policy. If you believe this is a false positive, ask the user to confirm.`;
}
