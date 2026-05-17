// ABOUTME: tool_advisor extension — LLM gatekeeper for destructive tool calls (Apple paper pattern).
// ABOUTME: pi.on("tool_call") routes in-scope calls to the agents/models.json tool-advisor model for review.

/**
 * tool_advisor — Inference-time reviewer gate
 *
 * Implements the "Gatekeeper" pattern from Apple's reinforced-agent paper:
 * a secondary LLM reviews each destructive tool call BEFORE execution and
 * either allows it or returns a critique. On block, the main agent sees the
 * critique and naturally retries with a corrected call.
 *
 * Hooks:
 *   session_start — Resolve the reviewer model from agents/models.json.
 *   tool_call     — Apply scope filter; if in scope, run the review and
 *                   translate the verdict to { block, reason }.
 *
 * Commands:
 *   /tool-advisor [status|policy] — View per-session stats and current model.
 *
 * Ordering:
 *   security-guard.ts → tool-advisor.ts → tasks.ts (alphabetical).
 *   security-guard's pattern scan short-circuits clearly-malicious calls so we
 *   don't pay an OpenRouter round-trip on every `rm -rf`.
 *
 * Fail-open: any reviewer error/timeout/parse failure returns { block: false }
 * with a warning. A broken reviewer must never break the agent.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { complete } from "@earendil-works/pi-ai";
import { Box, Text } from "@earendil-works/pi-tui";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildModelString, loadAgentModelsConfig, resolveAgentModelString, type AgentModelEntry } from "./lib/agent-defs.ts";
import { isInScope, explainScope } from "./lib/tool-advisor/tool-advisor-policy.ts";
import {
	reviewToolCall,
	type OpenRouterClient,
	type ReviewVerdict,
} from "./lib/tool-advisor/tool-advisor-runner.ts";
import { postReview } from "./lib/tool-advisor/tool-advisor-openrouter.ts";
import {
	applyToggleAction,
	initialToggleState,
	type ToggleAction,
	type ToggleState,
} from "./lib/tool-advisor/tool-advisor-toggle.ts";
import type { OpenRouterMessage, OpenRouterPostResult } from "./lib/tool-advisor/tool-advisor-openrouter.ts";

const AGENT_NAME = "tool-advisor";
const DEFAULT_MODEL_FALLBACK = "openrouter/openai/gpt-5-nano";
const DEFAULT_MODEL_ENTRY: AgentModelEntry = { provider: "openrouter", model: "openai/gpt-5-nano" };
const REVIEW_TIMEOUT_MS = 4000;
/** Hard cap on reviews per session — protects against runaway cost on stuck loops. */
const MAX_REVIEWS_PER_SESSION = 200;

interface SessionStats {
	reviews: number;
	allowed: number;
	blocked: number;
	failedOpen: number;
	totalLatencyMs: number;
	lastVerdict?: ReviewVerdict & { toolName: string };
}

function freshStats(): SessionStats {
	return { reviews: 0, allowed: 0, blocked: 0, failedOpen: 0, totalLatencyMs: 0 };
}

interface AdvisorCardDetails {
	verdict: "allow" | "block" | "skip" | "passed (reviewer error)";
	tool: string;
	reason: string;
	latencyMs?: number;
}

