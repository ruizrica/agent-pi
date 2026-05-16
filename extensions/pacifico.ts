// ABOUTME: Pacifico extension — terminal client for the pacifico worker (chat + jobs).
// ABOUTME: Registers /pacifico, /pacifico-model, /pacifico-api-key, /pacifico-jobs/-job/-cancel and pacifico_infer tool.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { ensurePacificoEnvLoaded } from "./lib/load-pacifico-env.ts";
import {
	listIncompletePacificoJobs,
	listPendingPacificoCompletions,
	markPacificoJobNotified,
	markPacificoJobPollError,
	markPacificoJobTerminal,
	prunePacificoJobs,
	saveSubmittedPacificoJob,
	type PacificoTrackedJob,
} from "./lib/pacifico-job-state.ts";
import { loadPacificoApiKey, loadPacificoModel, persistPacificoApiKey, persistPacificoModel } from "./lib/persist-pacifico.ts";

const PACIFICO_MESSAGE_TYPE = "pacifico_message";
const PACIFICO_JOB_COMPLETE_TYPE = "pacifico_job_complete";
const DEFAULT_BASE_URL = "https://pacifico.ruizrica2.workers.dev";
const COMPLETION_FLUSH_DELAY_MS = 500;
const COMPLETION_RETRY_DELAY_MS = 5_000;
const PACIFICO_JOB_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

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
	metadata?: Record<string, unknown>;
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
	model?: string | null;
	mode?: string | null;
	route?: string | null;
	result?: { output?: string; provider?: string; model?: string; route?: string } | null;
	error?: string | null;
	createdAt?: string;
	completedAt?: string | null;
}

const ASYNC_POLL_SCHEDULE: Array<{ count: number; intervalMs: number }> = [
	{ count: 240, intervalMs: 15_000 },
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

interface PacificoWidgetDetails {
	status?: string | null;
	jobId?: string | null;
	model?: string | null;
	output?: string | null;
	error?: string | null;
}

type PacificoWidgetStatus = "queued" | "processing" | "completed" | "error";

function normalizeWidgetStatus(status: string | null | undefined): PacificoWidgetStatus {
	const s = status?.trim().toLowerCase();
	if (s === "processing" || s === "submitted" || s === "running") return "processing";
	if (s === "completed" || s === "complete") return "completed";
	if (s === "failed" || s === "error" || s === "cancelled") return "error";
	return "queued";
}

function statusColor(status: PacificoWidgetStatus): string {
	if (status === "completed") return "\x1b[38;2;34;197;94m";
	if (status === "processing") return "\x1b[38;2;234;179;8m";
	if (status === "error") return "\x1b[38;2;239;68;68m";
	return "\x1b[38;2;148;163;184m";
}

function renderStatus(status: PacificoWidgetStatus): string {
	return `${statusColor(status)}${status}\x1b[39m`;
}

function formatPacificoWidgetContent(details: PacificoWidgetDetails): string {
	const lines = [`status: ${normalizeWidgetStatus(details.status)}`];
	if (details.jobId) lines.push(`job: ${details.jobId}`);
	if (details.model) lines.push(`model: ${details.model}`);
	return lines.join("\n");
}

function emitPacificoWidget(pi: ExtensionAPI, details: PacificoWidgetDetails): void {
	pi.sendMessage({
		customType: PACIFICO_MESSAGE_TYPE,
		content: formatPacificoWidgetContent(details),
		display: true,
		details,
	});
}

function renderPacificoMessage(message: { content?: unknown; details?: PacificoWidgetDetails }, _options: unknown, theme: any): Box {
	const content = typeof message.content === "string" ? message.content : "";
	const details = message.details ?? {};
	const status = normalizeWidgetStatus(details.status);
	const label = `\x1b[38;2;234;179;8m${theme.bold("pacifico")}\x1b[39m`;
	const key = (text: string) => theme.fg("dim", text.padEnd(6));
	const modelText = details.model ?? "(default)";
	const model = theme.bold(`\x1b[38;2;125;137;151m${modelText}\x1b[39m`);
	const lines = [
		label,
		`${key("status")} ${renderStatus(status)}`,
		`${key("job")} ${theme.fg("muted", details.jobId ?? "pending")}`,
		`${key("model")} ${model}`,
	];
	if (!message.details && content) {
		lines.push("", theme.fg("muted", content));
	}
	const cardBg = (text: string) => `\x1b[48;2;50;50;50m${text}\x1b[49m`;
	const box = new Box(2, 1, cardBg);
	box.addChild(new Text(lines.join("\n"), 0, 0));
	return box;
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
	cwd: string;
	abort(): void;
}

interface PendingCompletion {
	cwd: string;
	job: JobDetail;
}

function isTerminal(status: string): boolean {
	return status === "completed" || status === "failed" || status === "cancelled";
}

function pollJob(jobId: string, signal: AbortSignal, onUpdate?: (job: JobDetail) => void): Promise<JobDetail> {
	return new Promise((resolve, reject) => {
		const ticks: number[] = [];
		for (const phase of ASYNC_POLL_SCHEDULE) for (let i = 0; i < phase.count; i++) ticks.push(phase.intervalMs);
		let cancelled = false;
		let lastError: unknown;
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
					lastError = undefined;
					onUpdate?.(job);
					if (isTerminal(job.status)) {
						signal.removeEventListener("abort", onAbort);
						resolve(job);
						return;
					}
				} catch (err) {
					// Async watcher polling is intentionally quiet. A transient 404/network
					// miss should not create UI noise; remember it and keep polling.
					lastError = err;
				}
				await new Promise((r) => setTimeout(r, intervalMs));
			}
			signal.removeEventListener("abort", onAbort);
		const suffix = lastError instanceof Error ? ` Last poll error: ${lastError.message}` : "";
		reject(new Error(`Polling timed out before job reached terminal state.${suffix}`));
		};
		void run();
	});
}

