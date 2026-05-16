// ABOUTME: Agent email sending extension — enables agents to send emails via AgentMail through Commander.
// ABOUTME: Registers a send_email tool that proxies to commander_agentmail for reports, briefings, and custom emails.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";

// ── Types ────────────────────────────────────────────────────────────

interface SendEmailParams {
	to?: string;
	subject?: string;
	body?: string;
	html?: string;
	type?: "generic" | "report" | "briefing";
	report_name?: string;
	format?: "markdown" | "html" | "text";
}

// ── Tool Registration ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "send_email",
		label: "Send Email",
		description: [
			"Send an email via AgentMail through the Commander assistant.",
			"Uses the same email system as Commander reports and briefings.",
			"Default recipient: ruizrica2@gmail.com",
			"",
			"Three modes:",
			"  generic  — send a custom email with subject and body/content",
			"  report   — send a formatted report (markdown auto-converted to styled HTML)",
			"  briefing — send a morning briefing email",
			"",
			"Content supports markdown (auto-converted to HTML), raw HTML, or plain text.",
			"",
			"Examples:",
			'  { type: "report", report_name: "Feature Complete", body: "## Summary\\nAdded auth..." }',
			'  { type: "generic", subject: "Build Results", body: "All 42 tests passed." }',
			'  { type: "generic", to: "team@example.com", subject: "Deploy Done", body: "v2.1 is live" }',
		].join("\n"),
		parameters: Type.Object({
			to: Type.Optional(Type.String({ description: "Recipient email address. Default: ruizrica2@gmail.com" })),
			subject: Type.Optional(Type.String({ description: "Email subject line (required for generic, auto-generated for report/briefing)." })),
			body: Type.Optional(Type.String({ description: "Email body content — markdown (default), HTML, or plain text." })),
			html: Type.Optional(Type.String({ description: "Raw HTML email body (overrides body)." })),
			type: Type.Optional(Type.String({ description: "Email type: 'generic' (default), 'report', or 'briefing'." })),
			report_name: Type.Optional(Type.String({ description: "Report name for subject line (for report type)." })),
			format: Type.Optional(Type.String({ description: "Content format: 'markdown' (default), 'html', 'text'." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const p = params as SendEmailParams;
			const emailType = (p.type || "generic").toLowerCase();

			// ── Try to call commander_agentmail via the MCP client ──
			const g = globalThis as any;

			// Check if Commander is available
			const gate = g.__piCommanderGate;
			if (!gate || gate.status !== "available") {
				return {
					content: [{ type: "text" as const, text: "Email sending failed: Commander is not connected. The send_email tool requires Commander with AgentMail configured." }],
					details: { success: false, error: "commander_not_available" },
				};
			}

			// Build the commander_agentmail call based on email type
			let agentmailParams: Record<string, string | undefined>;

			if (emailType === "report") {
				if (!p.body && !p.html) {
					return {
						content: [{ type: "text" as const, text: "Email sending failed: 'body' content is required for report emails." }],
						details: { success: false, error: "missing_content" },
					};
				}
				agentmailParams = {
					operation: "send:report",
					report_name: p.report_name || p.subject || "Completion Report",
					content: p.html || p.body,
					format: p.html ? "html" : (p.format || "markdown"),
				};
				if (p.to) agentmailParams.to = p.to;
			} else if (emailType === "briefing") {
				if (!p.body) {
					return {
						content: [{ type: "text" as const, text: "Email sending failed: 'body' content is required for briefing emails." }],
						details: { success: false, error: "missing_content" },
					};
				}
				agentmailParams = {
					operation: "send:briefing",
					content: p.body,
				};
				if (p.to) agentmailParams.to = p.to;
			} else {
				// Generic email
				if (!p.subject) {
					return {
						content: [{ type: "text" as const, text: "Email sending failed: 'subject' is required for generic emails." }],
						details: { success: false, error: "missing_subject" },
					};
				}
				if (!p.body && !p.html) {
					return {
						content: [{ type: "text" as const, text: "Email sending failed: 'body' or 'html' is required for generic emails." }],
						details: { success: false, error: "missing_body" },
					};
				}
				agentmailParams = {
					operation: "send:custom",
					subject: p.subject,
					content: p.html || p.body,
					format: p.html ? "html" : (p.format || "markdown"),
				};
				if (p.to) agentmailParams.to = p.to;
			}

			// Call commander_agentmail through the tool system
			try {
				// Use ctx.callTool if available, otherwise fall back to finding the tool
				if (ctx && typeof (ctx as any).callTool === "function") {
					const result = await (ctx as any).callTool("commander_agentmail", agentmailParams);
					return result;
				}

				// Fallback: call via the registered Pi tool directly
				const piGlobal = g.__piInstance || g.__pi;
				if (piGlobal && typeof piGlobal.callTool === "function") {
					const result = await piGlobal.callTool("commander_agentmail", agentmailParams);
					return result;
				}

				// Last resort: use the MCP client directly
				const McpClientModule = await import("./lib/mcp-client.ts");
				const serverPath = "/Users/ricardo/Workshop/Github-Work/commander/services/commander-mcp/dist/server.js";
				const client = new McpClientModule.McpClient(serverPath, {
					COMMANDER_WS_URL: process.env.COMMANDER_WS_URL || "ws://localhost:9002",
					AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY || "",
				});

				try {
					await client.connect();
					const result = await client.callTool("commander_agentmail", agentmailParams);
					return result;
				} finally {
					try { client.disconnect(); } catch {}
				}
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Email sending failed: ${err.message}` }],
					details: { success: false, error: err.message },
				};
			}
		},

		renderCall(args, theme) {
			const p = args as SendEmailParams;
			const type = p.type || "generic";
			const to = p.to || "default";
			const label = `${type} → ${to}`;
			return new Text(theme.fg("toolTitle", theme.bold("send_email ")) + theme.fg("accent", label), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as any;
			const text = result.content?.[0];
			const textStr = text?.type === "text" ? text.text : "";

			if (details?.error || textStr.toLowerCase().includes("fail") || textStr.toLowerCase().includes("error")) {
				return new Text(theme.fg("error", `send_email failed: ${details?.error || textStr}`), 0, 0);
			}

			return new Text(theme.fg("success", `send_email ✓ ${textStr || "sent"}`), 0, 0);
		},
	});
}
