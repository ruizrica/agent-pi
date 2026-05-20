// ABOUTME: Tests for the parent-metadata diff helper used by `tasks update-list`.
// ABOUTME: Pure function that decides what to send to the Commander parent task
// ABOUTME: when the user edits the list title/description mid-flight.

import { describe, it, expect } from "vitest";
import { buildParentMetadataUpdate } from "../lib/tasks-list-metadata.ts";

describe("buildParentMetadataUpdate", () => {
	it("returns null when nothing changed", () => {
		const result = buildParentMetadataUpdate({
			currentTitle: "Sprint",
			currentDescription: "Harden the signup flow against duplicate emails and rate limits.",
			newTitle: undefined,
			newDescription: undefined,
		});
		expect(result).toBeNull();
	});

	it("returns null when proposed values match current values", () => {
		const result = buildParentMetadataUpdate({
			currentTitle: "Sprint",
			currentDescription: "Harden the signup flow against duplicate emails and rate limits.",
			newTitle: "Sprint",
			newDescription: "Harden the signup flow against duplicate emails and rate limits.",
		});
		expect(result).toBeNull();
	});

	it("returns title-only update when only the title changed", () => {
		const result = buildParentMetadataUpdate({
			currentTitle: "Sprint",
			currentDescription: "Harden the signup flow against duplicate emails and rate limits.",
			newTitle: "Sprint 2",
			newDescription: undefined,
		});
		expect(result).toEqual({ title: "Sprint 2" });
	});

	it("returns description + mission_brief when only the description changed", () => {
		// Description and mission_brief stay aligned — that's how the parent was
		// created (commander-cli-client.ts:272-284), so editing one means both.
		const result = buildParentMetadataUpdate({
			currentTitle: "Sprint",
			currentDescription: "Old brief that no longer reflects the actual work being done here.",
			newTitle: undefined,
			newDescription: "Refined brief that reflects the real scope and the why behind the work.",
		});
		expect(result).toEqual({
			description: "Refined brief that reflects the real scope and the why behind the work.",
			mission_brief: "Refined brief that reflects the real scope and the why behind the work.",
		});
	});

	it("returns all three fields when both changed", () => {
		const result = buildParentMetadataUpdate({
			currentTitle: "Sprint",
			currentDescription: "Old brief that no longer reflects the actual work being done here.",
			newTitle: "Sprint 2",
			newDescription: "Refined brief that reflects the real scope and the why behind the work.",
		});
		expect(result).toEqual({
			title: "Sprint 2",
			description: "Refined brief that reflects the real scope and the why behind the work.",
			mission_brief: "Refined brief that reflects the real scope and the why behind the work.",
		});
	});

	it("trims whitespace from new values before diffing", () => {
		const result = buildParentMetadataUpdate({
			currentTitle: "Sprint",
			currentDescription: "Brief that already matches and should not produce an update payload here.",
			newTitle: "  Sprint  ",
			newDescription: "  Brief that already matches and should not produce an update payload here.  ",
		});
		expect(result).toBeNull();
	});
});
