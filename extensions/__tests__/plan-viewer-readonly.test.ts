import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("plan-viewer Phase 2+3: snapshot capture and readonly support", () => {
	const source = readFileSync(new URL("../plan-viewer.ts", import.meta.url), "utf8");

	describe("parameter additions", () => {
		it("adds readonly and payload_id to ShowPlanParams", () => {
			expect(source).toContain("readonly: Type.Optional(Type.Boolean");
			expect(source).toContain("payload_id: Type.Optional(Type.String");
		});
	});

	describe("imports", () => {
		it("imports readRawPayload", () => {
			expect(source).toContain("readRawPayload");
		});

		it("imports snapshot builders", () => {
			expect(source).toContain("buildPlanSnapshot");
			expect(source).toContain("buildQuestionsSnapshot");
			expect(source).toContain("validateSnapshot");
			expect(source).toContain("synthesizeSnapshotFromEntry");
		});
	});

	describe("task parsing", () => {
		it("exports parsePlainTasksFromMarkdown helper", () => {
			expect(source).toContain("parsePlainTasksFromMarkdown");
			expect(source).toContain("interface TaskNode");
		});
	});

	describe("snapshot capture", () => {
		it("imports snapshot builders", () => {
			expect(source).toContain("buildPlanSnapshot");
			expect(source).toContain("buildQuestionsSnapshot");
		});
	});

	describe("backward compatibility", () => {
		it("still supports file-based loading", () => {
			expect(source).toContain("readFileSync");
		});

		it("still uses upsertPersistedReport", () => {
			expect(source).toContain("upsertPersistedReport");
		});
	});
});
