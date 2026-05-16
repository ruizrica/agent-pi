// ABOUTME: Durable job registry for Pacifico async work.
// ABOUTME: Lets the extension resume polling and deliver completions after session reloads.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export interface PacificoTrackedJob {
	jobId: string;
	status: string;
	model?: string | null;
	route?: string | null;
	promptPreview?: string;
	createdAt: string;
	updatedAt: string;
	completedAt?: string | null;
	notifiedAt?: string | null;
	lastPollError?: string | null;
	resultPreview?: string | null;
	error?: string | null;
}

export interface PacificoJobState {
	version: 1;
	jobs: PacificoTrackedJob[];
}

export interface PacificoSubmittedJobInput {
	jobId: string;
	status: string;
	model?: string | null;
	route?: string | null;
	prompt?: string;
	createdAt?: string;
}

export interface PacificoTerminalJobInput {
	jobId: string;
	status: string;
	model?: string | null;
	route?: string | null;
	completedAt?: string | null;
	output?: string | null;
	error?: string | null;
}

export const PACIFICO_JOBS_RELATIVE_PATH = join(".context", "pacifico-jobs.json");

function nowIso(): string {
	return new Date().toISOString();
}

function statePath(cwd: string): string {
	return join(cwd, PACIFICO_JOBS_RELATIVE_PATH);
}

function emptyState(): PacificoJobState {
	return { version: 1, jobs: [] };
}

function normalizeState(value: unknown): PacificoJobState {
	if (!value || typeof value !== "object") return emptyState();
	const record = value as Record<string, unknown>;
	const rows = Array.isArray(record.jobs) ? record.jobs : [];
	const jobs = rows.flatMap((row): PacificoTrackedJob[] => {
		if (!row || typeof row !== "object") return [];
		const r = row as Record<string, unknown>;
		if (typeof r.jobId !== "string" || r.jobId.trim().length === 0) return [];
		return [{
			jobId: r.jobId,
			status: typeof r.status === "string" ? r.status : "unknown",
			model: typeof r.model === "string" ? r.model : null,
			route: typeof r.route === "string" ? r.route : null,
			promptPreview: typeof r.promptPreview === "string" ? r.promptPreview : undefined,
			createdAt: typeof r.createdAt === "string" ? r.createdAt : nowIso(),
			updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : nowIso(),
			completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
			notifiedAt: typeof r.notifiedAt === "string" ? r.notifiedAt : null,
			lastPollError: typeof r.lastPollError === "string" ? r.lastPollError : null,
			resultPreview: typeof r.resultPreview === "string" ? r.resultPreview : null,
			error: typeof r.error === "string" ? r.error : null,
		}];
	});
	return { version: 1, jobs };
}

export function loadPacificoJobs(cwd: string): PacificoJobState {
	try {
		const path = statePath(cwd);
		if (!existsSync(path)) return emptyState();
		return normalizeState(JSON.parse(readFileSync(path, "utf-8")));
	} catch {
		return emptyState();
	}
}

export function writePacificoJobs(cwd: string, state: PacificoJobState): void {
	const path = statePath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(normalizeState(state), null, 2)}\n`);
}

function upsertJob(cwd: string, next: PacificoTrackedJob): PacificoTrackedJob {
	const state = loadPacificoJobs(cwd);
	const idx = state.jobs.findIndex((job) => job.jobId === next.jobId);
	if (idx >= 0) state.jobs[idx] = { ...state.jobs[idx], ...next };
	else state.jobs.push(next);
	writePacificoJobs(cwd, state);
	return idx >= 0 ? state.jobs[idx] : next;
}

function preview(text: string | null | undefined, max = 500): string | null {
	if (!text) return null;
	return text.replace(/\s+/g, " ").trim().slice(0, max) || null;
}

export function saveSubmittedPacificoJob(cwd: string, input: PacificoSubmittedJobInput): PacificoTrackedJob {
	const current = loadPacificoJobs(cwd).jobs.find((job) => job.jobId === input.jobId);
	const timestamp = nowIso();
	return upsertJob(cwd, {
		jobId: input.jobId,
		status: input.status,
		model: input.model ?? current?.model ?? null,
		route: input.route ?? current?.route ?? null,
		promptPreview: preview(input.prompt) ?? current?.promptPreview,
		createdAt: current?.createdAt ?? input.createdAt ?? timestamp,
		updatedAt: timestamp,
		completedAt: current?.completedAt ?? null,
		notifiedAt: current?.notifiedAt ?? null,
		lastPollError: null,
		resultPreview: current?.resultPreview ?? null,
		error: current?.error ?? null,
	});
}

export function markPacificoJobPollError(cwd: string, jobId: string, error: string): PacificoTrackedJob | undefined {
	const current = loadPacificoJobs(cwd).jobs.find((job) => job.jobId === jobId);
	if (!current) return undefined;
	return upsertJob(cwd, { ...current, updatedAt: nowIso(), lastPollError: error });
}

export function markPacificoJobTerminal(cwd: string, input: PacificoTerminalJobInput): PacificoTrackedJob {
	const current = loadPacificoJobs(cwd).jobs.find((job) => job.jobId === input.jobId);
	const timestamp = nowIso();
	return upsertJob(cwd, {
		jobId: input.jobId,
		status: input.status,
		model: input.model ?? current?.model ?? null,
		route: input.route ?? current?.route ?? null,
		promptPreview: current?.promptPreview,
		createdAt: current?.createdAt ?? timestamp,
		updatedAt: timestamp,
		completedAt: input.completedAt ?? timestamp,
		notifiedAt: current?.notifiedAt ?? null,
		lastPollError: null,
		resultPreview: preview(input.output),
		error: input.error ?? null,
	});
}

export function listIncompletePacificoJobs(cwd: string): PacificoTrackedJob[] {
	return loadPacificoJobs(cwd).jobs.filter((job) => !["completed", "failed", "cancelled"].includes(job.status));
}

export function listPendingPacificoCompletions(cwd: string): PacificoTrackedJob[] {
	return loadPacificoJobs(cwd).jobs.filter((job) => ["completed", "failed", "cancelled"].includes(job.status) && !job.notifiedAt);
}

export function markPacificoJobNotified(cwd: string, jobId: string, notifiedAt = nowIso()): PacificoTrackedJob | undefined {
	const current = loadPacificoJobs(cwd).jobs.find((job) => job.jobId === jobId);
	if (!current) return undefined;
	return upsertJob(cwd, { ...current, updatedAt: notifiedAt, notifiedAt });
}

export function prunePacificoJobs(cwd: string, maxAgeMs: number, nowMs = Date.now()): void {
	const state = loadPacificoJobs(cwd);
	state.jobs = state.jobs.filter((job) => {
		if (!["completed", "failed", "cancelled"].includes(job.status)) return true;
		if (!job.notifiedAt) return true;
		const t = Date.parse(job.notifiedAt);
		return Number.isNaN(t) || nowMs - t <= maxAgeMs;
	});
	writePacificoJobs(cwd, state);
}
