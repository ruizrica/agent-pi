// ABOUTME: Safe port scan wrapper around nmap with strict local/private scope checks and conservative defaults.
// ABOUTME: Refuses public targets, arbitrary flags, and aggressive scanning behavior.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";
import net from "node:net";
import { execFile } from "node:child_process";

const DEFAULT_PORTS = "22,53,80,123,135,139,443,445,3000,3389,5000,8000,8080,8443";

function execFileAsync(command: string, args: string[], timeout = 15000): Promise<{ stdout: string; stderr: string }> {
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

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd");
}

function validateTarget(target: string): { ok: boolean; reason?: string } {
  if (!target || /\s/.test(target)) return { ok: false, reason: "Target is required and must not contain whitespace." };
  if (/[a-z]/i.test(target) && net.isIP(target) === 0) {
    return { ok: false, reason: "Only literal IP addresses are allowed. Hostnames and domains are refused for safety." };
  }
  const ipVersion = net.isIP(target);
  if (ipVersion === 4 && isPrivateIpv4(target)) return { ok: true };
  if (ipVersion === 6 && isPrivateIpv6(target)) return { ok: true };
  return { ok: false, reason: "Target must be loopback or a private local-network IP address." };
}

function validatePorts(ports: string): { ok: boolean; reason?: string } {
  if (!ports) return { ok: true };
  if (!/^\d+(,\d+)*$/.test(ports)) {
    return { ok: false, reason: "Ports must be a comma-separated allowlist like 22,80,443." };
  }
  const values = ports.split(",").map((p) => Number(p));
  if (values.length > 25) return { ok: false, reason: "Too many ports requested. Maximum 25 ports per safe scan." };
  if (values.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) {
    return { ok: false, reason: "Ports must be valid integers between 1 and 65535." };
  }
  return { ok: true };
}

function parseGNmap(stdout: string): Array<{ host: string; openPorts: string[] }> {
  const lines = stdout.split(/\r?\n/);
  const results: Array<{ host: string; openPorts: string[] }> = [];
  for (const line of lines) {
    if (!line.startsWith("Host:")) continue;
    const hostMatch = line.match(/^Host:\s+(\S+)/);
    const portsMatch = line.match(/Ports:\s+(.+)$/);
    const portsField = portsMatch?.[1] || "";
    const openPorts = portsField
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.includes("/open/"))
      .map((entry) => entry.split("/")[0]);
    results.push({ host: hostMatch?.[1] || "unknown", openPorts });
  }
  return results;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "safe_port_scan",
    label: "Safe Port Scan",
    description: "Safe, low-impact local port analysis using a guarded nmap wrapper. Only loopback and private IP targets are allowed. Aggressive flags, public targets, hostnames, and arbitrary options are refused.",
    parameters: Type.Object({
      target: Type.String({ description: "Literal loopback or private IP address to scan." }),
      ports: Type.Optional(Type.String({ description: "Comma-separated allowlist of ports. Defaults to a small common set." })),
      dry_run: Type.Optional(Type.Boolean({ description: "If true, return the bounded command template without executing it." })),
    }),
    async execute(_toolCallId, params) {
      const target = typeof (params as any).target === "string" ? (params as any).target.trim() : "";
      const ports = typeof (params as any).ports === "string" ? (params as any).ports.trim() : DEFAULT_PORTS;
      const dryRun = Boolean((params as any).dry_run);

      const targetCheck = validateTarget(target);
      if (!targetCheck.ok) {
        return {
          content: [{ type: "text" as const, text: `Refused: ${targetCheck.reason}` }],
          details: { error: "invalid_target", reason: targetCheck.reason },
        };
      }

      const portCheck = validatePorts(ports);
      if (!portCheck.ok) {
        return {
          content: [{ type: "text" as const, text: `Refused: ${portCheck.reason}` }],
          details: { error: "invalid_ports", reason: portCheck.reason },
        };
      }

      const args = [
        "-Pn",
        "-n",
        "-T2",
        "--max-rate", "10",
        "--scan-delay", "1s",
        "--max-retries", "1",
        "--host-timeout", "30s",
        "--reason",
        "--open",
        "-p", ports,
        "-oG", "-",
        target,
      ];

      const commandPreview = `nmap ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`;

      if (dryRun) {
        return {
          content: [{ type: "text" as const, text: `Dry run only. Safe command template:\n\n${commandPreview}` }],
          details: { dryRun: true, commandPreview, target, ports },
        };
      }

      try {
        const result = await execFileAsync("nmap", args, 35000);
        const parsed = parseGNmap(result.stdout);
        const summary = parsed.length === 0
          ? "No open ports found within the bounded safe-scan profile."
          : parsed.map((entry) => `- ${entry.host}: ${entry.openPorts.length ? entry.openPorts.join(", ") : "no open ports reported"}`).join("\n");
        return {
          content: [{ type: "text" as const, text: `Safe port scan complete for ${target}.\n\n${summary}` }],
          details: { target, ports, commandPreview, parsed },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `safe_port_scan failed: ${error.message}` }],
          details: { error: error.message, target, commandPreview },
        };
      }
    },
    renderCall(args, theme) {
      const p = args as any;
      return new Text(theme.fg("toolTitle", theme.bold("safe_port_scan ")) + theme.fg("accent", p.target || ""), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as any;
      if (details?.error) return new Text(theme.fg("error", `safe_port_scan error: ${details.error}`), 0, 0);
      if (details?.dryRun) return new Text(theme.fg("accent", "safe_port_scan dry run"), 0, 0);
      return new Text(theme.fg("success", "safe_port_scan complete"), 0, 0);
    },
  });
}
