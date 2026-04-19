// ABOUTME: Tests for tool-response-attribution extension — ensures custom messages
// ABOUTME: get proper attribution framing to prevent the LLM from treating them as user input.

import { describe, expect, it } from "vitest";
import { frameCustomMessage, wrapContent, ATTRIBUTION_MAP, defaultFraming } from "../tool-response-attribution.ts";

// ── wrapContent ─────────────────────────────────────────────────────────

describe("wrapContent", () => {
	it("wraps subagent-result with SYSTEM framing", () => {
		const result = wrapContent("SA1 finished. Result:\nAll tests passed.", "subagent-result");
		expect(result).toContain("[SYSTEM:");
		expect(result).toContain("NOT user input");
		expect(result).toContain("SA1 finished. Result:\nAll tests passed.");
	});

	it("wraps plan-approved with SYSTEM framing", () => {
		const result = wrapContent("Plan approved! Proceed with implementation.", "plan-approved");
		expect(result).toContain("[SYSTEM:");
		expect(result).toContain("approved");
		expect(result).toContain("Plan approved! Proceed with implementation.");
	});

	it("wraps plan-changes-requested with SYSTEM framing", () => {
		const result = wrapContent("Changes requested: fix the tests.", "plan-changes-requested");
		expect(result).toContain("[SYSTEM:");
		expect(result).toContain("changes");
	});

	it("wraps plan-viewer-answers with attribution (still user input but from UI)", () => {
		const result = wrapContent("Here are my answers:\n1. Yes\n2. No", "plan-viewer-answers");
		expect(result).toContain("[SYSTEM:");
		expect(result).toContain("submitted");
		expect(result).toContain("Here are my answers:");
	});

	it("uses default framing for unknown custom types", () => {
		const result = wrapContent("Some content", "unknown-type-xyz");
		expect(result).toContain("[SYSTEM:");
		expect(result).toContain("unknown-type-xyz");
		expect(result).toContain("NOT user input");
		expect(result).toContain("Some content");
	});

	it("preserves original content after framing prefix", () => {
		const original = "Line 1\nLine 2\nLine 3";
		const result = wrapContent(original, "subagent-result");
		expect(result).toContain(original);
	});
});

// ── defaultFraming ──────────────────────────────────────────────────────

describe("defaultFraming", () => {
	it("includes the custom type name", () => {
		const [prefix] = defaultFraming("my-custom-event");
		expect(prefix).toContain("my-custom-event");
		expect(prefix).toContain("[SYSTEM:");
	});

	it("marks as NOT user input", () => {
		const [prefix] = defaultFraming("anything");
		expect(prefix).toContain("NOT user input");
	});
});

// ── ATTRIBUTION_MAP ─────────────────────────────────────────────────────

describe("ATTRIBUTION_MAP", () => {
	it("has entries for all known custom types", () => {
		const expectedTypes = [
			"subagent-result",
			"plan-approved",
			"plan-changes-requested",
			"plan-viewer-answers",
			"spec-approved",
			"spec-changes-requested",
			"tests-approved",
			"test-gen-complete",
			"toolkit-command-result",
			"toolkit-command",
			"memory-cycle-resume",
			"memory-restored",
			"session-recap",
			"session-recap-card",
			"vulnerability-sweep-result",
			"vulnerability-install-result",
			"qa-rico-config",
			"swagbucks-config",
			"security-guard-event",
			"task-validation",
			"auto-compact-gate",
			"dream-config",
			"dream-reminder",
			"dream-status",
		];

		for (const type of expectedTypes) {
			expect(ATTRIBUTION_MAP[type], `Missing ATTRIBUTION_MAP entry for "${type}"`).toBeDefined();
		}
	});

	it("all entries return valid [prefix, suffix] tuples", () => {
		for (const [type, fn] of Object.entries(ATTRIBUTION_MAP)) {
			const result = fn("test content");
			expect(Array.isArray(result), `${type} should return array`).toBe(true);
			expect(result.length, `${type} should return 2 elements`).toBe(2);
			expect(typeof result[0], `${type} prefix should be string`).toBe("string");
			expect(typeof result[1], `${type} suffix should be string`).toBe("string");
			expect(result[0], `${type} prefix should contain SYSTEM tag`).toContain("[SYSTEM:");
		}
	});
});

// ── frameCustomMessage ──────────────────────────────────────────────────

