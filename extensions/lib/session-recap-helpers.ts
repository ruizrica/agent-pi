// ABOUTME: Pure helper functions for the session-recap extension.
// ABOUTME: Handles exchange extraction, intelligent categorization, recap formatting, and dual storage.
// ABOUTME: No pi framework dependencies — designed for testability and reuse.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

// ── Constants ────────────────────────────────────────────────────────

export const RECAPS_DIR = ".context/recaps";
export const RECAP_INDEX_FILE = ".context/recaps/index.json";
export const SESSION_STORY_FILE = ".context/recaps/session-story.md";
export const DEFAULT_RECAP_INTERVAL = 5;

// ── Work Categories ──────────────────────────────────────────────────
// The system auto-detects what kind of work is happening and uses it
// to organize recaps both locally and in Obsidian.

export type WorkCategory =
	| "coding"        // writing/editing code, implementations
	| "debugging"     // fixing bugs, tracing errors
	| "research"      // reading docs, exploring codebases, searching
	| "planning"      // creating plans, specs, architecture
	| "review"        // code review, auditing, verification
	| "config"        // configuration, setup, environment
	| "conversation"  // general discussion, Q&A, brainstorming
	| "mixed";        // multiple categories in one block

const CATEGORY_SIGNALS: Record<Exclude<WorkCategory, "mixed">, {
	tools: string[];
	keywords: RegExp[];
}> = {
	coding: {
		tools: ["write", "Write", "edit", "Edit"],
		keywords: [/implement/i, /create.*file/i, /build/i, /add.*function/i, /refactor/i, /new.*component/i],
	},
	debugging: {
		tools: ["Bash"],
		keywords: [/fix/i, /bug/i, /error/i, /debug/i, /broken/i, /failing/i, /crash/i, /issue/i, /trace/i],
	},
	research: {
		tools: ["read", "Read", "Bash", "web_remote", "obsidian_memory"],
		keywords: [/find/i, /search/i, /look.*at/i, /explore/i, /check/i, /what.*is/i, /how.*does/i, /investigate/i],
	},
	planning: {
		tools: ["show_plan", "tasks", "commander_task", "commander_spec"],
		keywords: [/plan/i, /spec/i, /design/i, /architect/i, /strategy/i, /approach/i, /phase/i],
	},
	review: {
		tools: ["read", "Read"],
		keywords: [/review/i, /audit/i, /verify/i, /check.*for/i, /validate/i, /test/i, /inspect/i],
	},
	config: {
		tools: ["write", "Write", "edit", "Edit"],
		keywords: [/config/i, /setup/i, /install/i, /environment/i, /\.env/i, /package\.json/i, /tsconfig/i],
	},
	conversation: {
		tools: [],
		keywords: [/explain/i, /tell.*me/i, /what.*think/i, /opinion/i, /help.*me/i, /idea/i, /suggest/i],
	},
};

// ── Types ────────────────────────────────────────────────────────────

export interface Exchange {
	/** User message text (truncated if very long) */
	user: string;
	/** Assistant response text (truncated if very long) */
	assistant: string;
	/** Files read during this exchange */
	filesRead: string[];
	/** Files written/edited during this exchange */
	filesModified: string[];
	/** Tools called during this exchange */
	toolsCalled: string[];
	/** Timestamp of the user message */
	timestamp: number;
}

/** A thread is a continuing topic detected across recaps */
export interface WorkThread {
	id: string;
	label: string;
	/** Which recap numbers this thread appears in */
	recapNumbers: number[];
	/** Files associated with this thread */
	files: string[];
	lastActive: string; // ISO timestamp
}

export interface RecapMetadata {
	recapNumber: number;
	project: string;
	timestamp: string;
	messageRange: { from: number; to: number };
	exchangeCount: number;
	summary: string;
	category: WorkCategory;
	filesModified: string[];
	threads: string[]; // thread IDs
	localPath: string;
	obsidianPath?: string;
}

