// ABOUTME: Shared local editor launcher for file-oriented extensions.
// ABOUTME: Builds safe child_process argument arrays for Cursor, Windsurf, and VS Code.

import { spawn } from "node:child_process";

export type EditorName = "cursor" | "windsurf" | "vscode";

export interface EditorLaunchRequest {
	editor: string;
	filePath: string;
	line?: number;
	column?: number;
	platform?: NodeJS.Platform;
	preferCli?: boolean;
}

export interface EditorLaunchCommand {
	ok: true;
	editor: EditorName;
	label: string;
	command: string;
	args: string[];
	filePath: string;
}

export interface EditorLaunchFailure {
	ok: false;
	editor: string;
	error: string;
	filePath: string;
}

export type EditorLaunchPlan = EditorLaunchCommand | EditorLaunchFailure;

export type EditorLaunchResult = EditorLaunchPlan & {
	command?: string;
	args?: string[];
};

const EDITOR_CONFIG: Record<EditorName, { label: string; cli: string; macApp: string }> = {
	cursor: { label: "Cursor", cli: "cursor", macApp: "Cursor" },
	windsurf: { label: "Windsurf", cli: "windsurf", macApp: "Windsurf" },
	vscode: { label: "Visual Studio Code", cli: "code", macApp: "Visual Studio Code" },
};

function isEditorName(editor: string): editor is EditorName {
	return Object.prototype.hasOwnProperty.call(EDITOR_CONFIG, editor);
}

function positiveInteger(name: "line" | "column", value?: number): { ok: true; value?: number } | { ok: false; error: string } {
	if (value === undefined) return { ok: true };
	if (!Number.isInteger(value) || value < 1) {
		return { ok: false, error: `${name} must be a positive integer` };
	}
	return { ok: true, value };
}

function jumpTarget(filePath: string, line?: number, column?: number): string {
	if (!line) return filePath;
	return `${filePath}:${line}:${column ?? 1}`;
}

export function buildEditorLaunchCommand(request: EditorLaunchRequest): EditorLaunchPlan {
	const editor = request.editor.trim().toLowerCase();
	if (!isEditorName(editor)) {
		return { ok: false, editor: request.editor, error: `Unsupported editor: ${request.editor}`, filePath: request.filePath };
	}

	const line = positiveInteger("line", request.line);
	if (!line.ok) return { ok: false, editor, error: line.error, filePath: request.filePath };

	const column = positiveInteger("column", request.column);
	if (!column.ok) return { ok: false, editor, error: column.error, filePath: request.filePath };
	if (column.value !== undefined && line.value === undefined) {
		return { ok: false, editor, error: "column requires line", filePath: request.filePath };
	}

	const config = EDITOR_CONFIG[editor];
	const platform = request.platform ?? process.platform;
	const needsJump = line.value !== undefined;
	const useCli = request.preferCli === true || needsJump || platform !== "darwin";

	if (useCli) {
		return {
			ok: true,
			editor,
			label: config.label,
			command: config.cli,
			args: needsJump ? ["-g", jumpTarget(request.filePath, line.value, column.value)] : [request.filePath],
			filePath: request.filePath,
		};
	}

	return {
		ok: true,
		editor,
		label: config.label,
		command: "open",
		args: ["-a", config.macApp, request.filePath],
		filePath: request.filePath,
	};
}

export async function launchFileInEditor(request: EditorLaunchRequest): Promise<EditorLaunchResult> {
	const plan = buildEditorLaunchCommand(request);
	if (!plan.ok) return plan;

	return new Promise<EditorLaunchResult>((resolve) => {
		let settled = false;
		const settle = (result: EditorLaunchResult) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};

		try {
			const child = spawn(plan.command, plan.args, { detached: true, stdio: "ignore" });
			const fallback = setTimeout(() => {
				child.unref();
				settle(plan);
			}, 250);
			fallback.unref?.();

			child.once("spawn", () => {
				clearTimeout(fallback);
				child.unref();
				settle(plan);
			});

			child.once("error", (err) => {
				clearTimeout(fallback);
				settle({ ...plan, ok: false, error: err.message });
			});
		} catch (err: any) {
			settle({ ...plan, ok: false, error: err?.message || `Failed to launch ${plan.label}` });
		}
	});
}
