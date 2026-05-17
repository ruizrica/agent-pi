// ABOUTME: Stop/start guard for Commander lifecycle recovery.
// ABOUTME: Surfaces cmd housekeep findings and Pi pending lifecycle intents before agents finish.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { getCommanderCliClient, isCommanderAvailable } from "./lib/commander/commander-cli-client.ts";
import { listOpenLifecycleIntents } from "./lib/commander/lifecycle-intents.ts";

function parseWrappedJson(result: any): any | undefined {
	const text = result?.content?.[0]?.text;
	if (typeof text !== "string") return undefined;
	try { return JSON.parse(text); } catch { return undefined; }
}

async function collectLifecycleWarnings(): Promise<string[]> {
	const warnings: string[] = [];
	const intents = listOpenLifecycleIntents();
	if (intents.length > 0) {
		warnings.push(`Pi has ${intents.length} pending Commander lifecycle intent(s): ${intents.map(i => `${i.taskId}:${i.action}`).join(", ")}.`);
	}
	if (isCommanderAvailable()) {
		try {
			const client = getCommanderCliClient();
			const doctor = parseWrappedJson(await client.callTool("commander_housekeep", { operation: "doctor" }, 15_000));
			const findings = Array.isArray(doctor?.findings) ? doctor.findings : [];
			if (findings.length > 0) {
				warnings.push(`cmd housekeep reports ${findings.length} lifecycle finding(s): ${findings.slice(0, 5).map((f: any) => `${f.category}: ${f.line}`).join("; ")}.`);
			}
		} catch {
			// Housekeep is advisory; pending intents still surface recovery requirements.
		}
	}
	return warnings;
}

export default function (pi: ExtensionAPI) {
	let lastAgentEndFingerprint = "";
	let lastAgentEndNotifiedAt = 0;

	function shouldNotifyAgentEnd(warnings: string[]): boolean {
		const fingerprint = warnings.join("\n");
		const now = Date.now();
		if (fingerprint === lastAgentEndFingerprint && now - lastAgentEndNotifiedAt < 60_000) return false;
		lastAgentEndFingerprint = fingerprint;
		lastAgentEndNotifiedAt = now;
		return true;
	}

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		const warnings = await collectLifecycleWarnings();
		if (warnings.length > 0) {
			ctx.ui.notify(`Commander lifecycle recovery needed: ${warnings[0]}`, "warning");
		}
	});

	pi.on("agent_end", async (_event, _ctx) => {
		const warnings = await collectLifecycleWarnings();
		if (warnings.length === 0) {
			lastAgentEndFingerprint = "";
			lastAgentEndNotifiedAt = 0;
			return;
		}
		if (!shouldNotifyAgentEnd(warnings)) return;
		try {
			pi.sendMessage({
				customType: "commander-lifecycle-validation",
				content: `Commander lifecycle responsibilities remain open. Before stopping, resolve them through cmd: add a current task comment/handoff, then complete/fail/cancel/delete or adopt stale work.\n\n${warnings.map(w => `- ${w}`).join("\n")}`,
				display: true,
			}, { triggerTurn: false });
		} catch {
			// Short-lived/replaced sessions can make the extension API stale before
			// this advisory message is delivered. Do not surface lifecycle advice as
			// a startup/shutdown artifact.
		}
	});
}