function formatAsyncAcceptedMessage(response: InferAsyncResponse): string {
	return formatPacificoWidgetContent({
		status: response.status,
		jobId: response.id,
		model: response.model ?? "(default)",
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

function jobFromTracked(row: PacificoTrackedJob): JobDetail {
	return {
		id: row.jobId,
		status: row.status,
		model: row.model,
		route: row.route,
		result: row.status === "completed" ? { output: row.resultPreview ?? undefined, model: row.model ?? undefined, route: row.route ?? undefined } : null,
		error: row.error ?? row.lastPollError ?? null,
		createdAt: row.createdAt,
		completedAt: row.completedAt ?? null,
	};
}

function terminalInputFromJob(job: JobDetail) {
	return {
		jobId: job.id,
		status: job.status,
		model: job.result?.model ?? job.model ?? null,
		route: job.result?.route ?? job.route ?? null,
		completedAt: job.completedAt ?? null,
		output: job.result?.output ?? null,
		error: job.error ?? null,
	};
}

function jobCompletionDetails(job: JobDetail): Record<string, unknown> {
	return {
		jobId: job.id,
		status: job.status,
		model: job.result?.model ?? job.model ?? null,
		mode: job.mode ?? null,
		route: job.result?.route ?? job.route ?? null,
		output: job.result?.output ?? null,
		error: job.error ?? null,
		createdAt: job.createdAt ?? null,
		completedAt: job.completedAt ?? null,
	};
}

function emitJobComplete(pi: ExtensionAPI, job: JobDetail): void {
	const details = jobCompletionDetails(job);
	pi.sendMessage({
		customType: PACIFICO_JOB_COMPLETE_TYPE,
		content: formatPacificoWidgetContent({
			status: job.status,
			jobId: job.id,
			model: String(details.model ?? job.model ?? "(default)"),
		}),
		display: false,
		details,
	}, {
		triggerTurn: true,
		deliverAs: "followUp",
	});
}

export default function pacificoExtension(pi: ExtensionAPI) {
	ensurePacificoEnvLoaded();
	pi.registerMessageRenderer(PACIFICO_MESSAGE_TYPE, renderPacificoMessage);
	pi.registerMessageRenderer(PACIFICO_JOB_COMPLETE_TYPE, renderPacificoMessage);
	const pollers = new Map<string, Poller>();
	const pendingCompletions = new Map<string, PendingCompletion>();
	const widgetStates = new Map<string, PacificoWidgetDetails>();
	let activeWidgetKey: string | undefined;
	let activeWidgetDetails: PacificoWidgetDetails | undefined;
	let widgetCtx: ExtensionContext | undefined;
	let agentActive = false;
	let completionFlushTimer: ReturnType<typeof setTimeout> | undefined;

	function registerPacificoStatusWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI || !activeWidgetKey) return;
		widgetCtx = ctx;
		ctx.ui.setWidget(activeWidgetKey, (_tui: any, theme: any) => renderPacificoMessage({ details: activeWidgetDetails }, undefined, theme), { placement: "aboveEditor" } as any);
	}

	function setPacificoWidget(ctx: ExtensionContext, key: string, details: PacificoWidgetDetails): void {
		widgetStates.set(key, details);
		activeWidgetKey = `pacifico-${key}`;
		activeWidgetDetails = details;
		registerPacificoStatusWidget(ctx);
	}

	function clearPacificoWidget(key: string): void {
		widgetStates.delete(key);
		if (activeWidgetKey === `pacifico-${key}`) {
			widgetCtx?.ui.setWidget(activeWidgetKey, undefined);
			activeWidgetKey = undefined;
			activeWidgetDetails = undefined;
		}
	}

	function scheduleCompletionFlush(delayMs = COMPLETION_FLUSH_DELAY_MS): void {
		if (completionFlushTimer) return;
		completionFlushTimer = setTimeout(() => {
			completionFlushTimer = undefined;
			flushPendingCompletions();
		}, delayMs);
	}

	function flushPendingCompletions(): void {
		if (agentActive) {
			scheduleCompletionFlush(COMPLETION_RETRY_DELAY_MS);
			return;
		}
		const next = pendingCompletions.entries().next().value as [string, PendingCompletion] | undefined;
		if (!next) return;
		const [jobId, pending] = next;
		emitJobComplete(pi, pending.job);
		markPacificoJobNotified(pending.cwd, jobId);
		pendingCompletions.delete(jobId);
		if (pendingCompletions.size > 0) scheduleCompletionFlush(COMPLETION_RETRY_DELAY_MS);
	}

	function queueJobCompletion(job: JobDetail, cwd: string): void {
		markPacificoJobTerminal(cwd, terminalInputFromJob(job));
		pendingCompletions.set(job.id, { cwd, job });
		setPacificoWidget(widgetCtx ?? ({ hasUI: false } as ExtensionContext), job.id, {
			status: job.status,
			jobId: job.id,
			model: job.result?.model ?? job.model ?? "(default)",
		});
		scheduleCompletionFlush();
	}

	function registerPoller(jobId: string, ctx: ExtensionContext): void {
		if (pollers.has(jobId)) return;
		const cwd = ctx.cwd;
		const controller = new AbortController();
		pollers.set(jobId, { jobId, cwd, abort: () => controller.abort() });
		void (async () => {
			try {
				const final = await pollJob(jobId, controller.signal, (job) => {
					setPacificoWidget(ctx, job.id, {
						status: job.status,
						jobId: job.id,
						model: job.result?.model ?? job.model ?? "(default)",
					});
				});
				queueJobCompletion(final, cwd);
			} catch (err) {
				markPacificoJobPollError(cwd, jobId, err instanceof Error ? err.message : String(err));
				// Stay silent for timeout/not-found/network polling failures. The user
				// asked for no UI when nothing actionable has been found.
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
		widgetCtx = ctx;
		if (!getApiKey()) {
			ctx.ui.notify("Pacifico API key missing — refusing to send. Use PACIFICO_API_KEY / HARNESS_API_KEY or extensions/.pacifico.env.", "error");
			return;
		}
		const model = resolveModel();
		const body: InferRequest = { prompt, mode: "auto", metadata: { source: "pi_extension", command: "/pacifico" } };
		if (model) body.model = model;
		const provisionalKey = `pending-${Date.now()}`;
		setPacificoWidget(ctx, provisionalKey, { status: "queued", model: model ?? "(default)" });
		try {
			const result = await postInfer(body);
			if (result.kind === "sync") {
				const r = result.data;
				const meta = `_${r.provider} · ${r.model} · route ${r.route}_`;
				emitMessage(pi, `${meta}\n\n${r.output}`);
			} else {
				const r = result.data;
				saveSubmittedPacificoJob(ctx.cwd, {
					jobId: r.id,
					status: r.status || "queued",
					model: r.model ?? model,
					route: r.route,
					prompt,
				});
				clearPacificoWidget(provisionalKey);
				setPacificoWidget(ctx, r.id, {
					status: r.status,
					jobId: r.id,
					model: r.model ?? model ?? "(default)",
				});
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
		if (completionFlushTimer) clearTimeout(completionFlushTimer);
		completionFlushTimer = undefined;
		for (const p of pollers.values()) p.abort();
		pollers.clear();
	});

	// --- Track agent lifecycle so background completions wake from a safe point ---
	pi.on("agent_start", async () => {
		agentActive = true;
	});

	pi.on("agent_end", async () => {
		agentActive = false;
		if (pendingCompletions.size > 0) scheduleCompletionFlush();
	});

	// --- Status bar and durable Pacifico job recovery on session start ---
	pi.on("session_start", async (_event, ctx) => {
		updateStatus(ctx);
		prunePacificoJobs(ctx.cwd, PACIFICO_JOB_PRUNE_AGE_MS);
		for (const job of listIncompletePacificoJobs(ctx.cwd)) {
			registerPoller(job.jobId, ctx);
		}
		for (const job of listPendingPacificoCompletions(ctx.cwd)) {
			try {
				const fresh = await getJob(job.jobId);
				pendingCompletions.set(fresh.id, { cwd: ctx.cwd, job: fresh });
			} catch {
				pendingCompletions.set(job.jobId, { cwd: ctx.cwd, job: jobFromTracked(job) });
			}
		}
		if (pendingCompletions.size > 0) scheduleCompletionFlush();
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
				if (result.cancelled) {
					markPacificoJobTerminal(ctx.cwd, { jobId: id, status: "cancelled" });
					ctx.ui.notify(`Cancelled job ${id} (was ${result.previousStatus ?? "?"})`, "info");
				} else ctx.ui.notify(`Job ${id} was already terminal (${result.previousStatus ?? "?"})`, "warning");
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
			const body: InferRequest = { prompt: p.prompt, mode: p.mode ?? "auto", metadata: { source: "pi_extension", tool: "pacifico_infer" } };
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
