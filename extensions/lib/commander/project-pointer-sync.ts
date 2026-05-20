// ABOUTME: Aligns the dashboard's currentProjectId with cmd's cwd-resolved project on session_start.
// ABOUTME: commander-v2 fd6ce08 (2026-05-17) made the CLI cwd-blind by switching projectAware to false;
// ABOUTME: this helper reconciles by issuing `cmd project switch <id>` whenever cwd's project differs
// ABOUTME: from the dashboard's pointer. Pure resolver split from subprocess for unit testability.
// ABOUTME: See docs/adr/0001-cmd-contract.md for the cross-repo contract this protects.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Pure helpers (no I/O) ─────────────────────────────────────────────

export interface PointerProbeResult {
	/** Project id resolved from the shell working directory via `cmd whoami --json`. */
	readonly cwdProjectId: number | null;
	/** Project name resolved from cwd; surfaces in user-facing notify text. */
	readonly cwdProjectName: string | null;
	/** Current dashboard pointer read from ~/.commander/mock-state.json. */
	readonly currentProjectId: number | null;
}

export type PointerAction =
	| { readonly kind: "aligned" }
	| { readonly kind: "skip"; readonly reason: string }
	| {
		readonly kind: "switch";
		readonly targetProjectId: number;
		readonly targetProjectName: string | null;
		readonly previousProjectId: number | null;
	};

/**
 * Decide whether the dashboard pointer needs to be retargeted. Pure: takes a
 * probe result, returns an action. The companion alignPointerOnSessionStart
 * is the I/O wrapper.
 */
export function resolveProjectPointerMismatch(probe: PointerProbeResult): PointerAction {
	if (probe.cwdProjectId === null) {
		// cmd whoami didn't surface a project for the cwd — likely a fresh
		// directory with no .beads/ yet. Refuse to silently switch the
		// dashboard; the first `cmd task add` will materialize the project.
		return { kind: "skip", reason: "cwd has no resolvable project" };
	}
	if (probe.currentProjectId === probe.cwdProjectId) {
		return { kind: "aligned" };
	}
	return {
		kind: "switch",
		targetProjectId: probe.cwdProjectId,
		targetProjectName: probe.cwdProjectName,
		previousProjectId: probe.currentProjectId,
	};
}

// ── I/O helpers ───────────────────────────────────────────────────────

/**
 * Read currentProjectId from ~/.commander/mock-state.json. Returns null if
 * the file is absent, unreadable, or lacks the field. Pi treats this as a
 * best-effort probe — a missing dashboard file is not fatal.
 */
export function readMockStateCurrentProjectId(): number | null {
	const path = join(homedir(), ".commander", "mock-state.json");
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw);
		const v = parsed?.currentProjectId;
		return typeof v === "number" ? v : null;
	} catch {
		return null;
	}
}

function runCmd(
	bin: string,
	args: string[],
	timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(bin, args, { timeout: timeoutMs, encoding: "utf-8" }, (err, stdout, stderr) => {
			if (err) {
				reject(err);
				return;
			}
			resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
		});
	});
}

/**
 * Parses the JSON object emitted at the tail of `cmd whoami --json`. cmd
 * prepends an unrelated bd_exec telemetry line; we slice from the first '{'.
 */
function parseWhoamiJson(stdout: string): { id: number | null; name: string | null } {
	const start = stdout.indexOf("{");
	if (start === -1) return { id: null, name: null };
	try {
		const parsed = JSON.parse(stdout.slice(start));
		const id = parsed?.project?.id;
		const name = parsed?.project?.name;
		return {
			id: typeof id === "number" ? id : null,
			name: typeof name === "string" ? name : null,
		};
	} catch {
		return { id: null, name: null };
	}
}

export interface AlignPointerOptions {
	readonly cmdBin?: string;
	readonly timeoutMs?: number;
	readonly readMockStateCurrentProjectId?: () => number | null;
}

/**
 * Reconcile the dashboard pointer with cmd's cwd-resolved project. Safe to
 * call on every session_start: when already aligned it issues a single
 * `cmd whoami --json` and exits. Never throws — telemetry-only on failure.
 */
export async function alignPointerOnSessionStart(
	opts: AlignPointerOptions = {},
): Promise<PointerAction> {
	const bin = opts.cmdBin ?? process.env.COMMANDER_CMD_BIN ?? "cmd";
	const timeoutMs = opts.timeoutMs ?? 5000;
	const readPointer = opts.readMockStateCurrentProjectId ?? readMockStateCurrentProjectId;

	let cwdProjectId: number | null = null;
	let cwdProjectName: string | null = null;
	try {
		const { stdout } = await runCmd(bin, ["whoami", "--json", "--no-color", "--no-banner"], timeoutMs);
		const parsed = parseWhoamiJson(stdout);
		cwdProjectId = parsed.id;
		cwdProjectName = parsed.name;
	} catch (err: any) {
		console.error("[project-pointer-sync] cmd whoami failed:", err?.message || err);
		return { kind: "skip", reason: "cmd whoami unavailable" };
	}

	const action = resolveProjectPointerMismatch({
		cwdProjectId,
		cwdProjectName,
		currentProjectId: readPointer(),
	});

	if (action.kind !== "switch") return action;

	try {
		await runCmd(
			bin,
			["project", "switch", String(action.targetProjectId), "--json", "--no-color", "--no-banner"],
			timeoutMs,
		);
	} catch (err: any) {
		console.error("[project-pointer-sync] cmd project switch failed:", err?.message || err);
		return { kind: "skip", reason: "cmd project switch failed" };
	}

	return action;
}
