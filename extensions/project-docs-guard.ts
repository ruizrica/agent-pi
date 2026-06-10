// ABOUTME: Doc-freshness guard for projects onboarded with the toolkit doc pack.
// ABOUTME: On session start/end, runs toolkit doc-sync.sh check and surfaces staleness hints.
/**
 * Project Docs Guard — pi layer of the 3-layer doc-freshness system
 * (git hooks + Claude Stop hook + this pi session guard).
 *
 * If the cwd contains the onboarding doc pack (AGENTS.md + STATE.md), runs the
 * shared toolkit doc-sync.sh staleness check at session boundaries and shows
 * any warnings as a notification so STATE.md/DESIGN.md stay current.
 *
 * Usage: loaded automatically via the agent-pi package extensions directory.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DOC_SYNC = join(
	homedir(),
	"Workshop/GitHub/agent-toolkit/plugins/toolkit/scripts/doc-sync.sh",
);

function hasDocPack(cwd: string): boolean {
	return existsSync(join(cwd, "AGENTS.md")) && existsSync(join(cwd, "STATE.md"));
}

function runCheck(cwd: string): Promise<string> {
	return new Promise((resolvePromise) => {
		if (!existsSync(DOC_SYNC)) return resolvePromise("");
		execFile("bash", [DOC_SYNC, "check"], { cwd, timeout: 10_000 }, (_err, _stdout, stderr) => {
			resolvePromise((stderr ?? "").trim());
		});
	});
}

export default function (pi: ExtensionAPI) {
	let warned = false;

	const check = async (ctx: ExtensionContext) => {
		const cwd = process.cwd();
		if (!hasDocPack(cwd)) return;
		const warnings = await runCheck(cwd);
		if (warnings && !warned) {
			warned = true;
			ctx.ui?.notify?.(`Doc freshness: ${warnings.split("\n")[0]}`, "warning");
		}
	};

	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		await check(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx: ExtensionContext) => {
		warned = false;
		await check(ctx);
	});
}
