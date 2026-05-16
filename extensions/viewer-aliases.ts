// ABOUTME: Slash-command aliases for viewer re-opens from the /reports browser.
// ABOUTME: Registers /show-plan, /show-spec, /show-report and forwards the
// ABOUTME: full args string (including --payload-id, --readonly, --mode flags)
// ABOUTME: to the underlying /plan, /spec, /report handlers, which now honor
// ABOUTME: those flags natively (Phase 3 completion).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

export default function (pi: ExtensionAPI) {
	function forwardTo(commandName: string, args: string, ctx: any): Promise<void> {
		const pi_ = pi as any;
		const handler = pi_.handlers?.[commandName] || pi_.commands?.get?.(commandName)?.handler;
		if (typeof handler === "function") {
			return Promise.resolve(handler(args, ctx));
		}
		ctx.ui.notify(`/${commandName} handler is not available — viewer alias cannot forward`, "error");
		return Promise.resolve();
	}

	pi.registerCommand("show-plan", {
		description: "Re-open a persisted plan/questions report from /reports. Accepts [file_path] [--readonly] [--payload-id ID] [--mode questions].",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-plan requires interactive mode", "error");
				return;
			}
			await forwardTo("plan", args, ctx);
		},
	});

	pi.registerCommand("show-spec", {
		description: "Re-open a persisted spec report from /reports. Accepts [folder_path] [--readonly] [--payload-id ID].",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-spec requires interactive mode", "error");
				return;
			}
			await forwardTo("spec", args, ctx);
		},
	});

	pi.registerCommand("show-report", {
		description: "Re-open a persisted completion report from /reports. Requires --payload-id ID; accepts --readonly.",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-report requires interactive mode", "error");
				return;
			}
			if (!/--payload-id\s+\S+/.test(args)) {
				ctx.ui.notify("/show-report requires --payload-id <id>", "error");
				return;
			}
			await forwardTo("report", args, ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
