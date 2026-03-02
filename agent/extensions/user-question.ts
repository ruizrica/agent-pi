// ABOUTME: User Question — Interactive UI tool for agent-to-user communication
// ABOUTME: Three inline modes: select (pick from list), input (free text), confirm (yes/no)

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	Text,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { outputLine } from "./lib/output-box.ts";
import { buildAskUserDetails, type AskUserDetails } from "./lib/ask-user-details.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

// ── Tool Parameters ────────────────────────────────────────────────────

const AskUserParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	mode: StringEnum(["select", "input", "confirm"] as const),
	options: Type.Optional(Type.Array(Type.Object({
		label: Type.String({ description: "Option label shown in the list" }),
		markdown: Type.Optional(Type.String({ description: "Markdown preview shown when this option is highlighted" })),
	}), { description: "Options for select mode (required)" })),
	placeholder: Type.Optional(Type.String({ description: "Placeholder text for input mode" })),
	detail: Type.Optional(Type.String({ description: "Detail text for confirm mode" })),
});

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user a question with inline interactive UI. " +
			"Three modes: 'select' shows an inline picker with options. " +
			"'input' prompts for free-text entry. 'confirm' asks a yes/no question. " +
			"For select mode, provide options[] with label and optional markdown for each.",
		parameters: AskUserParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { question, mode, options, placeholder, detail } = params;

			if (mode === "select") {
				if (!options || options.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: options[] required for select mode" }],
					};
				}

				const labels = options.map((o) => o.label);
				const result = await ctx.ui.select(question, labels);

				if (result == null) {
					return {
						content: [{ type: "text" as const, text: "[User cancelled]" }],
						details: buildAskUserDetails({ mode, question, cancelled: true }),
					};
				}
				const opt = options.find((o) => o.label === result);
				return {
					content: [{ type: "text" as const, text: `User selected: ${result}` }],
					details: buildAskUserDetails({
						mode, question, answer: result,
						selectedMarkdown: opt?.markdown,
					}),
				};
			}

			if (mode === "input") {
				const answer = await ctx.ui.input(question, placeholder || "");
				if (!answer) {
					return {
						content: [{ type: "text" as const, text: "[User cancelled]" }],
						details: buildAskUserDetails({ mode, question, cancelled: true }),
					};
				}
				return {
					content: [{ type: "text" as const, text: `User answered: ${answer}` }],
					details: buildAskUserDetails({ mode, question, answer }),
				};
			}

			if (mode === "confirm") {
				const confirmed = await ctx.ui.confirm(
					question,
					detail || "",
					{ timeout: 60000 },
				);
				return {
					content: [{ type: "text" as const, text: confirmed ? "User confirmed: Yes" : "User declined: No" }],
					details: buildAskUserDetails({ mode, question, answer: confirmed ? "Yes" : "No" }),
				};
			}

			return {
				content: [{ type: "text" as const, text: `Error: unknown mode '${mode}'` }],
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("ask_user "));
			text += theme.fg("muted", args.mode || "");
			text += theme.fg("dim", `  "${args.question}"`);
			if (args.mode === "select" && args.options?.length) {
				text += theme.fg("dim", `  ${args.options.length} options`);
			}
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as AskUserDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.cancelled) {
				return new Text(outputLine(theme, "dim", "[Cancelled]"), 0, 0);
			}

			if (details.mode === "confirm") {
				const color = details.answer === "Yes" ? "success" : "warning";
				const bar = details.answer === "Yes" ? "success" : "warning";
				const label = details.answer === "Yes" ? "Confirmed" : "Declined";
				return new Text(outputLine(theme, bar, label), 0, 0);
			}

			// select or input
			const summary = details.mode === "select"
				? `Selected: ${details.answer}`
				: `Answer: ${details.answer}`;

			if (expanded && details.selectedMarkdown) {
				// Show summary + markdown preview as plain text lines
				const preview = details.selectedMarkdown
					.split("\n")
					.slice(0, 8)
					.map((l) => theme.fg("muted", "  " + l))
					.join("\n");
				return new Text(
					outputLine(theme, "accent", summary) + "\n" + preview,
					0, 0,
				);
			}

			return new Text(outputLine(theme, "accent", summary), 0, 0);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
