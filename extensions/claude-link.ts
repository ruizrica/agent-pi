// ABOUTME: pi side of the a2a-link bridge — talk to Claude Code and other agents.
// ABOUTME: Registers claude_send tool (mailbox async / claude -p sync) and a session-start inbox check.
/**
 * Claude Link — pi ↔ Claude bridge (counterpart of the toolkit a2a-link skill)
 *
 * Transports:
 *  - async  : durable message via `cmd mailbox send` (shared Commander bus)
 *  - sync   : spawn `claude -p "<prompt>"` non-interactively and return output
 *
 * Safety: refuses nested sync bridge calls via A2A_LINK_DEPTH (depth > 1).
 * On session start, surfaces unread mailbox messages addressed to this agent.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";

const SYNC_TIMEOUT_MS = 120_000;
const MAILBOX_TIMEOUT_MS = 10_000;

function run(
	cmd: string,
	args: string[],
	timeout: number,
	env?: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
	return new Promise((resolvePromise) => {
		execFile(
			cmd,
			args,
			{ timeout, env: { ...process.env, ...env }, maxBuffer: 4 * 1024 * 1024 },
			(err, stdout, stderr) => {
				resolvePromise({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" });
			},
		);
	});
}

function text(message: string, isError = false) {
	return { content: [{ type: "text" as const, text: message }], isError };
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "claude_send",
		label: "Claude Send (a2a-link)",
		description:
			"Bridge to Claude Code / other agents. mode=async sends a durable cmd mailbox message " +
			"(params: to, subject, body, type). mode=sync runs `claude -p <prompt>` non-interactively " +
			"and returns its output (params: prompt). Prefer async for handoffs; sync for immediate questions.",
		parameters: Type.Object({
			mode: Type.Union([Type.Literal("async"), Type.Literal("sync")], {
				description: "Transport: async (mailbox) or sync (claude -p)",
			}),
			to: Type.Optional(Type.String({ description: "Recipient agent name (async)" })),
			subject: Type.Optional(Type.String({ description: "Message subject (async)" })),
			body: Type.Optional(Type.String({ description: "Message body (async)" })),
			type: Type.Optional(
				Type.String({ description: "Message type: handoff|status|question|result (async, default status)" }),
			),
			prompt: Type.Optional(Type.String({ description: "Prompt for claude -p (sync)" })),
		}),
		async execute(_toolCallId, params) {
			const p = params as {
				mode: string;
				to?: string;
				subject?: string;
				body?: string;
				type?: string;
				prompt?: string;
			};
			if (p.mode === "sync") {
				const depth = Number(process.env.A2A_LINK_DEPTH ?? "0");
				if (depth >= 1) {
					return text("a2a-link: refusing nested sync bridge call (depth limit)", true);
				}
				const prompt = (p.prompt ?? "").trim();
				if (!prompt) return text("claude_send sync requires 'prompt'", true);
				const res = await run("claude", ["-p", prompt], SYNC_TIMEOUT_MS, {
					A2A_LINK_DEPTH: String(depth + 1),
				});
				if (!res.ok) return text(`claude -p failed: ${res.stderr || "(no stderr)"}`, true);
				return text(res.stdout.trim() || "(empty response)");
			}
			// async: cmd mailbox
			const to = (p.to ?? "").trim();
			const subject = (p.subject ?? "").trim();
			const body = (p.body ?? "").trim();
			const type = (p.type ?? "status").trim() || "status";
			if (!to || !subject || !body) {
				return text("claude_send async requires 'to', 'subject', 'body'", true);
			}
			const res = await run(
				"cmd",
				["mailbox", "send", to, subject, body, "--type", type, "--runtime", "pi", "--model", "pi-agent"],
				MAILBOX_TIMEOUT_MS,
			);
			if (!res.ok) return text(`cmd mailbox send failed: ${res.stderr || "cmd CLI unavailable"}`, true);
			return text(`a2a-link: sent '${subject}' -> ${to} (type=${type})`);
		},
	});

	// Surface recent mailbox messages at session start (lightweight, no polling).
	// Note: `cmd mailbox inbox --json` currently emits nothing, so we parse the
	// human-readable listing: lines like `1. [msg-297] ricardo - subject`.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		const res = await run("cmd", ["mailbox", "inbox"], MAILBOX_TIMEOUT_MS);
		if (!res.ok || !res.stdout.trim()) return;
		const plain = res.stdout.replace(/\x1b\[[0-9;]*m/g, "");
		const entries = [...plain.matchAll(/\[(msg-\d+)\]\s+(\S+)\s+-\s+(.+)\s*\n\s+([\d/:, ]+[AP]M)/g)];
		if (entries.length === 0) return;
		const [, , from, subject, dateStr] = entries[0];
		const ts = Date.parse(dateStr.trim());
		const fresh = Number.isFinite(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
		if (fresh) {
			ctx.ui?.notify?.(
				`Mailbox: ${entries.length} message(s) (latest: "${subject.trim()}" from ${from})`,
				"info",
			);
		}
	});
}
