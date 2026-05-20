// ABOUTME: Commander CLI client adapter for Pi's native commander_* tools.
// ABOUTME: Preserves the former callTool-style contract while using the local `cmd` binary.

import { execFile, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveRuntimeLabel, resolveModelName } from "../../agent-identity.js";
import { parseHousekeepDoctorOutput } from "./commander-housekeep.ts";
import { validateChildTaskPayload, validateStatus, CmdContractError } from "./cmd-bridge.ts";

/**
 * Walks up from `cwd` looking for `scripts/cmd` (the project-local wrapper that
 * enforces --mission-brief and auto-inits a missing bd database). Returns the
 * wrapper path if found and executable, else null.
 */
function findCmdWrapper(cwd: string): string | null {
	let dir = cwd;
	while (dir && dir !== "/") {
		const candidate = join(dir, "scripts", "cmd");
		try {
			if (existsSync(candidate)) {
				const mode = statSync(candidate).mode;
				if ((mode & 0o111) !== 0) return candidate;
			}
		} catch {
			// keep walking on stat errors
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

// ── Module-level singleton + availability cache ─────────────────────
// Replaces the old __piCommanderClient/__piCommanderGate globals that
// were set by commander-mcp.ts. Now callers ask the module directly.

let _singleton: CommanderCliClient | null = null;
let _availability: boolean | null = null;

export function getCommanderCliClient(): CommanderCliClient {
	if (!_singleton) _singleton = new CommanderCliClient();
	return _singleton;
}

/**
 * Returns true if the `cmd` binary is on PATH. Result is cached after the
 * first call; pass `force` to re-probe (useful in tests).
 */
export function isCommanderAvailable(force = false): boolean {
	if (_availability !== null && !force) return _availability;
	const bin = process.env.COMMANDER_CMD_BIN || "cmd";
	try {
		const result = spawnSync("which", [bin], { encoding: "utf8" });
		_availability = result.status === 0 && !!result.stdout.trim();
	} catch {
		_availability = false;
	}
	return _availability;
}

export function _resetCommanderClientForTests(): void {
	_singleton = null;
	_availability = null;
}

/** Inject a custom client + availability for tests; pass `null` for client to clear. */
export function _setCommanderClientForTests(client: any | null, available = true): void {
	_singleton = client;
	_availability = available;
}

const DEFAULT_TASK_LIST_LIMIT = 500;

export interface CommanderCliClientOptions {
	bin?: string;
	cwd?: string;
	defaultTimeoutMs?: number;
}

interface ExecResult {
	stdout: string;
	stderr: string;
}

export class CommanderCliClient {
	private connected = false;
	private readonly bin: string;
	private readonly cwd: string;
	private readonly defaultTimeoutMs: number;

	constructor(options: CommanderCliClientOptions = {}) {
		this.cwd = options.cwd || process.cwd();
		this.bin =
			options.bin ||
			process.env.COMMANDER_CMD_BIN ||
			findCmdWrapper(this.cwd) ||
			"cmd";
		this.defaultTimeoutMs = options.defaultTimeoutMs || 8000;
	}

	isConnected(): boolean {
		return this.connected;
	}

	async connect(): Promise<void> {
		await this.run(["task", "list", "--json", "--no-color", "--limit", "1"], 3000);
		this.connected = true;
	}

	disconnect(): void {
		this.connected = false;
	}

	async callTool(toolName: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<any> {
		const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
		let payload: unknown;

		switch (toolName) {
			case "commander_task":
				payload = await this.callTask(params, effectiveTimeout);
				break;
			case "commander_housekeep":
				payload = await this.callHousekeep(params, effectiveTimeout);
				break;
			case "commander_session":
				payload = await this.callSession(params, effectiveTimeout);
				break;
			case "commander_mailbox":
				payload = await this.callMailbox(params, effectiveTimeout);
				break;
			case "commander_dependency":
				payload = await this.callDependency(params, effectiveTimeout);
				break;
			case "commander_orchestration":
				payload = { unsupported: true, tool: toolName, operation: params.operation, agents: [], tasks: [] };
				break;
			default:
				payload = { unsupported: true, tool: toolName, operation: params.operation, error: `${toolName} is not supported by the Commander CLI adapter yet` };
		}

		return this.wrap(payload);
	}

	private async callTask(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const operation = String(params.operation || "list");
		switch (operation) {
			case "list": {
				const args = ["task", "list", "--json", "--no-color"];
				if (params.status) args.push("--status", String(params.status));
				args.push("--limit", String(params.limit ?? DEFAULT_TASK_LIST_LIMIT));
				if (params.working_directory === undefined) args.push("--all");
				const rows = await this.runJson(args, timeoutMs, []);
				return { tasks: Array.isArray(rows) ? rows : [] };
			}
			case "get": {
				const id = required(params.task_id, "task_id");
				return normalizeTask(await this.runJson(["task", "show", String(id), "--json", "--no-color"], timeoutMs, {}));
			}
			case "create": {
				const originalDescription = String(required(params.description, "description"));
				const groupId = params.group_id ?? params.groupId;
				const synthetic = groupId !== undefined ? buildSyntheticBoardTaskFields(originalDescription, params) : null;
				// Child tasks (--parent set) hit cmd's CodeRabbit-style description validator.
				// When synthetic-field generation is skipped (caller preset primary_file/body/lifecycle_owner),
				// still normalize a non-CodeRabbit description so the registration is not rejected.
				const presetPrimaryFile = (params.primary_file ?? params.primaryFile) as string | undefined;
				const description =
					synthetic?.description
					?? (groupId !== undefined
						? ensureCodeRabbitDescription(originalDescription, presetPrimaryFile)
						: originalDescription);
				const args = ["task", "add", description, "--json", "--no-color"];
				if (params.status) args.push("--status", String(params.status));
				if (params.priority) args.push("--priority", String(params.priority));
				if (params.title || synthetic?.title) args.push("--title", String(params.title ?? synthetic?.title));
				const missionBrief = params.mission_brief ?? params.missionBrief;
				if (missionBrief) args.push("--mission-brief", String(missionBrief));
				const labels = normalizeLabelsParam(params.labels ?? params.label);
				if (labels) args.push("--labels", labels);
				if (groupId !== undefined) args.push("--parent", String(groupId));
				const primaryFile = params.primary_file ?? params.primaryFile ?? synthetic?.primaryFile;
				if (primaryFile) args.push("--primary-file", String(primaryFile));
				const body = params.body ?? synthetic?.body;
				if (body) args.push("--body", String(body));
				const lifecycleOwner = params.lifecycle_owner ?? params.lifecycleOwner ?? synthetic?.lifecycleOwner;
				if (lifecycleOwner) args.push("--lifecycle-owner", String(lifecycleOwner));
				if (params.accept_lifecycle === true || params.acceptLifecycle === true) args.push("--accept-lifecycle");
				if (params.confirm_wrapper === true || params.confirmWrapper === true || synthetic?.confirmWrapper) args.push("--confirm-wrapper");
				// Fix 3 / Option 3: validate the cmd contract BEFORE spawning subprocess.
				// commander-v2's task-registration validator enforces CodeRabbit-style
				// descriptions + required body sections (## Steps/## Tests/## References)
				// on every --parent task. Failing here gives a typed CmdContractError
				// instead of a silent task_registration_rejected response.
				if (groupId !== undefined) {
					const bodyText = String(body ?? "");
					const violations = validateChildTaskPayload(description, bodyText);
					if (violations.length > 0) {
						throw new CmdContractError(violations,
							`Cmd contract violation on child task add: ${violations.map((v) => v.kind === "description-format" ? `description not CodeRabbit-form (got: ${v.got.slice(0, 60)}...)` : `body missing section: ${v.section}`).join(" | ")}`,
						);
					}
				}
				const created = normalizeTask(await this.runJson(args, timeoutMs, {}));
				return { ...created, task_id: Number((created as any).task_id ?? (created as any).id) };
			}
			case "update": {
				const id = required(params.task_id, "task_id");
				// Fix 3 / Option 3 (extended): validate status against commander-v2's
				// STATUS_ALIAS set BEFORE spawning subprocess. Covers update + the
				// claim/complete/fail/cancel aliases below (all route through here).
				if (params.status !== undefined) {
					const statusViolations = validateStatus(String(params.status));
					if (statusViolations.length > 0) {
						throw new CmdContractError(statusViolations,
							`Cmd contract violation on task update: unknown status "${String(params.status)}" (not in commander-v2 STATUS_ALIAS)`,
						);
					}
				}
				const args = ["task", "update", String(id), "--json", "--no-color"];
				if (params.status) args.push("--status", String(params.status));
				if (params.priority) args.push("--priority", String(params.priority));
				if (params.description) args.push("--description", String(params.description));
				if (params.title) args.push("--title", String(params.title));
				const updated = await this.runJson(args, timeoutMs, {});
				return { ...normalizeTask(updated), task_id: Number((updated as any).task_id ?? (updated as any).id ?? id) };
			}
			case "claim":
				return this.callTask({ operation: "update", task_id: params.task_id, status: "working" }, timeoutMs);
			case "complete":
				return this.callTask({ operation: "update", task_id: params.task_id, status: "completed" }, timeoutMs);
			case "fail":
				return this.callTask({ operation: "update", task_id: params.task_id, status: "failed" }, timeoutMs);
			case "group:create":
				return this.createTaskGroup(params, timeoutMs);
			case "group:list":
				return { groups: [] };
			case "comment:add": {
				const id = required(params.task_id, "task_id");
				const body = String(params.body ?? params.message ?? required(params.comment, "comment"));
				const type = String(params.type || "progress");
				await this.run(["task", "comment", String(id), body, "--type", type], timeoutMs);
				return { task_id: id, commented: true, type };
			}
			case "comment:list": {
				const id = required(params.task_id, "task_id");
				const comments = await this.runJson(["task", "comments", String(id), "--json", "--no-color"], timeoutMs, []);
				return { task_id: id, comments };
			}
			case "log": {
				const id = required(params.task_id, "task_id");
				const body = String(params.message ?? params.body ?? required(params.comment, "comment"));
				await this.run(["task", "comment", String(id), body, "--type", "progress"], timeoutMs);
				return { task_id: id, logged: true };
			}
			default:
				return { unsupported: true, tool: "commander_task", operation, error: `Unsupported commander_task operation: ${operation}` };
		}
	}

	private async createTaskGroup(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const groupName = String(required(params.group_name, "group_name"));
		const summary = String(params.initiative_summary || groupName);
		const groupLabels = normalizeLabelsArray(params.labels ?? params.label);
		const primaryFile = params.primary_file ?? params.primaryFile ?? ".";
		const body = params.body ?? buildTaskBody({
			description: summary,
			primaryFile: String(primaryFile),
			source: "Commander group created from Pi approval materialization.",
		});
		// Pi's initiative_summary is the mission brief shown in the Pi CLI task surfaces.
		const parent = await this.callTask({
			operation: "create",
			description: summary,
			title: groupName,
			mission_brief: summary,
			labels: ["initiative-root", ...groupLabels],
			status: "pending",
			primary_file: primaryFile,
			body,
			lifecycle_owner: params.lifecycle_owner ?? params.lifecycleOwner ?? "self",
			confirm_wrapper: params.confirm_wrapper ?? params.confirmWrapper ?? true,
		}, timeoutMs) as any;
		const groupId = Number(parent.task_id ?? parent.id);
		// Phase 3.0 (contract owner): refuse to return a partial group. If the parent's
		// id is missing/NaN, fail loudly so callers see the actual cmd response shape
		// instead of silently mapping local task #1 → groupId-undefined and hanging on
		// "Commander sync pending forever".
		if (!Number.isFinite(groupId)) {
			throw new Error(
				`group:create atomicity: parent response missing id/task_id — cmd returned: ${JSON.stringify(parent)}`,
			);
		}
		const tasks = Array.isArray(params.tasks) ? params.tasks as any[] : [];
		const taskIds: number[] = [];
		for (const task of tasks) {
			const description = String(task?.description || task?.task_prompt || summary);
			const created = await this.callTask({
				operation: "create",
				description,
				status: task?.status ?? "pending",
				group_id: groupId,
				title: task?.title ?? truncateForTitle(description),
				labels: task?.labels ?? task?.label,
				primary_file: task?.primary_file ?? task?.primaryFile ?? primaryFile,
				body: task?.body ?? buildTaskBody({
					description,
					primaryFile: String(task?.primary_file ?? task?.primaryFile ?? primaryFile),
					source: "Commander child task created from Pi approval materialization.",
				}),
				lifecycle_owner: task?.lifecycle_owner ?? task?.lifecycleOwner ?? "self",
				confirm_wrapper: task?.confirm_wrapper ?? task?.confirmWrapper ?? true,
			}, timeoutMs) as any;
			const id = Number(created.task_id ?? created.id);
			// Phase 3.0: if a child create returns without a usable id, throw immediately
			// with the actual response. Previously this skipped silently and produced a
			// partial { group_id, task_ids: [shorter] } that Pi mapped to "groupId set but
			// no mappings", which is what created the "pending forever" toggle bug.
			if (!Number.isFinite(id)) {
				throw new Error(
					`group:create atomicity: child task_id missing for "${truncateForTitle(description)}" — cmd returned: ${JSON.stringify(created)}`,
				);
			}
			taskIds.push(id);
		}
		return { group_id: groupId, task_ids: taskIds, emulated: true };
	}

	private async callSession(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const operation = String(params.operation || "list");
		if (operation === "list" || operation === "cleanup:status") {
			await this.run(["session", "list", "--json", "--no-color"], timeoutMs).catch(() => ({ stdout: "", stderr: "" }));
			return { sessions: [] };
		}
		if (operation === "cleanup:self" || operation === "cleanup:stale") return { ok: true, noop: true };
		return { unsupported: true, tool: "commander_session", operation, error: `Unsupported commander_session operation: ${operation}` };
	}

	private async callMailbox(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const operation = String(params.operation || "inbox");
		if (operation === "send") {
			const to = String(required(params.to_agent, "to_agent"));
			const subject = String(params.message_type || "status");
			const body = `${params.from_agent ? `From: ${params.from_agent}\n` : ""}${params.body || ""}`;
			await this.run(["mailbox", "send", to, subject, body], timeoutMs);
			return { sent: true };
		}
		if (operation === "inbox") {
			await this.run(["mailbox", "inbox", "--json", "--no-color"], timeoutMs).catch(() => ({ stdout: "", stderr: "" }));
			return { messages: [] };
		}
		if (operation === "read") {
			const id = required(params.message_id, "message_id");
			const res = await this.run(["mailbox", "read", String(id), "--no-color"], timeoutMs);
			return { text: res.stdout.trim() };
		}
		return { unsupported: true, tool: "commander_mailbox", operation, error: `Unsupported commander_mailbox operation: ${operation}` };
	}

	private async callHousekeep(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const operation = String(params.operation || "doctor");
		if (operation === "doctor") {
			const res = await this.runPlain(["housekeep", "--doctor", "--no-color", "--no-banner"], timeoutMs).catch((err: any) => ({ stdout: err?.cmdStdout || "", stderr: err?.cmdStderr || String(err) }));
			const raw = `${res.stdout || ""}\n${res.stderr || ""}`.trim();
			return parseHousekeepDoctorOutput(raw);
		}
		if (operation === "reap:stale-claims") {
			const args = ["housekeep", "--reap-stale-claims", "--no-color"];
			if (params.dry_run !== false && params.dryRun !== false) args.push("--dry-run");
			const res = await this.runPlain(args, timeoutMs).catch((err: any) => ({ stdout: err?.cmdStdout || "", stderr: err?.cmdStderr || String(err) }));
			return { raw: `${res.stdout || ""}\n${res.stderr || ""}`.trim() };
		}
		if (operation === "reap:orphan-writers") {
			const args = ["housekeep", "--reap-orphan-writers", "--no-color"];
			if (params.dry_run !== false && params.dryRun !== false) args.push("--dry-run");
			const res = await this.runPlain(args, timeoutMs).catch((err: any) => ({ stdout: err?.cmdStdout || "", stderr: err?.cmdStderr || String(err) }));
			return { raw: `${res.stdout || ""}\n${res.stderr || ""}`.trim() };
		}
		return { unsupported: true, tool: "commander_housekeep", operation, error: `Unsupported commander_housekeep operation: ${operation}` };
	}

	private async callDependency(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const operation = String(params.operation || "list");
		if (operation === "blockers") {
			const taskId = required(params.task_id, "task_id");
			await this.run(["dep", "blockers", String(taskId), "--no-color"], timeoutMs).catch(() => ({ stdout: "", stderr: "" }));
			return { tasks: [] };
		}
		if (operation === "ready_tasks") return { tasks: [] };
		return { unsupported: true, tool: "commander_dependency", operation, error: `Unsupported commander_dependency operation: ${operation}` };
	}

	private async runJson(args: string[], timeoutMs: number, fallback: unknown): Promise<unknown> {
		const { stdout } = await this.run(args, timeoutMs);
		const trimmed = stdout.trim();
		if (!trimmed) return fallback;
		return JSON.parse(trimmed);
	}

	private withIdentity(args: string[]): string[] {
		if (args.includes("--runtime")) {
			return args;  // caller already declared identity
		}
		const idx = Math.min(2, args.length);  // insert after subcommand + sub-subcommand
		return [
			...args.slice(0, idx),
			"--runtime", resolveRuntimeLabel(),
			"--model",   resolveModelName(),
			...args.slice(idx),
		];
	}

	private run(args: string[], timeoutMs = this.defaultTimeoutMs): Promise<ExecResult> {
		return this.runCommand(this.withIdentity(args), timeoutMs);
	}

	private runPlain(args: string[], timeoutMs = this.defaultTimeoutMs): Promise<ExecResult> {
		return this.runCommand(args, timeoutMs);
	}

	private runCommand(finalArgs: string[], timeoutMs = this.defaultTimeoutMs): Promise<ExecResult> {
		// Skip the bd-adapter's `bd list --all` preflight dedupe (~1.4s/call) on every
		// cmd invocation. Pi never relies on commander-v2's fingerprint-based duplicate
		// detection — group:create batches make N+1 sequential creates and the preflight
		// dominates the in-flight window. Opt-out for debugging via PI_CMD_KEEP_PREFLIGHT.
		// See commander-v2 commit 9bfb62b (2026-05-19) for the upstream opt-out flag.
		const childEnv: NodeJS.ProcessEnv = { ...process.env };
		if (!process.env.PI_CMD_KEEP_PREFLIGHT) {
			childEnv.CMD_SKIP_DUPLICATE_PREFLIGHT = "1";
		}
		return new Promise((resolve, reject) => {
			execFile(this.bin, finalArgs, { cwd: this.cwd, timeout: timeoutMs, encoding: "utf8", env: childEnv }, (error, stdout, stderr) => {
				if (error) {
					const subcommand = finalArgs.slice(0, 2).join(" ") || "(no args)";
					// Surface the real failure shape (signal/code/killed) instead of dumping
					// captured stderr — `diag.ts` writes NDJSON telemetry to stderr unconditionally,
					// so `stderr.trim()` is almost never the actual cause of an execFile rejection.
					const e = error as NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals | null; code?: string | number };
					const cause =
						e.killed ? `killed (${e.signal ?? "SIGTERM"}, timeout=${timeoutMs}ms)`
						: e.signal ? `signal ${e.signal}`
						: e.code !== undefined ? `exit ${e.code}`
						: e.message;
					const telemetry = stderr?.trim();
					const msg = telemetry
						? `cmd ${subcommand} failed: ${cause}\n--- subprocess telemetry (stderr) ---\n${telemetry}`
						: `cmd ${subcommand} failed: ${cause}`;
					const wrapped = new Error(msg);
					(wrapped as any).cmdArgs = finalArgs;
					(wrapped as any).cmdExitCode = e.code ?? null;
					(wrapped as any).cmdSignal = e.signal ?? null;
					(wrapped as any).cmdKilled = e.killed ?? false;
					(wrapped as any).cmdStderr = stderr ?? "";
					(wrapped as any).cmdStdout = stdout ?? "";
					reject(wrapped);
					return;
				}
				resolve({ stdout: stdout || "", stderr: stderr || "" });
			});
		});
	}

	private wrap(payload: unknown): any {
		return { content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload) }] };
	}
}

