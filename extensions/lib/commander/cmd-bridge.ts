// ABOUTME: Typed contract owner for the cmd CLI (Option 3 / Fix 3).
// ABOUTME: Mirrors commander-v2's task-registration/validate.ts so Pi catches violations
// ABOUTME: at the call site instead of at the subprocess boundary (where they manifest
// ABOUTME: as silent "task_registration_rejected" responses that produce empty task_ids
// ABOUTME: and the "Commander sync pending forever" toggle bug).
//
// Sourced from commander-v2 at SHA 8f34fc3+ (stable-20260517-195411 onwards):
// - cli/cmd/src/task-registration/validate.ts:11 — CODERABBIT_DESCRIPTION_RE
// - cli/cmd/src/task-registration/validate.ts:50-90 — child-task validator
// - cli/cmd/src/commands/task.add.ts:130-189 — success / rejection JSON shapes
//
// When commander-v2 changes its contract, update this file FIRST and let the
// TypeScript compiler tell you every call site that needs to follow.

// ── Validator (mirrors commander-v2's task-registration/validate.ts) ──

// Stable since commander-v2 commit 18122e8 (2026-05-16). Required for every
// `cmd task add --parent <id>` (child task) call. Root tasks are exempt.
export const CODERABBIT_DESCRIPTION_RE =
	/^In\s+\S+\s+around\s+lines\s+\d+\s*-\s*\d+,\s+.+;\s+.+\.?$/i;

// Required body section headings for child tasks. The validator's exact
// behavior is keyword-match anywhere in the body string; we keep the leading
// "## " to avoid false positives on sections named "Steps " elsewhere.
export const REQUIRED_BODY_SECTIONS = ["## Steps", "## Tests", "## References"] as const;

export type TaskRegistrationViolation =
	| { kind: "description-format"; got: string }
	| { kind: "body-missing-section"; section: typeof REQUIRED_BODY_SECTIONS[number] }
	| { kind: "status-invalid"; got: string };

// Pure validator — call from Pi BEFORE issuing the subprocess so violations
// fail loud locally instead of silent at the subprocess boundary. Returns an
// empty array on valid payloads.
export function validateChildTaskPayload(
	description: string,
	body: string,
): TaskRegistrationViolation[] {
	const violations: TaskRegistrationViolation[] = [];
	if (!CODERABBIT_DESCRIPTION_RE.test(description)) {
		violations.push({ kind: "description-format", got: description });
	}
	for (const section of REQUIRED_BODY_SECTIONS) {
		if (!body.includes(section)) {
			violations.push({ kind: "body-missing-section", section });
		}
	}
	return violations;
}

// ── Response types (mirrors commander-v2's task.add.ts JSON output) ──

export interface CmdTaskSuccessResponse {
	id: number;
	bead_id: string;
	description: string;
	mission_brief: string | null;
	title: string;
	primary_file: string | null;
	lifecycle_owner: string | null;
	status: "pending" | "working" | "completed" | "failed" | "cancelled";
	priority: number;
	readiness: string | null;
	identity: Record<string, unknown>;
	synced: string;
}

export interface CmdTaskRejection {
	error: "task_registration_rejected" | "wrapper_task_blocked" | string;
	task_registration_required?: boolean;
	errors?: string[];
	suggested_mailbox?: string;
	suggested_comment?: string;
}

export type CmdTaskResponse = CmdTaskSuccessResponse | CmdTaskRejection;

// Type guard. Prefer this over duck-typing in call sites.
export function isRejection(r: CmdTaskResponse): r is CmdTaskRejection {
	return (r as CmdTaskRejection).error !== undefined;
}

// ── Bridge errors ──

// Thrown when Pi's call payload violates the cmd contract — caught at the call
// site without ever spawning a subprocess. Carries structured violations so the
// caller can decide how to surface them (logging, mailbox, retry with fix).
export class CmdContractError extends Error {
	public readonly violations: TaskRegistrationViolation[];
	constructor(violations: TaskRegistrationViolation[], message?: string) {
		super(message ?? `Cmd contract violation: ${violations.map((v) => v.kind).join(", ")}`);
		this.name = "CmdContractError";
		this.violations = violations;
	}
}

