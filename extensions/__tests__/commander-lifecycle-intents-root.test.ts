// ABOUTME: Regression test ensuring lifecycle intents use the project root, not extension cwd.
// ABOUTME: Prevents stale test/extension-local intent files from causing guard loops.

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordLifecycleIntent, listOpenLifecycleIntents } from "../lib/commander/lifecycle-intents.ts";

describe("lifecycle intent root discovery", () => {
	it("walks up to the project root when cwd is an extension subdirectory", () => {
		const root = mkdtempSync(join(tmpdir(), "pi-intent-root-"));
		writeFileSync(join(root, "package.json"), "{}\n");
		const ext = join(root, "extensions");
		mkdirSync(ext);
		const prev = process.env.PI_LIFECYCLE_INTENTS_PATH;
		const oldCwd = process.cwd();
		try {
			delete process.env.PI_LIFECYCLE_INTENTS_PATH;
			process.chdir(ext);
			recordLifecycleIntent({ taskId: 123, action: "fail", message: "boom" });
			process.chdir(root);
			expect(listOpenLifecycleIntents().map(i => i.id)).toEqual(["123:fail"]);
		} finally {
			process.chdir(oldCwd);
			if (prev !== undefined) process.env.PI_LIFECYCLE_INTENTS_PATH = prev;
			else delete process.env.PI_LIFECYCLE_INTENTS_PATH;
		}
	});
});
