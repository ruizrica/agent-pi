import { describe, expect, it } from "vitest";
import { buildEditorLaunchCommand } from "../lib/editor-launcher.ts";

describe("editor-launcher", () => {
	it("builds Cursor CLI arguments for non-macOS file opens", () => {
		const plan = buildEditorLaunchCommand({
			editor: "cursor",
			filePath: "/tmp/example.ts",
			platform: "linux",
		});

		expect(plan).toMatchObject({
			ok: true,
			editor: "cursor",
			label: "Cursor",
			command: "cursor",
			args: ["/tmp/example.ts"],
		});
	});

	it("uses the macOS Cursor app fallback for plain file opens", () => {
		const plan = buildEditorLaunchCommand({
			editor: "cursor",
			filePath: "/tmp/example.ts",
			platform: "darwin",
		});

		expect(plan).toMatchObject({
			ok: true,
			command: "open",
			args: ["-a", "Cursor", "/tmp/example.ts"],
		});
	});

	it("uses Cursor CLI goto formatting when line and column are provided", () => {
		const plan = buildEditorLaunchCommand({
			editor: "cursor",
			filePath: "/tmp/example.ts",
			line: 42,
			column: 7,
			platform: "darwin",
		});

		expect(plan).toMatchObject({
			ok: true,
			command: "cursor",
			args: ["-g", "/tmp/example.ts:42:7"],
		});
	});

	it("refuses unsupported editor names", () => {
		const plan = buildEditorLaunchCommand({
			editor: "vim",
			filePath: "/tmp/example.ts",
			platform: "linux",
		});

		expect(plan.ok).toBe(false);
		if (!plan.ok) {
			expect(plan.error).toContain("Unsupported editor: vim");
		}
	});

	it("requires line before column", () => {
		const plan = buildEditorLaunchCommand({
			editor: "cursor",
			filePath: "/tmp/example.ts",
			column: 3,
			platform: "linux",
		});

		expect(plan.ok).toBe(false);
		if (!plan.ok) {
			expect(plan.error).toBe("column requires line");
		}
	});
});
