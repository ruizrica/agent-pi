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

	it("renders one updating widget with the shared Task Brief-style Pacifico brief", () => {
		expect(source).toContain('import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui"');
		expect(source).toContain('import { renderBriefWidget } from "./lib/task-list-render.ts"');
		expect(source).toContain('import { padRight } from "./lib/ui-helpers.ts"');
		expect(source).toContain("pi.registerMessageRenderer(PACIFICO_MESSAGE_TYPE, renderPacificoMessage)");
		expect(source).toContain("pi.registerMessageRenderer(PACIFICO_JOB_COMPLETE_TYPE, renderPacificoMessage)");
		expect(source).toContain("ctx.ui.setWidget(PACIFICO_WIDGET_KEY");
		expect(source).toContain("setPacificoWidget(ctx, r.id");
		expect(source).toContain("setPacificoWidget(ctx, job.id");
		expect(source).toContain('return renderPacificoRows(activeWidgetDetails, theme, "", width, true)');
		expect(source).not.toContain("content.setText(renderPacificoRows(activeWidgetDetails, theme");
		expect(source).toContain("display: false");
		expect(source).toContain("content: formatJobOutcome(job)");
		expect(source).toContain('const BRIEF_WIDGET_BG = "\\x1b[48;5;236m"');
		expect(source).toContain("renderBriefWidget({");
		expect(source).toContain('title: "Pacifico"');
		expect(source).toContain('briefLabel: "Pacifico Brief:"');
		expect(source).toContain('"/pacifico-jobs to view jobs"');
		expect(source).toContain('"/pacifico-job <id> for details"');
		expect(source).toContain("new Box(0, 0)");
		expect(source).not.toContain("const PACIFICO_OPERATIONAL_MODE_BG");
		expect(source).not.toContain("const PACIFICO_HEADER_BG");
		expect(source).not.toContain('value: `${headerPad}PACIFICO${headerPad}`');
		expect(source).not.toContain("theme.bold(`${spinner}pacifico`)");
		expect(source).not.toContain("[pacifico_message]");
		expect(source).not.toContain("[pacifico_job_complete]");
		expect(source).not.toContain("⏳");
		expect(source).not.toContain("I'll stay quiet while Pacifico works and continue when the result is ready.");
	});

	it("supports queued, processing, completed, and error widget states without old color-table chrome", () => {
		expect(source).toContain("function normalizeWidgetStatus");
		expect(source).toContain('return "queued"');
		expect(source).toContain('return "processing"');
		expect(source).toContain('return "completed"');
		expect(source).toContain('return "error"');
		expect(source).toContain('setPacificoWidget(ctx, provisionalKey, { status: "queued"');
		expect(source).toContain("function shortJobId");
		expect(source).toContain("function pacificoBriefDescription");
		expect(source).toContain("formatPacificoWidgetContent");
		expect(source).toContain("job ID:");
		expect(source).toContain("model:");
		expect(source).toContain("status:");
		expect(source).toContain("formatPacificoWidgetContent({");
		expect(source).not.toContain("38;2;148;163;184m");
		expect(source).not.toContain("38;2;234;179;8m");
		expect(source).not.toContain("38;2;34;197;94m");
		expect(source).not.toContain("38;2;239;68;68m");
		expect(source).not.toContain("BRAILLE_FRAMES");
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

	it("routes /pacifico through the context-packed advisor and keeps pacifico_advisor tool parity", () => {
		expect(source).not.toContain('pi.registerCommand("pacifico-advisor"');
		expect(source).toContain('pi.registerCommand("pacifico"');
		expect(source).toContain("The user invoked /pacifico for on-demand advisor guidance");
		expect(source).toContain("currentTaskContext()");
		expect(source).toContain('name: "pacifico_advisor"');
		expect(source).toContain("runPacificoAdvisor(params as PacificoAdvisorArgs");
		expect(source).toContain("collectPacificoAdvisorContext");
		expect(source).toContain("formatPacificoAdvisorResult");
		expect(source).toContain("normalizeAdvisorResponse");
		expect(source).toContain('tool: "pacifico_advisor"');
		expect(source).toContain('kind: "advisor_review"');
		expect(source).toContain('executionClass: "planning"');
		expect(source).toContain("outputComplexity: complexity");
		expect(source).toContain("Pacifico has no filesystem access");
	});

	it("renders Pacifico results through the existing Plan Viewer round-trip UI", () => {
		expect(source).toContain("generatePlanViewerHTML");
		expect(source).toContain("openPacificoLiveViewer");
		expect(source).toContain("buildPacificoLoadingMarkdown");
		expect(source).toContain("pacificoResultToMarkdown");
		expect(source).toContain("roundTripEnabled: true");
		expect(source).toContain("onEveryResult");
		expect(source).toContain('result?.action === "changes_requested"');
		expect(source).toContain("live.updateMarkdown");
		expect(source).toContain('bannerLabel: "Pacifico Queued"');
		expect(source).toContain('bannerTone: "warning"');
		expect(source).toContain('badgeLabel: "QUEUED"');
		expect(source).toContain('bannerLabel: "Pacifico Complete"');
		expect(source).not.toContain("generatePacificoResultHTML");
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
