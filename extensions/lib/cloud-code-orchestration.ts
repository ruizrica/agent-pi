import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";

export type CloudCodeMode = "dispatch" | "batch" | "chain" | "pipeline";
export type WriteScope = "none" | "narrow" | "broad";

export interface CloudCodeOrchestrationRequest {
	requestedMode?: CloudCodeMode | "auto";
	requestedAgents?: string[];
	allowParallel?: boolean;
	sequential?: boolean;
	phaseCount?: number;
	writeScope?: WriteScope;
	chainName?: string;
	task?: string;
}

export interface CloudCodeAuthInfo {
	present: boolean;
	source?: "CLAUDE_CODE_OAUTH_TOKEN" | "PI_CLAUDE_OAUTH_TOKEN" | "ANTHROPIC_OAUTH_TOKEN";
}

export interface CloudCodeOrchestrationPlan {
	mode: CloudCodeMode;
	requiresApproval: boolean;
	approvalReasons: string[];
	normalizedAgents: string[];
	unknownAgents: string[];
	summary: string;
}

const DEFAULT_CHAIN_THRESHOLD = 2;
const DEFAULT_PIPELINE_THRESHOLD = 3;

export function detectCloudCodeAuthEnv(
	env: NodeJS.ProcessEnv = process.env,
): CloudCodeAuthInfo {
	if (env.CLAUDE_CODE_OAUTH_TOKEN) {
		return { present: true, source: "CLAUDE_CODE_OAUTH_TOKEN" };
	}
	if (env.PI_CLAUDE_OAUTH_TOKEN) {
		return { present: true, source: "PI_CLAUDE_OAUTH_TOKEN" };
	}
	if (env.ANTHROPIC_OAUTH_TOKEN) {
		return { present: true, source: "ANTHROPIC_OAUTH_TOKEN" };
	}
	return { present: false };
}

export function discoverAgentCatalog(rootDir: string): string[] {
	const roots = [
		join(rootDir, "agents"),
		join(rootDir, ".claude", "agents"),
		join(rootDir, ".pi", "agents"),
	];
	const names = new Set<string>();

	for (const root of roots) {
		scanAgentDir(root, names);
	}

	return [...names].sort();
}

function scanAgentDir(dir: string, names: Set<string>): void {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			scanAgentDir(fullPath, names);
			continue;
		}
		if (!entry.name.endsWith(".md")) continue;
		const raw = readFileSync(fullPath, "utf-8");
		const match = raw.match(/^---\n([\s\S]*?)\n---/);
		if (!match) continue;
		for (const line of match[1].split("\n")) {
			if (!line.startsWith("name:")) continue;
			const name = line.slice("name:".length).trim().toLowerCase();
			if (name) names.add(name);
			break;
		}
	}
}

export function discoverChainCatalog(rootDir: string): string[] {
	const chainPath = resolve(rootDir, "agents", "agent-chain.yaml");
	if (!existsSync(chainPath)) return [];
	const raw = readFileSync(chainPath, "utf-8");
	const parsed = YAML.parse(raw) as Record<string, unknown> | null;
	if (!parsed || typeof parsed !== "object") return [];
	return Object.keys(parsed).sort();
}

export function normalizeAgentNames(
	requestedAgents: string[] = [],
	availableAgents: string[] = [],
): { normalized: string[]; unknown: string[] } {
	const lookup = new Map<string, string>();
	for (const name of availableAgents) {
		lookup.set(name.toLowerCase(), name.toLowerCase());
	}

	const normalized: string[] = [];
	const unknown: string[] = [];

	for (const name of requestedAgents) {
		const trimmed = name.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		const resolved = lookup.get(key);
		if (resolved) {
			normalized.push(resolved);
		} else {
			unknown.push(trimmed);
		}
	}

	return { normalized, unknown };
}

export function planCloudCodeOrchestration(
	request: CloudCodeOrchestrationRequest,
	availableAgents: string[] = [],
): CloudCodeOrchestrationPlan {
	const requestedMode = request.requestedMode || "auto";
	const requestedAgents = request.requestedAgents || [];
	const writeScope = request.writeScope || "none";
	const { normalized, unknown } = normalizeAgentNames(requestedAgents, availableAgents);

	let mode: CloudCodeMode;
	if (requestedMode !== "auto") {
		mode = requestedMode;
	} else if ((request.phaseCount || 0) >= DEFAULT_PIPELINE_THRESHOLD) {
		mode = "pipeline";
	} else if (request.chainName || request.sequential || (request.phaseCount || 0) >= DEFAULT_CHAIN_THRESHOLD) {
		mode = "chain";
	} else if (request.allowParallel || normalized.length > 1) {
		mode = "batch";
	} else {
		mode = "dispatch";
	}

	const approvalReasons: string[] = [];
	if (writeScope === "broad") {
		approvalReasons.push("broad writes requested");
	}
	if (mode === "batch" || mode === "chain" || mode === "pipeline" || normalized.length > 1) {
		approvalReasons.push("multi-agent orchestration requested");
	}

	const summaryParts = [`mode=${mode}`];
	if (normalized.length > 0) summaryParts.push(`agents=${normalized.join(",")}`);
	if (request.chainName) summaryParts.push(`chain=${request.chainName}`);
	if (writeScope !== "none") summaryParts.push(`writeScope=${writeScope}`);
	if ((request.phaseCount || 0) > 0) summaryParts.push(`phases=${request.phaseCount}`);

	return {
		mode,
		requiresApproval: approvalReasons.length > 0,
		approvalReasons,
		normalizedAgents: normalized,
		unknownAgents: unknown,
		summary: summaryParts.join(" | "),
	};
}
