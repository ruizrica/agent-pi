import { describe, expect, it, vi, beforeEach } from "vitest";
import openFileExt from "../open-file.ts";
import { launchFileInEditor } from "../lib/editor-launcher.ts";

vi.mock("../lib/editor-launcher.ts", () => ({
	launchFileInEditor: vi.fn(),
}));

function createPiMock() {
	const tools: Record<string, any> = {};
	const commands: Record<string, any> = {};
	const handlers: Record<string, any> = {};
	return {
		registerTool(def: any) {
			tools[def.name] = def;
		},
		registerCommand(name: string, def: any) {
			commands[name] = def;
		},
		on(event: string, handler: any) {
			handlers[event] = handler;
		},
		getTool(name: string) {
			return tools[name];
		},
		getCommand(name: string) {
			return commands[name];
		},
		getHandler(name: string) {
			return handlers[name];
		},
	};
}

describe("open_file extension", () => {
	beforeEach(() => {
		vi.mocked(launchFileInEditor).mockReset();
	});

	it("registers a Cursor-first open_file tool and /open-file command", () => {
		const pi = createPiMock();
		openFileExt(pi as any);

		const tool = pi.getTool("open_file");
		expect(tool.label).toBe("Open File in Cursor");
		expect(tool.description).toContain("Default tool for ordinary requests");
		expect(tool.description).toContain("Cursor");
		expect(tool.description).toContain("Use show_file only");
		expect(pi.getCommand("open-file")).toBeTruthy();
		expect(pi.getHandler("session_start")).toBeTruthy();
	});

	it("refuses missing files before launching Cursor", async () => {
		const pi = createPiMock();
		openFileExt(pi as any);
		const tool = pi.getTool("open_file");

		const result = await tool.execute("1", { file_path: "/definitely/not/here.ts" });

		expect(result.content[0].text).toContain("File not found");
		expect(result.details.error).toBe("file_not_found");
		expect(launchFileInEditor).not.toHaveBeenCalled();
	});

	it("opens existing files in Cursor and returns structured details", async () => {
		const pi = createPiMock();
		openFileExt(pi as any);
		const tool = pi.getTool("open_file");
		const filePath = new URL("../file-viewer.ts", import.meta.url).pathname;

		vi.mocked(launchFileInEditor).mockResolvedValue({
			ok: true,
			editor: "cursor",
			label: "Cursor",
			command: "open",
			args: ["-a", "Cursor", filePath],
			filePath,
		});

		const result = await tool.execute("1", { file_path: filePath, line: 12, column: 4 });

		expect(launchFileInEditor).toHaveBeenCalledWith({
			editor: "cursor",
			filePath,
			line: 12,
			column: 4,
		});
		expect(result.content[0].text).toContain("Opened file-viewer.ts in Cursor.");
		expect(result.details.editor).toBe("cursor");
		expect(result.details.filePath).toBe(filePath);
		expect(result.details.command).toBe("open");
	});

	it("notifies command users with open results", async () => {
		const pi = createPiMock();
		openFileExt(pi as any);
		const command = pi.getCommand("open-file");
		const filePath = new URL("../file-viewer.ts", import.meta.url).pathname;
		const notify = vi.fn();

		vi.mocked(launchFileInEditor).mockResolvedValue({
			ok: true,
			editor: "cursor",
			label: "Cursor",
			command: "open",
			args: ["-a", "Cursor", filePath],
			filePath,
		});

		await command.handler(`${filePath}:8:2`, { ui: { notify } });

		expect(launchFileInEditor).toHaveBeenCalledWith({
			editor: "cursor",
			filePath,
			line: 8,
			column: 2,
		});
		expect(notify).toHaveBeenCalledWith("Opened file-viewer.ts in Cursor.", "success");
	});
});
