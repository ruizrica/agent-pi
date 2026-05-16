import { describe, expect, it } from "vitest";
import { renderSessionSummary } from "../lib/summary-render.ts";

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => `<b>${text}</b>`,
  };
}

describe("renderSessionSummary", () => {
  it("renders summary header and key sections", () => {
    const lines = renderSessionSummary({
      title: "Task at Hand",
      status: "Using tools",
      task: "Implement toggle-summary command",
      elapsedMs: 65000,
      toolCount: 3,
      latestOutput: "Wired up the first pass of the UI",
      recentTools: [{ name: "read", count: 2 }, { name: "edit", count: 1 }],
      activeAgents: ["main"],
    }, 100, makeTheme());

    expect(lines[0]).toContain("SUMMARY");
    expect(lines.join("\n")).toContain("Task at Hand");
    expect(lines.join("\n")).toContain("TASK");
    expect(lines.join("\n")).toContain("TOOLBOX");
    expect(lines.join("\n")).toContain("LATEST SUMMARY");
    expect(lines.join("\n")).toContain("read (2x)");
  });

  it("renders empty-state when provided", () => {
    const lines = renderSessionSummary({
      title: "Task at Hand",
      status: "Idle",
      task: "No active task",
      elapsedMs: 0,
      toolCount: 0,
      latestOutput: "",
      recentTools: [],
      emptyState: "Waiting for activity",
    }, 80, makeTheme());

    expect(lines.join("\n")).toContain("STATE");
    expect(lines.join("\n")).toContain("Waiting for activity");
    expect(lines.join("\n")).not.toContain("LATEST SUMMARY");
  });
});
