#!/usr/bin/env python3
"""
ABOUTME: Live extension test runner for PI Agent core extensions.
ABOUTME: Loads each extension, runs a test prompt, captures output and status.
"""

import subprocess
import json
import sys
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# Configuration
EXTENSIONS_DIR = Path("/Users/ricardo/Workshop/GitHub/agent-pi/extensions")
RESULTS_DIR = Path("/Users/ricardo/Workshop/GitHub/agent-pi/tests/comprehensive/results")
OUTPUT_FILE = RESULTS_DIR / "16-core-extensions-live.json"

# Test definitions: extension name -> prompt
TESTS = {
    "claude-advisor": "What does the claude-advisor extension expose?",
    "advisor-command": "Is there an /advisor command?",
    "agent-identity": "What is the agent identity?",
    "agent-banner": "Reply OK.",
    "footer": "Reply OK.",
    "tasks": "Is the tasks panel enabled? Reply YES or NO.",
    "commander-tracker": "What tracker fields do you see?",
    "commander-lifecycle-guard": "Reply OK.",
    "goal-loop": "Reply OK.",
    "lean-tools": "What tools are available?",
}

def run_extension_test(ext_name: str, prompt: str) -> Tuple[str, str, int]:
    """
    Run a single extension test.

    Returns: (status, evidence, duration_ms)
    status: 'pass', 'fail', 'skip', 'error'
    evidence: Last 6 lines of output
    """
    ext_path = EXTENSIONS_DIR / f"{ext_name}.ts"

    if not ext_path.exists():
        return "skip", f"File not found: {ext_path}", 0

    cmd = [
        "pi",
        "--provider", "google",
        "--model", "claude-3-5-sonnet",
        "--no-session",
        "-e", str(ext_path),
        "-p", prompt
    ]

    start_time = time.time()
    try:
        result = subprocess.run(
            cmd,
            cwd="/Users/ricardo/Workshop/GitHub/agent-pi",
            capture_output=True,
            text=True,
            timeout=90
        )
        duration_ms = int((time.time() - start_time) * 1000)

        output_lines = result.stdout.split('\n')[-10:]  # Last 10 lines
        evidence = '\n'.join(output_lines).strip()[:500]  # First 500 chars

        if result.returncode == 0:
            return "pass", evidence, duration_ms
        elif "Extension error" in result.stderr or "not found" in result.stderr:
            return "error", result.stderr[:500], duration_ms
        else:
            return "error", f"Exit code {result.returncode}: {result.stderr[:300]}", duration_ms

    except subprocess.TimeoutExpired:
        return "error", "Test exceeded 90 second timeout", 90000
    except Exception as e:
        return "error", str(e)[:300], 0

def main():
    # Prepare output directory
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Get environment info
    try:
        pi_version = subprocess.run(
            ["pi", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        ).stdout.strip()
    except:
        pi_version = "unknown"

    node_version = subprocess.run(
        ["node", "--version"],
        capture_output=True,
        text=True,
        timeout=5
    ).stdout.strip()

    platform = subprocess.run(
        ["uname", "-s"],
        capture_output=True,
        text=True,
        timeout=5
    ).stdout.strip().lower()

    # Run tests
    start_time = datetime.utcnow().isoformat() + "Z"
    tests_results = []
    stats = {"pass": 0, "fail": 0, "skip": 0, "error": 0, "total": 0}

    print(f"Starting live extension tests... ({len(TESTS)} extensions)")
    for ext_name, prompt in TESTS.items():
        stats["total"] += 1
        print(f"  Testing {ext_name}...", end=" ", flush=True)

        status, evidence, duration = run_extension_test(ext_name, prompt)
        stats[status] += 1

        print(status.upper())

        tests_results.append({
            "id": f"ext.{ext_name}",
            "name": f"Load and test {ext_name}",
            "command": f"pi -e extensions/{ext_name}.ts -p \"{prompt[:50]}...\"",
            "status": status,
            "evidence": evidence,
            "duration_ms": duration,
            "notes": "Live extension test via pi CLI"
        })

    finish_time = datetime.utcnow().isoformat() + "Z"

    # Build result JSON
    result = {
        "category": "core-extensions",
        "category_name": "Core PI Agent Extensions",
        "scope": ", ".join(TESTS.keys()),
        "tested_by": "test-extensions.py",
        "started_at": start_time,
        "finished_at": finish_time,
        "environment": {
            "pi_version": pi_version,
            "node_version": node_version,
            "platform": platform,
            "cwd": "/Users/ricardo/Workshop/GitHub/agent-pi"
        },
        "tests": tests_results,
        "summary": stats,
        "improvements": [],
        "divergences": []
    }

    # Write output
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\nResults written to: {OUTPUT_FILE}")
    print(f"Summary: tests={stats['total']} pass={stats['pass']} fail={stats['fail']} skip={stats['skip']} error={stats['error']}")

    return 0 if stats['error'] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
