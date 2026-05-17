// ABOUTME: Pacifico extension — terminal client for the pacifico worker (chat + jobs).
// ABOUTME: Registers /pacifico, /pacifico-model, /pacifico-api-key, /pacifico-jobs/-job/-cancel and pacifico_infer tool.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import type { Server } from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
import { collectPacificoAdvisorContext, formatPacificoAdvisorResult, normalizeAdvisorResponse, type PacificoAdvisorArgs } from "./lib/pacifico-advisor.ts";
import { loadPacificoApiKey, loadPacificoModel, persistPacificoApiKey, persistPacificoModel } from "./lib/persist-pacifico.ts";
import { pacificoResultToMarkdown, type PacificoComplexity, type PacificoResultAction, type PacificoResultData } from "./lib/pacifico-result-html.ts";
import { generatePlanViewerHTML } from "./lib/viewers/plan-viewer-html.ts";
import { createPlanStandaloneExport, saveStandaloneExport } from "./lib/viewer-standalone-export.ts";
import { getProjectContext } from "./lib/project-context.ts";
import { createViewerServer, openBrowser } from "./lib/viewer-server.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";
import { readRawPayload, upsertPersistedReport } from "./lib/report-index.ts";
import { outputLine } from "./lib/output-box.ts";
import { renderBriefWidget } from "./lib/task-list-render.ts";
import { padRight } from "./lib/ui-helpers.ts";

const PACIFICO_MESSAGE_TYPE = "pacifico_message";
const PACIFICO_JOB_COMPLETE_TYPE = "pacifico_job_complete";
const DEFAULT_BASE_URL = "https://pacifico.ruizrica2.workers.dev";
const COMPLETION_FLUSH_DELAY_MS = 500;
const COMPLETION_RETRY_DELAY_MS = 5_000;
const PACIFICO_JOB_PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const PACIFICO_WIDGET_KEY = "pacifico-status";
const BRIEF_WIDGET_BG = "\x1b[48;5;236m";
const BRIEF_WIDGET_RESET = "\x1b[0m";

type TaskStatus = "idle" | "inprogress" | "done";

type CurrentTask = {
	id: number;
	text: string;
	commanderTaskId?: number;
};

type TaskList = {
	title?: string;
	description?: string;
	tasks?: { id: number; text: string; status: TaskStatus }[];
};

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
	executionClass?: "standard" | "expensive" | "planning";
	outputComplexity?: PacificoComplexity;
	maxOutputTokens?: number;
	outputDelivery?: "inline" | "artifact_summary" | "artifact_full";
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

function isActiveWidgetStatus(_status: PacificoWidgetStatus): boolean {
	return false;
}

function shortJobId(jobId: string | null | undefined): string {
	if (!jobId) return "pending";
	const parts = jobId.split("-");
	return parts[parts.length - 1] || jobId;
}

