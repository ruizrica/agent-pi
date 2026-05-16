// ABOUTME: Orchestrates a single tool-call review: build messages → call OpenRouter → parse verdict.
// ABOUTME: Fails open (allows) on any error/timeout/parse failure — the reviewer must never break the agent.

import { buildReviewerMessages, type ReviewerMessageInput } from "./tool-advisor-prompts.ts";
import {
	parseVerdict,
	type OpenRouterMessage,
	type OpenRouterPostResult,
} from "./tool-advisor-openrouter.ts";

export interface OpenRouterClient {
	postReview(
		messages: OpenRouterMessage[],
		opts: { model: string; timeoutMs: number },
	): Promise<OpenRouterPostResult>;
}

export interface ReviewVerdict {
	decision: "allow" | "block";
	confidence: number;
	reason: string;
	latencyMs: number;
	failedOpen?: boolean;
	error?: string;
}

export interface ReviewDeps {
	client: OpenRouterClient;
	model: string;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Review a single tool call.
 *
 * Contract:
 *  - On success: `{ decision, confidence, reason, latencyMs }`.
 *  - On any failure (network, parse, exception): `{ decision: "allow", failedOpen: true, error }`.
 *    Failing open is intentional — a broken reviewer must not block the agent.
 */
export async function reviewToolCall(
	input: ReviewerMessageInput,
	deps: ReviewDeps,
): Promise<ReviewVerdict> {
	const started = Date.now();
	const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	let post: OpenRouterPostResult;
	try {
		post = await deps.client.postReview(buildReviewerMessages(input), {
			model: deps.model,
			timeoutMs,
		});
	} catch (err: any) {
		return failOpen(`client threw: ${err?.message || err}`, started);
	}

	if (!post.ok) {
		return failOpen(post.error, started);
	}

	const parsed = parseVerdict(post.content);
	if (!parsed.ok) {
		return failOpen(`unparseable verdict: ${parsed.error}`, started);
	}

	return {
		decision: parsed.verdict.decision,
		confidence: parsed.verdict.confidence,
		reason: parsed.verdict.reason,
		latencyMs: Date.now() - started,
	};
}

function failOpen(error: string, started: number): ReviewVerdict {
	return {
		decision: "allow",
		confidence: 0,
		reason: `tool-advisor unavailable — failing open (${error})`,
		latencyMs: Date.now() - started,
		failedOpen: true,
		error,
	};
}