export interface RecapIndex {
	$schema: "session-recap-index-v1";
	project: string;
	messageCount: number;
	recaps: RecapMetadata[];
	threads: WorkThread[];
	/** Running session narrative — what's the overall story of this session */
	sessionGoal?: string;
}

// ── Directory & File Helpers ─────────────────────────────────────────

export function ensureDir(dirPath: string): void {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
	}
}

export function getProjectName(cwd: string): string {
	return basename(cwd);
}

export function getTimestamp(): { date: string; time: string; iso: string } {
	const now = new Date();
	const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
	const time = now.toTimeString().split(" ")[0].slice(0, 5); // HH:MM
	const iso = now.toISOString();
	return { date, time, iso };
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen - 3) + "...";
}

// ── Smart Categorization ─────────────────────────────────────────────

/**
 * Detect what kind of work these exchanges represent.
 * Scores each category by tool usage and keyword matches, picks the winner.
 */
export function detectCategory(exchanges: Exchange[]): WorkCategory {
	const scores: Record<string, number> = {};

	for (const cat of Object.keys(CATEGORY_SIGNALS) as Array<Exclude<WorkCategory, "mixed">>) {
		scores[cat] = 0;
		const signals = CATEGORY_SIGNALS[cat];

		for (const ex of exchanges) {
			// Tool match (strong signal)
			for (const tool of ex.toolsCalled) {
				if (signals.tools.includes(tool)) {
					scores[cat] += 2;
				}
			}

			// Keyword match on user message (moderate signal)
			for (const kw of signals.keywords) {
				if (kw.test(ex.user)) {
					scores[cat] += 1;
				}
			}
		}
	}

	// Find top categories
	const sorted = Object.entries(scores)
		.filter(([_, score]) => score > 0)
		.sort((a, b) => b[1] - a[1]);

	if (sorted.length === 0) return "conversation";
	if (sorted.length >= 2 && sorted[1][1] >= sorted[0][1] * 0.7) return "mixed";
	return sorted[0][0] as WorkCategory;
}

// ── Thread Detection ─────────────────────────────────────────────────

/**
 * Detect continuing work threads from exchanges and existing threads.
 * A "thread" is a topic that spans multiple recaps — detected by
 * overlapping files or recurring topic keywords.
 */
export function detectThreads(
	exchanges: Exchange[],
	existingThreads: WorkThread[],
	recapNumber: number,
	timestamp: string,
): { threads: WorkThread[]; activeThreadIds: string[] } {
	const allFiles = [...new Set(exchanges.flatMap((e) => [...e.filesModified, ...e.filesRead]))];
	const allText = exchanges.map((e) => e.user).join(" ").toLowerCase();

	// Extract topic keywords from user messages (simple approach: first 3 meaningful words)
	const topicWords = extractTopicWords(exchanges);

	const updatedThreads = [...existingThreads];
	const activeThreadIds: string[] = [];

	// Check if any existing thread continues in these exchanges
	for (const thread of updatedThreads) {
		const fileOverlap = thread.files.some((f) => allFiles.includes(f));
		const labelOverlap = thread.label.toLowerCase().split(" ").some((w) =>
			w.length > 3 && allText.includes(w),
		);

		if (fileOverlap || labelOverlap) {
			// Thread continues
			if (!thread.recapNumbers.includes(recapNumber)) {
				thread.recapNumbers.push(recapNumber);
			}
			thread.files = [...new Set([...thread.files, ...allFiles])].slice(0, 15);
			thread.lastActive = timestamp;
			activeThreadIds.push(thread.id);
		}
	}

	// If no existing thread matched, create a new one
	if (activeThreadIds.length === 0 && topicWords.length > 0) {
		const newThread: WorkThread = {
			id: `thread-${recapNumber}-${Date.now().toString(36)}`,
			label: topicWords.join(" "),
			recapNumbers: [recapNumber],
			files: allFiles.slice(0, 10),
			lastActive: timestamp,
		};
		updatedThreads.push(newThread);
		activeThreadIds.push(newThread.id);
	}

	return { threads: updatedThreads, activeThreadIds };
}

