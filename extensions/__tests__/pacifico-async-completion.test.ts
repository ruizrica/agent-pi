// ABOUTME: Static regression coverage for Pacifico advisor-style async completion behavior.
// ABOUTME: Ensures slash-command async jobs poll quietly and wake the assistant only on terminal result.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "..", "pacifico.ts"), "utf8");

describe("pacifico async completion notifier", () => {
	it("uses a dedicated completion custom type that is not filtered out of LLM context", () => {
		expect(source).toContain('const PACIFICO_JOB_COMPLETE_TYPE = "pacifico_job_complete"');
		expect(source).toContain('customType: PACIFICO_JOB_COMPLETE_TYPE');
		expect(source).toContain('m.customType === PACIFICO_MESSAGE_TYPE');
		expect(source).not.toContain('m.customType === PACIFICO_JOB_COMPLETE_TYPE');
	});

	it("polls async jobs on a quiet 15 second cadence", () => {
		expect(source).toContain("ASYNC_POLL_SCHEDULE");
		expect(source).toContain("intervalMs: 15_000");
		expect(source).not.toContain("intervalMs: 30_000");
		expect(source).not.toContain("intervalMs: 1_000");
		expect(source).not.toContain("intervalMs: 5_000");
	});

	it("renders one updating widget with a boxed flat-yellow pacifico label and emphasized model", () => {
		expect(source).toContain('import { Box, Text } from "@earendil-works/pi-tui"');
		expect(source).toContain("pi.registerMessageRenderer(PACIFICO_MESSAGE_TYPE, renderPacificoMessage)");
		expect(source).toContain("pi.registerMessageRenderer(PACIFICO_JOB_COMPLETE_TYPE, renderPacificoMessage)");
		expect(source).toContain("ctx.ui.setWidget(activeWidgetKey");
		expect(source).toContain("setPacificoWidget(ctx, r.id");
		expect(source).toContain("setPacificoWidget(ctx, job.id");
		expect(source).toContain("display: false");
		expect(source).toContain("38;2;234;179;8m");
		expect(source).toContain('theme.bold("pacifico")');
		expect(source).toContain("38;2;125;137;151m");
		expect(source).toContain("new Box(2, 1, cardBg)");
		expect(source).toContain("48;2;50;50;50m");
		expect(source).not.toContain("[pacifico_message]");
		expect(source).not.toContain("[pacifico_job_complete]");
		expect(source).not.toContain("⏳");
		expect(source).not.toContain("I'll stay quiet while Pacifico works and continue when the result is ready.");
	});

	it("supports color-coded queued, processing, completed, and error widget states without queue policy text", () => {
		expect(source).toContain("function normalizeWidgetStatus");
		expect(source).toContain('return "queued"');
		expect(source).toContain('return "processing"');
		expect(source).toContain('return "completed"');
		expect(source).toContain('return "error"');
		expect(source).toContain('38;2;148;163;184m');
		expect(source).toContain('38;2;234;179;8m');
		expect(source).toContain('38;2;34;197;94m');
		expect(source).toContain('38;2;239;68;68m');
		expect(source).toContain('setPacificoWidget(ctx, provisionalKey, { status: "queued"');
		expect(source).toContain("formatPacificoWidgetContent");
		expect(source).toContain("job:");
		expect(source).toContain("model:");
		expect(source).toContain("status:");
		expect(source).toContain("formatPacificoWidgetContent({");
		expect(source).not.toContain("response.reason");
	});

	it("persists async jobs and wakes the assistant through a pending completion queue", () => {
		expect(source).toContain("saveSubmittedPacificoJob(ctx.cwd");
		expect(source).toContain("const pendingCompletions = new Map<string, PendingCompletion>()");
		expect(source).toContain("function queueJobCompletion");
		expect(source).toContain("function flushPendingCompletions");
		expect(source).toContain("markPacificoJobTerminal(cwd");
		expect(source).toContain("markPacificoJobNotified(pending.cwd, jobId)");
		expect(source).toContain("triggerTurn: true");
		expect(source).toContain('deliverAs: "followUp"');
		expect(source).toContain("queueJobCompletion(final, cwd)");
		expect(source).not.toContain("emitJobComplete(pi, final)");
		expect(source).toContain("Stay silent for timeout/not-found/network polling failures");
	});

	it("recovers incomplete and unnotified jobs on session start", () => {
		expect(source).toContain('pi.on("session_start"');
		expect(source).toContain("prunePacificoJobs(ctx.cwd, PACIFICO_JOB_PRUNE_AGE_MS)");
		expect(source).toContain("listIncompletePacificoJobs(ctx.cwd)");
		expect(source).toContain("listPendingPacificoCompletions(ctx.cwd)");
		expect(source).toContain("registerPoller(job.jobId, ctx)");
	});

	it("tracks agent lifecycle before flushing background completions", () => {
		expect(source).toContain('pi.on("agent_start"');
		expect(source).toContain('pi.on("agent_end"');
		expect(source).toContain("agentActive = true");
		expect(source).toContain("agentActive = false");
		expect(source).toContain("scheduleCompletionFlush(COMPLETION_RETRY_DELAY_MS)");
	});

	it("keeps sync responses immediate and only registers the poller for async responses", () => {
		expect(source).toContain('if (result.kind === "sync")');
		expect(source).toContain("const meta = `_${r.provider} · ${r.model} · route ${r.route}_`;");
		expect(source).toContain("registerPoller(r.id, ctx)");
		const syncBranchIndex = source.indexOf('if (result.kind === "sync")');
		const pollerIndex = source.indexOf("registerPoller(r.id, ctx)", syncBranchIndex);
		expect(pollerIndex).toBeGreaterThan(syncBranchIndex);
	});
});
