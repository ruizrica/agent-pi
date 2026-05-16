// ABOUTME: Slash-command aliases for viewer re-opens from the reports browser.
// ABOUTME: Registers /show-plan, /show-spec, /show-report as entry points
// ABOUTME: that parse optional --readonly and --payload-id flags.
// ABOUTME: These are placeholder implementations; full functionality requires
// ABOUTME: Phase 3 (adding readonly/payload_id params to the viewer tools).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("show-plan", {
		description: "Open the plan viewer (alias supporting future snapshot mode)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-plan requires interactive mode", "error");
				return;
			}

			// Parse args: [file_path] [--readonly] [--payload-id ID] [--mode MODE]
			const parts = args.trim().split(/\s+/);
			let filePath = "";
			let mode = "";

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part === "--readonly" || (part === "--payload-id" && i + 1 < parts.length)) {
					if (part === "--payload-id") i++; // skip ID
					// Note: flags parsed but not yet used (Phase 3 support needed)
				} else if (part === "--mode" && i + 1 < parts.length) {
					mode = parts[++i];
				} else if (!part.startsWith("--")) {
					filePath = part;
				}
			}

			if (!filePath) {
				ctx.ui.notify("/show-plan requires a file path argument", "error");
				return;
			}

			// For now, just forward to /plan without readonly/payload_id
			// Phase 3 will extend tools to accept those params, then this handler can use them
			try {
				const finalArgs = mode ? `${filePath} --mode ${mode}` : filePath;
				// Access the /plan command which is registered in plan-viewer.ts
				const pi_ = pi as any;
				if (pi_.handlers?.plan) {
					await pi_.handlers.plan(finalArgs, ctx);
				} else {
					// If no direct handler access, just notify that the feature is pending Phase 3
					ctx.ui.notify(
						"/show-plan snapshot mode requires Phase 3 implementation (tool param support)",
						"info"
					);
				}
			} catch (err: any) {
				ctx.ui.notify(`show_plan failed: ${err?.message || "unknown error"}`, "error");
			}
		},
	});

	pi.registerCommand("show-spec", {
		description: "Open the spec viewer (alias supporting future snapshot mode)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-spec requires interactive mode", "error");
				return;
			}

			// Parse args: [folder_path] [--readonly] [--payload-id ID]
			const parts = args.trim().split(/\s+/);
			let folderPath = "";

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part === "--readonly" || (part === "--payload-id" && i + 1 < parts.length)) {
					if (part === "--payload-id") i++; // skip ID
					// Note: flags parsed but not yet used (Phase 3 support needed)
				} else if (!part.startsWith("--")) {
					folderPath = part;
				}
			}

			if (!folderPath) {
				ctx.ui.notify("/show-spec requires a folder path argument", "error");
				return;
			}

			// For now, just forward to /spec without readonly/payload_id
			// Phase 3 will extend tools to accept those params, then this handler can use them
			try {
				const pi_ = pi as any;
				if (pi_.handlers?.spec) {
					await pi_.handlers.spec(folderPath, ctx);
				} else {
					ctx.ui.notify(
						"/show-spec snapshot mode requires Phase 3 implementation (tool param support)",
						"info"
					);
				}
			} catch (err: any) {
				ctx.ui.notify(`show_spec failed: ${err?.message || "unknown error"}`, "error");
			}
		},
	});

	pi.registerCommand("show-report", {
		description: "Open the completion report viewer (alias supporting future snapshot mode)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-report requires interactive mode", "error");
				return;
			}

			// Parse args: [--readonly] [--payload-id ID]
			const parts = args.trim().split(/\s+/);
			let payloadId: string | undefined;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part === "--readonly") {
					// Note: flag parsed but not yet used (Phase 3 support needed)
				} else if (part === "--payload-id" && i + 1 < parts.length) {
					payloadId = parts[++i];
				}
			}

			if (!payloadId) {
				ctx.ui.notify("/show-report requires --payload-id argument", "error");
				return;
			}

			// For now, just forward to /report without readonly/payload_id
			// Phase 3 will extend tools to accept those params, then this handler can use them
			try {
				const pi_ = pi as any;
				if (pi_.handlers?.report) {
					await pi_.handlers.report("", ctx);
				} else {
					ctx.ui.notify(
						"/show-report snapshot mode requires Phase 3 implementation (tool param support)",
						"info"
					);
				}
			} catch (err: any) {
				ctx.ui.notify(`show_report failed: ${err?.message || "unknown error"}`, "error");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