/**
 * Extract meaningful topic words from user messages.
 */
function extractTopicWords(exchanges: Exchange[]): string[] {
	const stopWords = new Set([
		"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
		"have", "has", "had", "do", "does", "did", "will", "would", "could",
		"should", "may", "might", "can", "this", "that", "these", "those",
		"i", "you", "we", "they", "it", "my", "your", "our", "its",
		"and", "or", "but", "not", "no", "yes", "so", "if", "then",
		"for", "to", "from", "with", "in", "on", "at", "by", "of",
		"let", "me", "want", "need", "like", "make", "just", "also",
		"now", "here", "there", "when", "what", "how", "why", "where",
		"all", "each", "every", "some", "any", "get", "got", "use",
	]);

	const wordCounts = new Map<string, number>();

	for (const ex of exchanges) {
		const words = ex.user.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 2 && !stopWords.has(w));

		for (const word of words) {
			wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
		}
	}

	return [...wordCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([word]) => word);
}

// ── Exchange Extraction ──────────────────────────────────────────────

/**
 * Extract the last N user↔assistant exchanges from session branch entries.
 * Walks backward through the branch, pairing user messages with their
 * assistant responses and tracking tool calls in between.
 */
export function extractRecentExchanges(entries: any[], count: number): Exchange[] {
	const exchanges: Exchange[] = [];

	// Walk backward to find user→assistant pairs
	let i = entries.length - 1;

	while (i >= 0 && exchanges.length < count) {
		const entry = entries[i];

		// Skip non-message entries (compaction, branchSummary, etc.)
		if (entry.type !== "message") {
			i--;
			continue;
		}

		const msg = entry.message;
		if (!msg) {
			i--;
			continue;
		}

		// Find assistant messages, then look back for their user message
		if (msg.role === "assistant") {
			const assistantText = extractTextFromContent(msg.content);
			const filesRead: string[] = [];
			const filesModified: string[] = [];
			const toolsCalled: string[] = [];

			// Scan backward for tool results and the preceding user message
			let j = i - 1;
			let userText = "";
			let userTimestamp = 0;

			while (j >= 0) {
				const prevEntry = entries[j];
				if (prevEntry.type !== "message") {
					j--;
					continue;
				}

				const prevMsg = prevEntry.message;
				if (!prevMsg) {
					j--;
					continue;
				}

				if (prevMsg.role === "user") {
					userText = extractTextFromContent(prevMsg.content);
					userTimestamp = prevMsg.timestamp || 0;
					break;
				}

				if (prevMsg.role === "toolResult") {
					const toolName = prevMsg.toolName || "";
					if (toolName && !toolsCalled.includes(toolName)) {
						toolsCalled.push(toolName);
					}

					// Track file operations
					const details = prevMsg.details;
					if (details?.path) {
						if (toolName === "read" || toolName === "Read") {
							filesRead.push(details.path);
						} else if (
							toolName === "write" ||
							toolName === "Write" ||
							toolName === "edit" ||
							toolName === "Edit"
						) {
							filesModified.push(details.path);
						}
					}
				}

				j--;
			}

			if (userText) {
				exchanges.unshift({
					user: truncate(userText, 500),
					assistant: truncate(assistantText, 800),
					filesRead: [...new Set(filesRead)].slice(0, 5),
					filesModified: [...new Set(filesModified)].slice(0, 5),
					toolsCalled: [...new Set(toolsCalled)].slice(0, 10),
					timestamp: userTimestamp,
				});

				// Skip back past the user message we just consumed
				i = j - 1;
				continue;
			}
		}

		i--;
	}

	return exchanges;
}

/**
 * Extract plain text from message content (handles string and array formats).
 */
function extractTextFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const texts: string[] = [];
	for (const block of content) {
		if (block.type === "text" && block.text) {
			texts.push(block.text);
		}
	}
	return texts.join("\n");
}

