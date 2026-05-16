import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	detectCloudCodeAuthEnv,
	discoverAgentCatalog,
	discoverChainCatalog,
} from "../lib/cloud-code-orchestration.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("Cloud Code bridge auth reuse", () => {
	it("recognizes the Cloud Code OAuth token path", () => {
		const auth = detectCloudCodeAuthEnv({ CLAUDE_CODE_OAUTH_TOKEN: "cc-token" });
		expect(auth).toEqual({ present: true, source: "CLAUDE_CODE_OAUTH_TOKEN" });
	});

	it("recognizes the Pi alias token path", () => {
		const auth = detectCloudCodeAuthEnv({ PI_CLAUDE_OAUTH_TOKEN: "pi-token" });
		expect(auth).toEqual({ present: true, source: "PI_CLAUDE_OAUTH_TOKEN" });
	});
});

describe("Cloud Code bridge catalog reuse", () => {
	it("loads the existing Pi agent roster from the repository", () => {
		const agents = discoverAgentCatalog(repoRoot);
		expect(agents.length).toBeGreaterThan(5);
		expect(agents).toContain("planner");
		expect(agents).toContain("tester");
	});

	it("loads the existing chain catalog from the repository", () => {
		const chains = discoverChainCatalog(repoRoot);
		expect(chains.length).toBeGreaterThan(3);
		expect(chains).toContain("audit");
		expect(chains).toContain("test-fix");
	});
});
