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
	buildLearnSectionsFromChainOutput,
	buildRawLearnContent,
	buildWikiIndexContent,
	buildMasterIndexContent,
	parseChainOutputToWikiSections,
	normalizeForCompare,
	contentChanged,
	stripFrontmatter,
	buildChangelogEntry,
	changelogPath,
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

	it("parses chain output with ## WIKI: delimiters into sections", () => {
		const chainOutput = [
			"Some preamble that should be ignored.",
			"",
			"## WIKI:Overview",
			"",
			"### Project Summary",
			"This is a Node.js project.",
			"- Entry: `src/index.ts:1`",
			"",
			"## WIKI:Architecture",
			"",
			"### Component Map",
			"| Component | Files |",
			"|-----------|-------|",
			"| Auth | src/auth/ |",
			"",
			"## WIKI:Conventions",
			"",
			"### Naming",
			"- kebab-case files",
			"",
			"## WIKI:Testing",
			"",
			"### Framework",
			"Vitest with supertest.",
		].join("\n");

		const sections = parseChainOutputToWikiSections(chainOutput);
		expect(sections).toHaveLength(4);
		expect(sections.map((s: any) => s.name)).toEqual(["Overview", "Architecture", "Conventions", "Testing"]);
		expect(sections.map((s: any) => s.id)).toEqual(["overview", "architecture", "conventions", "testing"]);
		expect(sections[0].body).toContain("Node.js project");
		expect(sections[0].body).toContain("src/index.ts:1");
		expect(sections[1].body).toContain("Component Map");
		expect(sections[2].body).toContain("kebab-case");
		expect(sections[3].body).toContain("Vitest");
	});

	it("parses empty chain output gracefully", () => {
		const sections = parseChainOutputToWikiSections("no wiki sections here");
		expect(sections).toHaveLength(0);
	});

	it("builds wiki learn sections from parsed chain output", () => {
		const target = createLearnTarget(".", "/repo/demo", new Date("2025-04-05T08:30:00.000Z"));
		const parsed = [
			{ name: "Overview", id: "overview", body: "Real analysis content about demo project." },
			{ name: "Architecture", id: "architecture", body: "Component map with evidence." },
			{ name: "Conventions", id: "conventions", body: "Naming and patterns." },
			{ name: "Testing", id: "testing", body: "Vitest + supertest." },
		];
		const sections = buildLearnSectionsFromChainOutput(target, parsed);
		expect(sections).toHaveLength(4);
		expect(sections[0].title).toBe("demo Overview");
		expect(sections[0].body).toContain("Real analysis content");
		expect(sections[0].links).toContain("demo Architecture");
		expect(sections[1].title).toBe("demo Architecture");
		expect(sections[2].title).toBe("demo Conventions");
		expect(sections[3].title).toBe("demo Testing");
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

describe("learn — delta detection", () => {
	it("normalizeForCompare trims whitespace and collapses newlines", () => {
		expect(normalizeForCompare("  hello  \n\n\n  world  \n")).toBe("hello\n\n  world");
		expect(normalizeForCompare("same")).toBe(normalizeForCompare("same"));
		expect(normalizeForCompare("a\r\nb")).toBe(normalizeForCompare("a\nb"));
	});

	it("contentChanged returns false for identical content", () => {
		expect(contentChanged("hello world", "hello world")).toBe(false);
	});

	it("contentChanged returns false for whitespace-only differences", () => {
		expect(contentChanged("hello  \n\n\nworld\n", "hello\n\nworld")).toBe(false);
	});

	it("contentChanged returns true for different content", () => {
		expect(contentChanged("version 1", "version 2")).toBe(true);
	});

	it("contentChanged returns true when existing is null (new file)", () => {
		expect(contentChanged(null, "new content")).toBe(true);
	});

	it("stripFrontmatter removes YAML frontmatter", () => {
		const withFm = "---\ntitle: Test\ndate: 2025-01-01\n---\n\n# Hello\n\nWorld";
		expect(stripFrontmatter(withFm)).toBe("# Hello\n\nWorld");
	});

	it("stripFrontmatter returns content as-is when no frontmatter", () => {
		const noFm = "# Hello\n\nWorld";
		expect(stripFrontmatter(noFm)).toBe("# Hello\n\nWorld");
	});
});

describe("learn — changelog", () => {
	it("changelogPath returns correct path", () => {
		expect(changelogPath("codebase-demo")).toBe("wiki/codebase-demo/_changelog.md");
	});

	it("buildChangelogEntry formats a fresh learn (all created)", () => {
		const target = createLearnTarget(".", "/repo/demo", new Date("2025-04-05T08:30:00.000Z"));
		const delta = {
			created: ["demo Overview", "demo Architecture", "demo Conventions", "demo Testing"],
			updated: [],
			unchanged: [],
			changelog: "",
		};
		const entry = buildChangelogEntry(target, delta, new Date("2025-04-05T08:30:00.000Z"));
		expect(entry).toContain("2025-04-05");
		expect(entry).toContain("**Summary:** 4 created");
		expect(entry).toContain("### Created");
		expect(entry).toContain("- demo Overview");
		expect(entry).not.toContain("### Updated");
		expect(entry).not.toContain("### Unchanged");
	});

	it("buildChangelogEntry formats a re-learn (mix of updated/unchanged)", () => {
		const target = createLearnTarget(".", "/repo/demo", new Date("2025-04-05T08:30:00.000Z"));
		const delta = {
			created: [],
			updated: ["demo Architecture", "demo Testing"],
			unchanged: ["demo Overview", "demo Conventions"],
			changelog: "",
		};
		const entry = buildChangelogEntry(target, delta, new Date("2025-04-05T10:00:00.000Z"));
		expect(entry).toContain("**Summary:** 2 updated, 2 unchanged");
		expect(entry).toContain("### Updated");
		expect(entry).toContain("- demo Architecture");
		expect(entry).toContain("### Unchanged");
		expect(entry).toContain("- demo Overview (skipped)");
		expect(entry).not.toContain("### Created");
	});

	it("buildChangelogEntry formats a no-op re-learn (all unchanged)", () => {
		const target = createLearnTarget(".", "/repo/demo", new Date("2025-04-05T08:30:00.000Z"));
		const delta = {
			created: [],
			updated: [],
			unchanged: ["demo Overview", "demo Architecture", "demo Conventions", "demo Testing"],
			changelog: "",
		};
		const entry = buildChangelogEntry(target, delta, new Date("2025-04-05T12:00:00.000Z"));
		expect(entry).toContain("**Summary:** 4 unchanged");
		expect(entry).not.toContain("### Created");
		expect(entry).not.toContain("### Updated");
		expect(entry).toContain("### Unchanged");
	});
});
