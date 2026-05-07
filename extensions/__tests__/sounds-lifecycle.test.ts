// ABOUTME: Regression tests for /sounds lifecycle hook playback.
// ABOUTME: Ensures configured user sounds are not suppressed for Claude agent start/end contexts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig, mockIsSoundInstalled, mockPlayInstalledSound } = vi.hoisted(() => ({
	mockLoadConfig: vi.fn(),
	mockIsSoundInstalled: vi.fn(),
	mockPlayInstalledSound: vi.fn(),
}));

vi.mock("../lib/viewer-server.ts", () => ({
	openBrowser: vi.fn(),
}));

vi.mock("../lib/output-box.ts", () => ({
	outputLine: vi.fn((_theme, _tone, text) => text),
}));

vi.mock("../lib/themeMap.ts", () => ({
	applyExtensionDefaults: vi.fn(),
}));

vi.mock("../lib/sounds/sounds-viewer-html.ts", () => ({
	generateSoundsViewerHTML: vi.fn(() => "<html></html>"),
}));

vi.mock("../lib/sounds/sounds-image-cache.ts", () => ({
	ensureCachedImage: vi.fn(),
	readCachedImageEntry: vi.fn(),
}));

vi.mock("../lib/viewer-session.ts", () => ({
	registerActiveViewer: vi.fn(),
	clearActiveViewer: vi.fn(),
	notifyViewerOpen: vi.fn(),
}));

vi.mock("../lib/sounds/sounds-config.ts", () => ({
	ALL_HOOKS: ["agent_end", "agent_start", "tool_execution_start", "tool_execution_end", "turn_start", "turn_end", "session_start", "session_compact"],
	HOOK_DISPLAY_NAMES: {
		agent_end: "Task Complete",
		agent_start: "Agent Starting",
		tool_execution_start: "Tool Called",
		tool_execution_end: "Tool Finished",
		turn_start: "Turn Start",
		turn_end: "Turn End",
		session_start: "Session Boot",
		session_compact: "Context Compacted",
	},
	loadConfig: mockLoadConfig,
	saveConfig: vi.fn(),
	getActiveAssignmentCount: vi.fn((config) => Object.keys(config.assignments || {}).length),
	getAssignedSoundNames: vi.fn(),
}));

vi.mock("../lib/sounds/sounds-player.ts", () => ({
	playInstalledSound: mockPlayInstalledSound,
	installSound: vi.fn(),
	uninstallSound: vi.fn(),
	isSoundInstalled: mockIsSoundInstalled,
	installSoundFromUrl: vi.fn(),
	cleanupAllPlayback: vi.fn(),
}));

function createMockPi() {
	const events: Record<string, Function> = {};
	return {
		registerCommand: vi.fn(),
		registerTool: vi.fn(),
		on: vi.fn((event: string, handler: Function) => { events[event] = handler; }),
		_events: events,
	};
}

function createCtx(model = { provider: "anthropic", id: "claude-sonnet-4-6" }) {
	return {
		hasUI: true,
		model,
		ui: {
			setStatus: vi.fn(),
			notify: vi.fn(),
		},
	};
}

describe("sounds lifecycle playback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadConfig.mockReturnValue({
			assignments: {
				agent_start: "custom:agent-starting",
				agent_end: "custom:soft-chord",
				turn_start: "custom:turn-start",
			},
			volume: 0.4,
			enabled: true,
			customSounds: [],
		});
		mockIsSoundInstalled.mockReturnValue(true);
		mockPlayInstalledSound.mockResolvedValue(true);
	});

	it("plays assigned agent_start sounds for Claude model contexts", async () => {
		const pi = createMockPi();
		const mod = await import("../sounds.ts");
		mod.default(pi as any);

		await pi._events.agent_start({}, createCtx());

		expect(mockPlayInstalledSound).toHaveBeenCalledWith("custom:agent-starting", 0.4);
	});

	it("plays assigned agent_end sounds for Claude model contexts", async () => {
		const pi = createMockPi();
		const mod = await import("../sounds.ts");
		mod.default(pi as any);

		await pi._events.agent_end({}, createCtx());

		expect(mockPlayInstalledSound).toHaveBeenCalledWith("custom:soft-chord", 0.4);
	});

	it("still suppresses duplicate turn/session sounds for Claude model contexts", async () => {
		const pi = createMockPi();
		const mod = await import("../sounds.ts");
		mod.default(pi as any);

		await pi._events.turn_start({}, createCtx());

		expect(mockPlayInstalledSound).not.toHaveBeenCalled();
	});
});
