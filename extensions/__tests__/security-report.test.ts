import { describe, expect, it } from "vitest";
import securityReportExt from "../security-report";
import { generateSecurityReportHTML, type SecurityReportData } from "../lib/security-report-html.ts";

function createPiMock() {
  let tool: any;
  return {
    registerTool(def: any) {
      tool = def;
    },
    on() {},
    getTool() {
      return tool;
    },
  };
}

describe("show_security_report", () => {
  it("registers the security report tool", () => {
    const pi = createPiMock();
    securityReportExt(pi as any);
    const tool = pi.getTool();

    expect(tool.name).toBe("show_security_report");
    expect(tool.description).toContain("security analysis report viewer");
  });
});

describe("generateSecurityReportHTML", () => {
  it("renders without history (backward compat)", () => {
    const report: SecurityReportData = {
      title: "Test Report",
      summary: "Summary",
      generatedAt: new Date().toISOString(),
      findings: [
        { title: "Open port", severity: "high", category: "network" },
      ],
      mitigations: ["Close the port"],
    };
    const html = generateSecurityReportHTML(report);
    expect(html).toContain("Test Report");
    expect(html).toContain("Open port");
    expect(html).toContain("Findings");
    // Should NOT contain history tab
    expect(html).not.toContain('tab-history');
    expect(html).not.toContain('\u{1f4ca} History');
  });

  it("renders with history data including trend chart and delta", () => {
    const report: SecurityReportData = {
      title: "Scan #3",
      summary: "Third scan",
      generatedAt: new Date().toISOString(),
      findings: [
        { title: "Open port", severity: "high", category: "network" },
        { title: "Weak cipher", severity: "medium", category: "crypto" },
      ],
      mitigations: [],
      history: {
        snapshots: [
          {
            id: "scan-1",
            title: "Scan #2",
            summary: "Second scan",
            scope: "localhost",
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            severityCounts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
            totalFindings: 2,
            mitigations: [],
            findings: [
              { title: "Open port", severity: "high", category: "network" },
              { title: "Old vuln", severity: "medium", category: "crypto" },
            ],
          },
        ],
        trend: [
          {
            createdAt: new Date(Date.now() - 7200000).toISOString(),
            totalFindings: 3,
            severityCounts: { critical: 0, high: 2, medium: 1, low: 0, info: 0 },
          },
          {
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            totalFindings: 2,
            severityCounts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
          },
        ],
        delta: {
          newFindings: [{ title: "Weak cipher", severity: "medium", category: "crypto" }],
          resolvedFindings: [{ title: "Old vuln", severity: "medium", category: "crypto" }],
          unchangedCount: 1,
          previousScanAt: new Date(Date.now() - 3600000).toISOString(),
        },
      },
    };

    const html = generateSecurityReportHTML(report);

    // Has history tab
    expect(html).toContain('tab-history');
    expect(html).toContain('History');

    // Has delta banner
    expect(html).toContain('delta-banner');
    expect(html).toContain('+1 new');
    expect(html).toContain('1 resolved');
    expect(html).toContain('1 unchanged');

    // Has trend chart SVG
    expect(html).toContain('<svg');
    expect(html).toContain('Vulnerability Trend');

    // Has history list container
    expect(html).toContain('historyList');
    expect(html).toContain('history-data');

    // Has tab switching JS
    expect(html).toContain('switchTab');
    expect(html).toContain('initHistory');
  });

  it("renders severity filter tabs with correct counts", () => {
    const report: SecurityReportData = {
      title: "Test",
      summary: "Summary",
      generatedAt: new Date().toISOString(),
      findings: [
        { title: "A", severity: "critical", category: "test" },
        { title: "B", severity: "critical", category: "test" },
        { title: "C", severity: "high", category: "test" },
        { title: "D", severity: "low", category: "test" },
      ],
      mitigations: [],
    };
    const html = generateSecurityReportHTML(report);

    // Has severity tabs
    expect(html).toContain("switchTab('critical')");
    expect(html).toContain("switchTab('high')");
    expect(html).toContain("switchTab('low')");

    // Tab content sections
    expect(html).toContain('tab-critical');
    expect(html).toContain('tab-high');
    expect(html).toContain('tab-low');
  });

  it("fills all bottom sections when explicit content is provided", () => {
    const report: SecurityReportData = {
      title: "Complete Report",
      summary: "Summary",
      generatedAt: new Date().toISOString(),
      scope: "localhost",
      intelligence: "Threat intelligence content",
      inspection: "Passive inspection content",
      scan: "Scan analysis content",
      findings: [
        { title: "Open port", severity: "high", category: "network", evidence: "127.0.0.1:8080", recommendation: "Close the port" },
      ],
      mitigations: ["Close the port"],
    };

    const html = generateSecurityReportHTML(report);
    expect(html).toContain("Threat intelligence content");
    expect(html).toContain("Passive inspection content");
    expect(html).toContain("Scan analysis content");
    expect(html).toContain("Close the port");
  });
});