// Thrown when cmd accepts the subprocess invocation but returns a structured
// rejection response. Distinct from CmdContractError (which is local) so the
// upstream catch can tell "we sent invalid input" from "cmd refused valid input."
export class CmdRejectionError extends Error {
	public readonly rejection: CmdTaskRejection;
	constructor(rejection: CmdTaskRejection) {
		const detail = rejection.errors?.join("; ") || "no detail provided";
		super(`Cmd rejected request (${rejection.error}): ${detail}`);
		this.name = "CmdRejectionError";
		this.rejection = rejection;
	}
}

// ── `cmd task update` — types + status validator ──
//
// Pi's `commander_task` adapter routes claim/complete/fail/cancel through the
// same update path (see commander-cli-client.ts:218-223). A single typed
// CmdTaskUpdateRequest + status validator covers all five operations.
//
// Sourced from commander-v2 at SHA 8f34fc3+:
// - cli/cmd/src/commands/task.update.ts:22-34 — STATUS_ALIAS (canonical set)
// - cli/cmd/src/commands/task.update.ts:124-180 — response shape (noop | updated)
// - host/storage/types.ts:257-268 — CmdTaskUpdatePayload (server-side shape)

// Mirror of commander-v2 STATUS_ALIAS keys. Aliases (todo/in-progress/done)
// resolve to canonical statuses (pending/working/completed) inside cmd; both
// forms are accepted on the wire so we list both here.
export const VALID_STATUSES = [
	"pending",
	"working",
	"completed",
	"failed",
	"cancelled",
	"backlog",
	"blocked",
	"deferred",
	"todo",
	"in-progress",
	"done",
] as const;

export type CmdTaskStatus = typeof VALID_STATUSES[number];

// Pure validator. Returns no violations when `status` is undefined (status is
// optional on update) or matches a known alias. Use the same
// TaskRegistrationViolation channel so call sites can throw one CmdContractError.
export function validateStatus(status: string | undefined): TaskRegistrationViolation[] {
	if (status === undefined) return [];
	if ((VALID_STATUSES as readonly string[]).includes(status)) return [];
	return [{ kind: "status-invalid", got: status }];
}

// Request shape Pi sends through `commander_task` operation: "update".
// Mirrors commander-cli-client.ts:208-216 (which is what the cmd CLI ultimately
// sees). `task_id` is required; everything else is optional. Status flows
// through validateStatus(); description/title are passed raw (a follow-up could
// add CodeRabbit-form re-validation on description updates — out of scope here).
export interface CmdTaskUpdateRequest {
	task_id: number;
	status?: CmdTaskStatus | string;
	priority?: number;
	title?: string;
	description?: string;
	mission_brief?: string;
}

// Claim is `update {status: "working"}` per commander-cli-client.ts:218. The
// dedicated request type exists for caller symmetry; no fields beyond task_id.
export interface CmdTaskClaimRequest {
	task_id: number;
}

// Response shape from `cmd task update`. Two forms — idempotent no-op (when the
// only patch is status and it already matches), or the normal updated response.
// Source: cli/cmd/src/commands/task.update.ts:124-180.
export interface CmdTaskUpdateNoopResponse {
	id: number;
	noop: true;
	current_state: string;
	reason: string;
	synced: "noop" | "adapter";
}

export interface CmdTaskUpdatedResponse {
	id: number;
	updated: Record<string, unknown>;
	identity: Record<string, unknown>;
	synced: "adapter";
	noop?: false;
}

export type CmdTaskUpdateResponse = CmdTaskUpdateNoopResponse | CmdTaskUpdatedResponse;

// Type guard — prefer this over duck-typing `response.noop` at call sites.
export function isUpdateNoop(r: CmdTaskUpdateResponse): r is CmdTaskUpdateNoopResponse {
	return (r as CmdTaskUpdateNoopResponse).noop === true;
}
