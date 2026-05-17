// ABOUTME: Commander CLI client adapter for Pi's native commander_* tools.
// ABOUTME: Preserves the former callTool-style contract while using the local `cmd` binary.

import { execFile, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveRuntimeLabel, resolveModelName } from "../../agent-identity.js";

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
				if (params.limit) args.push("--limit", String(params.limit));
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
				const description = synthetic?.description ?? originalDescription;
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
				const created = normalizeTask(await this.runJson(args, timeoutMs, {}));
				return { ...created, task_id: Number((created as any).task_id ?? (created as any).id) };
			}
			case "update": {
				const id = required(params.task_id, "task_id");
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
			case "comment:add":
			case "comment:list":
			case "log":
				return { unsupported: true, tool: "commander_task", operation, error: `${operation} is not supported by cmd yet` };
			default:
				return { unsupported: true, tool: "commander_task", operation, error: `Unsupported commander_task operation: ${operation}` };
		}
	}

	private async createTaskGroup(params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
		const groupName = String(required(params.group_name, "group_name"));
		const summary = String(params.initiative_summary || groupName);
		// Pi's initiative_summary is the mission brief shown in the Pi CLI task surfaces.
		const parent = await this.callTask({
			operation: "create",
			description: summary,
			title: groupName,
			mission_brief: summary,
			labels: ["initiative-root"],
			status: "pending",
		}, timeoutMs) as any;
		const groupId = Number(parent.task_id ?? parent.id);
		const tasks = Array.isArray(params.tasks) ? params.tasks as any[] : [];
		const taskIds: number[] = [];
		for (const task of tasks) {
			const description = String(task?.description || task?.task_prompt || summary);
			const created = await this.callTask({ operation: "create", description, status: "pending", group_id: groupId }, timeoutMs) as any;
			const id = Number(created.task_id ?? created.id);
			if (Number.isFinite(id)) taskIds.push(id);
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
		return new Promise((resolve, reject) => {
			execFile(this.bin, this.withIdentity(args), { cwd: this.cwd, timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
				if (error) {
					reject(new Error(stderr?.trim() || error.message));
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

function normalizeLabelsParam(value: unknown): string | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (Array.isArray(value)) {
		const labels = value.map((v) => String(v).trim()).filter(Boolean);
		return labels.length > 0 ? labels.join(",") : undefined;
	}
	return String(value);
}

function truncateForTitle(value: string): string {
	const compact = value.replace(/\s+/g, " ").trim() || "Local task";
	return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function sanitizeSentence(value: string): string {
	return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").replace(/[.;]+$/g, "").trim() || "local task";
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

function normalizeTask(task: any): any {
	if (!task || typeof task !== "object") return task;
	const id = task.task_id ?? task.id;
	return id === undefined ? task : { ...task, task_id: Number(id) };
}
