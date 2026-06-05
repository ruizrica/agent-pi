// ABOUTME: Cursor-first local file opener for natural-language "open file" requests.
// ABOUTME: Keeps the browser file viewer available while making direct Cursor launches the default.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { launchFileInEditor } from "./lib/editor-launcher.ts";

const OpenFileParams = Type.Object({
	file_path: Type.String({ description: "Path to the local file to open in Cursor" }),
	line: Type.Optional(Type.Number({ description: "Optional 1-based line number to jump to in Cursor" })),
	column: Type.Optional(Type.Number({ description: "Optional 1-based column number to jump to in Cursor; requires line" })),
});

interface OpenFileParamsShape {
	file_path: string;
	line?: number;
	column?: number;
}

function parseCommandArgs(args: string): OpenFileParamsShape | null {
	const raw = String(args || "").trim();
	if (!raw) return null;

	const location = raw.match(/^(.*?)(?::(\d+)(?::(\d+))?)$/);
	if (!location) return { file_path: raw };

	return {
		file_path: location[1],
		line: Number(location[2]),
		column: location[3] ? Number(location[3]) : undefined,
	};
}

async function openFileInCursor(params: OpenFileParamsShape) {
	const filePath = resolve(params.file_path);
	if (!existsSync(filePath)) {
		return {
			content: [{ type: "text" as const, text: `File not found: ${params.file_path}` }],
			details: {
				error: "file_not_found",
				filePath,
			},
		};
	}

	const result = await launchFileInEditor({
		editor: "cursor",
		filePath,
		line: params.line,
		column: params.column,
	});

	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Failed to open ${basename(filePath)} in Cursor: ${result.error}` }],
			details: {
				error: "launch_failed",
				message: result.error,
				editor: "cursor",
				filePath,
			},
		};
	}

	return {
		content: [{ type: "text" as const, text: `Opened ${basename(filePath)} in Cursor.` }],
		details: {
			editor: result.editor,
			filePath,
			line: params.line,
			column: params.column,
			command: result.command,
			args: result.args,
		},
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "open_file",
		label: "Open File in Cursor",
		description:
			"Default tool for ordinary requests like 'open a file', 'open this path', or 'open this in Cursor'. " +
			"Opens the local file directly in Cursor instead of the browser file viewer. " +
			"Use show_file only when the user explicitly asks for the browser viewer, line-range preview, editing UI, or approval mode.",
		parameters: OpenFileParams,
		async execute(_toolCallId, params) {
			return openFileInCursor(params as OpenFileParamsShape);
		},
	});

	pi.registerCommand("open-file", {
		description: "Open a local file directly in Cursor",
		handler: async (args, ctx: ExtensionContext) => {
			const parsed = parseCommandArgs(String(args || ""));
			if (!parsed) {
				ctx.ui.notify("Usage: /open-file <path>[:line[:column]]", "warning");
				return;
			}

			const result = await openFileInCursor(parsed);
			const text = result.content[0]?.text || "Open file request finished.";
			ctx.ui.notify(text, result.details?.error ? "error" : "success");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
