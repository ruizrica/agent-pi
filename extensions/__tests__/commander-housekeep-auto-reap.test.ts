// ABOUTME: Verifies the lifecycle guard auto-invokes cmd housekeep reap stale-claims on hook fire.
// ABOUTME: Prevents claim leaks when subagent processes die without releasing their cmd task claim.

import { describe, it, expect, vi } from "vitest";
import { runReapStaleClaims } from "../commander-lifecycle-guard.ts";

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

describe("runReapStaleClaims — automatic stale-claim sweep", () => {
	it("invokes commander_housekeep reap:stale-claims with dry_run false", async () => {
		const client: MockClient = { callTool: vi.fn().mockResolvedValue({ count: 0 }) };
		await runReapStaleClaims(client as any);

		expect(client.callTool).toHaveBeenCalledTimes(1);
		const [tool, params] = client.callTool.mock.calls[0];
		expect(tool).toBe("commander_housekeep");
		expect(params).toEqual(expect.objectContaining({
			operation: "reap:stale-claims",
			dry_run: false,
		}));
	});

	it("is a no-op when client is null (Commander unavailable)", async () => {
		await expect(runReapStaleClaims(null)).resolves.toBeUndefined();
	});

	it("never throws even when the cmd call rejects (graceful fallback)", async () => {
		const client: MockClient = { callTool: vi.fn().mockRejectedValue(new Error("cmd timed out")) };
		await expect(runReapStaleClaims(client as any)).resolves.toBeUndefined();
	});
});
