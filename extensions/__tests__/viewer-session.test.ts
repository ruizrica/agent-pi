// ABOUTME: Test suite for viewer-session — singleton viewer tracking, registration, and cleanup.
// ABOUTME: Validates the shared viewer lifecycle manager used by 13+ viewer extensions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	clearActiveViewer,
	registerActiveViewer,
	getActiveViewer,
	closeActiveViewer,
	notifyViewerOpen,
	type ActiveViewerSession,
} from "../lib/viewer-session.ts";

// ── Helpers ────────────────────────────────────────────────────────────

function mockSession(kind = "file" as any, title = "Test Viewer"): ActiveViewerSession {
	return {
		kind,
		title,
		url: "http://localhost:3000",
		server: { close: vi.fn() } as any,
		onClose: vi.fn(),
	};
}

function mockCtx(hasUI = true) {
	return {
		hasUI,
		ui: { notify: vi.fn() },
	} as any;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("getActiveViewer / clearActiveViewer", () => {
	beforeEach(() => {
		clearActiveViewer(); // reset singleton state
	});

	it("returns null when no viewer is active", () => {
		expect(getActiveViewer()).toBeNull();
	});

	it("clears unconditionally when called with no argument", () => {
		registerActiveViewer(mockSession());
		expect(getActiveViewer()).not.toBeNull();
		clearActiveViewer();
		expect(getActiveViewer()).toBeNull();
	});

	it("clears only if session matches when called with argument", () => {
		const session = mockSession();
		registerActiveViewer(session);

		// Different session — should NOT clear
		clearActiveViewer(mockSession("plan", "Other"));
		expect(getActiveViewer()).toBe(session);

		// Same session — should clear
		clearActiveViewer(session);
		expect(getActiveViewer()).toBeNull();
	});
});

describe("registerActiveViewer", () => {
	beforeEach(() => {
		clearActiveViewer();
	});

	it("sets the active viewer", () => {
		const session = mockSession();
		registerActiveViewer(session);
		expect(getActiveViewer()).toBe(session);
	});

	it("closes previous viewer when registering a new one", () => {
		const first = mockSession("file", "First");
		const second = mockSession("plan", "Second");

		registerActiveViewer(first);
		registerActiveViewer(second);

		expect(first.server.close).toHaveBeenCalled();
		expect(first.onClose).toHaveBeenCalled();
		expect(getActiveViewer()).toBe(second);
	});

	it("does not close self when re-registering same session", () => {
		const session = mockSession();
		registerActiveViewer(session);
		registerActiveViewer(session);

		expect(session.server.close).not.toHaveBeenCalled();
		expect(session.onClose).not.toHaveBeenCalled();
	});

	it("handles server.close() throwing without crashing", () => {
		const first = mockSession();
		(first.server.close as any).mockImplementation(() => { throw new Error("already closed"); });

		const second = mockSession("plan", "Second");
		expect(() => registerActiveViewer(second)).not.toThrow();
	});
});

describe("closeActiveViewer", () => {
	beforeEach(() => {
		clearActiveViewer();
	});

	it("returns { closed: false } when no viewer is active", () => {
		const result = closeActiveViewer();
		expect(result).toEqual({ closed: false });
	});

	it("closes the active viewer and returns its info", () => {
		const session = mockSession("spec", "Spec Viewer");
		registerActiveViewer(session);

		const result = closeActiveViewer();
		expect(result).toEqual({ closed: true, kind: "spec", title: "Spec Viewer" });
		expect(session.server.close).toHaveBeenCalled();
		expect(session.onClose).toHaveBeenCalled();
		expect(getActiveViewer()).toBeNull();
	});

	it("handles onClose() throwing without crashing", () => {
		const session = mockSession();
		(session.onClose as any).mockImplementation(() => { throw new Error("callback error"); });
		registerActiveViewer(session);

		expect(() => closeActiveViewer()).not.toThrow();
		expect(getActiveViewer()).toBeNull();
	});
});

describe("notifyViewerOpen", () => {
	it("sends notification when hasUI is true", () => {
		const ctx = mockCtx(true);
		const session = mockSession("board", "Board Viewer");
		notifyViewerOpen(ctx, session);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Board Viewer opened at http://localhost:3000",
			"info",
		);
	});

	it("does nothing when hasUI is false", () => {
		const ctx = mockCtx(false);
		const session = mockSession();
		notifyViewerOpen(ctx, session);

		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});
});
