// ABOUTME: Guarded passive local network inspection tool with interface/listener discovery and bounded capture summaries.
// ABOUTME: Uses safe system command wrappers and refuses invasive or privileged escalation behavior.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import os from "node:os";
import { execFile } from "node:child_process";

function execFileAsync(command: string, args: string[], timeout = 10000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, encoding: "utf-8", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function localInterfaces() {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces).map(([name, addrs]) => ({
    name,
    addresses: (addrs || []).map((addr) => ({
      family: addr.family,
      address: addr.address,
      internal: addr.internal,
      mac: addr.mac,
      cidr: addr.cidr,
    })),
  }));
}

function isSafeInterface(name: string): boolean {
  return /^[a-zA-Z0-9_.:-]+$/.test(name);
}

function normalizeAction(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function listListeners(): Promise<string> {
  try {
    const result = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], 10000);
    return result.stdout.trim();
  } catch {
    const result = await execFileAsync("netstat", ["-an"], 10000);
    return result.stdout.trim();
  }
}

async function captureSummary(iface: string, seconds: number, packetCount: number): Promise<string> {
  if (!isSafeInterface(iface)) throw new Error("Invalid interface name.");
  const args = ["-i", iface, "-nn", "-p", "-q", "-c", String(packetCount)];
  const timeoutMs = Math.max(1000, seconds * 1000);
  const result = await execFileAsync("tcpdump", args, timeoutMs);
  return result.stdout.trim() || result.stderr.trim();
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "network_inspect",
    label: "Network Inspect",
    description: "Passive local network inspection with safe actions only: interface inventory, listener inventory, and bounded capture summaries. No privilege escalation or invasive scanning is performed.",
    parameters: Type.Object({
      action: Type.String({ description: "Action to perform: interfaces, listeners, capture_summary" }),
      interface: Type.Optional(Type.String({ description: "Interface name for capture_summary. Prefer loopback/authorized local interfaces only." })),
      seconds: Type.Optional(Type.Number({ description: "Bounded capture duration hint in seconds (default 3, max 10)." })),
      packet_count: Type.Optional(Type.Number({ description: "Maximum packets to summarize (default 10, max 50)." })),
    }),
    async execute(_toolCallId, params) {
      const action = normalizeAction((params as any).action);
      const iface = typeof (params as any).interface === "string" ? (params as any).interface.trim() : "";
      const seconds = Math.max(1, Math.min(10, Number((params as any).seconds) || 3));
      const packetCount = Math.max(1, Math.min(50, Number((params as any).packet_count) || 10));

      try {
        if (action === "interfaces") {
          const items = localInterfaces();
          const text = [
            "Local interfaces:",
            "",
            ...items.map((item) => `- ${item.name}\n${item.addresses.map((a) => `  ${a.family} ${a.address}${a.internal ? " (internal)" : ""}${a.cidr ? ` ${a.cidr}` : ""}`).join("\n")}`),
          ].join("\n");
          return { content: [{ type: "text" as const, text }], details: { action, count: items.length, items } };
        }

        if (action === "listeners") {
          const output = await listListeners();
          return {
            content: [{ type: "text" as const, text: `Local listening sockets:\n\n${output || "No listeners found."}` }],
            details: { action, output },
          };
        }

        if (action === "capture_summary") {
          if (!iface) {
            return {
              content: [{ type: "text" as const, text: "capture_summary requires an interface name. Use the interfaces action first and prefer loopback or an explicitly authorized local interface." }],
              details: { error: "missing_interface" },
            };
          }
          const output = await captureSummary(iface, seconds, packetCount);
          return {
            content: [{ type: "text" as const, text: `Passive capture summary (${iface}, up to ${packetCount} packets):\n\n${output || "No packets captured within the bounded window."}` }],
            details: { action, interface: iface, seconds, packetCount, output },
          };
        }

        return {
          content: [{ type: "text" as const, text: `Unknown action: ${action}. Use interfaces, listeners, or capture_summary.` }],
          details: { error: "invalid_action" },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `network_inspect failed: ${error.message}` }],
          details: { action, error: error.message },
        };
      }
    },
    renderCall(args, theme) {
      const p = args as any;
      return new Text(theme.fg("toolTitle", theme.bold("network_inspect ")) + theme.fg("accent", p.action || ""), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as any;
      if (details?.error) return new Text(theme.fg("error", `network_inspect error: ${details.error}`), 0, 0);
      return new Text(theme.fg("success", `network_inspect ${details?.action || "done"}`), 0, 0);
    },
  });
}
