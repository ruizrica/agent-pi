// ABOUTME: Scope policy for tool_advisor — fires the LLM gate only on irreversible, high-stakes calls.
// ABOUTME: Inspects tool ARGUMENTS, not just names; routine bash/writes skip, sudo/rm/publish/etc. review.

/**
 * Built-in tools that mutate local state — candidates for review, but final
 * decision depends on argument inspection (see analyzeBash / analyzeWritePath).
 */
const POTENTIALLY_DESTRUCTIVE_BUILTINS = new Set<string>([
	"bash",
	"write",
	"edit",
	"notebook_edit",
	"notebookedit",
]);

const READONLY_BUILTIN_TOOLS = new Set<string>([
	"read",
	"grep",
	"find",
	"ls",
	"glob",
]);

// ── Bash command analyzer ────────────────────────────────────────────────────

/**
 * Bash command substrings that mark a call as irreversible / high-stakes.
 * Kept as a tight list — over-broad matching trains the user to ignore the gate.
 * Add new patterns here as you encounter false negatives.
 */
export const IRREVERSIBLE_BASH_PATTERNS: readonly RegExp[] = [
	/(^|\s|;|&&|\|\|)sudo(\s|$)/,
	/(^|\s|;|&&|\|\|)rm\s+(-[rRfF]+\s|-[rRfF]+$|--recursive|--force)/,
	/(^|\s|;|&&|\|\|)dd\s+(if|of)=/,
	/\|\s*(bash|sh|zsh)(\s|$)/, // curl ... | bash
	/(^|\s)git\s+push\s+(.*\s)?(--force|-f)(\s|$)/,
	/(^|\s)git\s+reset\s+--hard(\s|$)/,
	/(^|\s)npm\s+(publish|unpublish)(\s|$)/,
	/(^|\s)yarn\s+publish(\s|$)/,
	/(^|\s)pnpm\s+publish(\s|$)/,
	/(^|\s)docker\s+push(\s|$)/,
	/(^|\s)kubectl\s+(apply|delete|replace)(\s|$)/,
	/(^|\s)terraform\s+(apply|destroy)(\s|$)/,
	/(^|\s)gh\s+(pr\s+merge|release\s+create|repo\s+delete)(\s|$)/,
	/(^|\s)aws\s+\w+\s+(delete|put|terminate|stop|reboot)/,
	/(^|\s)psql\s+.*-c\s+["'](DROP|TRUNCATE|DELETE\s)/i,
	/(^|\s)(shutdown|reboot|halt|poweroff)(\s|$)/,
	/>\s*\/dev\/(sda|sdb|nvme|disk)/,
];

export function analyzeBash(command: string): "review" | "skip" {
	const cmd = (command || "").trim();
	if (!cmd) return "skip";
	for (const pattern of IRREVERSIBLE_BASH_PATTERNS) {
		if (pattern.test(cmd)) return "review";
	}
	return "skip";
}

// ── Write/Edit path analyzer ─────────────────────────────────────────────────

/**
 * Path prefixes/patterns whose modification crosses the line from "in-project
 * scratch" to "system / secret / CI config" — always reviewed.
 */
export const PROTECTED_WRITE_PATTERNS: readonly RegExp[] = [
	/^\/(etc|usr|var|boot|sys|proc|dev|root|sbin|bin|lib)(\/|$)/,
	/(^|\/)\.ssh\//,
	/(^|\/)\.aws\//,
	/(^|\/)\.kube\//,
	/(^|\/)\.gnupg\//,
	/(^|\/)\.npmrc$/,
	/(^|\/)\.pypirc$/,
	/(^|\/)\.env(\.[\w-]+)?$/,
	/(^|\/)\.envrc$/,
	/(^|\/)\.github\/workflows\//,
	/(^|\/)Dockerfile(\.\w+)?$/,
	/(^|\/)docker-compose(\.[\w-]+)?\.ya?ml$/,
	/\/credentials(\.[\w-]+)?$/,
	/\/secrets(\.[\w-]+)?$/,
];

export function analyzeWritePath(path: string): "review" | "skip" {
	const p = (path || "").trim();
	if (!p) return "skip";
	for (const pattern of PROTECTED_WRITE_PATTERNS) {
		if (pattern.test(p)) return "review";
	}
	return "skip";
}

// ── MCP verb analyzer ────────────────────────────────────────────────────────

/**
 * MCP verbs that mark IRREVERSIBLE external actions. Tightened from the
 * earlier "anything that mutates" list — `create`/`update`/`insert` are
 * usually reversible within their service and don't deserve the latency tax.
 * Kept on the gated side: anything that leaves your sandbox (sends, publishes,
 * deploys), anything financial, anything that mutates third-party state in a
 * way you can't trivially undo.
 */
export const IRREVERSIBLE_MCP_VERBS: readonly string[] = [
	"send",
	"post",
	"publish",
	"delete",
	"destroy",
	"remove",
	"deploy",
	"transfer",
	"pay",
	"charge",
	"refund",
	"merge", // PR merge — externally visible, history-changing
	"approve",
	"reject",
	"email",
	"text",
	"call_phone",
	"purchase",
	"order",
];

const READONLY_MCP_VERB_PREFIXES: readonly string[] = [
	"get",
	"list",
	"read",
	"search",
	"fetch",
	"find",
	"show",
	"describe",
	"query",
	"snapshot",
	"screenshot",
	"take_",
	"inspect",
	"view",
	"check",
	"is_",
	"has_",
];

function mcpVerb(toolName: string): string {
	const m = toolName.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
	return (m?.[1] || "").toLowerCase();
}

function verbStartsWith(verb: string, prefixes: readonly string[]): boolean {
	for (const p of prefixes) {
		if (verb === p || verb.startsWith(p + "_") || verb.startsWith(p)) return true;
	}
	return false;
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Decide whether a tool call should be reviewed by tool_advisor.
 *
 * Philosophy: "discerning, not exhaustive." Fire the LLM gate ONLY on the
 * small surface of calls that are truly irreversible — sending emails, paying
 * money, publishing packages, deleting prod data, force-pushing, deploying.
 * Routine bash (`ls`, `echo`, project-local file edits) skip silently.
 *
 * Truth table:
 *  - Built-in read-only (read/grep/find/ls/glob) → skip.
 *  - bash → analyzeBash(command): only IRREVERSIBLE_BASH_PATTERNS gate.
 *  - write/edit → analyzeWritePath(path): only PROTECTED_WRITE_PATTERNS gate.
 *  - MCP w/ read-only verb → skip.
 *  - MCP w/ verb in IRREVERSIBLE_MCP_VERBS → review.
 *  - MCP w/ unknown verb → skip (was "review" — too noisy in practice).
 *  - Non-MCP custom tools → skip.
 */
export function isInScope(toolName: string, toolInput?: any): boolean {
	const name = (toolName || "").toLowerCase();
	if (READONLY_BUILTIN_TOOLS.has(name)) return false;

	if (POTENTIALLY_DESTRUCTIVE_BUILTINS.has(name)) {
		if (name === "bash") {
			const cmd = toolInput?.command ?? toolInput?.cmd ?? "";
			return analyzeBash(String(cmd)) === "review";
		}
		if (name === "write" || name === "edit" || name === "notebook_edit" || name === "notebookedit") {
			const path = toolInput?.path ?? toolInput?.file ?? toolInput?.file_path ?? "";
			return analyzeWritePath(String(path)) === "review";
		}
	}

	if (name.startsWith("mcp__")) {
		const verb = mcpVerb(name);
		if (verb && verbStartsWith(verb, READONLY_MCP_VERB_PREFIXES)) return false;
		if (verb && IRREVERSIBLE_MCP_VERBS.includes(verb.split("_")[0])) return true;
		return false;
	}

	return false;
}

/** Exposed for tests / debugging — describes why a decision was made. */
export function explainScope(toolName: string, toolInput?: any): { inScope: boolean; reason: string } {
	const name = (toolName || "").toLowerCase();
	if (READONLY_BUILTIN_TOOLS.has(name)) return { inScope: false, reason: "built-in read-only" };

	if (name === "bash") {
		const cmd = String(toolInput?.command ?? toolInput?.cmd ?? "");
		const r = analyzeBash(cmd);
		return {
			inScope: r === "review",
			reason: r === "review" ? "bash command matches irreversible pattern" : "bash command is routine",
		};
	}
	if (name === "write" || name === "edit" || name === "notebook_edit" || name === "notebookedit") {
		const path = String(toolInput?.path ?? toolInput?.file ?? toolInput?.file_path ?? "");
		const r = analyzeWritePath(path);
		return {
			inScope: r === "review",
			reason: r === "review" ? `path '${path}' is protected` : `path '${path}' is in-project`,
		};
	}
	if (name.startsWith("mcp__")) {
		const verb = mcpVerb(name);
		if (verb && verbStartsWith(verb, READONLY_MCP_VERB_PREFIXES)) {
			return { inScope: false, reason: `mcp verb '${verb}' is read-only` };
		}
		if (verb && IRREVERSIBLE_MCP_VERBS.includes(verb.split("_")[0])) {
			return { inScope: true, reason: `mcp verb '${verb}' is irreversible` };
		}
		return { inScope: false, reason: `mcp verb '${verb || "?"}' not in irreversible set` };
	}
	return { inScope: false, reason: "non-mcp custom tool — out of scope" };
}
