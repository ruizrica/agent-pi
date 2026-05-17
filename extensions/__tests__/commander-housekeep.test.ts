// ABOUTME: Tests for cmd housekeep doctor output parsing (telemetry + ANSI banner stripping).

import { describe, expect, it } from "vitest";
import { parseHousekeepDoctorOutput } from "../lib/commander/commander-housekeep.ts";

describe("parseHousekeepDoctorOutput", () => {
	it("parses real findings without identity injection mock shape", () => {
		const raw = `1 finding:

  orphaned children (1)
    agent-pi-test  parent=#1 (cancelled)
    → either reopen the parent or close the child
`;
		const { findings, total } = parseHousekeepDoctorOutput(raw);
		expect(total).toBe(1);
		expect(findings[0]).toMatchObject({
			category: "orphaned children",
			taskId: "agent-pi-test",
		});
		expect(findings[0].line).toContain("agent-pi-test");
	});

	it("ignores ANSI banner lines and JSONL telemetry from cmd doctor output", () => {
		const raw = `
                    \x1b[38;2;17;165;204m▄\x1b[0m\x1b[38;2;17;168;205m▄\x1b[0m
\x1b[38;2;36;114;200m█\x1b[0m logo row

{"ts":"2026-05-17T00:00:00.000Z","event":"bd_exec","ok":true}
{"ts":"2026-05-17T00:00:00.100Z","event":"housekeep_doctor","total":0}

✓ board is healthy — no findings.
`;
		const { findings, total } = parseHousekeepDoctorOutput(raw);
		expect(total).toBe(0);
		expect(findings).toEqual([]);
	});
});
