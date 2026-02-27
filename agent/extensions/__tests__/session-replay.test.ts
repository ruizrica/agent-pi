// ABOUTME: Tests for session-replay.ts extractContent and timestamp handling
// Verifies content extraction from various message formats and timestamp fallbacks

import { describe, it, expect } from "vitest";
import { extractContent, buildHistoryItems } from "../lib/session-replay-helpers.ts";

describe("extractContent", () => {
	it("returns empty string when entry has no message", () => {
		expect(extractContent({})).toBe("");
	});

	it("returns empty string when message has no content", () => {
		expect(extractContent({ message: {} })).toBe("");
	});

	it("returns string content directly", () => {
		expect(extractContent({ message: { content: "hello world" } })).toBe("hello world");
	});

	it("extracts text from array with text parts", () => {
		const entry = {
			message: {
				content: [
					{ type: "text", text: "first part" },
					{ type: "text", text: "second part" },
				],
			},
		};
		expect(extractContent(entry)).toBe("first part\nsecond part");
	});

	it("extracts tool call info from array with toolCall parts", () => {
		const entry = {
			message: {
				content: [
					{ type: "toolCall", name: "readFile", arguments: { path: "/foo" } },
				],
			},
		};
		const result = extractContent(entry);
		expect(result).toContain("Tool: readFile");
		expect(result).toContain("/foo");
	});

	it("handles mixed text and toolCall parts", () => {
		const entry = {
			message: {
				content: [
					{ type: "text", text: "some text" },
					{ type: "toolCall", name: "bash", arguments: { cmd: "ls" } },
				],
			},
		};
		const result = extractContent(entry);
		expect(result).toContain("some text");
		expect(result).toContain("Tool: bash");
	});

	it("skips unknown part types gracefully", () => {
		const entry = {
			message: {
				content: [
					{ type: "image", data: "base64stuff" },
					{ type: "text", text: "visible" },
				],
			},
		};
		expect(extractContent(entry)).toBe("visible");
	});

	it("handles non-string non-array content by stringifying", () => {
		const entry = {
			message: { content: { key: "value" } },
		};
		const result = extractContent(entry);
		expect(result).toBe('{"key":"value"}');
	});
});

describe("buildHistoryItems", () => {
	it("returns empty array for empty branch", () => {
		expect(buildHistoryItems([])).toEqual([]);
	});

	it("skips non-message entries", () => {
		const branch = [{ type: "tool", data: {} }];
		expect(buildHistoryItems(branch)).toEqual([]);
	});

	it("uses timestamp from message when available", () => {
		const branch = [
			{
				type: "message",
				message: {
					role: "user",
					content: "hello",
					timestamp: "2025-01-15T10:00:00Z",
				},
			},
		];
		const items = buildHistoryItems(branch);
		expect(items).toHaveLength(1);
		expect(items[0].timestamp).toEqual(new Date("2025-01-15T10:00:00Z"));
	});

	it("uses index-based timestamp (0) when message has no timestamp", () => {
		const branch = [
			{
				type: "message",
				message: {
					role: "user",
					content: "no timestamp",
				},
			},
		];
		const items = buildHistoryItems(branch);
		expect(items).toHaveLength(1);
		// Should use 0 (epoch) rather than current time
		expect(items[0].timestamp.getTime()).toBe(0);
	});

	it("preserves ordering via index for missing timestamps", () => {
		const branch = [
			{
				type: "message",
				message: { role: "user", content: "first" },
			},
			{
				type: "message",
				message: { role: "assistant", content: "second" },
			},
			{
				type: "message",
				message: { role: "user", content: "third" },
			},
		];
		const items = buildHistoryItems(branch);
		expect(items).toHaveLength(3);
		// Each should have incrementing timestamps based on index
		expect(items[0].timestamp.getTime()).toBeLessThan(items[1].timestamp.getTime());
		expect(items[1].timestamp.getTime()).toBeLessThan(items[2].timestamp.getTime());
	});

	it("computes elapsed time between consecutive messages", () => {
		const branch = [
			{
				type: "message",
				message: {
					role: "user",
					content: "hello",
					timestamp: "2025-01-15T10:00:00Z",
				},
			},
			{
				type: "message",
				message: {
					role: "assistant",
					content: "world",
					timestamp: "2025-01-15T10:00:30Z",
				},
			},
		];
		const items = buildHistoryItems(branch);
		expect(items).toHaveLength(2);
		expect(items[0].elapsed).toBeUndefined();
		expect(items[1].elapsed).toBe("30s");
	});

	it("maps role to correct type", () => {
		const branch = [
			{ type: "message", message: { role: "user", content: "u" } },
			{ type: "message", message: { role: "assistant", content: "a" } },
			{ type: "message", message: { role: "toolResult", content: "t", toolName: "bash" } },
		];
		const items = buildHistoryItems(branch);
		expect(items[0].type).toBe("user");
		expect(items[1].type).toBe("assistant");
		expect(items[2].type).toBe("tool");
	});

	it("uses toolName for tool result titles", () => {
		const branch = [
			{
				type: "message",
				message: { role: "toolResult", content: "output", toolName: "readFile" },
			},
		];
		const items = buildHistoryItems(branch);
		expect(items[0].title).toBe("Tool: readFile");
	});

	it("falls back to 'tool' when toolName is missing", () => {
		const branch = [
			{
				type: "message",
				message: { role: "toolResult", content: "output" },
			},
		];
		const items = buildHistoryItems(branch);
		expect(items[0].title).toBe("Tool: tool");
	});
});