function formatPacificoWidgetContent(details: PacificoWidgetDetails): string {
	const lines = [`status: ${normalizeWidgetStatus(details.status)}`];
	if (details.jobId) lines.push(`job ID: ${shortJobId(details.jobId)}`);
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

function normalizePacificoContent(content: string): string | undefined {
	const normalized = content.replace(/\s+/g, " ").trim();
	return normalized.length > 0 ? normalized : undefined;
}

function pacificoBriefDescription(details: PacificoWidgetDetails | undefined, content: string): string | undefined {
	if (!details) return normalizePacificoContent(content);
	const status = normalizeWidgetStatus(details.status);
	const model = details.model ?? "(default)";
	const job = shortJobId(details.jobId);
	if (details.error) return `Pacifico ${status} on ${model}. Job ${job}. Error: ${details.error}`;
	if (details.output) return `Pacifico ${status} on ${model}. Job ${job}. Result is ready.`;
	return `Pacifico ${status} on ${model}. Job ${job}.`;
}

function renderPacificoRows(details: PacificoWidgetDetails | undefined, theme: any, content = "", width?: number, paintBackground = true): string[] {
	const status = details ? normalizeWidgetStatus(details.status) : "message";
	const jobSuffix = details?.jobId ? ` #${shortJobId(details.jobId)}` : "";
	const safeWidth = width && width > 0 ? width : 80;
	const availableHeight = Math.max(4, Math.min((process.stdout.rows || 24) - 10, 14));
	const briefLines = renderBriefWidget({
		title: "Pacifico",
		progressText: `${status}${jobSuffix}`,
		description: pacificoBriefDescription(details, content),
		briefLabel: "Pacifico Brief:",
		hint: details?.jobId ? "/pacifico-job <id> for details" : "/pacifico-jobs to view jobs",
	}, safeWidth, availableHeight, {
		truncateToWidth,
		fg: (color: string, text: string) => theme.fg(color, text),
		bold: (text: string) => theme.bold(text),
	});

	if (!paintBackground) return briefLines;
	const emptyPad = BRIEF_WIDGET_BG + padRight("", safeWidth) + BRIEF_WIDGET_RESET;
	return [
		emptyPad,
		...briefLines.map((line) => BRIEF_WIDGET_BG + padRight(line, safeWidth) + BRIEF_WIDGET_RESET),
		emptyPad,
	];
}

function renderPacificoMessage(message: { content?: unknown; details?: PacificoWidgetDetails }, _options: unknown, theme: any): Box {
	const content = typeof message.content === "string" ? message.content : "";
	const box = new Box(0, 0);
	box.addChild({
		render(width: number): string[] {
			return renderPacificoRows(message.details, theme, content, width, true);
		},
		invalidate() {
			return undefined;
		},
	});
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

function currentTaskContext(): string | undefined {
	const g = globalThis as any;
	const current = g.__piCurrentTask as CurrentTask | undefined;
	const taskList = g.__piTaskList as TaskList | undefined;
	const lines: string[] = [];
	if (current?.text) {
		lines.push(`Current local task: #${current.id} ${current.text}${current.commanderTaskId ? ` (Commander #${current.commanderTaskId})` : ""}`);
	}
	if (taskList?.title) {
		lines.push(`Task list: ${taskList.title}${taskList.description ? ` — ${taskList.description}` : ""}`);
	}
	if (Array.isArray(taskList?.tasks) && taskList.tasks.length) {
		lines.push("Tasks:");
		for (const task of taskList.tasks.slice(0, 12)) {
			lines.push(`- [${task.status === "done" ? "x" : task.status === "inprogress" ? "*" : " "}] #${task.id}: ${task.text}`);
		}
		if (taskList.tasks.length > 12) lines.push(`- … ${taskList.tasks.length - 12} more task(s)`);
	}
	return lines.length ? lines.join("\n") : undefined;
}

function normalizePacificoComplexity(value: unknown): PacificoComplexity | undefined {
	if (value === "simple" || value === "standard" || value === "complex" || value === "super_complex") return value;
	if (value === "super-complex") return "super_complex";
	return undefined;
}

function parsePacificoCommandArgs(raw: string): { question: string; complexity?: PacificoComplexity; maxOutputTokens?: number } {
	const tokens = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	const rest: string[] = [];
	let complexity: PacificoComplexity | undefined;
	let maxOutputTokens: number | undefined;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i].replace(/^(["'])(.*)\1$/, "$2");
		if (token === "--simple") { complexity = "simple"; continue; }
		if (token === "--standard") { complexity = "standard"; continue; }
		if (token === "--complex") { complexity = "complex"; continue; }
		if (token === "--super-complex" || token === "--super_complex") { complexity = "super_complex"; continue; }
		if (token === "--complexity" && tokens[i + 1]) {
			const next = tokens[++i].replace(/^(["'])(.*)\1$/, "$2");
			complexity = normalizePacificoComplexity(next) ?? complexity;
			continue;
		}
		if (token === "--max-output-tokens" && tokens[i + 1]) {
			const next = Number(tokens[++i].replace(/^(["'])(.*)\1$/, "$2"));
			if (Number.isFinite(next) && next > 0) maxOutputTokens = Math.trunc(next);
			continue;
		}
		rest.push(token);
	}
	return { question: rest.join(" ").trim(), complexity, maxOutputTokens };
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
		content: formatJobOutcome(job),
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
	let activeWidgetDetails: PacificoWidgetDetails | undefined;
	let widgetCtx: ExtensionContext | undefined;
	let widgetRegistered = false;
	let pacificoWidgetInvalidate: (() => void) | undefined;
	let pacificoAnimationTimer: ReturnType<typeof setInterval> | undefined;
	let agentActive = false;
	let completionFlushTimer: ReturnType<typeof setTimeout> | undefined;
	let activeResultServer: Server | null = null;
	let activeResultSession: { kind: "report"; title: string; url: string; server: Server; onClose: () => void } | null = null;

	function cleanupPacificoResultServer(): void {
		const server = activeResultServer;
		activeResultServer = null;
		if (server) {
			try { server.close(); } catch {}
		}
		if (activeResultSession) {
			clearActiveViewer(activeResultSession);
			activeResultSession = null;
		}
	}

	function startPacificoAnimation(): void {
		if (pacificoAnimationTimer) return;
		pacificoAnimationTimer = setInterval(() => pacificoWidgetInvalidate?.(), 120);
	}

	function stopPacificoAnimation(): void {
		if (!pacificoAnimationTimer) return;
		clearInterval(pacificoAnimationTimer);
		pacificoAnimationTimer = undefined;
	}

	function refreshPacificoWidget(): void {
		const status = normalizeWidgetStatus(activeWidgetDetails?.status);
		if (isActiveWidgetStatus(status)) startPacificoAnimation();
		else stopPacificoAnimation();
		pacificoWidgetInvalidate?.();
	}

	function registerPacificoStatusWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		widgetCtx = ctx;
		if (widgetRegistered) return;
		widgetRegistered = true;
		ctx.ui.setWidget(PACIFICO_WIDGET_KEY, (_tui: any, theme: any) => {
			const widget = {
				render(width: number): string[] {
					return renderPacificoRows(activeWidgetDetails, theme, "", width, true);
				},
				invalidate() {
					return undefined;
				},
			};
			pacificoWidgetInvalidate = () => widget.invalidate();
			return widget;
		}, { placement: "aboveEditor" } as any);
	}

	function setPacificoWidget(ctx: ExtensionContext | undefined, _key: string, details: PacificoWidgetDetails): void {
		activeWidgetDetails = details;
		if (ctx?.hasUI) registerPacificoStatusWidget(ctx);
		else if (widgetCtx?.hasUI) registerPacificoStatusWidget(widgetCtx);
		refreshPacificoWidget();
	}

	function clearPacificoWidget(_key: string): void {
		// Stable single-widget mode: do not clear when replacing provisional job state.
		refreshPacificoWidget();
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
		setPacificoWidget(widgetCtx, job.id, {
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

	function buildPacificoResultData(question: string, result: Awaited<ReturnType<typeof runPacificoAdvisor>>, complexity: PacificoComplexity, ancestry: PacificoResultData["followUpAncestry"] = []): PacificoResultData {
		const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
		const details = (result.details ?? {}) as any;
		return {
			title: "Pacifico Result",
			question,
			generatedAt: new Date().toISOString(),
			advisor: {
				summary: String(details.summary || "No summary returned."),
				recommendation: String(details.recommendation || details.summary || "No recommendation returned."),
				risks: Array.isArray(details.risks) ? details.risks.map(String) : [],
				alternatives: Array.isArray(details.alternatives) ? details.alternatives.map(String) : [],
				nextActions: Array.isArray(details.nextActions) ? details.nextActions.map(String) : [],
				raw: String(details.raw || text),
			},
			formattedText: text,
			metadata: {
				model: typeof details.model === "string" ? details.model : null,
				provider: typeof details.provider === "string" ? details.provider : null,
				route: typeof details.route === "string" ? details.route : null,
				jobId: typeof details.jobId === "string" ? details.jobId : null,
				requestId: typeof details.requestId === "string" ? details.requestId : null,
				complexity,
				mode: typeof details.mode === "string" ? details.mode : null,
			},
			diagnostics: Array.isArray(details.contextDiagnostics) ? details.contextDiagnostics : [],
			followUpAncestry: ancestry,
		};
	}

	function persistPacificoResult(ctx: ExtensionContext, data: PacificoResultData): void {
		try {
			upsertPersistedReport({
				category: "pacifico",
				title: `${data.title} — ${data.question.slice(0, 80)}`,
				summary: data.advisor.summary,
				content: data.formattedText,
				sourcePath: join(ctx.cwd || process.cwd(), ".context", "todo.md"),
				viewerPath: join(ctx.cwd || process.cwd(), ".context", "todo.md"),
				viewerLabel: data.title,
				tags: ["pacifico", "advisor", data.metadata?.complexity || "standard"],
				metadata: {
					question: data.question,
					complexity: data.metadata?.complexity,
					model: data.metadata?.model,
					provider: data.metadata?.provider,
					route: data.metadata?.route,
					jobId: data.metadata?.jobId,
				},
				payload: data,
			});
		} catch {}
	}

	function buildPacificoLoadingMarkdown(question: string, complexity: PacificoComplexity, status: string, ancestry: PacificoResultData["followUpAncestry"] = []): string {
		return [
			"# Pacifico Result",
			"",
			"## Question",
			"",
			question,
			"",
			"## Status",
			"",
			`- **State:** ${status}`,
			`- **Complexity:** ${complexity}`,
			"- **UI:** This Plan Viewer stays open while Pacifico works. Use **Needs Changes** to send a follow-up back to Pacifico.",
			"",
			ancestry.length ? "## Follow-up Thread" : "",
			ancestry.length ? "" : "",
			...ancestry.flatMap((item, index) => [`${index + 1}. **Question:** ${item.question}`, `   - Summary: ${item.summary}`]),
			ancestry.length ? "" : "",
			"## Result",
			"",
			"Pacifico is working asynchronously. This view will refresh automatically when status or results change.",
			"",
		].filter((line, index, arr) => line !== "" || arr[index - 1] !== "").join("\n");
	}

	type PacificoLiveViewerUpdate = {
		changeSummary?: string[];
		bannerLabel?: string;
		bannerTone?: "success" | "warning";
		badgeLabel?: string;
		locked?: boolean;
	};

	type PacificoLiveViewer = {
		updateMarkdown(markdown: string, update?: string[] | PacificoLiveViewerUpdate): void;
		waitForAction(): Promise<PacificoResultAction>;
		close(): void;
	};

	async function openPacificoLiveViewer(ctx: ExtensionContext, initialMarkdown: string, signal?: AbortSignal): Promise<PacificoLiveViewer> {
		cleanupPacificoResultServer();
		const projectContext = getProjectContext(ctx.cwd || process.cwd(), 1);
		let latestMarkdown = initialMarkdown;
		let revision = 0;
		let roundTripState = {
			status: "idle",
			feedback: "",
			revision,
			changeSummary: [] as string[],
			bannerLabel: "Pacifico Ready",
			bannerTone: "success" as const,
			badgeLabel: "PACIFICO",
			locked: false,
			payload: { markdown: latestMarkdown },
		};
		let resolveAction: ((action: PacificoResultAction) => void) | undefined;
		const nextAction = () => new Promise<PacificoResultAction>((resolve, reject) => {
			resolveAction = resolve;
			if (signal?.aborted) reject(new Error("Aborted"));
			signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
		});
		const handle = await createViewerServer({
			getHtml: (port) => generatePlanViewerHTML({
				markdown: latestMarkdown,
				title: "Pacifico Result",
				mode: "plan",
				port,
				roundTripEnabled: true,
				projectContext,
			}),
			routes: [
				{
					method: "POST",
					path: "/save",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", () => {
							try {
								const parsed = JSON.parse(body || "{}");
								const desktop = join(homedir(), "Desktop");
								if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
								const fileName = `pacifico-result-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`;
								writeFileSync(join(desktop, fileName), String(parsed.markdown || latestMarkdown), "utf-8");
								res.writeHead(200, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ ok: true, message: `Saved to ~/Desktop/${fileName}` }));
							} catch (err: any) {
								res.writeHead(500, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: err?.message || "Save failed" }));
							}
						});
					},
				},
				{
					method: "POST",
					path: "/export-standalone",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", () => {
							try {
								const parsed = JSON.parse(body || "{}");
								const html = createPlanStandaloneExport({ title: "Pacifico Result", markdown: String(parsed.markdown || latestMarkdown), mode: "plan" });
								const saved = saveStandaloneExport({ filePrefix: "pacifico-result", html });
								res.writeHead(200, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ ok: true, message: `Standalone export saved to ~/Desktop/${saved.fileName}` }));
							} catch (err: any) {
								res.writeHead(500, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: err?.message || "Standalone export failed" }));
							}
						});
					},
				},
			],
			onEveryResult: (result) => {
				const feedback = typeof result?.feedback === "string" ? result.feedback.trim() : "";
				if (result?.action === "changes_requested" && feedback) resolveAction?.({ action: "follow_up", question: feedback });
				else if (result?.action === "approved" || result?.action === "declined") resolveAction?.({ action: "closed" });
			},
			getRoundTripState: () => roundTripState,
		});
		void handle.waitForResult().then((result) => {
			if (!result) resolveAction?.({ action: "closed" });
		}).catch(() => resolveAction?.({ action: "closed" }));
		activeResultServer = handle.server;
		const url = `http://127.0.0.1:${handle.port}`;
		activeResultSession = {
			kind: "report",
			title: "Pacifico Result",
			url,
			server: handle.server,
			onClose: () => { activeResultServer = null; activeResultSession = null; },
		};
		registerActiveViewer(activeResultSession);
		openBrowser(url);
		notifyViewerOpen(ctx, activeResultSession);
		return {
			updateMarkdown(markdown, update = ["Pacifico status updated"]) {
				const options = Array.isArray(update) ? { changeSummary: update } : update;
				latestMarkdown = markdown;
				revision += 1;
				roundTripState = {
					status: "updated",
					feedback: "",
					revision,
					changeSummary: options.changeSummary ?? ["Pacifico status updated"],
					bannerLabel: options.bannerLabel ?? "Pacifico Updated",
					bannerTone: options.bannerTone ?? "success",
					badgeLabel: options.badgeLabel ?? "PACIFICO",
					locked: options.locked === true,
					payload: { markdown: latestMarkdown },
				};
			},
			waitForAction: nextAction,
			close: cleanupPacificoResultServer,
		};
	}

	async function showPacificoResult(ctx: ExtensionContext, data: PacificoResultData, signal?: AbortSignal): Promise<PacificoResultAction> {
		persistPacificoResult(ctx, data);
		cleanupPacificoResultServer();
		const markdown = pacificoResultToMarkdown(data);
		const projectContext = getProjectContext(ctx.cwd || process.cwd(), 1);
		let roundTripState = {
			status: "idle",
			feedback: "",
			revision: 0,
			changeSummary: [] as string[],
			payload: { markdown },
		};
		let latestMarkdown = markdown;
		const handle = await createViewerServer({
			getHtml: (port) => generatePlanViewerHTML({
				markdown: latestMarkdown,
				title: data.title || "Pacifico Result",
				mode: "plan",
				port,
				roundTripEnabled: true,
				projectContext,
			}),
			routes: [
				{
					method: "POST",
					path: "/save",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", () => {
							try {
								const parsed = JSON.parse(body || "{}");
								const desktop = join(homedir(), "Desktop");
								if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
								const fileName = `pacifico-result-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`;
								writeFileSync(join(desktop, fileName), String(parsed.markdown || latestMarkdown), "utf-8");
								res.writeHead(200, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ ok: true, message: `Saved to ~/Desktop/${fileName}` }));
							} catch (err: any) {
								res.writeHead(500, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: err?.message || "Save failed" }));
							}
						});
					},
				},
				{
					method: "POST",
					path: "/export-standalone",
					handler: async (req, res) => {
						let body = "";
						req.on("data", (chunk) => { body += chunk; });
						req.on("end", () => {
							try {
								const parsed = JSON.parse(body || "{}");
								const html = createPlanStandaloneExport({ title: data.title || "Pacifico Result", markdown: String(parsed.markdown || latestMarkdown), mode: "plan" });
								const saved = saveStandaloneExport({ filePrefix: "pacifico-result", html });
								res.writeHead(200, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ ok: true, message: `Standalone export saved to ~/Desktop/${saved.fileName}` }));
							} catch (err: any) {
								res.writeHead(500, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: err?.message || "Standalone export failed" }));
							}
						});
					},
				},
			],
			onFeedback: async (body) => {
				roundTripState = {
					status: "feedback_submitted",
					feedback: body?.feedback || "",
					revision: roundTripState.revision,
					changeSummary: [],
					payload: { markdown: latestMarkdown },
				};
			},
			getRoundTripState: () => roundTripState,
		});
		activeResultServer = handle.server;
		const url = `http://127.0.0.1:${handle.port}`;
		activeResultSession = {
			kind: "report",
			title: data.title,
			url,
			server: handle.server,
			onClose: () => { activeResultServer = null; activeResultSession = null; },
		};
		registerActiveViewer(activeResultSession);
		openBrowser(url);
		notifyViewerOpen(ctx, activeResultSession);
		try {
			const abortPromise = signal ? new Promise<PacificoResultAction>((_, reject) => {
				if (signal.aborted) reject(new Error("Aborted"));
				signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
			}) : null;
			const result = await (abortPromise ? Promise.race([handle.waitForResult(), abortPromise]) : handle.waitForResult());
			if (typeof result?.markdown === "string" && result.markdown.trim()) latestMarkdown = result.markdown;
			const feedback = typeof result?.feedback === "string" ? result.feedback.trim() : "";
			return result?.action === "changes_requested" && feedback
				? { action: "follow_up", question: feedback }
				: { action: "closed" };
		} finally {
			cleanupPacificoResultServer();
		}
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
				setPacificoWidget(ctx, provisionalKey, { status: "completed", model: r.model });
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
		cleanupPacificoResultServer();
		stopPacificoAnimation();
		widgetCtx?.ui.setWidget(PACIFICO_WIDGET_KEY, undefined);
		widgetRegistered = false;
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
			setPacificoWidget(ctx, job.jobId, { status: job.status, jobId: job.jobId, model: job.model ?? "(default)" });
			registerPoller(job.jobId, ctx);
		}
		for (const job of listPendingPacificoCompletions(ctx.cwd)) {
			try {
				const fresh = await getJob(job.jobId);
				setPacificoWidget(ctx, fresh.id, { status: fresh.status, jobId: fresh.id, model: fresh.result?.model ?? fresh.model ?? "(default)" });
				pendingCompletions.set(fresh.id, { cwd: ctx.cwd, job: fresh });
			} catch {
				setPacificoWidget(ctx, job.jobId, { status: job.status, jobId: job.jobId, model: job.model ?? "(default)" });
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

	// --- /pacifico [--simple|--standard|--complex|--super-complex] [question] ---
	pi.registerCommand("pacifico", {
		description: "Ask Pacifico for Claude-advisor-style guidance; with no args, opens the model picker (first run) or shows current model.",
		handler: async (args, ctx) => {
			const parsed = parsePacificoCommandArgs(args.trim());
			if (parsed.question.length === 0) {
				const current = resolveModel();
				if (current === null) {
					const picked = await pickAndPersistModel(ctx);
					if (picked === undefined) return;
					emitMessage(pi, `Pacifico model set to **${describeModel(picked)}**. Use \`/pacifico --complex <question>\` to ask the advisor, or \`/pacifico-model\` to change.`);
					return;
				}
				emitMessage(pi, `Pacifico model is **${describeModel(current)}**. Ask with \`/pacifico <question>\`, add \`--simple\`, \`--complex\`, or \`--super-complex\`, change with \`/pacifico-model\`.`);
				return;
			}
			let question = parsed.question;
			const complexity = parsed.complexity ?? "standard";
			const ancestry: PacificoResultData["followUpAncestry"] = [];
			const live = await openPacificoLiveViewer(ctx, buildPacificoLoadingMarkdown(question, complexity, "Opening Pacifico advisor session…", ancestry));
			try {
				for (let turn = 0; turn < 5; turn++) {
					live.updateMarkdown(buildPacificoLoadingMarkdown(question, complexity, "Queued — waiting for Pacifico…", ancestry), {
						changeSummary: ["Pacifico request queued", "Waiting for async result"],
						bannerLabel: "Pacifico Queued",
						bannerTone: "warning",
						badgeLabel: "QUEUED",
						locked: true,
					});
					const priorContext = ancestry.length
						? `Previous Pacifico advisor turns:\n${ancestry.map((item, i) => `${i + 1}. Question: ${item.question}\nSummary: ${item.summary}`).join("\n\n")}`
						: "";
					const taskContext = [
						"The user invoked /pacifico for on-demand advisor guidance. Pacifico cannot access the filesystem, so reason only from this supplied current task/session context and any embedded files.",
						currentTaskContext(),
						priorContext,
					].filter(Boolean).join("\n\n");
					ctx.ui.notify(`Consulting Pacifico advisor (${complexity})…`, "info");
					const result = await runPacificoAdvisor(
						{ question, task_context: taskContext, agent_role: "pacifico-command", complexity, max_output_tokens: parsed.maxOutputTokens },
						undefined,
						(update) => {
							const text = update?.content?.[0]?.text;
							if (typeof text === "string" && text.trim()) {
								live.updateMarkdown(buildPacificoLoadingMarkdown(question, complexity, text.trim(), ancestry), {
									changeSummary: ["Pacifico async status updated", text.trim()],
									bannerLabel: "Pacifico Queued",
									bannerTone: "warning",
									badgeLabel: "QUEUED",
									locked: true,
								});
							}
						},
						ctx,
					);
					const data = buildPacificoResultData(question, result, complexity, [...ancestry]);
					persistPacificoResult(ctx, data);
					live.updateMarkdown(pacificoResultToMarkdown(data), {
						changeSummary: ["Pacifico result ready", "Use Needs Changes to send a follow-up"],
						bannerLabel: "Pacifico Complete",
						bannerTone: "success",
						badgeLabel: "COMPLETE",
						locked: false,
					});
					const action = await live.waitForAction();
					if (action.action !== "follow_up" || !action.question?.trim()) return;
					ancestry.push({ question, summary: data.advisor.summary });
					question = action.question.trim();
				}
				ctx.ui.notify("Pacifico follow-up limit reached; run /pacifico again to continue.", "warning");
			} finally {
				live.close();
			}
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

	async function runPacificoAdvisor(args: PacificoAdvisorArgs, signal: AbortSignal | undefined, onUpdate: ((update: any) => void) | undefined, ctx: ExtensionContext) {
		const apiKey = getApiKey();
		if (!apiKey) {
			return {
				content: [{ type: "text" as const, text: "Pacifico API key missing; set PACIFICO_API_KEY or extensions/.pacifico.env — refusing pacifico_advisor." }],
				details: { error: "missing_api_key" },
			};
		}
		const complexity = normalizePacificoComplexity(args.complexity) ?? "standard";
		const packet = collectPacificoAdvisorContext({ ...args, complexity }, { cwd: ctx.cwd });
		const chosen = args.model ?? resolveModel();
		const body: InferRequest = {
			prompt: packet.prompt,
			mode: args.mode ?? "auto",
			executionClass: "planning",
			outputComplexity: complexity,
			metadata: { source: "pi_extension", tool: "pacifico_advisor", kind: "advisor_review", advisorComplexity: complexity },
		};
		if (args.max_output_tokens) body.maxOutputTokens = Math.trunc(args.max_output_tokens);
		if (chosen) body.model = chosen;
		setPacificoWidget(ctx, `advisor-${Date.now()}`, { status: "queued", model: chosen ?? "(default)" });
		try {
			const result = await postInfer(body);
			let raw = "";
			let meta: Record<string, unknown> = { contextDiagnostics: packet.diagnostics, promptBytes: packet.promptBytes, includedFiles: packet.includedFiles, complexity };
			if (result.kind === "sync") {
				const r = result.data;
				raw = r.output;
				meta = { ...meta, route: r.route, provider: r.provider, model: r.model, mode: r.mode, requestId: r.requestId };
				setPacificoWidget(ctx, r.requestId, { status: "completed", model: r.model });
			} else {
				const r = result.data;
				setPacificoWidget(ctx, r.id, { status: r.status, jobId: r.id, model: r.model ?? chosen ?? "(default)" });
				onUpdate?.({ content: [{ type: "text", text: `Pacifico advisor job ${r.id} accepted; waiting for result.` }] });
				const ctrl = new AbortController();
				const onParentAbort = () => ctrl.abort();
				if (signal) {
					if (signal.aborted) ctrl.abort();
					else signal.addEventListener("abort", onParentAbort);
				}
				try {
					const job = await pollJob(r.id, ctrl.signal, (jobUpdate) => {
						setPacificoWidget(ctx, jobUpdate.id, { status: jobUpdate.status, jobId: jobUpdate.id, model: jobUpdate.result?.model ?? jobUpdate.model ?? r.model ?? chosen ?? "(default)" });
					});
					meta = { ...meta, jobId: job.id, status: job.status, route: job.result?.route ?? job.route ?? null, provider: job.result?.provider ?? null, model: job.result?.model ?? job.model ?? r.model ?? null };
					if (job.status === "completed" && job.result?.output) raw = job.result.output;
					else raw = `Pacifico advisor job ${job.id} ended ${job.status}${job.error ? `: ${job.error}` : " without output."}`;
				} finally {
					if (signal) signal.removeEventListener("abort", onParentAbort);
				}
			}
			const normalized = normalizeAdvisorResponse(raw);
			const text = formatPacificoAdvisorResult(normalized, {
				diagnostics: packet.diagnostics,
				jobId: typeof meta.jobId === "string" ? meta.jobId : undefined,
				model: typeof meta.model === "string" ? meta.model : chosen,
				route: typeof meta.route === "string" ? meta.route : null,
			});
			return { content: [{ type: "text" as const, text }], details: { ...normalized, ...meta } };
		} catch (err) {
			setPacificoWidget(ctx, "advisor-error", { status: "error", model: chosen ?? "(default)", error: err instanceof Error ? err.message : String(err) });
			return {
				content: [{ type: "text" as const, text: `pacifico_advisor failed: ${err instanceof Error ? err.message : String(err)}` }],
				details: { error: err instanceof Error ? err.message : String(err), contextDiagnostics: packet.diagnostics },
			};
		}
	}

	async function showPersistedPacificoResult(payloadId: string, ctx: ExtensionContext, signal?: AbortSignal) {
		const payload = readRawPayload(payloadId) as PacificoResultData | null;
		if (!payload || typeof payload !== "object" || !("advisor" in payload)) {
			return { content: [{ type: "text" as const, text: `No persisted Pacifico result found for payload_id=${payloadId}.` }] };
		}
		await showPacificoResult(ctx, payload, signal);
		return { content: [{ type: "text" as const, text: "Pacifico result viewer closed." }] };
	}

	pi.registerTool({
		name: "show_pacifico_result",
		label: "Show Pacifico Result",
		description: "Open a formatted Pacifico Result viewer for a fresh or persisted Pacifico advisor response.",
		parameters: Type.Object({
			payload_id: Type.Optional(Type.String({ description: "ID of a persisted Pacifico result payload to reopen" })),
			report_data: Type.Optional(Type.String({ description: "JSON-encoded PacificoResultData payload to display" })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const p = params as { payload_id?: string; report_data?: string };
			if (p.payload_id) return showPersistedPacificoResult(p.payload_id, ctx, signal);
			if (p.report_data) {
				const data = JSON.parse(p.report_data) as PacificoResultData;
				await showPacificoResult(ctx, data, signal);
				return { content: [{ type: "text" as const, text: "Pacifico result viewer closed." }] };
			}
			return { content: [{ type: "text" as const, text: "Provide payload_id or report_data." }] };
		},
		renderCall(args, theme) {
			const p = args as any;
			return new Text(outputLine(theme, "accent", `${theme.bold("show_pacifico_result ")}${theme.fg("accent", p.payload_id || "Pacifico Result")}`), 0, 0);
		},
	});

	pi.registerCommand("show-pacifico-result", {
		description: "Open a persisted Pacifico Result payload: /show-pacifico-result --payload-id <id>",
		handler: async (args, ctx) => {
			const match = args.match(/--payload-id\s+(\S+)/) || args.match(/--payload_id\s+(\S+)/);
			const payloadId = match?.[1]?.trim();
			if (!payloadId) {
				ctx.ui.notify("Usage: /show-pacifico-result --payload-id <id>", "warning");
				return;
			}
			await showPersistedPacificoResult(payloadId, ctx);
		},
	});

	// --- pacifico_advisor tool (agent-callable; context-packed async advisor review) ---
	pi.registerTool({
		name: "pacifico_advisor",
		label: "Pacifico Advisor",
		description:
			"Ask Pacifico for advisor-style async review using only context provided by this tool call. Pacifico has no filesystem access; include relevant task_context and files explicitly.",
		parameters: Type.Object({
			question: Type.String({ description: "Question or decision to ask Pacifico to review" }),
			task_context: Type.Optional(Type.String({ description: "All relevant context/findings to include directly in the Pacifico prompt" })),
			files: Type.Optional(Type.Array(Type.String({ description: "Local files to read and embed into the Pacifico prompt; Pacifico cannot read them itself" }))),
			model: Type.Optional(Type.String({ description: "Optional Pacifico model override" })),
			mode: Type.Optional(Type.Union([Type.Literal("sync"), Type.Literal("async"), Type.Literal("auto")], { description: "Routing hint; defaults to auto" })),
			agent_role: Type.Optional(Type.String({ description: "Role of the calling agent (planner, reviewer, builder, etc.)" })),
			complexity: Type.Optional(Type.Union([Type.Literal("simple"), Type.Literal("standard"), Type.Literal("complex"), Type.Literal("super_complex")], { description: "Deterministic Pacifico response budget tier; defaults to standard for advisor calls." })),
			max_output_tokens: Type.Optional(Type.Number({ description: "Explicit max output token override for Pacifico backend; use complexity unless you need a precise budget." })),
			max_file_bytes: Type.Optional(Type.Number({ description: "Maximum bytes per embedded file" })),
			max_context_bytes: Type.Optional(Type.Number({ description: "Maximum total advisor prompt bytes" })),
		}) as any,
		async execute(_id, params, signal, onUpdate, ctx) {
			return runPacificoAdvisor(params as PacificoAdvisorArgs, signal, onUpdate, ctx);
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
