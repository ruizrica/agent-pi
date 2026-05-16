// ABOUTME: Tests Droid CLI worker argument construction and result normalization.

import { describe, it, expect } from "vitest";
import {
	buildDroidCliArgs,
	DROID_CLI_OUTPUT_FORMAT,
	normalizeDroidCliResult,
} from "../lib/droid-cli.ts";

describe("buildDroidCliArgs", () => {
	it("uses exec mode with explicit JSON output and low autonomy", () => {
		expect(buildDroidCliArgs("analyze repo")).toEqual([
			"exec",
			"--output-format", DROID_CLI_OUTPUT_FORMAT,
			"--auto", "low",
			"analyze repo",
		]);
	});

	it("passes cwd through --cwd when provided", () => {
		expect(buildDroidCliArgs("analyze repo", "/tmp/project")).toEqual([
			"exec",
			"--output-format", DROID_CLI_OUTPUT_FORMAT,
			"--auto", "low",
			"--cwd", "/tmp/project",
			"analyze repo",
		]);
	});
});

describe("normalizeDroidCliResult", () => {
	it("extracts a final text field from successful JSON output", () => {
		expect(normalizeDroidCliResult({
			exitCode: 0,
			stdout: "  {\"result\":\"ok\"}\n",
			stderr: "",
		})).toEqual({
			exitCode: 0,
			output: "ok",
			stderr: "",
		});
	});

	it("falls back to raw stdout for unknown JSON shapes", () => {
		expect(normalizeDroidCliResult({
			exitCode: 0,
			stdout: "{\"status\":\"ok\",\"items\":[1,2]}",
			stderr: "",
		})).toEqual({
			exitCode: 0,
			output: "{\"status\":\"ok\",\"items\":[1,2]}",
			stderr: "",
		});
	});

	it("turns empty successful runs into actionable failures", () => {
		expect(normalizeDroidCliResult({
			exitCode: 0,
			stdout: "\n\n",
			stderr: "warning: no final payload",
		})).toEqual({
			exitCode: 1,
			output: "Droid completed without producing any usable output.\n\nStderr:\nwarning: no final payload",
			stderr: "warning: no final payload",
		});
	});

	it("surfaces stderr for failed runs", () => {
		expect(normalizeDroidCliResult({
			exitCode: 2,
			stdout: "",
			stderr: "Exec failed",
		})).toEqual({
			exitCode: 2,
			output: "Droid exec failed with exit code 2.\n\nStderr:\nExec failed\n\nHint: Droid may be using an invalid or unavailable default model in Factory configuration. Verify Droid's current default model outside Pi.",
			stderr: "Exec failed",
		});
	});

	it("extracts a structured failure message from JSON stdout", () => {
		expect(normalizeDroidCliResult({
			exitCode: 1,
			stdout: '{"type":"result","subtype":"failure","result":"Exec failed"}',
			stderr: "",
		})).toEqual({
			exitCode: 1,
			output: "Droid exec failed with exit code 1.\n\nOutput:\nExec failed\n\nHint: Droid may be using an invalid or unavailable default model in Factory configuration. Verify Droid's current default model outside Pi.",
			stderr: "",
		});
	});

	it("does not add the generic model hint for richer structured failures", () => {
		expect(normalizeDroidCliResult({
			exitCode: 1,
			stdout: '{"message":"Authentication required"}',
			stderr: "",
		})).toEqual({
			exitCode: 1,
			output: "Droid exec failed with exit code 1.\n\nOutput:\nAuthentication required",
			stderr: "",
		});
	});

	it("surfaces signal-based termination clearly", () => {
		expect(normalizeDroidCliResult({
			exitCode: null,
			signal: "SIGTERM",
			stdout: "",
			stderr: "",
		})).toEqual({
			exitCode: 1,
			output: "Droid exec terminated by signal SIGTERM.",
			stderr: "",
		});
	});
});
