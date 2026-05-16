// ABOUTME: Tests durable Pacifico async job registry helpers.
// ABOUTME: Ensures submitted jobs can be recovered, marked terminal, notified, and pruned.

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	listIncompletePacificoJobs,
	listPendingPacificoCompletions,
	loadPacificoJobs,
	markPacificoJobNotified,
	markPacificoJobPollError,
	markPacificoJobTerminal,
	PACIFICO_JOBS_RELATIVE_PATH,
	prunePacificoJobs,
	saveSubmittedPacificoJob,
} from "../lib/pacifico-job-state.ts";

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "pacifico-jobs-"));
});

afterEach(() => {
	// tmpdir cleanup is handled by the OS; tests use unique directories.
});

describe("pacifico-job-state", () => {
	it("saves submitted jobs under .context/pacifico-jobs.json", () => {
		saveSubmittedPacificoJob(cwd, {
			jobId: "job_1",
			status: "submitted",
			model: "claude-opus-4-6",
			route: "batch",
			prompt: "hello ".repeat(200),
		});

		const path = join(cwd, PACIFICO_JOBS_RELATIVE_PATH);
		expect(existsSync(path)).toBe(true);
		const state = loadPacificoJobs(cwd);
		expect(state.jobs).toHaveLength(1);
		expect(state.jobs[0].jobId).toBe("job_1");
		expect(state.jobs[0].status).toBe("submitted");
		expect(state.jobs[0].promptPreview!.length).toBeLessThanOrEqual(500);
		expect(listIncompletePacificoJobs(cwd).map((j) => j.jobId)).toEqual(["job_1"]);
	});

	it("marks terminal jobs as pending completion until notified", () => {
		saveSubmittedPacificoJob(cwd, { jobId: "job_2", status: "queued", prompt: "work" });
		markPacificoJobTerminal(cwd, {
			jobId: "job_2",
			status: "completed",
			model: "claude-opus-4-6",
			route: "batch",
			output: "done ".repeat(200),
		});

		expect(listIncompletePacificoJobs(cwd)).toHaveLength(0);
		const pending = listPendingPacificoCompletions(cwd);
		expect(pending.map((j) => j.jobId)).toEqual(["job_2"]);
		expect(pending[0].resultPreview!.length).toBeLessThanOrEqual(500);

		markPacificoJobNotified(cwd, "job_2", "2026-01-01T00:00:00.000Z");
		expect(listPendingPacificoCompletions(cwd)).toHaveLength(0);
	});

	it("records poll errors without making the job terminal", () => {
		saveSubmittedPacificoJob(cwd, { jobId: "job_3", status: "queued" });
		markPacificoJobPollError(cwd, "job_3", "temporary 404");

		const state = loadPacificoJobs(cwd);
		expect(state.jobs[0].lastPollError).toBe("temporary 404");
		expect(listIncompletePacificoJobs(cwd).map((j) => j.jobId)).toEqual(["job_3"]);
	});

	it("prunes old notified terminal jobs but keeps active and unnotified jobs", () => {
		saveSubmittedPacificoJob(cwd, { jobId: "active", status: "queued" });
		saveSubmittedPacificoJob(cwd, { jobId: "unnotified", status: "queued" });
		markPacificoJobTerminal(cwd, { jobId: "unnotified", status: "completed", output: "done" });
		saveSubmittedPacificoJob(cwd, { jobId: "old", status: "queued" });
		markPacificoJobTerminal(cwd, { jobId: "old", status: "completed", output: "done" });
		markPacificoJobNotified(cwd, "old", "2020-01-01T00:00:00.000Z");

		prunePacificoJobs(cwd, 1_000, Date.parse("2026-01-01T00:00:00.000Z"));

		const ids = loadPacificoJobs(cwd).jobs.map((job) => job.jobId).sort();
		expect(ids).toEqual(["active", "unnotified"]);
		expect(readFileSync(join(cwd, PACIFICO_JOBS_RELATIVE_PATH), "utf-8")).toContain("version");
	});
});
