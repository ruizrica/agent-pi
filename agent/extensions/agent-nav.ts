// ABOUTME: Shared F-key navigation for agent widgets (chain, team)
// ABOUTME: Dispatches F1-F4 to the first active NavProvider on globalThis

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	function getActiveProvider() {
		const providers = (globalThis as any).__piNavProviders || [];
		return providers.find((p: any) => p.isActive());
	}

	pi.registerShortcut("f1", {
		description: "Select previous item",
		handler: async (ctx) => { getActiveProvider()?.selectPrev(ctx); },
	});
	pi.registerShortcut("f2", {
		description: "Select next item",
		handler: async (ctx) => { getActiveProvider()?.selectNext(ctx); },
	});
	pi.registerShortcut("f3", {
		description: "Open detail view",
		handler: async (ctx) => { await getActiveProvider()?.showDetail(ctx); },
	});
	pi.registerShortcut("f4", {
		description: "Exit selection",
		handler: async (ctx) => { getActiveProvider()?.exitSelection(ctx); },
	});
}
