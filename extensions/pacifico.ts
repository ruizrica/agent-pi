// ABOUTME: Pacifico extension — terminal client for the pacifico worker (chat + jobs).
// ABOUTME: Registers /pacifico, /pacifico-model, /pacifico-api-key, /pacifico-jobs/-job/-cancel and pacifico_infer tool.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { ensurePacificoEnvLoaded } from "./lib/load-pacifico-env.ts";
import { loadPacificoApiKey, loadPacificoModel, persistPacificoApiKey, persistPacificoModel } from "./lib/persist-pacifico.ts";

const PACIFICO_MESSAGE_TYPE = "pacifico_message";
const DEFAULT_BASE_URL = "https://pacifico.ruizrica2.workers.dev";

interface ModelChoice {
	id: string | null;
	label: string;
	note: string;
}

const MODEL_CHOICES: ModelChoice[] = [
	{ id: null, label: "(default)", note: "let pacifico pick — sync uses INSTANT_MODEL, async uses BASE_BACKGROUND_MODEL" },
	{ id: "openai/gpt-5.4-nano", label: "openai/gpt-5.4-nano", note: "sync, cheap (current INSTANT_MODEL default)" },
	{ id: "claude-haiku-4-5", label: "claude-haiku-4-5", note: "async, balanced (current BASE_BACKGROUND_MODEL default)" },
	{ id: "claude-opus-4-6", label: "claude-opus-4-6", note: "async, expensive — forces queue/batch" },
	{ id: "gpt-5.5", label: "gpt-5.5", note: "async, expensive" },
	{ id: "__custom__", label: "Custom…", note: "type any model string accepted by /api/infer" },
];

interface InferRequest {
	prompt: string;
	mode?: "sync" | "async" | "auto";
	model?: string;
}

interface InferSyncResponse {
	output: string;
	provider: string;
	model: string;
	mode: "sync";
	route: string;
	requestId: string;
	traceId?: string;
	decision?: string;
	reason?: string;
}

interface InferAsyncResponse {
	id: string;
	status: string;
	mode: "async";
	route: string;
	requestId: string;
	decision?: string;
	reason?: string;
	model?: string;
}

interface JobDetail {
	id: string;
	status: string;
	taskType?: string;
	input?: string;
	result?: { output?: string; provider?: string; model?: string; route?: string } | null;
	error?: string | null;
	createdAt?: string;
	completedAt?: string | null;
}

const POLL_SCHEDULE: Array<{ count: number; intervalMs: number }> = [
	{ count: 10, intervalMs: 1_000 },
	{ count: 12, intervalMs: 5_000 },
	{ count: 84, intervalMs: 10_000 },
];

function getBaseUrl(): string {
	ensurePacificoEnvLoaded();
	return (process.env.PACIFICO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getApiKey(): string | undefined {
	ensurePacificoEnvLoaded();
	const fromEnv = process.env.PACIFICO_API_KEY?.trim() || process.env.HARNESS_API_KEY?.trim();
	if (fromEnv) return fromEnv;
	return loadPacificoApiKey();
}

function resolveModel(): string | null {
	ensurePacificoEnvLoaded();
	const envModel = process.env.PACIFICO_MODEL;
	if (envModel && envModel.length > 0) return envModel;
	return loadPacificoModel();
}

function emitMessage(pi: ExtensionAPI, text: string): void {
	pi.sendMessage({ customType: PACIFICO_MESSAGE_TYPE, content: text, display: true });
}

function describeModel(model: string | null): string {
	return model ?? "(default — backend chooses)";
}

function updateStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	const model = resolveModel();
	const label = model ? `pf: ${model}` : "pf: default";
	ctx.ui.setStatus("pacifico", label);
}

async function pacificoFetch(path: string, init: RequestInit & { body?: string }): Promise<Response> {
	const apiKey = getApiKey();
	if (!apiKey) throw new Error("Pacifico API key missing (PACIFICO_API_KEY / HARNESS_API_KEY or extensions/.pacifico.env)");
	const headers: Record<string, string> = {
		"Authorization": `Bearer ${apiKey}`,
		...((init.headers as Record<string, string> | undefined) ?? {}),
	};
	if (init.body !== undefined && !headers["Content-Type"]) {
		headers["Content-Type"] = "application/json";
	}
	const response = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });
	return response;
}

