import { describe, expect, it } from "vitest";
import securityReportExt from "../security-report";

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
