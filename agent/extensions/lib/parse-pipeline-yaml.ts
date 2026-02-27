// ABOUTME: Pure YAML parser for pipeline-team definitions
// ABOUTME: Extracts pipeline configs with phases, modes, agents, and task templates

export interface PhaseAgentDef {
	role: string;
	task_template: string;
}

export interface PhaseDef {
	name: string;
	description: string;
	mode: "interactive" | "parallel" | "sequential";
	agents: PhaseAgentDef[];
	max_iterations?: number;
}

export interface PipelineConfig {
	name: string;
	description: string;
	review_max_loops: number;
	phases: PhaseDef[];
}

export function parsePipelineYaml(raw: string): PipelineConfig[] {
	const configs: PipelineConfig[] = [];
	let current: PipelineConfig | null = null;
	let currentPhase: PhaseDef | null = null;
	let currentAgent: PhaseAgentDef | null = null;
	let inTaskTemplate = false;

	for (const line of raw.split("\n")) {
		// Top-level config name (no leading whitespace, ends with colon)
		const configMatch = line.match(/^(\S[^:]*):$/);
		if (configMatch) {
			if (currentAgent && currentPhase) currentPhase.agents.push(currentAgent);
			if (currentPhase && current) current.phases.push(currentPhase);
			currentAgent = null;
			currentPhase = null;
			inTaskTemplate = false;
			current = { name: configMatch[1].trim(), description: "", review_max_loops: 3, phases: [] };
			configs.push(current);
			continue;
		}

		if (!current) continue;

		// Config-level description
		const descMatch = line.match(/^\s+description:\s+"(.+)"$/);
		if (descMatch && !currentPhase) {
			current.description = descMatch[1];
			continue;
		}

		// review_max_loops
		const loopsMatch = line.match(/^\s+review_max_loops:\s+(\d+)$/);
		if (loopsMatch && !currentPhase) {
			current.review_max_loops = parseInt(loopsMatch[1], 10);
			continue;
		}

		// "phases:" label
		if (line.match(/^\s+phases:\s*$/) && !currentPhase) continue;

		// Phase start: "    - name: ..."
		const phaseNameMatch = line.match(/^\s+-\s+name:\s+(.+)$/);
		if (phaseNameMatch) {
			if (currentAgent && currentPhase) currentPhase.agents.push(currentAgent);
			if (currentPhase) current.phases.push(currentPhase);
			currentAgent = null;
			inTaskTemplate = false;
			currentPhase = { name: phaseNameMatch[1].trim(), description: "", mode: "interactive", agents: [] };
			continue;
		}

		if (!currentPhase) continue;

		// Phase description
		const phaseDescMatch = line.match(/^\s+description:\s+"(.+)"$/);
		if (phaseDescMatch && !currentAgent) {
			currentPhase.description = phaseDescMatch[1];
			continue;
		}

		// Phase mode
		const modeMatch = line.match(/^\s+mode:\s+(.+)$/);
		if (modeMatch && !currentAgent) {
			currentPhase.mode = modeMatch[1].trim() as PhaseDef["mode"];
			continue;
		}

		// Phase max_iterations
		const iterMatch = line.match(/^\s+max_iterations:\s+(\d+)$/);
		if (iterMatch && !currentAgent) {
			currentPhase.max_iterations = parseInt(iterMatch[1], 10);
			continue;
		}

		// "agents:" label
		if (line.match(/^\s+agents:\s*\[\]\s*$/) && currentPhase) continue;
		if (line.match(/^\s+agents:\s*$/) && currentPhase) continue;

		// Agent role
		const roleMatch = line.match(/^\s+-\s+role:\s+(.+)$/);
		if (roleMatch) {
			if (currentAgent) currentPhase.agents.push(currentAgent);
			inTaskTemplate = false;
			currentAgent = { role: roleMatch[1].trim(), task_template: "" };
			continue;
		}

		// Agent task_template (single-line with quotes)
		const templateMatch = line.match(/^\s+task_template:\s+"(.+)"$/);
		if (templateMatch && currentAgent) {
			currentAgent.task_template = templateMatch[1].replace(/\\n/g, "\n");
			inTaskTemplate = false;
			continue;
		}

		// Agent task_template (unquoted single-line)
		const templateUnquoted = line.match(/^\s+task_template:\s+(.+)$/);
		if (templateUnquoted && currentAgent) {
			currentAgent.task_template = templateUnquoted[1].replace(/\\n/g, "\n");
			inTaskTemplate = false;
			continue;
		}
	}

	if (currentAgent && currentPhase) currentPhase.agents.push(currentAgent);
	if (currentPhase && current) current.phases.push(currentPhase);

	return configs;
}