async function readErrorBody(response: Response): Promise<string> {
	try {
		const text = await response.text();
		try {
			const parsed = JSON.parse(text);
			if (parsed && typeof parsed.error === "string") return parsed.error;
		} catch {
			// fall through to raw text
		}
		return text || `HTTP ${response.status}`;
	} catch {
		return `HTTP ${response.status}`;
	}
}

async function postInfer(req: InferRequest): Promise<{ kind: "sync"; data: InferSyncResponse } | { kind: "async"; data: InferAsyncResponse }> {
	const response = await pacificoFetch("/api/infer", {
		method: "POST",
		body: JSON.stringify(req),
	});
	if (response.status === 200) return { kind: "sync", data: (await response.json()) as InferSyncResponse };
	if (response.status === 202) return { kind: "async", data: (await response.json()) as InferAsyncResponse };
	throw new Error(`/api/infer ${response.status}: ${await readErrorBody(response)}`);
}

async function getJob(id: string): Promise<JobDetail> {
	const response = await pacificoFetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "GET" });
	if (response.status !== 200) throw new Error(`/api/jobs/${id} ${response.status}: ${await readErrorBody(response)}`);
	const body = (await response.json()) as { job: JobDetail };
	return body.job;
}

async function listJobs(): Promise<JobDetail[]> {
	const response = await pacificoFetch("/api/jobs", { method: "GET" });
	if (response.status !== 200) throw new Error(`/api/jobs ${response.status}: ${await readErrorBody(response)}`);
	const body = (await response.json()) as { jobs: JobDetail[] };
	return body.jobs;
}

async function postCancel(id: string): Promise<{ id: string; cancelled: boolean; previousStatus?: string }> {
	const response = await pacificoFetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
	if (response.status !== 200) throw new Error(`/api/jobs/${id}/cancel ${response.status}: ${await readErrorBody(response)}`);
	return (await response.json()) as { id: string; cancelled: boolean; previousStatus?: string };
}

interface Poller {
	jobId: string;
	abort(): void;
}

function isTerminal(status: string): boolean {
	return status === "completed" || status === "failed" || status === "cancelled";
}

function pollJob(jobId: string, signal: AbortSignal): Promise<JobDetail> {
	return new Promise((resolve, reject) => {
		const ticks: number[] = [];
		for (const phase of POLL_SCHEDULE) for (let i = 0; i < phase.count; i++) ticks.push(phase.intervalMs);
		let cancelled = false;
		const onAbort = () => {
			cancelled = true;
			signal.removeEventListener("abort", onAbort);
			reject(new Error("aborted"));
		};
		signal.addEventListener("abort", onAbort);

		const run = async () => {
			for (const intervalMs of ticks) {
				if (cancelled) return;
				try {
					const job = await getJob(jobId);
					if (isTerminal(job.status)) {
						signal.removeEventListener("abort", onAbort);
						resolve(job);
						return;
					}
				} catch (err) {
					signal.removeEventListener("abort", onAbort);
					reject(err);
					return;
				}
				await new Promise((r) => setTimeout(r, intervalMs));
			}
			signal.removeEventListener("abort", onAbort);
			reject(new Error("Polling timed out before job reached terminal state"));
		};
		void run();
	});
}

function formatJobOutcome(job: JobDetail): string {
	const header = `**Pacifico job \`${job.id}\` — ${job.status}**`;
	if (job.status === "completed" && job.result?.output) {
		const provider = job.result.provider ? ` · ${job.result.provider}` : "";
		const model = job.result.model ? ` · ${job.result.model}` : "";
		const route = job.result.route ? ` · route ${job.result.route}` : "";
		return `${header}${provider}${model}${route}\n\n${job.result.output}`;
	}
	if (job.status === "failed") {
		return `${header}\n\n${job.error ?? "(no error message)"}`;
	}
	if (job.status === "cancelled") {
		return `${header}\n\n_Cancelled before completion._`;
	}
	return `${header}\n\n_Job ended with status ${job.status} but no output was returned._`;
}

