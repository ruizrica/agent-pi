// ABOUTME: Tests that shared advisor runner uses Anthropic provider routing and normalizes output.

import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { describe, expect, it, vi } from "vitest";

const spawn = vi.fn(() => {
	const proc = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
	proc.stdout = new PassThrough();
	proc.stderr = new PassThrough();
	queueMicrotask(() => {
		proc.stdout.write(`${JSON.stringify({
			type: "message_update",
			assistantMessageEvent: {
				type: "text_delta",
				delta: [
					"Summary: Use the shared runner.\n",
					"Recommended decision: Keep Anthropic provider routing.\n",
					"Risks:\n- Regression risk\n",
					"Alternatives:\n- Duplicate code\n",
					"Next actions:\n- Run tests",
				].join(""),
			},
		})}\n`);
		proc.emit("close", 0);
	});
	return proc;
});

vi.mock("child_process", () => ({ spawn }));

const { runAdvisor } = await import("../claude-advisor-runner.ts");

describe("runAdvisor", () => {
	it("uses the Anthropic provider path, tools, context, and normalized output", async () => {
		const updates: string[] = [];
		const result = await runAdvisor({
			question: "Should we keep behavior?",
			task_context: "Current task context",
			files: ["extensions/claude-advisor.ts"],
			model: "anthropic/claude-opus-4-7",
			agent_role: "builder",
		}, { cwd: process.cwd() }, (streamed) => updates.push(streamed));

		expect(spawn).toHaveBeenCalledOnce();
		const [command, cliArgs, options] = spawn.mock.calls[0];
		expect(command).toBe("pi");
		expect(cliArgs).toContain("--provider");
		expect(cliArgs[cliArgs.indexOf("--provider") + 1]).toBe("anthropic");
		expect(cliArgs).toContain("--model");
		expect(cliArgs[cliArgs.indexOf("--model") + 1]).toBe("claude-opus-4-7");
		expect(cliArgs).toContain("--tools");
		expect(cliArgs[cliArgs.indexOf("--tools") + 1]).toBe("read,grep,find,ls,bash");
		expect(cliArgs).toContain("--append-system-prompt");
		expect(cliArgs[cliArgs.indexOf("--append-system-prompt") + 1]).toContain("produce strategic guidance");
		expect(cliArgs.join("\n")).toContain("Current task context");
		expect(cliArgs.join("\n")).toContain("You are advising a builder agent");
		expect(cliArgs.join("\n")).toContain("extensions/claude-advisor.ts");
		expect(options.cwd).toBe(process.cwd());
		expect(options.env.PI_SUBAGENT).toBe("1");
		expect(result.text).toContain("Summary: Summary: Use the shared runner.");
		expect(result.normalized.recommendation).toContain("Keep Anthropic provider routing");
		expect(result.normalized.risks).toEqual(["Regression risk"]);
		expect(updates.at(-1)).toContain("Next actions");
	});
});
