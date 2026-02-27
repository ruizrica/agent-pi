// ABOUTME: Extracted helpers for session-replay.ts content extraction and history building
// Handles content extraction from message parts and timestamp fallbacks

interface HistoryItem {
	type: 'user' | 'assistant' | 'tool';
	title: string;
	content: string;
	timestamp: Date;
	elapsed?: string;
}

function getElapsedTime(start: Date, end: Date): string {
	const diffMs = end.getTime() - start.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return `${diffSec}s`;
	const diffMin = Math.floor(diffSec / 60);
	return `${diffMin}m ${diffSec % 60}s`;
}

/**
 * Extract displayable text from a session branch entry.
 * Handles string content, arrays of text/toolCall parts, and arbitrary objects.
 */
export function extractContent(entry: any): string {
	const msg = entry.message;
	if (!msg) return "";
	const content = msg.content;
	if (!content) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c: any) => {
				if (c.type === "text") return c.text || "";
				if (c.type === "toolCall") return `Tool: ${c.name}(${JSON.stringify(c.arguments).slice(0, 200)})`;
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return JSON.stringify(content);
}

/**
 * Build HistoryItem[] from a session branch array.
 * Uses message index as fallback timestamp (epoch + index ms) instead of new Date()
 * to preserve ordering when timestamps are missing.
 */
export function buildHistoryItems(branch: any[]): HistoryItem[] {
	const items: HistoryItem[] = [];
	let prevTime: Date | null = null;

	for (let i = 0; i < branch.length; i++) {
		const entry = branch[i];
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!msg) continue;

		const ts = msg.timestamp ? new Date(msg.timestamp) : new Date(i);
		const elapsed = prevTime ? getElapsedTime(prevTime, ts) : undefined;
		prevTime = ts;

		const role = msg.role;
		const text = extractContent(entry);
		if (!text) continue;

		if (role === "user") {
			items.push({
				type: "user",
				title: "User Prompt",
				content: text,
				timestamp: ts,
				elapsed,
			});
		} else if (role === "assistant") {
			items.push({
				type: "assistant",
				title: "Assistant",
				content: text,
				timestamp: ts,
				elapsed,
			});
		} else if (role === "toolResult") {
			const toolName = (msg as any).toolName || "tool";
			items.push({
				type: "tool",
				title: `Tool: ${toolName}`,
				content: text,
				timestamp: ts,
				elapsed,
			});
		}
	}

	return items;
}