export default function pacificoExtension(pi: ExtensionAPI) {
	ensurePacificoEnvLoaded();
	const pollers = new Map<string, Poller>();

	function registerPoller(jobId: string, ctx: ExtensionContext): void {
		if (pollers.has(jobId)) return;
		const controller = new AbortController();
		pollers.set(jobId, { jobId, abort: () => controller.abort() });
		void (async () => {
			try {
				const final = await pollJob(jobId, controller.signal);
				if (ctx.hasUI) ctx.ui.notify(`Pacifico job ${jobId} ${final.status}`, final.status === "completed" ? "info" : "warning");
				emitMessage(pi, formatJobOutcome(final));
			} catch (err) {
				if (ctx.hasUI) ctx.ui.notify(`Pacifico job ${jobId} poll failed: ${err instanceof Error ? err.message : String(err)}`, "error");
			} finally {
				pollers.delete(jobId);
			}
		})();
	}

	async function pickAndPersistModel(ctx: ExtensionContext): Promise<string | null | undefined> {
		if (!ctx.hasUI) return undefined;
		const items = MODEL_CHOICES.map((c) => `${c.label} — ${c.note}`);
		const picked = await ctx.ui.select("Pacifico model", items);
		if (!picked) return undefined;
		const idx = items.indexOf(picked);
		const choice = MODEL_CHOICES[idx];
		let toPersist: string | null;
		if (choice.id === "__custom__") {
			const typed = await ctx.ui.input("Custom model id", "e.g. claude-sonnet-4-6 or openai/gpt-4.1");
			if (!typed) return undefined;
			toPersist = typed.trim();
			if (!toPersist) return undefined;
		} else {
			toPersist = choice.id;
		}
		persistPacificoModel(toPersist);
		updateStatus(ctx);
		ctx.ui.notify(`Pacifico model: ${describeModel(toPersist)}`, "info");
		return toPersist;
	}

	async function runInferAndRender(prompt: string, ctx: ExtensionContext): Promise<void> {
		if (!getApiKey()) {
			ctx.ui.notify("Pacifico API key missing — refusing to send. Use PACIFICO_API_KEY / HARNESS_API_KEY or extensions/.pacifico.env.", "error");
			return;
		}
		const model = resolveModel();
		const body: InferRequest = { prompt, mode: "auto" };
		if (model) body.model = model;
		try {
			const result = await postInfer(body);
			if (result.kind === "sync") {
				const r = result.data;
				const meta = `_${r.provider} · ${r.model} · route ${r.route}_`;
				emitMessage(pi, `${meta}\n\n${r.output}`);
			} else {
				const r = result.data;
				const queued = `⏳ Queued as \`${r.id}\` — model \`${r.model ?? "(default)"}\`${r.reason ? ` — ${r.reason}` : ""}.\nWill notify when complete.`;
				emitMessage(pi, queued);
				registerPoller(r.id, ctx);
			}
		} catch (err) {
			ctx.ui.notify(`/api/infer failed: ${err instanceof Error ? err.message : String(err)}`, "error");
		}
	}

	// --- Filter our display-only messages out of the LLM context ---
	pi.on("context", async (event) => ({
		messages: event.messages.filter((m: any) => !(m.role === "custom" && m.customType === PACIFICO_MESSAGE_TYPE)),
	}));

	// --- Tear down pollers when pi exits ---
	pi.on("session_shutdown", async () => {
		for (const p of pollers.values()) p.abort();
		pollers.clear();
	});

	// --- Status bar reflects current model on session start ---
	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
		if (!getApiKey()) {
			ctx.ui.notify(
				"Pacifico API key missing — run /pacifico-api-key to save it (same path as /pacifico-model), or set PACIFICO_API_KEY / .pacifico.env.",
				"warning",
			);
		}
	});

	// --- /pacifico [prompt] ---
	pi.registerCommand("pacifico", {
		description: "Send a prompt to the pacifico backend; with no args, opens the model picker (first run) or shows current model.",
		handler: async (args, ctx) => {
			const prompt = args.trim();
			if (prompt.length === 0) {
				const current = resolveModel();
				if (current === null) {
					const picked = await pickAndPersistModel(ctx);
					if (picked === undefined) return;
					emitMessage(pi, `Pacifico model set to **${describeModel(picked)}**. Use \`/pacifico <message>\` to send a prompt, or \`/pacifico-model\` to change.`);
					return;
				}
				emitMessage(pi, `Pacifico model is **${describeModel(current)}**. Send a prompt with \`/pacifico <message>\`, change with \`/pacifico-model\`.`);
				return;
			}
			await runInferAndRender(prompt, ctx);
		},
	});

	// --- /pacifico-model ---
	pi.registerCommand("pacifico-model", {
		description: "Pick (or change) the pacifico model used for /pacifico calls",
		handler: async (_args, ctx) => {
			await pickAndPersistModel(ctx);
		},
	});

	// --- /pacifico-api-key [key] ---
	pi.registerCommand("pacifico-api-key", {
		description: "Save Pacifico PACIFICO_API_KEY to settings.json (same file as model). No args + UI = prompt; empty clears.",
		handler: async (args, ctx) => {
			const feedback = (msg: string, level: "info" | "warning" = "info") => {
				if (ctx.hasUI) ctx.ui.notify(msg, level);
				else emitMessage(pi, msg);
			};
			const apply = (raw: string) => {
				const t = raw.trim();
				if (t.length === 0) {
					persistPacificoApiKey(null);
					delete process.env.PACIFICO_API_KEY;
					delete process.env.HARNESS_API_KEY;
					feedback("Pacifico API key cleared from settings.");
					return;
				}
				persistPacificoApiKey(t);
				process.env.PACIFICO_API_KEY = t;
				feedback("Pacifico API key saved (settings.json + this session).");
			};
			const inline = args.trim();
			if (inline.length > 0) {
				apply(inline);
				return;
			}
			if (!ctx.hasUI) {
				emitMessage(pi, "Usage: `/pacifico-api-key <your-key>` (same value as Pacifico Worker) or use a UI session for the prompt.");
				return;
			}
			const key = await ctx.ui.input(
				"Pacifico API key (paste from Pacifico .dev.vars; empty = clear)",
				"min 32 chars on Worker",
			);
			if (key === undefined) return;
			apply(key);
		},
	});

	// --- /pacifico-jobs ---
	pi.registerCommand("pacifico-jobs", {
		description: "List your recent pacifico jobs",
		handler: async (_args, ctx) => {
			try {
				const jobs = await listJobs();
				if (jobs.length === 0) {
					emitMessage(pi, "_No jobs yet._");
					return;
				}
				const lines = ["**Pacifico jobs**", ""];
				for (const j of jobs.slice(0, 50)) {
					const created = j.createdAt ?? "";
					const completed = j.completedAt ? ` → ${j.completedAt}` : "";
					const inputPreview = (j.input ?? "").replace(/\s+/g, " ").slice(0, 60);
					lines.push(`- \`${j.id}\` · **${j.status}** · ${j.taskType ?? "?"} · ${created}${completed}` + (inputPreview ? ` — ${inputPreview}` : ""));
				}
				emitMessage(pi, lines.join("\n"));
			} catch (err) {
				ctx.ui.notify(`pacifico-jobs failed: ${err instanceof Error ? err.message : String(err)}`, "error");
			}
		},
	});

	// --- /pacifico-job <id> ---
	pi.registerCommand("pacifico-job", {
		description: "Inspect a single pacifico job: /pacifico-job <id>",
		handler: async (args, ctx) => {
			const id = args.trim();
			if (!id) {
				ctx.ui.notify("Usage: /pacifico-job <id>", "warning");
				return;
			}
			try {
				const job = await getJob(id);
				emitMessage(pi, formatJobOutcome(job));
			} catch (err) {
				ctx.ui.notify(`pacifico-job failed: ${err instanceof Error ? err.message : String(err)}`, "error");
			}
		},
	});

	// --- /pacifico-cancel <id> ---
	pi.registerCommand("pacifico-cancel", {
		description: "Cancel a non-terminal pacifico job: /pacifico-cancel <id>",
		handler: async (args, ctx) => {
			const id = args.trim();
			if (!id) {
				ctx.ui.notify("Usage: /pacifico-cancel <id>", "warning");
				return;
			}
			const local = pollers.get(id);
			if (local) {
				local.abort();
				pollers.delete(id);
			}
			try {
				const result = await postCancel(id);
				if (result.cancelled) ctx.ui.notify(`Cancelled job ${id} (was ${result.previousStatus ?? "?"})`, "info");
				else ctx.ui.notify(`Job ${id} was already terminal (${result.previousStatus ?? "?"})`, "warning");
			} catch (err) {
				ctx.ui.notify(`pacifico-cancel failed: ${err instanceof Error ? err.message : String(err)}`, "error");
			}
		},
	});

	// --- pacifico_infer tool (agent-callable; blocks until result is ready) ---
	pi.registerTool({
		name: "pacifico_infer",
		label: "Pacifico Infer",
		description:
			"Send a prompt to the pacifico backend (auto-routes between an instant gateway and a queue/batch system). Returns the model output as text. Use this when you specifically want pacifico's billing/observability/cost-routing in the loop, not just any LLM call.",
		parameters: Type.Object({
			prompt: Type.String({ description: "The prompt to send to /api/infer" }),
			model: Type.Optional(Type.String({ description: "Optional pacifico model override (e.g. claude-haiku-4-5). Falls back to PACIFICO_MODEL / persisted setting / backend default." })),
			mode: Type.Optional(Type.Union([Type.Literal("sync"), Type.Literal("async"), Type.Literal("auto")], { description: "Routing hint; defaults to auto" })),
		}) as any,
		async execute(_id, params, signal, _onUpdate, _ctx) {
			const apiKey = getApiKey();
			if (!apiKey) {
				return {
					content: [{ type: "text", text: "Pacifico API key missing; set PACIFICO_API_KEY or extensions/.pacifico.env — refusing /api/infer." }],
					details: { error: "missing_api_key" },
				};
			}
			const p = params as { prompt: string; model?: string; mode?: "sync" | "async" | "auto" };
			const body: InferRequest = { prompt: p.prompt, mode: p.mode ?? "auto" };
			const chosen = p.model ?? resolveModel();
			if (chosen) body.model = chosen;
			try {
				const result = await postInfer(body);
				if (result.kind === "sync") {
					const r = result.data;
					return {
						content: [{ type: "text", text: r.output }],
						details: { route: r.route, provider: r.provider, model: r.model, mode: r.mode, requestId: r.requestId },
					};
				}
				const ctrl = new AbortController();
				const onParentAbort = () => ctrl.abort();
				if (signal) {
					if (signal.aborted) ctrl.abort();
					else signal.addEventListener("abort", onParentAbort);
				}
				try {
					const job = await pollJob(result.data.id, ctrl.signal);
					if (job.status === "completed" && job.result?.output) {
						return {
							content: [{ type: "text", text: job.result.output }],
							details: { jobId: job.id, route: job.result.route, provider: job.result.provider, model: job.result.model, status: job.status },
						};
					}
					return {
						content: [{ type: "text", text: `Job ${job.id} ended ${job.status}${job.error ? `: ${job.error}` : "."}` }],
						details: { jobId: job.id, status: job.status, error: job.error ?? null },
					};
				} finally {
					if (signal) signal.removeEventListener("abort", onParentAbort);
				}
			} catch (err) {
				return {
					content: [{ type: "text", text: `pacifico_infer failed: ${err instanceof Error ? err.message : String(err)}` }],
					details: { error: err instanceof Error ? err.message : String(err) },
				};
			}
		},
	});
}
