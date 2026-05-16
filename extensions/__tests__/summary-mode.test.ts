import { describe, expect, it, vi } from "vitest";
import summaryMode from "../summary-mode.ts";

function makePi() {
  const commands = new Map<string, any>();
  const events = new Map<string, any[]>();
  return {
    commands,
    events,
    registerCommand: vi.fn((name: string, def: any) => commands.set(name, def)),
    on: vi.fn((name: string, handler: any) => {
      const arr = events.get(name) || [];
      arr.push(handler);
      events.set(name, arr);
    }),
  } as any;
}

function makeCtx() {
  return {
    hasUI: true,
    sessionManager: { getBranch: () => [] },
    ui: {
      setWidget: vi.fn(),
      setStatus: vi.fn(),
      notify: vi.fn(),
      setTheme: vi.fn(() => ({ success: true })),
      custom: vi.fn(),
      theme: { name: "midnight-ocean" },
    },
  } as any;
}

describe("summary-mode extension", () => {
  it("registers /toggle-summary command", () => {
    const pi = makePi();
    summaryMode(pi);
    expect(pi.registerCommand).toHaveBeenCalledWith("toggle-summary", expect.any(Object));
  });

  it("toggles summary widget on and off without blocking input UI", async () => {
    const pi = makePi();
    summaryMode(pi);
    const ctx = makeCtx();
    const cmd = pi.commands.get("toggle-summary");

    await cmd.handler("", ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("summary-mode", expect.any(Function), { placement: "aboveEditor" });
    expect(ctx.ui.notify).toHaveBeenCalledWith("Summary view shown", "info");
    expect(ctx.ui.custom).not.toHaveBeenCalled();

    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Summary view hidden", "info");
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("summary-mode", undefined);
  });

  it("tracks started and finished tools in the live summary state", async () => {
    const pi = makePi();
    summaryMode(pi);
    const ctx = makeCtx();
    const sessionStart = pi.events.get("session_start")?.[0];
    const toolStart = pi.events.get("tool_execution_start")?.[0];
    const toolEnd = pi.events.get("tool_execution_end")?.[0];
    const input = pi.events.get("input")?.[0];
    const cmd = pi.commands.get("toggle-summary");

    await sessionStart({}, ctx);
    await cmd.handler("", ctx);
    await input({ text: "build summary mode" });
    await toolStart({ toolName: "read" });
    await toolEnd({ toolName: "read", details: { path: "extensions/summary-mode.ts" } });

    const renderFactory = ctx.ui.setWidget.mock.calls.find((call: any[]) => call[0] === "summary-mode" && typeof call[1] === "function")?.[1];
    const widget = renderFactory({}, { fg: (_c: string, t: string) => t, bold: (t: string) => t });
    const lines = widget.render(100).join("\n");

    expect(lines).toContain("Started read");
    expect(lines).toContain("Finished read");
    expect(lines).toMatch(/Started read \((just now|\d+s ago)\)/);
    expect(lines).toMatch(/Finished read \((just now|\d+s ago)\)/);
    expect(lines).toContain("Touched summary-mode.ts");
    expect(lines).toContain("Asked: build");
    expect(lines).toContain("summary mode");
  });
});