function required(value: unknown, name: string): unknown {
	if (value === undefined || value === null || value === "") throw new Error(`${name} is required`);
	return value;
}

function normalizeLabelsArray(value: unknown): string[] {
	if (value === undefined || value === null || value === "") return [];
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
	return String(value).split(",").map((v) => v.trim()).filter(Boolean);
}

function normalizeLabelsParam(value: unknown): string | undefined {
	const labels = normalizeLabelsArray(value);
	return labels.length > 0 ? labels.join(",") : undefined;
}

function truncateForTitle(value: string): string {
	const compact = value.replace(/\s+/g, " ").trim() || "Local task";
	return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function sanitizeSentence(value: string): string {
	return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").replace(/[.;]+$/g, "").trim() || "local task";
}

function buildTaskBody(options: { description: string; primaryFile: string; source: string }): string {
	return `## Steps\n1. Complete the requested work: ${sanitizeSentence(options.description)}\n\n## Tests\n- Verify the task is complete and the Commander board status stays in sync.\n\n## References\n- Primary file: ${options.primaryFile}\n- ${options.source}`;
}

function buildSyntheticBoardTaskFields(description: string, params: Record<string, unknown>) {
	if (params.primary_file || params.primaryFile || params.body || params.lifecycle_owner || params.lifecycleOwner) return null;
	const title = truncateForTitle(String(params.title || description));
	const cleanDescription = sanitizeSentence(description);
	return {
		title,
		description: `In . around lines 1-1, local task requires execution: ${cleanDescription}; complete the requested local task.`,
		primaryFile: ".",
		body: `## Steps\n1. Complete the local Pi task: ${cleanDescription}\n\n## Tests\n- Verify the local Pi task is marked done and the Commander board status stays in sync.\n\n## References\n- Generated from Pi local task discipline sync.`,
		lifecycleOwner: "self",
		confirmWrapper: true,
	};
}

// Mirrors cli/cmd/src/task-registration/validate.ts CODERABBIT_DESCRIPTION_RE.
const CODERABBIT_DESCRIPTION_RE = /^In\s+\S+\s+around\s+lines\s+\d+\s*-\s*\d+,\s+.+;\s+.+\.?$/i;

function ensureCodeRabbitDescription(description: string, primaryFile?: string): string {
	if (CODERABBIT_DESCRIPTION_RE.test(description.trim())) return description;
	const file = primaryFile && primaryFile.trim() ? primaryFile.trim() : ".";
	const cleanDescription = sanitizeSentence(description);
	return `In ${file} around lines 1-1, local task requires execution: ${cleanDescription}; complete the requested local task.`;
}

function normalizeTask(task: any): any {
	if (!task || typeof task !== "object") return task;
	const id = task.task_id ?? task.id;
	return id === undefined ? task : { ...task, task_id: Number(id) };
}
