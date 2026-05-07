// ABOUTME: OAuth provider extension — uses CLAUDE_CODE_OAUTH_TOKEN env var for Anthropic auth.
// ABOUTME: Supersedes the built-in OAuth flow so no browser login is needed. Set the env var and go.
/**
 * OAuth Provider — Environment-Variable-Based Anthropic Authentication
 *
 * Instead of using pi's built-in OAuth login flow (which requires opening a browser,
 * completing PKCE auth, and storing refresh/access tokens in auth.json), this extension
 * reads the `CLAUDE_CODE_OAUTH_TOKEN` (or `PI_CLAUDE_OAUTH_TOKEN`) environment variable
 * and uses it directly as the API credential.
 *
 * How it works:
 *   1. On load, checks for CLAUDE_CODE_OAUTH_TOKEN or PI_CLAUDE_OAUTH_TOKEN env var
 *   2. If found, registers an Anthropic provider override via pi.registerProvider()
 *   3. The override's getApiKey() returns the env var token directly
 *   4. No browser login, no token refresh, no auth.json management needed
 *
 * Commands:
 *   /auth-status   — Show which auth method is active and token presence
 *   /auth-logout   — Clear built-in OAuth credentials from auth.json (keeps env var auth)
 *   /auth-clear    — Alias for /auth-logout
 *
 * Environment Variables:
 *   CLAUDE_CODE_OAUTH_TOKEN  — Primary: Claude Code OAuth token (Claude Max Plan)
 *   PI_CLAUDE_OAUTH_TOKEN    — Alias: Pi-specific OAuth token variable
 *
 * Setup:
 *   1. Get your OAuth token from Claude Code or Anthropic Console
 *   2. Add to ~/.zshrc or ~/.bashrc:  export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"
 *   3. Restart terminal and pi — done. No /login needed.
 *
 * Usage: Loaded via packages in agent/settings.json
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { streamClaudeCliProvider } from "./lib/claude/claude-provider-stream.ts";

// ── Constants ────────────────────────────────────────────────────────

const ENV_PRIMARY = "CLAUDE_CODE_OAUTH_TOKEN";
const ENV_ALIAS = "PI_CLAUDE_OAUTH_TOKEN";
const PROVIDER_NAME = "anthropic";
const FAR_FUTURE_EXPIRY = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year from now

// ── Helpers ──────────────────────────────────────────────────────────

/** Bridge our env vars to ANTHROPIC_OAUTH_TOKEN so the pi-ai library picks them up. */
export function bridgeOAuthEnvVar(): void {
	if (!process.env.ANTHROPIC_OAUTH_TOKEN) {
		const token = process.env[ENV_PRIMARY] || process.env[ENV_ALIAS];
		if (token) {
			process.env.ANTHROPIC_OAUTH_TOKEN = token;
		}
	}
}

function getOAuthToken(): string | undefined {
	return process.env[ENV_PRIMARY] || process.env[ENV_ALIAS];
}

function getTokenSource(): string | undefined {
	if (process.env[ENV_PRIMARY]) return ENV_PRIMARY;
	if (process.env[ENV_ALIAS]) return ENV_ALIAS;
	return undefined;
}

function getAuthJsonPath(): string {
	// auth.json lives in the agent directory (same level as extensions/)
	const agentDir = join(import.meta.dirname, "..");
	return join(agentDir, "auth.json");
}

function readAuthJson(): Record<string, unknown> | null {
	const path = getAuthJsonPath();
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return null;
	}
}