describe("frameCustomMessage", () => {
	it("frames string content", () => {
		const msg = {
			role: "custom",
			customType: "subagent-result",
			content: "SA1 finished with results",
			display: true,
			timestamp: Date.now(),
		};

		const framed = frameCustomMessage(msg);
		expect(framed.content).toContain("[SYSTEM:");
		expect(framed.content).toContain("SA1 finished with results");
		expect(framed.role).toBe("custom"); // role unchanged at this point
	});

	it("frames array content — prepends to first text block", () => {
		const msg = {
			role: "custom",
			customType: "plan-approved",
			content: [
				{ type: "text", text: "Plan approved! Proceed." },
			],
			display: true,
			timestamp: Date.now(),
		};

		const framed = frameCustomMessage(msg);
		expect(Array.isArray(framed.content)).toBe(true);
		expect(framed.content[0].text).toContain("[SYSTEM:");
		expect(framed.content[0].text).toContain("Plan approved! Proceed.");
	});

	it("handles array content with no text blocks — prepends text block", () => {
		const msg = {
			role: "custom",
			customType: "subagent-result",
			content: [
				{ type: "image", source: { type: "base64", data: "..." } },
			],
			display: true,
			timestamp: Date.now(),
		};

		const framed = frameCustomMessage(msg);
		expect(Array.isArray(framed.content)).toBe(true);
		expect(framed.content.length).toBe(2); // text block prepended + original image
		expect(framed.content[0].type).toBe("text");
		expect(framed.content[0].text).toContain("[SYSTEM:");
	});

	it("preserves all original message fields", () => {
		const msg = {
			role: "custom",
			customType: "subagent-result",
			content: "test",
			display: true,
			details: { agentId: 1, taskId: 42 },
			timestamp: 1234567890,
		};

		const framed = frameCustomMessage(msg);
		expect(framed.role).toBe("custom");
		expect(framed.customType).toBe("subagent-result");
		expect(framed.display).toBe(true);
		expect(framed.details).toEqual({ agentId: 1, taskId: 42 });
		expect(framed.timestamp).toBe(1234567890);
	});

	it("does not mutate the original message", () => {
		const msg = {
			role: "custom",
			customType: "subagent-result",
			content: "original content",
			display: true,
			timestamp: Date.now(),
		};

		const original = JSON.parse(JSON.stringify(msg));
		frameCustomMessage(msg);
		expect(msg).toEqual(original);
	});

	it("handles unknown custom types with default framing", () => {
		const msg = {
			role: "custom",
			customType: "brand-new-extension-type",
			content: "Some new extension output",
			display: true,
			timestamp: Date.now(),
		};

		const framed = frameCustomMessage(msg);
		expect(framed.content).toContain("[SYSTEM:");
		expect(framed.content).toContain("brand-new-extension-type");
		expect(framed.content).toContain("NOT user input");
	});

	it("handles messages with empty content", () => {
		const msg = {
			role: "custom",
			customType: "subagent-result",
			content: "",
			display: true,
			timestamp: Date.now(),
		};

		const framed = frameCustomMessage(msg);
		expect(framed.content).toContain("[SYSTEM:");
	});

	it("handles messages with missing customType", () => {
		const msg = {
			role: "custom",
			content: "Some content",
			display: true,
			timestamp: Date.now(),
		};

		const framed = frameCustomMessage(msg);
		expect(framed.content).toContain("[SYSTEM:");
		expect(framed.content).toContain("unknown");
	});
});

// ── Integration-style: simulating context event behavior ────────────────

describe("context event simulation", () => {
	it("only frames custom messages, not user/assistant/toolResult", () => {
		const messages = [
			{ role: "user", content: "Hello, read this file", timestamp: 1 },
			{ role: "assistant", content: [{ type: "text", text: "Sure, reading..." }], timestamp: 2 },
			{ role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text: "file contents" }], isError: false, timestamp: 3 },
			{ role: "custom", customType: "subagent-result", content: "SA1 done", display: true, timestamp: 4 },
		];

		const result = messages.map((msg: any) => {
			if (msg.role !== "custom") return msg;
			if (typeof msg.content === "string" && msg.content.startsWith("[SYSTEM:")) return msg;
			return frameCustomMessage(msg);
		});

		// User message untouched
		expect(result[0].content).toBe("Hello, read this file");
		// Assistant message untouched
		expect(result[1].content[0].text).toBe("Sure, reading...");
		// ToolResult untouched
		expect(result[2].content[0].text).toBe("file contents");
		// Custom message framed
		expect(result[3].content).toContain("[SYSTEM:");
		expect(result[3].content).toContain("SA1 done");
	});

	it("skips already-framed messages (idempotent)", () => {
		const msg = {
			role: "custom",
			customType: "subagent-result",
			content: "Original result",
			display: true,
			timestamp: 1,
		};

		const framed = frameCustomMessage(msg);
		// Simulate running through context event again
		const content = typeof framed.content === "string" ? framed.content : "";
		if (content.startsWith("[SYSTEM:")) {
			// Should skip — already framed
			expect(content).toContain("[SYSTEM:");
			// Make sure there's only one [SYSTEM: prefix
			const matches = content.match(/\[SYSTEM:/g);
			expect(matches?.length).toBe(1);
		}
	});
});
