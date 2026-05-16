// ABOUTME: Minimal OpenRouter HTTPS client + verdict parser for tool_advisor.
// ABOUTME: Uses built-in fetch (Node 20+); AbortController-bounded timeout; no SDK dependency.

export interface OpenRouterMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface OpenRouterPostOptions {
	model: string;
	timeoutMs: number;
	apiKey?: string;
	endpoint?: string;
}

/**
 * Strip the internal "openrouter/" routing prefix that agents/models.json adds.
 *
 * Pi uses provider/model strings ("openrouter/openai/gpt-5-nano") so the
 * internal router knows where to send the call. OpenRouter's HTTP API only
 * knows about the bare slug ("openai/gpt-5-nano") — the "openrouter/" part
 * is meaningful to us, meaningless to them, and returns HTTP 400 if sent.
 */
export function normalizeOpenRouterModelId(id: string): string {
	const trimmed = (id || "").trim();
	return trimmed.startsWith("openrouter/") ? trimmed.slice("openrouter/".length) : trimmed;
}

export type OpenRouterPostResult =
	| { ok: true; content: string }
	| { ok: false; error: string };

/**
 * POST chat/completions to OpenRouter and return the assistant's text content.
 *
 * Fails into `{ ok: false }` on:
 *  - missing OPENROUTER_API_KEY env var
 *  - non-2xx HTTP status
 *  - abort/timeout
 *  - malformed response envelope (no choices[0].message.content)
 *
 * Never throws — caller can rely on the discriminated union.
 */
export async function postReview(
	messages: OpenRouterMessage[],
	opts: OpenRouterPostOptions,
): Promise<OpenRouterPostResult> {
	const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return { ok: false, error: "OPENROUTER_API_KEY not set" };
	}

	const endpoint = opts.endpoint ?? "https://openrouter.ai/api/v1/chat/completions";
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.max(500, opts.timeoutMs));

	try {
		const res = await fetch(endpoint, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"content-type": "application/json",
				"authorization": `Bearer ${apiKey}`,
				"x-title": "pi-tool-advisor",
			},
			body: JSON.stringify({
				model: normalizeOpenRouterModelId(opts.model),
				messages,
				temperature: 0.2,
				// NOTE: deliberately omit response_format: { type: "json_object" }.
				// Several OpenRouter-hosted models (notably the gpt-5 reasoning
				// family) return empty content when strict JSON mode is forced —
				// they want to emit reasoning_content first. The system prompt
				// already requests strict JSON; parseVerdict tolerates markdown
				// fences and surrounding prose. Belt-and-suspenders here became
				// a single point of failure in production.
			}),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return { ok: false, error: `HTTP ${res.status} ${truncate(body, 200)}` };
		}

		const json: any = await res.json().catch(() => null);
		const content: unknown = json?.choices?.[0]?.message?.content;
		if (typeof content !== "string" || !content.trim()) {
			return { ok: false, error: "empty response content" };
		}
		return { ok: true, content };
	} catch (err: any) {
		if (err?.name === "AbortError") return { ok: false, error: "timeout" };
		return { ok: false, error: String(err?.message || err) };
	} finally {
		clearTimeout(timer);
	}
}

// ── Verdict parsing ──────────────────────────────────────────────────────────

export interface Verdict {
	decision: "allow" | "block";
	confidence: number;
	reason: string;
}

export type ParseVerdictResult =
	| { ok: true; verdict: Verdict }
	| { ok: false; error: string };

/**
 * Parse a reviewer response into a typed verdict.
 * Tolerates surrounding noise (e.g. ```json fences) by extracting the first
 * `{...}` block. Rejects malformed JSON or invalid decision values.
 */
export function parseVerdict(raw: string): ParseVerdictResult {
	const text = (raw || "").trim();
	if (!text) return { ok: false, error: "empty" };

	let jsonStr = text;
	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) jsonStr = fenceMatch[1].trim();
	if (!jsonStr.startsWith("{")) {
		const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
		if (braceMatch) jsonStr = braceMatch[0];
	}

	let parsed: any;
	try {
		parsed = JSON.parse(jsonStr);
	} catch (err: any) {
		return { ok: false, error: `parse error: ${err?.message || err}` };
	}

	if (!parsed || typeof parsed !== "object") {
		return { ok: false, error: "not an object" };
	}
	if (parsed.decision !== "allow" && parsed.decision !== "block") {
		return { ok: false, error: `invalid decision: ${JSON.stringify(parsed.decision)}` };
	}

	const confidence = typeof parsed.confidence === "number"
		? Math.max(0, Math.min(1, parsed.confidence))
		: 0.5;
	const reason = typeof parsed.reason === "string" ? parsed.reason : "";

	return { ok: true, verdict: { decision: parsed.decision, confidence, reason } };
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max) + "…";
}
