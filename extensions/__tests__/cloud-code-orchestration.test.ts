import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	detectCloudCodeAuthEnv,
	discoverAgentCatalog,
	discoverChainCatalog,
	normalizeAgentNames,
	planCloudCodeOrchestration,
} from "../lib/cloud-code-orchestration.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("planCloudCodeOrchestration", () => {
	const availableAgents = ["scout", "builder", "reviewer", "planner"];

	it("routes a single-agent request to dispatch", () => {
		const plan = planCloudCodeOrchestration({
			requestedAgents: ["Scout"],
			writeScope: "narrow",
		}, availableAgents);

		expect(plan.mode).toBe("dispatch");
		expect(plan.requiresApproval).toBe(false);
		expect(plan.normalizedAgents).toEqual(["scout"]);
	});

	it("routes a parallel request to batch", () => {
		const plan = planCloudCodeOrchestration({
			requestedAgents: ["scout", "builder"],
			allowParallel: true,
			writeScope: "narrow",
		}, availableAgents);

		expect(plan.mode).toBe("batch");
		expect(plan.requiresApproval).toBe(true);
		expect(plan.approvalReasons).toContain("multi-agent orchestration requested");
	});

	it("routes a sequential request to chain", () => {
		const plan = planCloudCodeOrchestration({
			chainName: "plan-build-review",
			sequential: true,
			phaseCount: 2,
		}, availableAgents);

		expect(plan.mode).toBe("chain");
		expect(plan.requiresApproval).toBe(true);
	});

	it("routes 3+ phase work to pipeline", () => {
		const plan = planCloudCodeOrchestration({
			phaseCount: 4,
			writeScope: "narrow",
		}, availableAgents);

		expect(plan.mode).toBe("pipeline");
		expect(plan.requiresApproval).toBe(true);
	});

	it("requires approval for broad writes even with dispatch", () => {
		const plan = planCloudCodeOrchestration({
			requestedAgents: ["reviewer"],
			writeScope: "broad",
		}, availableAgents);

		expect(plan.mode).toBe("dispatch");
		expect(plan.requiresApproval).toBe(true);
		expect(plan.approvalReasons).toContain("broad writes requested");
	});
});

describe("agent normalization and discovery", () => {
	it("normalizes matching agents and preserves unknown ones", () => {
		const result = normalizeAgentNames(["Scout", "Unknown-Agent"], ["scout", "builder"]);
		expect(result.normalized).toEqual(["scout"]);
		expect(result.unknown).toEqual(["Unknown-Agent"]);
	});

	it("discovers the repo agent catalog", () => {
		const agents = discoverAgentCatalog(repoRoot);
		expect(agents).toContain("scout");
		expect(agents).toContain("builder");
		expect(agents).toContain("reviewer");
	});

	it("discovers the repo chain catalog", () => {
		const chains = discoverChainCatalog(repoRoot);
		expect(chains).toContain("plan-build-review");
		expect(chains).toContain("full-pipeline");
	});
});

describe("detectCloudCodeAuthEnv", () => {
	it("prefers CLAUDE_CODE_OAUTH_TOKEN", () => {
		const result = detectCloudCodeAuthEnv({
			CLAUDE_CODE_OAUTH_TOKEN: "primary",
			PI_CLAUDE_OAUTH_TOKEN: "alias",
			ANTHROPIC_OAUTH_TOKEN: "fallback",
		});
		expect(result).toEqual({ present: true, source: "CLAUDE_CODE_OAUTH_TOKEN" });
	});

	it("falls back to PI_CLAUDE_OAUTH_TOKEN", () => {
		const result = detectCloudCodeAuthEnv({ PI_CLAUDE_OAUTH_TOKEN: "alias" });
		expect(result).toEqual({ present: true, source: "PI_CLAUDE_OAUTH_TOKEN" });
	});

	it("falls back to ANTHROPIC_OAUTH_TOKEN", () => {
		const result = detectCloudCodeAuthEnv({ ANTHROPIC_OAUTH_TOKEN: "fallback" });
		expect(result).toEqual({ present: true, source: "ANTHROPIC_OAUTH_TOKEN" });
	});

	it("reports missing auth when no token is present", () => {
		const result = detectCloudCodeAuthEnv({});
		expect(result).toEqual({ present: false });
	});
});
