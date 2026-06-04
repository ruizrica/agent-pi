// ABOUTME: Public catalog for the QA Reco pre-release automation sections.
// ABOUTME: Keeps setup UI, runner manifests, and report grouping aligned as checks grow.

export type QARecoSectionId = "basic-feed" | "scrolling" | "liking" | "commenting";
export type QARecoPriority = "P1";
export type QARecoRisk = "low" | "medium";

export interface QARecoCheckDefinition {
	id: string;
	name: string;
	description: string;
	requiredEvidence: string[];
	defaultEnabled: boolean;
}

export interface QARecoPrereleaseSection {
	id: QARecoSectionId;
	name: string;
	description: string;
	priority: QARecoPriority;
	risk: QARecoRisk;
	defaultEnabled: boolean;
	acceptanceCriteria: string[];
	checks: QARecoCheckDefinition[];
}

export const QA_RECO_PRERELEASE_SECTIONS: readonly QARecoPrereleaseSection[] = [
	{
		id: "basic-feed",
		name: "Basic Feed",
		description: "Proves the app can launch, navigate to the Reco feed, load data, and show the current card without visible error overlays.",
		priority: "P1",
		risk: "low",
		defaultEnabled: true,
		acceptanceCriteria: [
			"Reco app is foregrounded on the target platform.",
			"Feed route is reachable and exposes a current item summary.",
			"At least one screenshot/snapshot captures the visible card and no redbox/error overlay.",
		],
		checks: [
			{ id: "basic-feed.app-foreground", name: "App foreground", description: "Launch or verify the Reco app is foregrounded before feed checks begin.", requiredEvidence: ["foreground-state", "startup-log"], defaultEnabled: true },
			{ id: "basic-feed.navigate-feed", name: "Navigate feed", description: "Navigate to the Explore/Recs feed through configured QA helpers.", requiredEvidence: ["route-state", "navigation-log"], defaultEnabled: true },
			{ id: "basic-feed.feed-data-ready", name: "Feed data ready", description: "Assert dev-gated feed state exists and contains at least one item.", requiredEvidence: ["__qaFeedState.dataLength", "current-item-id"], defaultEnabled: true },
			{ id: "basic-feed.first-card-visible", name: "First card visible", description: "Capture visible-card evidence for the current item.", requiredEvidence: ["screenshot", "current-card-summary"], defaultEnabled: true },
			{ id: "basic-feed.no-error-overlay", name: "No error overlay", description: "Verify no React Native redbox or blocking error overlay is visible.", requiredEvidence: ["snapshot", "error-overlay-check"], defaultEnabled: true },
			{ id: "basic-feed.media-evidence", name: "Media evidence", description: "Capture current-card/media evidence when media content is present.", requiredEvidence: ["screenshot"], defaultEnabled: true },
		],
	},
	{
		id: "scrolling",
		name: "Scrolling",
		description: "Proves feed advancement, fallback gestures, backward navigation, and foreground stability across several cards.",
		priority: "P1",
		risk: "medium",
		defaultEnabled: true,
		acceptanceCriteria: [
			"Current feed index changes across forward scroll checks.",
			"Gesture fallback is reported separately when CDP/dev hooks are unavailable.",
			"App remains foregrounded and free of visible error overlays after a 3-5 card sequence.",
		],
		checks: [
			{ id: "scrolling.cdp-next", name: "CDP next", description: "Advance one item through __qaFeedState.scrollToNext or equivalent CDP helper.", requiredEvidence: ["before-index", "after-index"], defaultEnabled: true },
			{ id: "scrolling.gesture-fallback", name: "Gesture fallback", description: "Use device swipe fallback if CDP feed hooks are unavailable.", requiredEvidence: ["gesture-log", "index-or-snapshot-change"], defaultEnabled: true },
			{ id: "scrolling.index-progression", name: "Index progression", description: "Prove the current index progresses across multiple scrolls.", requiredEvidence: ["index-sequence"], defaultEnabled: true },
			{ id: "scrolling.stress-5-items", name: "3-5 item stress", description: "Scroll through several cards with screenshots and no visible crash/error state.", requiredEvidence: ["screenshots", "stability-log"], defaultEnabled: true },
			{ id: "scrolling.scroll-back", name: "Scroll back", description: "Return to an earlier item through scrollToIndex or fallback gesture.", requiredEvidence: ["target-index", "returned-index"], defaultEnabled: true },
			{ id: "scrolling.foreground-stability", name: "Foreground stability", description: "Assert app remains foregrounded after the scrolling sequence.", requiredEvidence: ["foreground-state"], defaultEnabled: true },
		],
	},
	{
		id: "liking",
		name: "Liking",
		description: "Proves the action rail can toggle liked state, update count/state evidence, persist when possible, and clean up test-account pollution.",
		priority: "P1",
		risk: "medium",
		defaultEnabled: true,
		acceptanceCriteria: [
			"Like selector is discoverable through testID/accessibility snapshot.",
			"Like state and/or count changes after the action.",
			"Flow attempts cleanup back to the initial state or reports a blocked cleanup reason.",
		],
		checks: [
			{ id: "liking.initial-state", name: "Initial state", description: "Record active item ID, isLiked, and likesCount before tapping.", requiredEvidence: ["item-id", "isLiked", "likesCount"], defaultEnabled: true },
			{ id: "liking.action-rail-tap", name: "Action rail tap", description: "Tap feed-action-like through selector lookup.", requiredEvidence: ["selector-ref", "tap-log", "screenshot"], defaultEnabled: true },
			{ id: "liking.count-toggle", name: "Count/state toggle", description: "Assert liked state toggles and count changes by the expected direction when available.", requiredEvidence: ["before-state", "after-state"], defaultEnabled: true },
			{ id: "liking.double-tap-optional", name: "Double-tap optional", description: "Attempt or explicitly skip the double-tap like gesture with a reason.", requiredEvidence: ["gesture-result-or-skip-reason"], defaultEnabled: true },
			{ id: "liking.scroll-persistence", name: "Scroll persistence", description: "Scroll away/back and verify liked state for the same item when backend/auth supports it.", requiredEvidence: ["same-item-id", "state-after-return"], defaultEnabled: true },
			{ id: "liking.cleanup", name: "Cleanup", description: "Toggle back to the initial state when possible to avoid test-account pollution.", requiredEvidence: ["cleanup-result"], defaultEnabled: true },
		],
	},
	{
		id: "commenting",
		name: "Commenting",
		description: "Proves the comments sheet opens, validates empty send behavior, submits a unique QA comment, and records count/list evidence.",
		priority: "P1",
		risk: "medium",
		defaultEnabled: true,
		acceptanceCriteria: [
			"Comment selector opens the comments sheet.",
			"Empty send is disabled or safely blocked before typing.",
			"A unique QA comment is submitted or backend/auth blockers are reported accurately.",
		],
		checks: [
			{ id: "commenting.initial-state", name: "Initial state", description: "Record active item ID and commentCount before opening the sheet.", requiredEvidence: ["item-id", "commentCount"], defaultEnabled: true },
			{ id: "commenting.open-sheet", name: "Open sheet", description: "Tap feed-action-comment and wait for comments-sheet.", requiredEvidence: ["selector-ref", "sheet-snapshot"], defaultEnabled: true },
			{ id: "commenting.empty-send-disabled", name: "Empty send disabled", description: "Verify send remains disabled or blocked before typing.", requiredEvidence: ["send-button-state"], defaultEnabled: true },
			{ id: "commenting.type-unique-comment", name: "Type unique comment", description: "Type a unique QA comment into comments-input.", requiredEvidence: ["input-state", "unique-comment-id"], defaultEnabled: true },
			{ id: "commenting.submit", name: "Submit", description: "Tap comments-send and wait for state/list evidence or backend blocker.", requiredEvidence: ["submit-result"], defaultEnabled: true },
			{ id: "commenting.count-or-list-evidence", name: "Count/list evidence", description: "Verify count increments or the unique comment appears in list/snapshot evidence.", requiredEvidence: ["after-count-or-list-snapshot"], defaultEnabled: true },
			{ id: "commenting.close-reopen-optional", name: "Close/reopen optional", description: "Close and reopen the sheet to verify persistence if auth/backend supports it.", requiredEvidence: ["persistence-result-or-skip-reason"], defaultEnabled: true },
		],
	},
] as const;

const LEGACY_SECTION_ALIASES: Record<string, QARecoSectionId> = {
	smoke: "basic-feed",
	navigation: "basic-feed",
	explore: "scrolling",
	home: "basic-feed",
	feed: "basic-feed",
	like: "liking",
	likes: "liking",
	comment: "commenting",
	comments: "commenting",
};

export function normalizeQARecoSectionIds(ids: readonly string[] | undefined): QARecoSectionId[] {
	const all = QA_RECO_PRERELEASE_SECTIONS.map((section) => section.id);
	if (!ids || ids.length === 0) return [...all];

	const normalized: QARecoSectionId[] = [];
	for (const rawId of ids) {
		const lowerId = String(rawId).trim().toLowerCase();
		const id = (all as readonly string[]).includes(lowerId)
			? lowerId as QARecoSectionId
			: LEGACY_SECTION_ALIASES[lowerId];
		if (id && !normalized.includes(id)) normalized.push(id);
	}
	return normalized.length > 0 ? normalized : [...all];
}

export function getQARecoSectionLabel(id: string): string {
	return QA_RECO_PRERELEASE_SECTIONS.find((section) => section.id === id)?.name ?? id;
}
