import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMessage = vi.fn();
const registerMessageRenderer = vi.fn();
const registerCommand = vi.fn();
const registerTool = vi.fn();
const on = vi.fn();

vi.mock("../lib/dream-state.js", () => {
	const readDreamState = vi.fn();
	const writeDreamState = vi.fn();
	const getHoursSinceLastDream = vi.fn();
	const formatNextDream = vi.fn(() => "Now (overdue)");
	const formatTimeSince = vi.fn(() => "2 days");
	const getDreamRoot = vi.fn(() => "/tmp/.pi/dream");

	return {
		DEFAULT_DREAM_STATE: {
			lastDream: null,
			intervalHours: 24,
			enabled: true,
			globalRoot: "/tmp/.pi/dream",
			lastScope: "global",
		},
		formatNextDream,
		formatTimeSince,
		getHoursSinceLastDream,
		getDreamRoot,
		readDreamState,
		writeDreamState,
	};
});

import dreamScheduler from "../dream-scheduler.ts";
import * as dreamState from "../lib/dream-state.js";

describe("dream-scheduler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(dreamState.readDreamState).mockReturnValue({
			lastDream: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
			intervalHours: 24,
			enabled: true,
			globalRoot: "/tmp/.pi/dream",
			lastScope: "global",
			lastSummary: {
				workspacesScanned: 2,
				sourcesConsolidated: 10,
				durableMemoriesPromoted: 3,
				supersededItems: 2,
				recommendationsGenerated: 4,
			},
		});
		vi.mocked(dreamState.getHoursSinceLastDream).mockReturnValue(48);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function setup() {
		dreamScheduler({
			sendMessage,
			registerMessageRenderer,
			registerCommand,
			registerTool,
			on,
		} as any);
		return {
			dreamStatusCommand: registerCommand.mock.calls.find((c) => c[0] === "dream-status")?.[1],
			dreamConfigCommand: registerCommand.mock.calls.find((c) => c[0] === "dream-config")?.[1],
			dreamStatusTool: registerTool.mock.calls.find((c) => c[0]?.name === "dream_status")?.[0],
			dreamRecordTool: registerTool.mock.calls.find((c) => c[0]?.name === "dream_record")?.[0],
			sessionStart: on.mock.calls.find((c) => c[0] === "session_start")?.[1],
		};
	}

	it("registers commands, tools, and renderers", () => {
		setup();
		expect(registerMessageRenderer).toHaveBeenCalledTimes(2);
		expect(registerCommand).toHaveBeenCalledWith("dream-status", expect.any(Object));
		expect(registerCommand).toHaveBeenCalledWith("dream-config", expect.any(Object));
		expect(registerTool).toHaveBeenCalledTimes(2);
		expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("sends a reminder on session start when dream state is stale", () => {
		vi.useFakeTimers();
		const { sessionStart } = setup();
		expect(sessionStart).toBeTypeOf("function");
		sessionStart();
		vi.runAllTimers();
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ customType: "dream-reminder" }));
	});

	it("does not send a reminder when disabled", () => {
		vi.useFakeTimers();
		vi.mocked(dreamState.readDreamState).mockReturnValueOnce({
			lastDream: new Date().toISOString(),
			intervalHours: 24,
			enabled: false,
			globalRoot: "/tmp/.pi/dream",
			lastScope: "global",
		});
		const { sessionStart } = setup();
		sessionStart();
		vi.runAllTimers();
		expect(sendMessage).not.toHaveBeenCalled();
	});

	it("dream-status command emits state details", async () => {
		const { dreamStatusCommand } = setup();
		await dreamStatusCommand.handler();
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "dream-status",
			details: expect.objectContaining({ isStale: true, hoursSince: 48 }),
		}));
	});

	it("dream-config disable updates state and notifies", async () => {
		const { dreamConfigCommand } = setup();
		await dreamConfigCommand.handler("disable");
		expect(dreamState.writeDreamState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: "Global dream reminders disabled." }));
	});

	it("dream-config enable updates state and notifies", async () => {
		const { dreamConfigCommand } = setup();
		await dreamConfigCommand.handler("enable");
		expect(dreamState.writeDreamState).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: "Global dream reminders enabled." }));
	});

	it("dream-config validates interval input", async () => {
		const { dreamConfigCommand } = setup();
		await dreamConfigCommand.handler("999");
		expect(dreamState.writeDreamState).not.toHaveBeenCalled();
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Usage: /dream-config") }));
	});

	it("dream-config stores a valid interval", async () => {
		const { dreamConfigCommand } = setup();
		await dreamConfigCommand.handler("72");
		expect(dreamState.writeDreamState).toHaveBeenCalledWith(expect.objectContaining({ intervalHours: 72 }));
		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: "Global dream reminder interval set to 72 hours." }));
	});

	it("dream_status tool returns global dream metadata", async () => {
		const { dreamStatusTool } = setup();
		const result = await dreamStatusTool.handler();
		expect(result).toEqual(expect.objectContaining({
			intervalHours: 24,
			enabled: true,
			globalRoot: "/tmp/.pi/dream",
			lastScope: "global",
			isStale: true,
			nextDream: "Now (overdue)",
		}));
	});

	it("dream_record tool writes updated state for global scope", async () => {
		const { dreamRecordTool } = setup();
		const result = await dreamRecordTool.handler({
			workspacesScanned: 3,
			sourcesConsolidated: 18,
			durableMemoriesPromoted: 6,
			supersededItems: 5,
			recommendationsGenerated: 4,
		});
		expect(dreamState.writeDreamState).toHaveBeenCalledWith(expect.objectContaining({
			lastScope: "global",
			lastSummary: expect.objectContaining({
				workspacesScanned: 3,
				sourcesConsolidated: 18,
				durableMemoriesPromoted: 6,
				supersededItems: 5,
				recommendationsGenerated: 4,
			}),
		}));
		expect(result).toEqual(expect.objectContaining({ recorded: true, globalRoot: "/tmp/.pi/dream" }));
	});

	it("dream_record tool stores workspace scope when provided", async () => {
		const { dreamRecordTool } = setup();
		await dreamRecordTool.handler({
			workspacesScanned: 1,
			sourcesConsolidated: 4,
			durableMemoriesPromoted: 2,
			supersededItems: 1,
			recommendationsGenerated: 2,
			scope: "workspace",
		});
		expect(dreamState.writeDreamState).toHaveBeenCalledWith(expect.objectContaining({ lastScope: "workspace" }));
	});
});