// ── Recap Formatting ─────────────────────────────────────────────────

export const CATEGORY_EMOJI: Record<WorkCategory, string> = {
	coding: "🔨",
	debugging: "🐛",
	research: "🔍",
	planning: "📋",
	review: "👀",
	config: "⚙️",
	conversation: "💬",
	mixed: "🔀",
};

export const CATEGORY_LABEL: Record<WorkCategory, string> = {
	coding: "Implementation",
	debugging: "Debugging",
	research: "Research",
	planning: "Planning",
	review: "Review",
	config: "Configuration",
	conversation: "Discussion",
	mixed: "Mixed Work",
};

/**
 * Build a structured markdown recap from extracted exchanges.
 * Organized intelligently by category, with thread tracking.
 */
export function buildRecapMarkdown(
	exchanges: Exchange[],
	recapNumber: number,
	project: string,
	timestamp: { date: string; time: string; iso: string },
	category: WorkCategory,
	activeThreads: WorkThread[],
): string {
	const allFilesModified = [...new Set(exchanges.flatMap((e) => e.filesModified))];
	const allFilesRead = [...new Set(exchanges.flatMap((e) => e.filesRead))];
	const allTools = [...new Set(exchanges.flatMap((e) => e.toolsCalled))];

	// Build summary from the exchanges
	const summaryParts: string[] = [];
	for (const ex of exchanges) {
		const firstLine = ex.user.split("\n")[0].trim();
		if (firstLine) {
			summaryParts.push(`- ${truncate(firstLine, 120)}`);
		}
	}

	const label = CATEGORY_LABEL[category];

	const lines: string[] = [
		`# Session Recap #${recapNumber} — ${label}`,
		"",
		`**Project:** ${project}`,
		`**Time:** ${timestamp.date} ${timestamp.time}`,
		`**Category:** ${label}`,
		`**Exchanges:** ${exchanges.length}`,
	];

	// Thread continuity
	if (activeThreads.length > 0) {
		const threadLabels = activeThreads.map((t) => {
			const spans = t.recapNumbers.length;
			return spans > 1 ? `${t.label} (spans ${spans} recaps)` : t.label;
		});
		lines.push(`**Threads:** ${threadLabels.join(", ")}`);
	}

	lines.push("", "## Summary", "", "Topics discussed in this block:", ...summaryParts, "");

	// Key exchanges — organized by what happened
	lines.push("## Key Exchanges", "");
	for (let idx = 0; idx < exchanges.length; idx++) {
		const ex = exchanges[idx];
		lines.push(`### Exchange ${idx + 1}`);
		lines.push("");
		lines.push(`**User:** ${truncate(ex.user, 200)}`);
		lines.push("");
		lines.push(`**Assistant:** ${truncate(ex.assistant, 300)}`);
		lines.push("");

		if (ex.toolsCalled.length > 0) {
			lines.push(`**Tools:** ${ex.toolsCalled.join(", ")}`);
		}
		if (ex.filesModified.length > 0) {
			lines.push(`**Modified:** ${ex.filesModified.join(", ")}`);
		}
		lines.push("");
	}

	// Files touched — grouped by read vs modified
	if (allFilesModified.length > 0 || allFilesRead.length > 0) {
		lines.push("## Files Touched", "");
		if (allFilesModified.length > 0) {
			lines.push("**Modified:**");
			for (const f of allFilesModified) lines.push(`- \`${f}\``);
			lines.push("");
		}
		if (allFilesRead.length > 0) {
			lines.push("**Read:**");
			for (const f of allFilesRead.slice(0, 10)) lines.push(`- \`${f}\``);
			lines.push("");
		}
	}

	// Tools used
	if (allTools.length > 0) {
		lines.push("## Tools Used", "");
		lines.push(allTools.join(", "));
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Build a one-line summary from exchanges (for metadata/index).
 */
export function buildRecapSummary(exchanges: Exchange[]): string {
	const topics = exchanges
		.map((e) => e.user.split("\n")[0].trim())
		.filter(Boolean)
		.map((t) => truncate(t, 60));
	return topics.join(" → ") || "Session activity";
}

// ── Session Story — Running Narrative ────────────────────────────────

/**
 * Update the session story — a running markdown file that accumulates
 * a high-level narrative of the entire session, updated each recap.
 * This is the "smart" view: not raw recaps, but a curated story.
 */
export function updateSessionStory(
	cwd: string,
	recapNumber: number,
	summary: string,
	category: WorkCategory,
	timestamp: { date: string; time: string; iso: string },
	activeThreads: WorkThread[],
	allRecaps: RecapMetadata[],
): void {
	const storyPath = join(cwd, SESSION_STORY_FILE);
	const project = getProjectName(cwd);

	// Build the full story from scratch each time (keeps it clean)
	const lines: string[] = [
		`# Session Story — ${project}`,
		"",
		`*Auto-generated narrative of this work session. Updated every ${DEFAULT_RECAP_INTERVAL} messages.*`,
		"",
		`**Total recaps:** ${allRecaps.length}`,
		`**Last updated:** ${timestamp.date} ${timestamp.time}`,
	];

	// Active threads section
	if (activeThreads.length > 0) {
		lines.push("", "## Active Work Threads", "");
		for (const thread of activeThreads) {
			const isLong = thread.recapNumbers.length > 1;
			const status = isLong ? "[ongoing]" : "[new]";
			lines.push(`- **${thread.label}** — ${status} (recaps: ${thread.recapNumbers.join(", ")})`);
			if (thread.files.length > 0) {
				lines.push(`  - Files: ${thread.files.slice(0, 5).map((f) => `\`${f}\``).join(", ")}`);
			}
		}
	}

	// Timeline — each recap as a story beat
	lines.push("", "## Timeline", "");
	for (const recap of allRecaps) {
		const date = recap.timestamp.split("T")[0];
		const time = recap.timestamp.split("T")[1]?.slice(0, 5) ?? "";
		lines.push(`### Recap #${recap.recapNumber} — ${time}`);
		lines.push("");
		lines.push(`*${CATEGORY_LABEL[recap.category] || "Work"}* — ${recap.exchangeCount} exchanges`);
		lines.push("");
		lines.push(recap.summary);
		if (recap.filesModified.length > 0) {
			lines.push("");
			lines.push(`Files: ${recap.filesModified.map((f) => `\`${f}\``).join(", ")}`);
		}
		lines.push("");
	}

	ensureDir(join(cwd, RECAPS_DIR));
	writeFileSync(storyPath, lines.join("\n"), "utf-8");
}

// ── Local Storage ────────────────────────────────────────────────────

/**
 * Write a recap markdown file to `.context/recaps/` organized by category.
 * Files are named descriptively: `{recapNumber}-{category}-{timestamp}.md`
 */
export function writeLocalRecap(
	cwd: string,
	recapNumber: number,
	markdown: string,
	category: WorkCategory,
	timestamp: { date: string; time: string },
): string {
	const recapsDir = join(cwd, RECAPS_DIR);
	ensureDir(recapsDir);
	const safeName = `${String(recapNumber).padStart(3, "0")}-${category}-${timestamp.time.replace(":", "")}.md`;
	const filePath = join(recapsDir, safeName);
	writeFileSync(filePath, markdown, "utf-8");
	return filePath;
}

/**
 * Read the recap index for the current project.
 */
export function readRecapIndex(cwd: string): RecapIndex | null {
	const indexPath = join(cwd, RECAP_INDEX_FILE);
	if (!existsSync(indexPath)) return null;
	try {
		return JSON.parse(readFileSync(indexPath, "utf-8"));
	} catch {
		return null;
	}
}

/**
 * Update the recap index with a new entry.
 */
export function updateRecapIndex(
	cwd: string,
	recapNumber: number,
	metadata: Omit<RecapMetadata, "recapNumber">,
	messageCount: number,
	threads: WorkThread[],
): RecapIndex {
	const recapsDir = join(cwd, RECAPS_DIR);
	ensureDir(recapsDir);

	const existing = readRecapIndex(cwd);
	const project = getProjectName(cwd);

	const index: RecapIndex = existing ?? {
		$schema: "session-recap-index-v1",
		project,
		messageCount: 0,
		recaps: [],
		threads: [],
	};

	index.messageCount = messageCount;
	index.recaps.push({ recapNumber, ...metadata });
	index.threads = threads;

	const indexFilePath = join(cwd, RECAP_INDEX_FILE);
	writeFileSync(indexFilePath, JSON.stringify(index, null, 2), "utf-8");
	return index;
}

/**
 * Persist the current message count to the index without adding a recap.
 */
export function persistMessageCount(cwd: string, messageCount: number): void {
	const recapsDir = join(cwd, RECAPS_DIR);
	ensureDir(recapsDir);

	const existing = readRecapIndex(cwd);
	const project = getProjectName(cwd);

	const index: RecapIndex = existing ?? {
		$schema: "session-recap-index-v1",
		project,
		messageCount: 0,
		recaps: [],
		threads: [],
	};

	index.messageCount = messageCount;

	const indexFilePath = join(cwd, RECAP_INDEX_FILE);
	writeFileSync(indexFilePath, JSON.stringify(index, null, 2), "utf-8");
}

// ── Obsidian Integration ─────────────────────────────────────────────

/**
 * Build Obsidian-ready recap content with YAML frontmatter.
 * Organized into `raw/sessions/{project}/{date}/` hierarchy.
 * Includes wiki-links to project articles and related recaps.
 */
export function buildObsidianRecap(
	markdown: string,
	project: string,
	recapNumber: number,
	timestamp: { date: string; time: string; iso: string },
	category: WorkCategory,
	threads: WorkThread[],
): { content: string; title: string; path: string } {
	const title = `recap-${project}-${timestamp.date}-${recapNumber}`;

	// Frontmatter
	const tags = [`session-recap`, project, category];
	const threadLabels = threads.map((t) => t.label.replace(/\s+/g, "-").toLowerCase());

	const frontmatter = [
		"---",
		`title: "Session Recap #${recapNumber} — ${project}"`,
		`date: ${timestamp.date}`,
		`time: "${timestamp.time}"`,
		"status: raw",
		`tags: [${tags.join(", ")}]`,
		`project: ${project}`,
		`category: ${category}`,
		`recap_number: ${recapNumber}`,
	];

	if (threadLabels.length > 0) {
		frontmatter.push(`threads: [${threadLabels.join(", ")}]`);
	}

	frontmatter.push("---");

	// Add wiki-links section for Obsidian graph connectivity
	const wikiLinks: string[] = [];
	// Link to project codebase wiki if it exists
	wikiLinks.push(`Related: [[codebase-${project}]]`);
	// Link to adjacent recaps
	if (recapNumber > 1) {
		wikiLinks.push(`Previous: [[recap-${project}-${timestamp.date}-${recapNumber - 1}]]`);
	}

	const content = [
		frontmatter.join("\n"),
		"",
		markdown,
		"",
		"---",
		"",
		"## Links",
		"",
		...wikiLinks,
	].join("\n");

	// Organize by project/date in Obsidian
	const path = `raw/sessions/${project}/${timestamp.date}/${title}.md`;

	return { content, title, path };
}

// ── Context Injection ────────────────────────────────────────────────

/**
 * Build the context injection string for the agent.
 * Compact but information-dense — this is what keeps the agent grounded.
 */
export function buildRecapInjection(
	exchanges: Exchange[],
	recapNumber: number,
	project: string,
	category: WorkCategory,
	activeThreads: WorkThread[],
): string {
	const summary = buildRecapSummary(exchanges);
	const allFilesModified = [...new Set(exchanges.flatMap((e) => e.filesModified))];
	const lines = [
		`※ recap: Session Recap #${recapNumber} — ${CATEGORY_LABEL[category]}`,
		`  Project: ${project} | ${exchanges.length} exchanges captured`,
		`  Work: ${summary}`,
	];

	if (allFilesModified.length > 0) {
		lines.push(`  Files modified: ${allFilesModified.join(", ")}`);
	}

	// Thread continuity — helps agent understand ongoing work
	if (activeThreads.length > 0) {
		const continuing = activeThreads.filter((t) => t.recapNumbers.length > 1);
		if (continuing.length > 0) {
			lines.push(`  Ongoing threads: ${continuing.map((t) => t.label).join(", ")}`);
		}
	}

	// Include the last exchange's continuation context
	if (exchanges.length > 0) {
		const lastExchange = exchanges[exchanges.length - 1];
		const lastAssistant = truncate(lastExchange.assistant, 200);
		lines.push(`  Last response: ${lastAssistant}`);
	}

	return lines.join("\n");
}

// ── Dedup & Validation ───────────────────────────────────────────────

/**
 * Check if a recap for this message range already exists.
 */
export function shouldSkipRecap(cwd: string, messageCount: number): boolean {
	const index = readRecapIndex(cwd);
	if (!index) return false;

	return index.recaps.some(
		(r) => r.messageRange.to === messageCount,
	);
}

// ── Recap Widget Rendering ─────────────────────────────────────────────
// Separated into a pure function (like subagent-widget) for testability.
// The TUI framework calls render(width) to get the widget lines.

export interface RecapWidgetState {
	recapNumber: number;
	category: WorkCategory;
	summary: string;
	threadCount: number;
	filesModified: string[];
	exchangeCount: number;
	createdAt: number; // ms timestamp
	pinned: boolean;
}

export interface RecapWidgetTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export interface RecapWidgetResult {
	lines: string[];
	borderCount: number;
}

export const RECAP_WIDGET_BG: Record<string, string> = {
	idle:   "\x1b[48;2;28;38;48m",   // dark charcoal-blue (same as recap card)
	saved:  "\x1b[48;2;26;65;52m",   // muted teal-green
	pinned: "\x1b[48;2;55;45;80m",   // muted purple
};

export function renderRecapWidget(
	state: RecapWidgetState,
	width: number,
	theme: RecapWidgetTheme,
): RecapWidgetResult {
	const lines: string[] = [];

	const label = CATEGORY_LABEL[state.category] ?? "Work";
	const pin = state.pinned ? " [PINNED]" : "";
	const now = Date.now();
	const ageSec = Math.round((now - state.createdAt) / 1000);
	const ageLabel = ageSec < 60 ? `${ageSec}s ago` : `${Math.round(ageSec / 60)}m ago`;

	// Header
	const header = theme.bold(`Session Recap #${state.recapNumber} — ${label}${pin}`);
	lines.push(header);

	// Summary
	const maxSummaryLen = Math.max(40, width - 10);
	const summaryPreview = state.summary.length > maxSummaryLen
		? state.summary.slice(0, maxSummaryLen - 3) + "..."
		: state.summary;
	lines.push(theme.fg("dim", `  ${summaryPreview}`));

	// Stats
	const stats: string[] = [];
	if (state.exchangeCount > 0) stats.push(`${state.exchangeCount} exchanges`);
	if (state.threadCount > 0) stats.push(`${state.threadCount} thread${state.threadCount === 1 ? "" : "s"}`);
	if (state.filesModified.length > 0) stats.push(`${state.filesModified.length} files`);
	stats.push(ageLabel);
	lines.push(theme.fg("muted", `  ${stats.join(" · ")}`));

	// Thread indicator
	if (state.threadCount > 0) {
		lines.push(theme.fg("dim", `  🧵 ${state.threadCount} active thread${state.threadCount === 1 ? "" : "s"}`));
	}

	return { lines, borderCount: 1 };
}
