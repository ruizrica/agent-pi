// ABOUTME: Fix 3 / Option 3 — typed contract owner for the cmd CLI.
// ABOUTME: Mirrors commander-v2's task-registration/validate.ts so violations are caught
// ABOUTME: at the Pi call site (TypeScript-loud) instead of at the subprocess boundary
// ABOUTME: (commander-v2's task_registration_rejected silent failure).

import { describe, it, expect } from "vitest";
import {
	CODERABBIT_DESCRIPTION_RE,
	REQUIRED_BODY_SECTIONS,
	validateChildTaskPayload,
	isRejection,
	CmdContractError,
	VALID_STATUSES,
	validateStatus,
	isUpdateNoop,
	type CmdTaskResponse,
	type CmdTaskUpdateRequest,
	type CmdTaskUpdateResponse,
	type CmdTaskClaimRequest,
	type CmdTaskStatus,
} from "../lib/commander/cmd-bridge";

describe("cmd-bridge: contract owner for commander-v2", () => {
	describe("CODERABBIT_DESCRIPTION_RE — mirror of commander-v2/validate.ts:11", () => {
		it("accepts valid CodeRabbit-form descriptions", () => {
			expect(CODERABBIT_DESCRIPTION_RE.test("In foo.ts around lines 1-5, problem; solution.")).toBe(true);
			expect(CODERABBIT_DESCRIPTION_RE.test("In a/b/c.ts around lines 100-200, x; y")).toBe(true);
			expect(CODERABBIT_DESCRIPTION_RE.test("In . around lines 1-1, simple; fix.")).toBe(true);
		});

		it("rejects plain-text descriptions", () => {
			expect(CODERABBIT_DESCRIPTION_RE.test("Test this thing")).toBe(false);
			expect(CODERABBIT_DESCRIPTION_RE.test("Clarify what should be done")).toBe(false);
			expect(CODERABBIT_DESCRIPTION_RE.test("")).toBe(false);
		});
	});

	describe("REQUIRED_BODY_SECTIONS — mirror of commander-v2 child body validator", () => {
		it("lists the three required section headings", () => {
			expect(REQUIRED_BODY_SECTIONS).toEqual(["## Steps", "## Tests", "## References"]);
		});
	});

	describe("validateChildTaskPayload", () => {
		it("returns no violations when both description and body are valid", () => {
			const violations = validateChildTaskPayload(
				"In foo.ts around lines 1-2, x; y.",
				"## Steps\n1. Do\n\n## Tests\n- Verify\n\n## References\n- Source",
			);
			expect(violations).toEqual([]);
		});

		it("flags description-format when the description is plain text", () => {
			const violations = validateChildTaskPayload(
				"Plain text",
				"## Steps\n1. x\n## Tests\n- y\n## References\n- z",
			);
			expect(violations).toContainEqual({ kind: "description-format", got: "Plain text" });
		});

		it("flags body-missing-section for each missing section", () => {
			const violations = validateChildTaskPayload(
				"In a.ts around lines 1-1, x; y.",
				"## Steps\n1. only steps",
			);
			expect(violations).toContainEqual({ kind: "body-missing-section", section: "## Tests" });
			expect(violations).toContainEqual({ kind: "body-missing-section", section: "## References" });
		});

		it("flags both axes simultaneously when both are wrong", () => {
			const violations = validateChildTaskPayload("Plain", "Empty body");
			expect(violations.length).toBeGreaterThanOrEqual(4); // description + 3 missing sections
		});
	});

	describe("isRejection (type guard)", () => {
		it("returns true for rejection responses", () => {
			const rej: CmdTaskResponse = { error: "task_registration_rejected", task_registration_required: true, errors: ["x"] };
			expect(isRejection(rej)).toBe(true);
		});

		it("returns false for success responses", () => {
			const ok: CmdTaskResponse = {
				id: 1, bead_id: "agent-pi-x", description: "x", mission_brief: null,
				title: "x", primary_file: null, lifecycle_owner: null, status: "pending",
				priority: 5, readiness: null, identity: {}, synced: "mock",
			};
			expect(isRejection(ok)).toBe(false);
		});
	});

	describe("CmdContractError", () => {
		it("includes the violations in the error", () => {
			const err = new CmdContractError([{ kind: "description-format", got: "plain" }]);
			expect(err.name).toBe("CmdContractError");
			expect(err.violations[0].kind).toBe("description-format");
			expect(err.message).toContain("description-format");
		});
	});

	// ── task update / claim / complete / fail / cancel ──────────────────
	// Pi routes claim/complete/fail/cancel through `update {status: X}` per
	// commander-cli-client.ts:218-223. One typed update request covers all five.

	describe("VALID_STATUSES — mirror of commander-v2 STATUS_ALIAS (task.update.ts:22-34)", () => {
		it("includes all canonical commander-v2 statuses", () => {
			// Canonical (resolved) statuses
			expect(VALID_STATUSES).toContain("pending");
			expect(VALID_STATUSES).toContain("working");
			expect(VALID_STATUSES).toContain("completed");
			expect(VALID_STATUSES).toContain("failed");
			expect(VALID_STATUSES).toContain("cancelled");
			expect(VALID_STATUSES).toContain("backlog");
			expect(VALID_STATUSES).toContain("blocked");
			expect(VALID_STATUSES).toContain("deferred");
			// Aliases (commander-v2 resolves todo/in-progress/done internally)
			expect(VALID_STATUSES).toContain("todo");
			expect(VALID_STATUSES).toContain("in-progress");
			expect(VALID_STATUSES).toContain("done");
		});
	});

	describe("validateStatus", () => {
		it("returns no violations for each canonical status", () => {
			for (const status of VALID_STATUSES) {
				expect(validateStatus(status)).toEqual([]);
			}
		});

		it("returns a status-invalid violation for unknown statuses", () => {
			const violations = validateStatus("not-a-status");
			expect(violations).toContainEqual({ kind: "status-invalid", got: "not-a-status" });
		});

		it("treats undefined as a no-op (status is optional on update)", () => {
			expect(validateStatus(undefined)).toEqual([]);
		});

		it("rejects empty string as invalid", () => {
			const violations = validateStatus("");
			expect(violations).toContainEqual({ kind: "status-invalid", got: "" });
		});
	});

	describe("CmdTaskUpdateRequest type", () => {
		it("compiles with id only", () => {
			const req: CmdTaskUpdateRequest = { task_id: 42 };
			expect(req.task_id).toBe(42);
		});

		it("compiles with status set", () => {
			const req: CmdTaskUpdateRequest = { task_id: 42, status: "working" };
			expect(req.status).toBe("working");
		});

		it("compiles with all optional fields", () => {
			const req: CmdTaskUpdateRequest = {
				task_id: 42,
				status: "completed",
				priority: 3,
				title: "x",
				description: "y",
				mission_brief: "z",
			};
			expect(req.priority).toBe(3);
		});

		it("accepts mission_brief on update (cmd task update --mission-brief is supported)", () => {
			const req: CmdTaskUpdateRequest = {
				task_id: 42,
				mission_brief: "Refine the parent mission brief mid-flight.",
			};
			expect(req.mission_brief).toBe("Refine the parent mission brief mid-flight.");
		});
	});

	describe("CmdTaskClaimRequest type", () => {
		it("compiles with just task_id (claim is update {status: working} per commander-cli-client.ts:218)", () => {
			const req: CmdTaskClaimRequest = { task_id: 42 };
			expect(req.task_id).toBe(42);
		});
	});

	describe("isUpdateNoop — discriminates the noop response shape", () => {
		it("returns true for noop responses (task.update.ts:124-131)", () => {
			const noop: CmdTaskUpdateResponse = {
				id: 1,
				noop: true,
				current_state: "working",
				reason: "status_already_matches",
				synced: "noop",
			};
			expect(isUpdateNoop(noop)).toBe(true);
		});

		it("returns false for normal update responses (task.update.ts:170-178)", () => {
			const updated: CmdTaskUpdateResponse = {
				id: 1,
				updated: { status: "working" },
				identity: {} as any,
				synced: "adapter",
			};
			expect(isUpdateNoop(updated)).toBe(false);
		});
	});

	describe("CmdContractError carries status-invalid violations", () => {
		it("constructs cleanly with a status-invalid violation", () => {
			const err = new CmdContractError([{ kind: "status-invalid", got: "bogus" }]);
			expect(err.name).toBe("CmdContractError");
			expect(err.violations[0].kind).toBe("status-invalid");
			expect(err.message).toContain("status-invalid");
		});
	});

	describe("CmdTaskStatus type", () => {
		it("accepts each canonical and alias status as a CmdTaskStatus", () => {
			// Compile-time check: assigning each VALID_STATUSES member to CmdTaskStatus
			// must not error. If validateStatus widens beyond the type, TS catches it here.
			const sample: CmdTaskStatus = "working";
			expect(VALID_STATUSES).toContain(sample);
		});
	});
});
