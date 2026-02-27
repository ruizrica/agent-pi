// ABOUTME: Tests for parseChainYaml() in agent-chain.ts
// ABOUTME: Validates YAML parsing of chain definitions with steps, agents, and prompts

import { describe, it, expect } from "vitest";
import { parseChainYaml } from "../lib/parse-chain-yaml.ts";

describe("parseChainYaml", () => {
	it("should parse a valid chain with all fields", () => {
		const yaml = `plan-build-review:
  description: "Plan, implement, and review"
  steps:
    - agent: planner
      prompt: "Plan for: $INPUT"
    - agent: builder
      prompt: "Implement: $INPUT"
    - agent: reviewer
      prompt: "Review: $INPUT"`;

		const chains = parseChainYaml(yaml);
		expect(chains).toHaveLength(1);
		expect(chains[0].name).toBe("plan-build-review");
		expect(chains[0].description).toBe("Plan, implement, and review");
		expect(chains[0].steps).toHaveLength(3);
		expect(chains[0].steps[0]).toEqual({ agent: "planner", prompt: "Plan for: $INPUT" });
		expect(chains[0].steps[1]).toEqual({ agent: "builder", prompt: "Implement: $INPUT" });
		expect(chains[0].steps[2]).toEqual({ agent: "reviewer", prompt: "Review: $INPUT" });
	});

	it("should parse multiple chains", () => {
		const yaml = `chain-a:
  description: "First chain"
  steps:
    - agent: scout
      prompt: "Explore: $INPUT"

chain-b:
  description: "Second chain"
  steps:
    - agent: builder
      prompt: "Build: $INPUT"`;

		const chains = parseChainYaml(yaml);
		expect(chains).toHaveLength(2);
		expect(chains[0].name).toBe("chain-a");
		expect(chains[0].steps).toHaveLength(1);
		expect(chains[1].name).toBe("chain-b");
		expect(chains[1].steps).toHaveLength(1);
	});

	it("should handle missing description", () => {
		const yaml = `simple-chain:
  steps:
    - agent: builder
      prompt: "Do the thing"`;

		const chains = parseChainYaml(yaml);
		expect(chains).toHaveLength(1);
		expect(chains[0].name).toBe("simple-chain");
		expect(chains[0].description).toBe("");
		expect(chains[0].steps).toHaveLength(1);
	});

	it("should return empty array for empty string", () => {
		const chains = parseChainYaml("");
		expect(chains).toEqual([]);
	});

	it("should return empty array for whitespace-only input", () => {
		const chains = parseChainYaml("   \n\n  \n");
		expect(chains).toEqual([]);
	});

	it("should strip double quotes from description", () => {
		const yaml = `my-chain:
  description: "Quoted description"
  steps:
    - agent: test
      prompt: "go"`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].description).toBe("Quoted description");
	});

	it("should strip single quotes from description", () => {
		const yaml = `my-chain:
  description: 'Single quoted'
  steps:
    - agent: test
      prompt: "go"`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].description).toBe("Single quoted");
	});

	it("should strip quotes from prompt values", () => {
		const yaml = `my-chain:
  description: test
  steps:
    - agent: builder
      prompt: "Do the thing: $INPUT"`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].steps[0].prompt).toBe("Do the thing: $INPUT");
	});

	it("should handle unquoted description", () => {
		const yaml = `my-chain:
  description: No quotes here
  steps:
    - agent: test
      prompt: go`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].description).toBe("No quotes here");
	});

	it("should convert \\n in prompts to actual newlines", () => {
		const yaml = `my-chain:
  description: test
  steps:
    - agent: builder
      prompt: "Line one\\nLine two\\nLine three"`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].steps[0].prompt).toBe("Line one\nLine two\nLine three");
	});

	it("should handle special characters in chain names", () => {
		const yaml = `investigate-fix:
  description: "Bug fix flow"
  steps:
    - agent: scout
      prompt: "Explore: $INPUT"`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].name).toBe("investigate-fix");
	});

	it("should handle a chain with many steps", () => {
		const yaml = `full-pipeline:
  description: "End-to-end"
  steps:
    - agent: scout
      prompt: "Explore: $INPUT"
    - agent: planner
      prompt: "Plan: $INPUT"
    - agent: builder
      prompt: "Build: $INPUT"
    - agent: reviewer
      prompt: "Review: $INPUT"
    - agent: tester
      prompt: "Test: $INPUT"`;

		const chains = parseChainYaml(yaml);
		expect(chains).toHaveLength(1);
		expect(chains[0].steps).toHaveLength(5);
		expect(chains[0].steps[0].agent).toBe("scout");
		expect(chains[0].steps[4].agent).toBe("tester");
	});

	it("should handle $ORIGINAL variable in prompts", () => {
		const yaml = `my-chain:
  description: test
  steps:
    - agent: debugger
      prompt: "Context: $INPUT\\nOriginal: $ORIGINAL"`;

		const chains = parseChainYaml(yaml);
		expect(chains[0].steps[0].prompt).toBe("Context: $INPUT\nOriginal: $ORIGINAL");
	});

	it("should handle chain with no steps", () => {
		const yaml = `empty-chain:
  description: "Has no steps"
  steps:`;

		const chains = parseChainYaml(yaml);
		expect(chains).toHaveLength(1);
		expect(chains[0].name).toBe("empty-chain");
		expect(chains[0].steps).toHaveLength(0);
	});

	it("should handle steps with missing prompt", () => {
		const yaml = `my-chain:
  steps:
    - agent: builder`;

		const chains = parseChainYaml(yaml);
		expect(chains).toHaveLength(1);
		expect(chains[0].steps).toHaveLength(1);
		expect(chains[0].steps[0].agent).toBe("builder");
		expect(chains[0].steps[0].prompt).toBe("");
	});
});
