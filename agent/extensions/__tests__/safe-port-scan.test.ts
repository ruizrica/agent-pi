import { describe, expect, it } from "vitest";
import safePortScanExt from "../safe-port-scan";

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

describe("safe_port_scan", () => {
  it("refuses public targets", async () => {
    const pi = createPiMock();
    safePortScanExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { target: "8.8.8.8", dry_run: true });
    const text = result.content[0].text as string;

    expect(text).toContain("Refused");
    expect(result.details.error).toBe("invalid_target");
  });

  it("refuses hostnames", async () => {
    const pi = createPiMock();
    safePortScanExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { target: "example.com", dry_run: true });
    expect(result.details.error).toBe("invalid_target");
  });

  it("returns a bounded dry-run command for private targets", async () => {
    const pi = createPiMock();
    safePortScanExt(pi as any);
    const tool = pi.getTool();

    const result = await tool.execute("1", { target: "127.0.0.1", ports: "22,80,443", dry_run: true });
    const text = result.content[0].text as string;

    expect(text).toContain("Dry run only");
    expect(text).toContain("nmap -Pn -n -T2");
    expect(text).toContain("--max-rate 10");
    expect(text).toContain("127.0.0.1");
  });
});
