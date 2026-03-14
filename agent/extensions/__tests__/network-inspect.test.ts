import { describe, expect, it } from "vitest";
import networkInspectExt from "../network-inspect";

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

describe("network_inspect", () => {
  it("lists interfaces without requiring command execution", async () => {
    const pi = createPiMock();
    networkInspectExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { action: "interfaces" });
    const text = result.content[0].text as string;

    expect(text).toContain("Local interfaces");
    expect(Array.isArray(result.details.items)).toBe(true);
  });

  it("requires interface for capture summary", async () => {
    const pi = createPiMock();
    networkInspectExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { action: "capture_summary" });
    expect(result.details.error).toBe("missing_interface");
  });
});
