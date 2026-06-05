// ABOUTME: Registration tests for consolidated slash-command families.
// ABOUTME: Ensures family dispatchers replace retired top-level aliases.

import { describe, expect, it, vi } from "vitest";
import pipelineTeam from "../pipeline-team.ts";
import agentTeam from "../agent-team.ts";
import openrouterRouting from "../openrouter-routing.ts";
import subagentWidget from "../subagent-widget.ts";

function makePi() {
	const commands: string[] = [];
	const pi = {
		on: vi.fn(),
		registerTool: vi.fn(),
		registerShortcut: vi.fn(),
		registerProvider: vi.fn(),
		registerCommand: vi.fn((name: string) => {
			commands.push(name);
		}),
		sendMessage: vi.fn(),
	};
	return { pi, commands };
}

function expectOnlyCanonical(commands: string[], canonical: string, retired: string[]) {
	expect(commands).toContain(canonical);
	for (const name of retired) {
		expect(commands).not.toContain(name);
	}
}

describe("consolidated slash-command family registration", () => {
	it("registers only /pipeline for pipeline subcommands", () => {
		const { pi, commands } = makePi();
		pipelineTeam(pi as any);

		expectOnlyCanonical(commands, "pipeline", ["pipeline-status", "pipeline-reset", "pipeline-off", "pipeline-clear"]);
	});

	it("registers only /agents for agent-team subcommands", () => {
		const { pi, commands } = makePi();
		agentTeam(pi as any);

		expectOnlyCanonical(commands, "agents", ["agents-team", "agents-list", "agents-grid", "agents-clear"]);
	});

	it("registers only /openrouter for OpenRouter subcommands", () => {
		const { pi, commands } = makePi();
		openrouterRouting(pi as any);

		expectOnlyCanonical(commands, "openrouter", ["openrouter-sync", "openrouter-enrich", "openrouter-preview", "openrouter-balance", "openrouter-status"]);
	});

	it("registers only /sub for subagent slash subcommands", () => {
		const { pi, commands } = makePi();
		subagentWidget(pi as any);

		expectOnlyCanonical(commands, "sub", ["subcont", "subrm", "subclear"]);
	});
});
