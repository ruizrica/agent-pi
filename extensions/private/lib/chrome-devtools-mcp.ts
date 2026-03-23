// ABOUTME: Shared utilities for Chrome DevTools MCP integration.
// ABOUTME: The actual MCP server runs natively via Claude CLI (~/.claude/mcp.json).
// ABOUTME: This module provides login-detection heuristics, private-repo detection,
// ABOUTME: and access-verification helpers used by other extensions (e.g., PR review viewer).

// ── Types ───────────────────────────────────────────────────────────

export type PageAccessStatus = "accessible" | "login_required" | "needs_browser_verification" | "failed";

export interface ChromeDevtoolsPageAccessResult {
	url: string;
	accessible: boolean;
	loginRequired: boolean;
	status: PageAccessStatus;
	title?: string;
	reason?: string;
	evidence?: string[];
}

// ── Login detection ─────────────────────────────────────────────────

const LOGIN_INDICATORS = [
	"log in",
	"sign in",
	"sign-in",
	"authenticate",
	"session expired",
	"repository not found",
	"page not found",
	"choose an account",
	"403",
	"unauthorized",
];

const LOGIN_URL_PATTERNS = [
	"id.atlassian.com/login",
	"accounts.google.com",
	"github.com/login",
	"login.microsoftonline.com",
	"/signin",
	"/login",
];

// ── Private repo detection ───────────────────────────────────────────

const PRIVATE_REPO_URL_PATTERNS = [
	/bitbucket\.org\/[^/]+\/[^/]+\/pull-requests/i,
	/github\.com\/[^/]+\/[^/]+\/pull\//i,
	/gitlab\.com\/[^/]+\/[^/]+\/-\/merge_requests/i,
	/dev\.azure\.com\/[^/]+\/[^/]+\/_git/i,
];

/**
 * Check if a URL looks like it points to a private repository / PR page.
 * These URLs typically require authentication cookies to access,
 * so HTTP probes without auth will always fail.
 * Chrome DevTools MCP should be used to verify access for these URLs.
 */
export function isLikelyPrivateRepoUrl(url: string): boolean {
	return PRIVATE_REPO_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Analyze page content for login indicators.
 * Use this after fetching page content via native MCP tools or HTTP.
 */
export function analyzePageAccess(
	url: string,
	title: string,
	bodyText: string,
): ChromeDevtoolsPageAccessResult {
	const lowerTitle = title.toLowerCase();
	const lowerBody = bodyText.substring(0, 5000).toLowerCase();
	const lowerUrl = url.toLowerCase();

	const titleHasLogin = LOGIN_INDICATORS.some((i) => lowerTitle.includes(i));
	const bodyHasLogin = LOGIN_INDICATORS.some((i) => lowerBody.includes(i));
	const urlHasLogin = LOGIN_URL_PATTERNS.some((p) => lowerUrl.includes(p));

	const loginRequired = titleHasLogin || urlHasLogin || (bodyHasLogin && !lowerBody.includes("log out"));
	const accessible = !loginRequired;

	const evidence: string[] = [];
	if (titleHasLogin) evidence.push(`Title contains login indicator: "${title}"`);
	if (urlHasLogin) evidence.push(`URL matches login pattern: ${url}`);
	if (bodyHasLogin) evidence.push("Body contains login indicators");

	const status: PageAccessStatus = accessible ? "accessible" : "login_required";

	return {
		url,
		accessible,
		loginRequired,
		status,
		title: title || undefined,
		reason: accessible ? undefined : (loginRequired ? "Authentication required" : "Page unavailable"),
		evidence: evidence.length > 0 ? evidence : undefined,
	};
}

/**
 * Verify access to a URL via HTTP probe.
 *
 * For URLs that look like private repos (Bitbucket, GitHub, GitLab PRs),
 * HTTP probes without auth cookies will always fail. In that case, this
 * returns status "needs_browser_verification" instead of "login_required"
 * to indicate that Chrome DevTools MCP should be used for real verification.
 */
export async function verifyAccessViaHttp(url: string): Promise<ChromeDevtoolsPageAccessResult> {
	// For private repo URLs, skip the HTTP probe entirely — it will always
	// fail without auth cookies and misleadingly report "login_required".
	if (isLikelyPrivateRepoUrl(url)) {
		return {
			url,
			accessible: false,
			loginRequired: false,
			status: "needs_browser_verification",
			reason: "Private repo — requires Chrome DevTools MCP to verify access",
			evidence: ["URL matches private repo pattern; HTTP probe skipped"],
		};
	}

	try {
		const resp = await fetch(url, {
			method: "GET",
			redirect: "follow",
			signal: AbortSignal.timeout(15_000),
			headers: { "User-Agent": "agent-pi-pr-review/1.0" },
		});

		const body = await resp.text();
		const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const title = titleMatch?.[1]?.trim() || "";

		if (resp.status === 401 || resp.status === 403) {
			return {
				url,
				accessible: false,
				loginRequired: true,
				status: "login_required",
				title,
				reason: `HTTP ${resp.status}`,
				evidence: [`HTTP status: ${resp.status}`],
			};
		}

		return analyzePageAccess(url, title, body);
	} catch (err: any) {
		return {
			url,
			accessible: false,
			loginRequired: false,
			status: "failed",
			reason: err?.message || "Request failed",
		};
	}
}
