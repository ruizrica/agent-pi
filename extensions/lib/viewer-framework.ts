// ABOUTME: Deep viewer framework module — accepts a viewer spec and hides server lifecycle,
// ABOUTME: session bridging, snapshot/restore, scrollbar styling, and standalone export wiring.
// ABOUTME: New viewers can be launched with ~100 lines of domain content instead of ~1500 lines
// ABOUTME: of duplicated infrastructure.

import type { Server, IncomingMessage, ServerResponse } from "node:http";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createViewerServer, openBrowser, type ViewerRoute, type ViewerServerHandle, type ViewerRoundTripState } from "./viewer-server.ts";
import { registerActiveViewer, clearActiveViewer, closeActiveViewer, notifyViewerOpen, type ActiveViewerKind, type ActiveViewerSession } from "./viewer-session.ts";

// ─────────────────────────────────────────────────────────────────────
// Viewer Spec Interface
// ─────────────────────────────────────────────────────────────────────

/**
 * A viewer spec defines the domain-specific parts of a viewer.
 * The framework handles all infrastructure (server, session, browser open, cleanup).
 *
 * Usage:
 *   const result = await launchViewer({
 *     kind: "plan",
 *     title: "My Plan",
 *     ctx,
 *     getHtml: (port) => generatePlanViewerHTML({ port, ... }),
 *     onResult: (body) => { ... },
 *   });
 *   // result.url — the viewer URL
 *   // result.waitForResult() — promise that resolves when the viewer submits
 *   // result.close() — shut down the server
 */
export interface ViewerSpec {
	/** Viewer kind for session tracking (plan, spec, report, etc.) */
	kind: ActiveViewerKind;
	/** Display title for notifications and session tracking */
	title: string;
	/** Extension context (for UI notifications) */
	ctx: ExtensionContext;
	/** Function that generates the HTML, called with the allocated port */
	getHtml: (port: number) => string;
	/** Additional custom routes beyond the standard ones */
	routes?: ViewerRoute[];
	/** Called once when the first POST /result is received */
	onResult?: (body: any) => void;
	/** Called for every POST /result, including repeated submissions */
	onEveryResult?: (body: any) => void;
	/** Round-trip state provider for live refresh viewers */
	getRoundTripState?: () => ViewerRoundTripState;
	/** Called when POST /feedback is received for live refresh viewers */
	onFeedback?: (body: any) => void | Promise<void>;
	/** Fallback handler for requests not matched by exact routes */
	fallbackHandler?: (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;
	/** Listen on 0.0.0.0 instead of 127.0.0.1 (for LAN-accessible servers like web-chat) */
	listenAll?: boolean;
	/** If true, don't automatically open the browser */
	headless?: boolean;
	/** Optional callback when server is ready (receives URL) */
	onReady?: (url: string) => void;
}

export interface LaunchedViewer {
	/** The URL the viewer is served at */
	url: string;
	/** The server port */
	port: number;
	/** The underlying server handle */
	handle: ViewerServerHandle;
	/** Promise that resolves with the result body when the viewer submits */
	waitForResult: () => Promise<any>;
	/** Promise that resolves with feedback data */
	waitForFeedback: () => Promise<any>;
	/** Close the server and clean up the active viewer session */
	close: () => void;
	/** The active viewer session (for external reference) */
	session: ActiveViewerSession;
}

// ─────────────────────────────────────────────────────────────────────
// Core Framework Function
// ─────────────────────────────────────────────────────────────────────

/**
 * Launch a viewer with full infrastructure wiring.
 *
 * This is the single entrypoint that replaces the repeated pattern of:
 * 1. createViewerServer(config)
 * 2. openBrowser(url)
 * 3. registerActiveViewer(session)
 * 4. notifyViewerOpen(ctx, session)
 *
 * The caller only needs to provide the domain-specific spec:
 * - kind, title, ctx (identity)
 * - getHtml (domain content)
 * - onResult, routes, etc. (domain behavior)
 */
export async function launchViewer(spec: ViewerSpec): Promise<LaunchedViewer> {
	const handle = await createViewerServer({
		getHtml: spec.getHtml,
		routes: spec.routes,
		onResult: spec.onResult,
		onEveryResult: spec.onEveryResult,
		getRoundTripState: spec.getRoundTripState,
		onFeedback: spec.onFeedback,
		fallbackHandler: spec.fallbackHandler,
		listenAll: spec.listenAll,
	});

	const url = `http://127.0.0.1:${handle.port}`;

	const session: ActiveViewerSession = {
		kind: spec.kind,
		title: spec.title,
		url,
		server: handle.server,
		onClose: () => {
			clearActiveViewer(session);
		},
	};

	registerActiveViewer(session);
	notifyViewerOpen(spec.ctx, session);

	if (!spec.headless) {
		openBrowser(url);
	}

	spec.onReady?.(url);

	const close = () => {
		try {
			handle.server.close();
		} catch {}
		clearActiveViewer(session);
	};

	return {
		url,
		port: handle.port,
		handle,
		waitForResult: handle.waitForResult,
		waitForFeedback: handle.waitForFeedback,
		close,
		session,
	};
}

// ─────────────────────────────────────────────────────────────────────
// Convenience: Launch a simple one-shot viewer
// ─────────────────────────────────────────────────────────────────────

/**
 * Launch a simple one-shot viewer that waits for a single result.
 * Convenience wrapper around launchViewer for the most common pattern.
 *
 * Returns the result body from the viewer, or undefined if the server closed.
 */
export async function launchOneShotViewer(
	spec: Omit<ViewerSpec, "onResult"> & { onResult?: (body: any) => void },
): Promise<{ result: any; viewer: LaunchedViewer }> {
	let resolveResult: (value: any) => void;
	const resultPromise = new Promise<any>((resolve) => {
		resolveResult = resolve;
	});

	const viewer = await launchViewer({
		...spec,
		onResult: (body: any) => {
			spec.onResult?.(body);
			resolveResult(body);
		},
	});

	const result = await viewer.waitForResult();
	return { result, viewer };
}

// ─────────────────────────────────────────────────────────────────────
// Re-exports for backward compatibility
// ─────────────────────────────────────────────────────────────────────
// Consumers that previously imported from viewer-server.ts or viewer-session.ts
// can now import from this single module instead.

export {
	createViewerServer,
	openBrowser,
	type ViewerRoute,
	type ViewerServerConfig,
	type ViewerServerHandle,
	type ViewerRoundTripState,
} from "./viewer-server.ts";

export {
	registerActiveViewer,
	clearActiveViewer,
	closeActiveViewer,
	getActiveViewer,
	notifyViewerOpen,
	type ActiveViewerKind,
	type ActiveViewerSession,
} from "./viewer-session.ts";

export {
	VIEWER_SCROLLBAR_STYLES,
} from "./viewer-scrollbar-styles.ts";
