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
		// Parent-authoritative: children should NOT claim/complete/fail
		expect(result).toContain("parent process manages");
		expect(result).toContain("Do NOT call claim");
		// But should still have progress logging and heartbeat
		expect(result).toContain("Log progress");
		expect(result).toContain("heartbeat");
	});

	it("shows generic no-task message when taskId is omitted", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER" });
		expect(result).toContain("No Commander task assigned");
		expect(result).not.toContain("parent process manages");
	});

	it("includes mailbox chat section when enableMailboxChat is true", () => {
		const result = buildCommanderPrompt({
			agentName: "SCOUT",
			enableMailboxChat: true,
		});
		expect(result).toContain("Inter-Agent Mailbox Communication (REQUIRED)");
		expect(result).toContain("commander_mailbox");
	});

	it("omits mailbox chat section when enableMailboxChat is false", () => {
		const result = buildCommanderPrompt({
			agentName: "SCOUT",
			enableMailboxChat: false,
		});
		expect(result).not.toContain("Inter-Agent Mailbox Communication");
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
		expect(result).toContain("Inter-Agent Mailbox Communication (REQUIRED)");
		expect(result).not.toContain("Your active peers:");
	});

	it("includes heartbeat instructions for tasks", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER", taskId: 7 });
		expect(result).toContain("heartbeat");
	});

	it("supports local collaboration mailbox instructions", () => {
		const result = buildCommanderPrompt({
			agentName: "BUILDER",
			enableMailboxChat: true,
			collaborationMode: "local",
			localMailboxPath: ".pi/local-mailbox/thread-1.jsonl",
		});
		expect(result).toContain("local mailbox");
		expect(result).toContain("DECLARE INTENT");
		expect(result).toContain("ACKNOWLEDGE direct assignments or questions");
		expect(result).toContain("CHECK the local mailbox before starting work");
		expect(result).toContain("AVOID DUPLICATE WORK");
		expect(result).toContain(".pi/local-mailbox/thread-1.jsonl");
	});

	it("does not mention join-specific collaboration workflow when mailbox chat is disabled", () => {
		const result = buildCommanderPrompt({
			agentName: "SOLO",
			enableMailboxChat: false,
			collaborationMode: "local",
		});
		expect(result).not.toContain("CHECK the local mailbox before starting work");
		expect(result).not.toContain("ACKNOWLEDGE direct assignments or questions");
		expect(result).not.toContain("canonical peer identities");
	});

	it("includes comment instructions when task is assigned", () => {
		const result = buildCommanderPrompt({ agentName: "BUILDER", taskId: 7 });
		expect(result).toContain("comment:add");
		expect(result).toContain("agent_name");
	});
});
