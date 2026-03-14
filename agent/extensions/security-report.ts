// ABOUTME: Dedicated browser viewer for network/security analysis reports.
// ABOUTME: Renders structured defensive security assessments with findings, mitigations, and source sections.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { generateSecurityReportHTML, type SecurityReportData, type SecurityReportFinding } from "./lib/security-report-html.ts";
import { upsertPersistedReport } from "./lib/report-index.ts";
import { registerActiveViewer, clearActiveViewer, notifyViewerOpen } from "./lib/viewer-session.ts";

function openBrowser(url: string): void {
  try { execSync(`open \"${url}\"`, { stdio: "ignore" }); } catch {
    try { execSync(`xdg-open \"${url}\"`, { stdio: "ignore" }); } catch {
      try { execSync(`start \"${url}\"`, { stdio: "ignore" }); } catch {}
    }
  }
}

function parseList(value?: string): string[] {
  if (!value) return [];
  return value.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
}

function parseFindings(markdown: string): SecurityReportFinding[] {
  const lines = markdown.split(/\r?\n/);
  const findings: SecurityReportFinding[] = [];
  let current: SecurityReportFinding | null = null;

  for (const line of lines) {
    const findingMatch = line.match(/^[-*]\s+\[(critical|high|medium|low|info)\]\s+(.+)$/i);
    if (findingMatch) {
      if (current) findings.push(current);
      current = {
        severity: findingMatch[1].toLowerCase() as SecurityReportFinding["severity"],
        title: findingMatch[2].trim(),
        category: "general",
      };
      continue;
    }

    if (!current) continue;

    const categoryMatch = line.match(/^\s*category:\s*(.+)$/i);
    if (categoryMatch) {
      current.category = categoryMatch[1].trim();
      continue;
    }

    const evidenceMatch = line.match(/^\s*evidence:\s*(.+)$/i);
    if (evidenceMatch) {
      current.evidence = evidenceMatch[1].trim();
      continue;
    }

    const recMatch = line.match(/^\s*recommendation:\s*(.+)$/i);
    if (recMatch) {
      current.recommendation = recMatch[1].trim();
      continue;
    }
  }

  if (current) findings.push(current);
  return findings;
}

function startServer(report: SecurityReportData): Promise<{ port: number; server: Server; waitForClose: () => Promise<void> }> {
  return new Promise((resolveSetup) => {
    let resolveResult!: () => void;
    const resultPromise = new Promise<void>((resolve) => { resolveResult = resolve; });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(generateSecurityReportHTML(report));
        return;
      }

      if (req.method === "GET" && url.pathname === "/logo.png") {
        try {
          const logoPath = join(dirname(fileURLToPath(import.meta.url)), "assets", "agent-logo.png");
          const logo = readFileSync(logoPath);
          res.writeHead(200, { "Content-Type": "image/png" });
          res.end(logo);
        } catch {
          res.writeHead(404);
          res.end();
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/save") {
        const desktop = join(homedir(), "Desktop");
        if (!existsSync(desktop)) mkdirSync(desktop, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filePath = join(desktop, `security-report-${ts}.html`);
        writeFileSync(filePath, generateSecurityReportHTML(report), "utf-8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: filePath }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/result") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        resolveResult();
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.on("close", () => resolveResult());
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      resolveSetup({ port: addr.port, server, waitForClose: () => resultPromise });
    });
  });
}

export default function (pi: ExtensionAPI) {
  let activeServer: Server | null = null;
  let activeSession: { kind: "report"; title: string; url: string; server: Server; onClose: () => void } | null = null;

  function cleanup() {
    if (activeServer) {
      try { activeServer.close(); } catch {}
      activeServer = null;
    }
    if (activeSession) {
      clearActiveViewer(activeSession);
      activeSession = null;
    }
  }

  pi.registerTool({
    name: "show_security_report",
    label: "Show Security Report",
    description: "Open a dedicated security analysis report viewer for defensive local/network assessments. Supports a summary, findings, mitigations, and sections for intelligence, inspection, and scan results.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Report title" })),
      summary: Type.String({ description: "Executive summary for the report" }),
      scope: Type.Optional(Type.String({ description: "Scope of the assessment" })),
      findings_markdown: Type.Optional(Type.String({ description: "Structured findings in markdown bullets like '- [high] Open service exposure' with optional category/evidence/recommendation lines." })),
      mitigations: Type.Optional(Type.String({ description: "Mitigation list separated by newlines or semicolons" })),
      intelligence: Type.Optional(Type.String({ description: "Threat intelligence section text" })),
      inspection: Type.Optional(Type.String({ description: "Passive inspection section text" })),
      scan: Type.Optional(Type.String({ description: "Port analysis section text" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as any;
      const report: SecurityReportData = {
        title: p.title || "Security Analysis Report",
        summary: p.summary,
        generatedAt: new Date().toISOString(),
        scope: p.scope,
        intelligence: p.intelligence,
        inspection: p.inspection,
        scan: p.scan,
        findings: parseFindings(p.findings_markdown || ""),
        mitigations: parseList(p.mitigations),
      };

      cleanup();
      const { port, server, waitForClose } = await startServer(report);
      activeServer = server;
      const url = `http://127.0.0.1:${port}`;
      activeSession = {
        kind: "report",
        title: report.title,
        url,
        server,
        onClose: () => {
          activeServer = null;
          activeSession = null;
        },
      };
      registerActiveViewer(activeSession);
      openBrowser(url);
      notifyViewerOpen(ctx, activeSession);

      try {
        await waitForClose();
        try {
          upsertPersistedReport({
            category: "completion",
            title: report.title,
            summary: report.summary,
            sourcePath: join(ctx.cwd || process.cwd(), ".context", "network-security-chain-design.md"),
            viewerPath: join(ctx.cwd || process.cwd(), ".context", "network-security-chain-design.md"),
            viewerLabel: report.title,
            tags: ["security", "report", "network"],
            metadata: {
              scope: report.scope,
              findings: report.findings.length,
              mitigations: report.mitigations.length,
            },
          });
        } catch {}

        return {
          content: [{ type: "text" as const, text: "Security analysis report closed." }],
          details: { findings: report.findings.length, mitigations: report.mitigations.length },
        };
      } finally {
        cleanup();
      }
    },
    renderCall(args, theme) {
      const p = args as any;
      const text = theme.fg("toolTitle", theme.bold("show_security_report ")) + theme.fg("accent", p.title || "Security Analysis Report");
      return new Text(outputLine(theme, "accent", text), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as any;
      return new Text(outputLine(theme, "success", `Security report closed — ${details?.findings ?? 0} findings`), 0, 0);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    applyExtensionDefaults(import.meta.url, ctx);
  });

  pi.on("session_shutdown", async () => {
    cleanup();
  });
}
