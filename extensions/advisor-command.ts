// ABOUTME: Registers /advisor for on-demand Claude advisor guidance from the current Pi session.
// ABOUTME: Preserves claude_advisor behavior while keeping slash-command registration separate from the tool extension.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { runAdvisor } from "./lib/claude-advisor-runner.ts";

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

export default function (pi: ExtensionAPI) {
	pi.registerCommand("advisor", {
		description: "Ask the Claude advisor for on-demand guidance about the current work: /advisor [question]",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const question = (args || "").trim() || "Review my current work context and provide strategic advice, risks, alternatives, and next actions.";
			const taskContext = [
				"The user invoked /advisor for on-demand guidance. Infer the current objective from the available project/session context and provide concise advice without taking over implementation.",
				currentTaskContext(),
			].filter(Boolean).join("\n\n");

			ctx.ui.notify("Consulting Claude advisor…", "info");
			try {
				const { text } = await runAdvisor({
					question,
					task_context: taskContext,
					agent_role: "advisor-command",
				}, ctx);
				ctx.ui.notify(text, "info");
			} catch (err: any) {
				ctx.ui.notify(`Advisor failed: ${err?.message || err}`, "error");
			}
		},
	});
}
