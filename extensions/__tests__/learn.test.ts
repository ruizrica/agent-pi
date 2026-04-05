import { describe, expect, it } from "vitest";
import { __testExports } from "../learn.ts";

const {
	slugifySegment,
	formatTimestamp,
	formatDisplayName,
	createLearnTarget,
	buildLearnAssignments,
	createLearnPrompts,
	aggregateLearnResults,
	buildLearnSections,
	buildRawLearnContent,
	buildWikiIndexContent,
	buildMasterIndexContent,
} = __testExports;

describe("learn", () => {
	it("builds stable slugs and timestamps", () => {
		expect(slugifySegment("My Repo_Name")).toBe("my-repo-name");
		expect(formatTimestamp(new Date("2025-04-05T08:30:00.000Z"))).toBe("2025-04-05-0830z");
	});

	it("creates a normalized learn target", () => {
		const target = createLearnTarget(" ./demo-folder ", "/repo", new Date("2025-04-05T08:30:00.000Z"));
		expect(target.input).toBe("./demo-folder");
		expect(target.resolvedPath).toBe("/repo/demo-folder");
		expect(target.displayName).toBe("demo folder");
		expect(target.folderSlug).toBe("demo-folder");
		expect(target.wikiSlug).toBe("codebase-demo-folder");
		expect(target.rawTitle).toContain("Codebase Learn Report");
	});

	it("builds eight canonical learn assignments and prompts", () => {
		const target = createLearnTarget(".", "/repo/demo", new Date("2025-04-05T08:30:00.000Z"));
		const assignments = buildLearnAssignments(target);
		const prompts = createLearnPrompts(target);
		expect(assignments).toHaveLength(8);
		expect(prompts).toHaveLength(8);
		expect(assignments.filter((item: any) => item.role === "builder")).toHaveLength(2);
		expect(prompts[0].prompt).toContain(target.resolvedPath);
	});

	it("aggregates learn results with validation metadata", () => {
		const target = createLearnTarget(".", "/repo/demo", new Date("2025-04-05T08:30:00.000Z"));
		const assignments = buildLearnAssignments(target);
		const aggregation = aggregateLearnResults([
			{ assignmentId: "structure", status: "done", output: "Mapped files" },
			{ assignmentId: "patterns", status: "error", output: "", error: "timeout" },
		], assignments);
		expect(aggregation.completed).toHaveLength(1);
		expect(aggregation.failed).toHaveLength(1);
		expect(aggregation.missing.length).toBe(6);
		expect(aggregation.coverage.percent).toBe(13);
		expect(aggregation.coverage.validated).toBe(false);
		expect(aggregation.validationChecklist.join("\n")).toContain("Coverage validated: no");
	});

	it("builds richer learn sections and raw content", () => {
		const target = createLearnTarget(".", "/repo/project", new Date("2025-04-05T08:30:00.000Z"));
		const assignments = buildLearnAssignments(target);
		const aggregation = aggregateLearnResults(assignments.map((assignment: any) => ({
			assignmentId: assignment.id,
			status: "done" as const,
			output: `${assignment.summary} output`,
		})), assignments);
		const sections = buildLearnSections(target, aggregation);
		const raw = buildRawLearnContent(target, sections);
		const index = buildWikiIndexContent(target, sections);
		const master = buildMasterIndexContent(target, sections);

		expect(sections.length).toBeGreaterThanOrEqual(4);
		expect(sections.map((section: any) => section.id)).toContain("testing");
		expect(raw).toContain("## Coverage Validation");
		expect(raw).toContain("Assignments completed: 8");
		expect(index).toContain("## Articles");
		expect(master).toContain("validated codebase learn snapshot");
	});
});