function writeAuthJson(data: Record<string, unknown>): void {
	const path = getAuthJsonPath();
	writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function maskToken(token: string): string {
	if (token.length <= 12) return "***";
	return token.slice(0, 8) + "..." + token.slice(-4);
}

// ── Extension Factory ────────────────────────────────────────────────

export default function oauthProvider(pi: ExtensionAPI): void {
	// Bridge env vars so the underlying pi-ai library sees ANTHROPIC_OAUTH_TOKEN
	bridgeOAuthEnvVar();

	const token = getOAuthToken();
	const source = getTokenSource();

	// ── Register Provider Override ─────────────────────────────────

	pi.registerProvider(PROVIDER_NAME, {
		api: "anthropic-messages",
		streamSimple: streamClaudeCliProvider,
		...(token ? {
			oauth: {
				name: "Anthropic (OAuth Env Var)",

				async login(_callbacks) {
					// No browser login needed — return synthetic credentials from env var
					const currentToken = getOAuthToken();
					if (!currentToken) {
						throw new Error(
							`OAuth token not found. Set ${ENV_PRIMARY} or ${ENV_ALIAS} in your environment.\n` +
							`Add to ~/.zshrc:  export ${ENV_PRIMARY}="your-token-here"`
						);
					}
					return {
						refresh: "env-var-managed",
						access: currentToken,
						expires: FAR_FUTURE_EXPIRY,
					};
				},

				async refreshToken(_credentials) {
					// Re-read from env var on "refresh" — picks up any changes
					const currentToken = getOAuthToken();
					if (!currentToken) {
						throw new Error(
							`OAuth token no longer available in environment. ` +
							`Set ${ENV_PRIMARY} or ${ENV_ALIAS} to continue.`
						);
					}
					return {
						refresh: "env-var-managed",
						access: currentToken,
						expires: FAR_FUTURE_EXPIRY,
					};
				},

				getApiKey(_credentials) {
					// Always return the live env var value (not the stored credential)
					const currentToken = getOAuthToken();
					if (!currentToken) {
						throw new Error(`OAuth token not found in environment. Set ${ENV_PRIMARY}.`);
					}
					return currentToken;
				},
			},
		} : {}),
	});

	// ── /auth-status Command ───────────────────────────────────────

	pi.registerCommand("auth-status", {
		description: "Show current authentication method and status",
		async handler(_args, ctx) {
			const currentToken = getOAuthToken();
			const currentSource = getTokenSource();
			const authData = readAuthJson();
			const hasAuthJsonEntry = authData && typeof authData[PROVIDER_NAME] === "object";

			const lines: string[] = [];
			lines.push("═══ Authentication Status ═══");
			lines.push("");

			if (currentToken) {
				lines.push(`✅ Env var auth ACTIVE`);
				lines.push(`   Source:  ${currentSource}`);
				lines.push(`   Token:   ${maskToken(currentToken)}`);
				lines.push(`   Method:  Environment variable (no login required)`);
			} else {
				lines.push(`⚠️  Env var auth NOT configured`);
				lines.push(`   Neither ${ENV_PRIMARY} nor ${ENV_ALIAS} is set.`);
				lines.push(`   Set one in your shell profile to enable env-var auth.`);
			}

			lines.push("");

			if (hasAuthJsonEntry) {
				const entry = authData[PROVIDER_NAME] as Record<string, unknown>;
				if (entry.type === "oauth") {
					const expires = typeof entry.expires === "number" ? entry.expires : 0;
					const isExpired = expires < Date.now();
					lines.push(`📄 auth.json entry: ${isExpired ? "EXPIRED" : "valid"}`);
					if (typeof entry.access === "string") {
						lines.push(`   Access:  ${maskToken(entry.access)}`);
					}
					lines.push(`   Expires: ${new Date(expires).toLocaleString()}`);
					if (currentToken) {
						lines.push(`   ℹ️  Env var takes priority over auth.json.`);
						lines.push(`   Run /auth-logout to clear auth.json entry.`);
					}
				} else if (entry.type === "api_key") {
					lines.push(`📄 auth.json entry: API key`);
				}
			} else {
				lines.push(`📄 auth.json: No ${PROVIDER_NAME} entry`);
			}

			lines.push("");
			lines.push("─────────────────────────────");

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ── /auth-logout Command ───────────────────────────────────────

	pi.registerCommand("auth-logout", {
		description: "Clear built-in Anthropic OAuth credentials from auth.json",
		async handler(_args, ctx) {
			const authData = readAuthJson();

			if (!authData || !(PROVIDER_NAME in authData)) {
				ctx.ui.notify(
					`No ${PROVIDER_NAME} credentials found in auth.json. Nothing to clear.`,
					"info"
				);
				return;
			}

			const confirmed = await ctx.ui.confirm(
				"Clear Anthropic Credentials",
				`Remove the "${PROVIDER_NAME}" entry from auth.json?\n` +
				`This clears the built-in OAuth credentials.\n` +
				`${getOAuthToken() ? "Env var auth will continue to work." : "⚠️  No env var token set — you'll need to set one or /login again."}`
			);

			if (!confirmed) {
				ctx.ui.notify("Cancelled.", "info");
				return;
			}

			// Remove the anthropic entry
			const { [PROVIDER_NAME]: _removed, ...rest } = authData;
			writeAuthJson(rest);

			ctx.ui.notify(
				`✅ Cleared "${PROVIDER_NAME}" from auth.json.\n` +
				`${getOAuthToken() ? "Env var auth remains active." : "Set " + ENV_PRIMARY + " to continue using Claude."}`,
				"info"
			);
		},
	});

	// ── /auth-clear Alias ──────────────────────────────────────────

	pi.registerCommand("auth-clear", {
		description: "Alias for /auth-logout — clear built-in OAuth credentials",
		async handler(args, ctx) {
			// Delegate to auth-logout
			const commands = pi.getCommands();
			const logoutCmd = commands.find(c => c.name === "auth-logout");
			if (logoutCmd) {
				// Can't invoke commands directly, so duplicate the logic
				const authData = readAuthJson();

				if (!authData || !(PROVIDER_NAME in authData)) {
					ctx.ui.notify(
						`No ${PROVIDER_NAME} credentials found in auth.json. Nothing to clear.`,
						"info"
					);
					return;
				}

				const confirmed = await ctx.ui.confirm(
					"Clear Anthropic Credentials",
					`Remove the "${PROVIDER_NAME}" entry from auth.json?\n` +
					`This clears the built-in OAuth credentials.\n` +
					`${getOAuthToken() ? "Env var auth will continue to work." : "⚠️  No env var token set — you'll need to set one or /login again."}`
				);

				if (!confirmed) {
					ctx.ui.notify("Cancelled.", "info");
					return;
				}

				const { [PROVIDER_NAME]: _removed, ...rest } = authData;
				writeAuthJson(rest);

				ctx.ui.notify(
					`✅ Cleared "${PROVIDER_NAME}" from auth.json.\n` +
					`${getOAuthToken() ? "Env var auth remains active." : "Set " + ENV_PRIMARY + " to continue using Claude."}`,
					"info"
				);
			}
		},
	});
}
