// ABOUTME: Tests Commander task ownership sync policy so subagents do not create phantom board tasks.
// ABOUTME: Keeps local WARDEN bookkeeping separate from parent-managed Commander task lifecycle.

import { describe, expect, it } from "vitest";
import {
	buildCommanderTaskOwnershipPolicy,
	resolveCommanderTaskSyncPolicy,
	resolveCommanderTaskSyncPolicyFromEnv,
} from "../lib/commander/task-ownership-policy.ts";

describe("resolveCommanderTaskSyncPolicy", () => {
	it("syncs parent-session local tasks to Commander by default", () => {
		const policy = resolveCommanderTaskSyncPolicy({});
		expect(policy.shouldSyncLocalTasksToCommander).toBe(true);
		expect(policy.mode).toBe("auto");
	});

	it("suppresses local task sync for subagents with an assigned Commander task", () => {
		const policy = resolveCommanderTaskSyncPolicy({ isSubagent: true, commanderTaskId: 42 });
		expect(policy.shouldSyncLocalTasksToCommander).toBe(false);
		expect(policy.mode).toBe("assigned-only");
		expect(policy.suppressedMessage).toContain("assigned Commander task is managed by parent");
	});

	it("allows explicit opt-in for subagent local-task sync", () => {
		const policy = resolveCommanderTaskSyncPolicy({
			isSubagent: true,
			commanderTaskId: 42,
			syncMode: "auto",
		});
		expect(policy.shouldSyncLocalTasksToCommander).toBe(true);
		expect(policy.mode).toBe("auto");
	});

	it("honors explicit assigned-only mode even without a task id", () => {
		const policy = resolveCommanderTaskSyncPolicy({ syncMode: "assigned-only" });
		expect(policy.shouldSyncLocalTasksToCommander).toBe(false);
		expect(policy.mode).toBe("assigned-only");
	});

	it("keeps external sync authoritative", () => {
		const policy = resolveCommanderTaskSyncPolicy({ externalSyncActive: true, syncMode: "auto" });
		expect(policy.shouldSyncLocalTasksToCommander).toBe(false);
		expect(policy.mode).toBe("external");
	});

	it("resolves from child process environment", () => {
		const policy = resolveCommanderTaskSyncPolicyFromEnv({
			PI_SUBAGENT: "1",
			PI_COMMANDER_TASK_ID: "99",
			PI_COMMANDER_TASK_SYNC_MODE: "assigned-only",
		});
		expect(policy.shouldSyncLocalTasksToCommander).toBe(false);
		expect(policy.mode).toBe("assigned-only");
	});
});

describe("buildCommanderTaskOwnershipPolicy", () => {
	it("directs agents to mailbox/comments instead of coordination tasks", () => {
		const prompt = buildCommanderTaskOwnershipPolicy({ taskId: 7 });
		expect(prompt).toContain("Do not create additional Commander board tasks");
		expect(prompt).toContain("commander_mailbox");
		expect(prompt).toContain("comment:add");
	});

	it("requires every created or claimed board task to be closed or handed off", () => {
		const prompt = buildCommanderTaskOwnershipPolicy();
		expect(prompt).toContain("Every Commander board task you create or claim is your responsibility");
		expect(prompt).toContain("completed, failed, cancelled, or explicitly handed off");
		expect(prompt).toContain("Never leave pending/working tasks behind");
	});
});
