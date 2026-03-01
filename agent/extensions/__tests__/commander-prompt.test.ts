// ABOUTME: Tests for buildCommanderPrompt — shared Commander system prompt generation.
// ABOUTME: Validates prompt construction with/without taskId, mailbox chat, and peer names.

import { describe, it, expect } from "vitest";
import { buildCommanderPrompt } from "../lib/commander-prompt.ts";

describe("buildCommanderPrompt", () => {
	it("includes agent name in output", () => {
		const result = buildCommanderPrompt({ agentName: "SCOUT" });
		expect(result).toContain('"SCOUT"');
	});

	it("includes task ID instructions when taskId is provided", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER", taskId: 42 });
		expect(result).toContain("task_id: 42");
		expect(result).toContain("claim");
		expect(result).toContain("complete");
		expect(result).toContain("fail");
	});

	it("shows generic no-task message when taskId is omitted", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER" });
		expect(result).toContain("No Commander task assigned");
		expect(result).not.toContain("claim");
	});

	it("includes mailbox chat section when enableMailboxChat is true", () => {
		const result = buildCommanderPrompt({
			agentName: "SCOUT",
			enableMailboxChat: true,
		});
		expect(result).toContain("Inter-Agent Communication");
		expect(result).toContain("commander_mailbox");
	});

	it("omits mailbox chat section when enableMailboxChat is false", () => {
		const result = buildCommanderPrompt({
			agentName: "SCOUT",
			enableMailboxChat: false,
		});
		expect(result).not.toContain("Inter-Agent Communication");
	});

	it("lists peer names in mailbox chat section", () => {
		const result = buildCommanderPrompt({
			agentName: "SCOUT",
			enableMailboxChat: true,
			peerNames: ["SA-1-BUILDER", "SA-2-REVIEWER"],
		});
		expect(result).toContain("SA-1-BUILDER");
		expect(result).toContain("SA-2-REVIEWER");
	});

	it("omits peer list when peerNames is empty", () => {
		const result = buildCommanderPrompt({
			agentName: "SCOUT",
			enableMailboxChat: true,
			peerNames: [],
		});
		expect(result).toContain("Inter-Agent Communication");
		expect(result).not.toContain("Your peers are:");
	});

	it("includes heartbeat instructions for tasks", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER", taskId: 7 });
		expect(result).toContain("heartbeat");
	});

	it("includes mailbox notify on success when task is assigned", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER", taskId: 7 });
		expect(result).toContain("Task complete:");
		expect(result).toContain("from_agent");
	});
});
