// ABOUTME: End-to-end contract test that exercises the real `cmd` binary against an isolated
// ABOUTME: state directory (CMD_STATE_DIR + CMD_BACKEND=mock). Asserts the success/rejection
// ABOUTME: shapes that Pi's bridge depends on, per docs/adr/0001-cmd-contract.md. Skipped when
// ABOUTME: cmd isn't on PATH so unrelated CI runs aren't tripped by environment.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cmdAvailable(): boolean {
	const r = spawnSync("which", ["cmd"], { encoding: "utf-8" });
	return r.status === 0 && !!r.stdout.trim();
}

const SHOULD_RUN = cmdAvailable();
const describeMaybe = SHOULD_RUN ? describe : describe.skip;

interface IsolatedEnv {
	stateDir: string;
	workdir: string;
	env: NodeJS.ProcessEnv;
}

function makeIsolatedEnv(): IsolatedEnv {
	const root = mkdtempSync(join(tmpdir(), "pi-cmd-contract-"));
	const stateDir = join(root, "state");
	const workdir = join(root, "project");
	mkdirSync(stateDir, { recursive: true });
	mkdirSync(workdir, { recursive: true });
	// Initialize a minimal .beads/ marker so cmd treats this cwd as a project
	// when CMD_BACKEND=mock; the JSON adapter creates the project on first
	// task add, so we only need a stable workdir, not a real bd database.
	return {
		stateDir,
		workdir,
		env: {
			...process.env,
			CMD_STATE_DIR: stateDir,
			CMD_BACKEND: "mock",
			COMMANDER_CMD_BIN: undefined as unknown as string,
			NO_COLOR: "1",
		},
	};
}

function runCmd(env: IsolatedEnv, args: string[]): { stdout: string; status: number } {
	const r = spawnSync("cmd", args, {
		cwd: env.workdir,
		env: env.env,
		encoding: "utf-8",
	});
	return { stdout: String(r.stdout ?? ""), status: r.status ?? 0 };
}

/**
 * cmd whoami/task add emit a leading bd_exec telemetry line before the JSON
 * payload. This slices from the first '{' so JSON.parse succeeds.
 */
function sliceJson(stdout: string): string {
	const i = stdout.indexOf("{");
	return i === -1 ? stdout : stdout.slice(i);
}

describeMaybe("cmd contract — integration (real subprocess, isolated state)", () => {
	let env: IsolatedEnv;

	beforeAll(() => {
		env = makeIsolatedEnv();
	});

	afterAll(() => {
		if (env?.stateDir) {
			try { rmSync(env.stateDir.replace(/\/state$/, ""), { recursive: true, force: true }); } catch {}
		}
	});

	it("isolated state directory does not point at ~/.commander", () => {
		// Guard: if this assertion fails, the test is about to clobber real state.
		expect(env.stateDir).not.toContain(".commander");
		expect(env.env.CMD_STATE_DIR).toBe(env.stateDir);
	});

	it("`cmd task add` (root) returns the success shape Pi depends on", () => {
		const r = runCmd(env, [
			"task", "add",
			"Initial contract probe",
			"--mission-brief", "Probe the cmd success shape so Pi's bridge stays accurate.",
			"--runtime", "pi",
			"--model", "contract-test",
			"--json",
			"--no-color",
			"--no-banner",
		]);
		expect(r.status).toBe(0);
		const payload = JSON.parse(sliceJson(r.stdout));
		// These are the four fields Pi reads from a successful root task add:
		expect(typeof payload.id).toBe("number");
		expect(typeof payload.bead_id).toBe("string");
		expect(payload.bead_id.length).toBeGreaterThan(0);
		expect(typeof payload.status).toBe("string");
		expect(typeof payload.title).toBe("string");
	});

	it("`cmd task add --parent <id>` with non-CodeRabbit description returns the rejection shape", () => {
		// Build a parent first so the child has a target.
		const parent = JSON.parse(sliceJson(runCmd(env, [
			"task", "add",
			"Parent for rejection probe",
			"--mission-brief", "Anchor a parent so we can attempt a deliberately bad child.",
			"--runtime", "pi",
			"--model", "contract-test",
			"--json",
			"--no-color",
			"--no-banner",
		]).stdout));

		// Deliberately invalid: prose description, no required body sections.
		const r = runCmd(env, [
			"task", "add",
			"this is not CodeRabbit form",
			"--parent", String(parent.id),
			"--runtime", "pi",
			"--model", "contract-test",
			"--json",
			"--no-color",
			"--no-banner",
		]);
		// cmd exits non-zero on rejection but the JSON is on stdout.
		const payload = JSON.parse(sliceJson(r.stdout));
		// These are the fields Pi's CmdRejectionError relies on:
		expect(payload.error).toBeDefined();
		expect(typeof payload.error).toBe("string");
		// The specific token Pi's code-path checks for:
		expect(["task_registration_rejected", "wrapper_task_blocked"]).toContain(payload.error);
	});

	it("`cmd whoami --json` exposes project.id (the field project-pointer-sync reads)", () => {
		const r = runCmd(env, ["whoami", "--json", "--no-color", "--no-banner"]);
		expect(r.status).toBe(0);
		const payload = JSON.parse(sliceJson(r.stdout));
		expect(payload.project).toBeDefined();
		// project.id may be null on a brand-new state dir until a task lands —
		// the shape (presence of the project field) is what Pi depends on.
		const id = payload.project?.id;
		expect(id === null || typeof id === "number").toBe(true);
	});
});

// Always-run smoke so a skipped suite is loud about the reason.
describe("cmd contract — integration availability", () => {
	it("reports whether the test ran or was skipped (cmd on PATH check)", () => {
		// This test exists so a fully-skipped run still surfaces a single
		// passing assertion explaining why; CI logs will show the message.
		if (!SHOULD_RUN) {
			// eslint-disable-next-line no-console
			console.warn("[cmd-contract-integration] SKIPPED — `cmd` not on PATH");
		}
		expect(typeof SHOULD_RUN).toBe("boolean");
	});
});