export default function toolAdvisor(pi: ExtensionAPI) {
	let stats = freshStats();
	let reviewerModel = DEFAULT_MODEL_FALLBACK;
	let reviewerEntry: AgentModelEntry = DEFAULT_MODEL_ENTRY;
	let projectRoot = "";
	let toggle: ToggleState = initialToggleState(false);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const defaultRoot = `${__dirname}/..`;

	// ── TUI guard card ───────────────────────────────────────────────────────

	function renderCard(message: any, _options: any, theme: any) {
		const d: AdvisorCardDetails = message.details || ({} as any);
		const title = theme.fg("muted", "tool-advisor");
		// Reviewer errors are MUTED (not warning) because the tool DID pass —
		// the agent is not blocked. A warning color would falsely suggest a stop.
		const color =
			d.verdict === "block" ? "warning" :
			"muted";
		const verdict = theme.bold(theme.fg(color, d.verdict));
		const tool = theme.fg("dim", d.tool || "?");
		const reason = theme.fg("dim", d.reason || "");
		const latency = d.latencyMs != null ? theme.fg("dim", `${d.latencyMs}ms`) : "";

		const body = `${title}  │  ${verdict}  │  ${tool}  │  ${reason}${latency ? "  │  " + latency : ""}`;

		const cardBg = (text: string) => `\x1b[48;2;50;50;50m${text}\x1b[49m`;
		const box = new Box(2, 1, cardBg);
		box.addChild(new Text(body, 0, 0));
		return box;
	}

	pi.registerMessageRenderer<AdvisorCardDetails>("tool-advisor-event", renderCard);

	function emitCard(details: AdvisorCardDetails) {
		pi.sendMessage({
			customType: "tool-advisor-event",
			content: `tool-advisor | ${details.verdict} | ${details.tool} | ${details.reason}`,
			display: true,
			details,
		});
	}

	// ── Reviewer clients ──────────────────────────────────────────────────────

	async function postReviewViaModelRegistry(
		messages: OpenRouterMessage[],
		opts: { provider: string; model: string; displayModel: string; timeoutMs: number },
		ctx: ExtensionContext,
	): Promise<OpenRouterPostResult> {
		const model = ctx.modelRegistry.find(opts.provider, opts.model);
		if (!model) return { ok: false, error: `model not found: ${opts.displayModel}` };

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) {
			return { ok: false, error: auth.ok ? `No API key for ${opts.provider}` : auth.error };
		}

		const systemPrompt = messages
			.filter((m) => m.role === "system")
			.map((m) => m.content)
			.join("\n\n");
		const aiMessages = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role,
				content: [{ type: "text" as const, text: m.content }],
				timestamp: Date.now(),
			}));

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), Math.max(500, opts.timeoutMs));
		try {
			const response = await complete(
				model,
				{ systemPrompt, messages: aiMessages as any },
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					signal: controller.signal,
					timeoutMs: opts.timeoutMs,
					maxRetries: 0,
					maxTokens: 500,
				},
			);
			const content = response.content
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text)
				.join("\n")
				.trim();
			if (!content) return { ok: false, error: "empty response content" };
			return { ok: true, content };
		} catch (err: any) {
			if (err?.name === "AbortError") return { ok: false, error: "timeout" };
			return { ok: false, error: String(err?.message || err) };
		} finally {
			clearTimeout(timer);
		}
	}

	function makeClient(ctx: ExtensionContext): OpenRouterClient {
		return {
			async postReview(messages, opts) {
				if (reviewerEntry.provider === "openrouter") {
					return postReview(messages, { model: opts.model, timeoutMs: opts.timeoutMs });
				}
				return postReviewViaModelRegistry(messages, {
					provider: reviewerEntry.provider,
					model: reviewerEntry.model,
					displayModel: reviewerModel,
					timeoutMs: opts.timeoutMs,
				}, ctx);
			},
		};
	}

	// ── Lifecycle ────────────────────────────────────────────────────────────

	function initFromCwd(cwd?: string) {
		projectRoot = cwd || defaultRoot;
		let configured = false;
		try {
			const config = loadAgentModelsConfig(projectRoot, defaultRoot);
			const entry = config.agents?.[AGENT_NAME];
			if (entry?.provider && entry.model) {
				configured = true;
				reviewerEntry = entry;
				reviewerModel = resolveAgentModelString(AGENT_NAME, config);
			} else {
				reviewerEntry = DEFAULT_MODEL_ENTRY;
				reviewerModel = buildModelString(DEFAULT_MODEL_ENTRY);
			}
		} catch {
			reviewerEntry = DEFAULT_MODEL_ENTRY;
			reviewerModel = DEFAULT_MODEL_FALLBACK;
		}
		toggle = initialToggleState(configured);
	}

	initFromCwd();

	pi.on("session_start", async (_event, ctx) => {
		stats = freshStats();
		initFromCwd((ctx as any)?.cwd);
	});

	// ── Tool-call gate ───────────────────────────────────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		if (!toggle.enabled) return { block: false };

		const toolName = (event as any).toolName as string;
		const toolInput =
			(event as any).input ?? (event as any).arguments ?? (event as any).params ?? {};

		if (!isInScope(toolName, toolInput)) return { block: false };

		if (stats.reviews >= MAX_REVIEWS_PER_SESSION) {
			// Cost cap reached — silently allow rather than spam cards.
			return { block: false };
		}

		const verdict = await reviewToolCall(
			{ toolName, toolInput },
			{ client: makeClient(ctx), model: reviewerModel, timeoutMs: REVIEW_TIMEOUT_MS },
		);

		stats.reviews++;
		stats.totalLatencyMs += verdict.latencyMs;
		stats.lastVerdict = { ...verdict, toolName };

		if (verdict.failedOpen) {
			// Reviewer broke — tool passes through unchanged. This is the
			// promised contract: "if we fail, allow the tool use to pass."
			// The card emits for transparency but never blocks the agent.
			stats.failedOpen++;
			emitCard({
				verdict: "passed (reviewer error)",
				tool: toolName,
				reason: verdict.error || verdict.reason,
				latencyMs: verdict.latencyMs,
			});
			return { block: false };
		}

		if (verdict.decision === "block") {
			stats.blocked++;
			emitCard({
				verdict: "block",
				tool: toolName,
				reason: verdict.reason,
				latencyMs: verdict.latencyMs,
			});
			return { block: true, reason: `tool-advisor blocked: ${verdict.reason}` };
		}

		stats.allowed++;
		emitCard({
			verdict: "allow",
			tool: toolName,
			reason: verdict.reason,
			latencyMs: verdict.latencyMs,
		});
		return { block: false };
	});

	// ── Status command ──────────────────────────────────────────────────────

	pi.registerCommand("tool-advisor", {
		description: "Toggle and inspect the tool-advisor gate (/tool-advisor on|off|status|scope <tool>)",
		async execute(args: string[], ctx) {
			const sub = (args[0] || "status").toLowerCase();

			if (sub === "on" || sub === "off" || sub === "status") {
				const result = applyToggleAction(toggle, sub as ToggleAction);
				toggle = result.state;
				if (sub === "status") {
					// Status: also dump session stats + model + scope hint.
					const avg = stats.reviews > 0 ? Math.round(stats.totalLatencyMs / stats.reviews) : 0;
					const lines = [
						result.message,
						`  model: ${reviewerModel}`,
						`  reviews: ${stats.reviews}  allowed: ${stats.allowed}  blocked: ${stats.blocked}  failed-open: ${stats.failedOpen}`,
						`  avg latency: ${avg}ms  total: ${stats.totalLatencyMs}ms`,
					];
					if (stats.lastVerdict) {
						lines.push(`  last: ${stats.lastVerdict.toolName} → ${stats.lastVerdict.decision} (${stats.lastVerdict.reason})`);
					}
					ctx?.ui?.notify(lines.join("\n"), "info");
					return;
				}
				ctx?.ui?.notify(result.message, result.level);
				return;
			}

			if (sub === "scope") {
				const tool = args[1] || "bash";
				const ex = explainScope(tool);
				ctx?.ui?.notify(`${tool}: ${ex.inScope ? "in scope" : "skip"} — ${ex.reason}`, "info");
				return;
			}

			ctx?.ui?.notify(
				"Usage: /tool-advisor [on|off|status|scope <tool>]",
				"info",
			);
		},
	});
}
