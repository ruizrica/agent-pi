import { describe, expect, it } from "vitest";
import securityNewsExt from "../security-news";

function createPiMock() {
  let tool: any;
  return {
    registerTool(def: any) {
      tool = def;
    },
    getTool() {
      return tool;
    },
  };
}

describe("security_news", () => {
  it("lists trusted sources", async () => {
    const pi = createPiMock();
    securityNewsExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { action: "sources" });
    const text = result.content[0].text as string;

    expect(text).toContain("CISA KEV");
    expect(text).toContain("NVD");
    expect(text).toContain("OWASP");
    expect(text).toContain("CVE / MITRE");
  });

  it("rejects invalid cve lookup input", async () => {
    const pi = createPiMock();
    securityNewsExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { action: "cve_lookup", cve_id: "not-a-cve" });
    expect(result.details.error).toBe("invalid_cve");
  });
});
