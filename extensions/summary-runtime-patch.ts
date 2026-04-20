// ABOUTME: Startup runtime patch for Pi interactive mode to support true summary-only rendering.
// ABOUTME: Suppresses transcript/tool rendering while summary mode is active and restores chat on exit.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const g = globalThis as any;

async function resolveInteractiveModeCtor(): Promise<any> {
	const candidates: string[] = [
		fileURLToPath(new URL("../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js", import.meta.url)),
		join(process.cwd(), "node_modules", "@mariozechner", "pi-coding-agent", "dist", "modes", "interactive", "interactive-mode.js"),
		"/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js",
		"/usr/local/lib/node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js",
	];
	const errors: string[] = [];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			const mod = await import(pathToFileURL(candidate).href);
			if (mod?.InteractiveMode) return mod.InteractiveMode;
			errors.push(`${candidate} (loaded, but InteractiveMode export missing)`);
		} catch (err: any) {
			errors.push(`${candidate} (${err?.message || String(err)})`);
		}
	}
	throw new Error(`Could not resolve Pi interactive-mode.js runtime for summary patching. Tried: ${errors.join("; ") || "no existing candidates"}`);
}

async function installSummaryRuntimePatch() {
	if (g.__piSummaryRuntimePatchInstalled) return;
	if (g.__piSummaryRuntimePatchInstalling) return g.__piSummaryRuntimePatchInstalling;
	g.__piSummaryRuntimePatchInstalling = (async () => {
		const InteractiveMode = await resolveInteractiveModeCtor();
		if (g.__piSummaryRuntimePatchInstalled) return;
		g.__piSummaryRuntimePatchInstalled = true;

		const proto = InteractiveMode.prototype as any;
		const originalHandleEvent = proto.handleEvent;
		const originalSetExtensionWidget = proto.setExtensionWidget;

		function syncInteractiveMode(instance: any) {
			g.__piSummaryInteractiveMode = instance;
			g.__piApplySummaryTranscriptMode = (active: boolean) => {
				if (!instance?.ui || !instance?.chatContainer) return;
				if (active) {
					if (instance.__piSummaryTranscriptHidden) return;
					instance.__piSummaryTranscriptHidden = true;
					try {
						instance.chatContainer.clear();
						instance.pendingMessagesContainer?.clear?.();
						if (instance.streamingComponent) {
							try { instance.chatContainer.removeChild(instance.streamingComponent); } catch {}
							instance.streamingComponent = undefined;
							instance.streamingMessage = undefined;
						}
						instance.pendingTools?.clear?.();
						instance.ui.requestRender?.();
					} catch {}
					return;
				}
				if (!instance.__piSummaryTranscriptHidden) return;
				instance.__piSummaryTranscriptHidden = false;
				try {
					instance.chatContainer.clear();
					instance.rebuildChatFromMessages?.();
					instance.updatePendingMessagesDisplay?.();
					instance.ui.requestRender?.();
				} catch {}
			};
		}

		proto.setExtensionWidget = function patchedSetExtensionWidget(key: string, content: any, options: any) {
			syncInteractiveMode(this);
			const result = originalSetExtensionWidget.call(this, key, content, options);
			if (key === "summary-mode") {
				const apply = g.__piApplySummaryTranscriptMode;
				if (typeof apply === "function") apply(content !== undefined);
			}
			return result;
		};

		proto.handleEvent = async function patchedHandleEvent(event: any) {
			syncInteractiveMode(this);
			if (!this.isInitialized) {
				await this.init();
			}
			const summaryOnly = !!g.__piSummaryModeActive;
			if (!summaryOnly) {
				return await originalHandleEvent.call(this, event);
			}
			this.footer?.invalidate?.();
			switch (event?.type) {
				case "message_start":
					if (event.message?.role === "user") {
						this.updatePendingMessagesDisplay?.();
						this.ui?.requestRender?.();
					}
					return;
				case "message_update":
					return;
				case "message_end":
					if (this.streamingComponent) {
						try { this.chatContainer?.removeChild?.(this.streamingComponent); } catch {}
						this.streamingComponent = undefined;
						this.streamingMessage = undefined;
					}
					this.pendingTools?.clear?.();
					this.ui?.requestRender?.();
					return;
				case "tool_execution_start":
					return;
				case "tool_execution_update":
					return;
				case "tool_execution_end":
					this.pendingTools?.delete?.(event.toolCallId);
					return;
				default:
					return await originalHandleEvent.call(this, event);
			}
		};
	})();
	return g.__piSummaryRuntimePatchInstalling;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		try {
			await installSummaryRuntimePatch();
		} catch (err: any) {
			ctx.ui?.notify?.(`Summary runtime patch failed: ${err?.message || String(err)}`, "warning");
		}
	});
}
