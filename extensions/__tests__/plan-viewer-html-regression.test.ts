import { describe, expect, it } from "vitest";
import { generatePlanViewerHTML } from "../lib/plan-viewer-html.ts";

describe("plan viewer HTML regression guards", () => {
  it("defines a safe projectContext default so stale metadata access cannot blank the UI", () => {
    const html = generatePlanViewerHTML({
      markdown: "# Plan\n\n- [ ] Ship fix",
      title: "Implementation Plan",
      mode: "plan",
      port: 4321,
      roundTripEnabled: true,
    });

    expect(html).toContain("const projectContext = (typeof globalThis !== 'undefined' && globalThis.projectContext) ? globalThis.projectContext : null;");
    expect(html).toContain("function renderPlan() {");
    expect(html).toContain("container.innerHTML = html;");
  });
});
