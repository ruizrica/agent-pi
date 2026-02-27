// ABOUTME: Tests for parsePipelineYaml() in pipeline-team.ts
// ABOUTME: Validates YAML parsing of pipeline configs with phases, modes, and agents

import { describe, it, expect } from "vitest";
import { parsePipelineYaml } from "../lib/parse-pipeline-yaml.ts";

describe("parsePipelineYaml", () => {
	it("should parse a valid pipeline with all fields", () => {
		const yaml = `plan-build-review:
  description: "Standard dev cycle"
  review_max_loops: 3
  phases:
    - name: understand
      description: "Clarify the task"
      mode: interactive
      agents:
        - role: scout
          task_template: "Explore the codebase"
    - name: plan
      description: "Create plan"
      mode: sequential
      agents:
        - role: planner
          task_template: "Plan for: $INPUT"
    - name: build
      description: "Implement"
      mode: parallel
      agents:
        - role: builder
          task_template: "Build: $INPUT"`;

		const configs = parsePipelineYaml(yaml);
		expect(configs).toHaveLength(1);
		expect(configs[0].name).toBe("plan-build-review");
		expect(configs[0].description).toBe("Standard dev cycle");
		expect(configs[0].review_max_loops).toBe(3);
		expect(configs[0].phases).toHaveLength(3);

		expect(configs[0].phases[0].name).toBe("understand");
		expect(configs[0].phases[0].description).toBe("Clarify the task");
		expect(configs[0].phases[0].mode).toBe("interactive");
		expect(configs[0].phases[0].agents).toHaveLength(1);
		expect(configs[0].phases[0].agents[0]).toEqual({
			role: "scout",
			task_template: "Explore the codebase",
		});

		expect(configs[0].phases[1].mode).toBe("sequential");
		expect(configs[0].phases[2].mode).toBe("parallel");
	});

	it("should parse multiple pipeline configs", () => {
		const yaml = `pipeline-a:
  description: "First pipeline"
  review_max_loops: 2
  phases:
    - name: plan
      description: "Plan"
      mode: interactive
      agents: []

pipeline-b:
  description: "Second pipeline"
  review_max_loops: 1
  phases:
    - name: build
      description: "Build"
      mode: parallel
      agents: []`;

		const configs = parsePipelineYaml(yaml);
		expect(configs).toHaveLength(2);
		expect(configs[0].name).toBe("pipeline-a");
		expect(configs[0].review_max_loops).toBe(2);
		expect(configs[1].name).toBe("pipeline-b");
		expect(configs[1].review_max_loops).toBe(1);
	});

	it("should default review_max_loops to 3 when not specified", () => {
		const yaml = `my-pipeline:
  description: "No loops specified"
  phases:
    - name: plan
      description: "Plan"
      mode: interactive
      agents: []`;

		const configs = parsePipelineYaml(yaml);
		expect(configs).toHaveLength(1);
		expect(configs[0].review_max_loops).toBe(3);
	});

	it("should return empty array for empty string", () => {
		const configs = parsePipelineYaml("");
		expect(configs).toEqual([]);
	});

	it("should return empty array for whitespace-only input", () => {
		const configs = parsePipelineYaml("   \n\n  \n");
		expect(configs).toEqual([]);
	});

	it("should handle phase with multiple agents", () => {
		const yaml = `my-pipeline:
  description: "Multi-agent phase"
  review_max_loops: 2
  phases:
    - name: gather
      description: "Gather info"
      mode: parallel
      agents:
        - role: scout
          task_template: "Explore area A"
        - role: scout
          task_template: "Explore area B"
        - role: scout
          task_template: "Explore area C"`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].phases[0].agents).toHaveLength(3);
		expect(configs[0].phases[0].agents[0].role).toBe("scout");
		expect(configs[0].phases[0].agents[1].task_template).toBe("Explore area B");
		expect(configs[0].phases[0].agents[2].task_template).toBe("Explore area C");
	});

	it("should handle quoted task_template with \\n", () => {
		const yaml = `my-pipeline:
  description: "Test"
  review_max_loops: 1
  phases:
    - name: build
      description: "Build"
      mode: sequential
      agents:
        - role: builder
          task_template: "Implement the plan:\\n\\n$INPUT"`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].phases[0].agents[0].task_template).toBe("Implement the plan:\n\n$INPUT");
	});

	it("should handle unquoted task_template", () => {
		const yaml = `my-pipeline:
  description: "Test"
  review_max_loops: 1
  phases:
    - name: build
      description: "Build"
      mode: sequential
      agents:
        - role: builder
          task_template: Do the thing`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].phases[0].agents[0].task_template).toBe("Do the thing");
	});

	it("should handle phase with max_iterations", () => {
		const yaml = `my-pipeline:
  description: "Test"
  review_max_loops: 3
  phases:
    - name: review
      description: "Review"
      mode: sequential
      max_iterations: 5
      agents:
        - role: reviewer
          task_template: "Review: $INPUT"`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].phases[0].max_iterations).toBe(5);
	});

	it("should handle phase with empty agents list", () => {
		const yaml = `my-pipeline:
  description: "Test"
  phases:
    - name: understand
      description: "Interactive phase"
      mode: interactive
      agents: []`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].phases[0].agents).toHaveLength(0);
	});

	it("should handle special characters in description", () => {
		const yaml = `my-pipeline:
  description: "Plan, build & review — the standard cycle"
  phases:
    - name: plan
      description: "Create an implementation plan"
      mode: interactive
      agents: []`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].description).toBe("Plan, build & review — the standard cycle");
	});

	it("should handle pipeline with many phases", () => {
		const yaml = `full-pipeline:
  description: "Full five-phase pipeline"
  review_max_loops: 2
  phases:
    - name: understand
      description: "Phase 1"
      mode: interactive
      agents: []
    - name: gather
      description: "Phase 2"
      mode: parallel
      agents: []
    - name: plan
      description: "Phase 3"
      mode: sequential
      agents: []
    - name: execute
      description: "Phase 4"
      mode: parallel
      agents: []
    - name: review
      description: "Phase 5"
      mode: sequential
      agents: []`;

		const configs = parsePipelineYaml(yaml);
		expect(configs).toHaveLength(1);
		expect(configs[0].phases).toHaveLength(5);
		expect(configs[0].phases[0].name).toBe("understand");
		expect(configs[0].phases[4].name).toBe("review");
	});

	it("should handle $TASK and $CONTEXT variables in task_template", () => {
		const yaml = `my-pipeline:
  description: "Test"
  phases:
    - name: build
      description: "Build"
      mode: sequential
      agents:
        - role: builder
          task_template: "$TASK with context: $CONTEXT"`;

		const configs = parsePipelineYaml(yaml);
		expect(configs[0].phases[0].agents[0].task_template).toBe("$TASK with context: $CONTEXT");
	});
});
