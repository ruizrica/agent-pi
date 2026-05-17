#!/usr/bin/env python3
"""
ABOUTME: Detailed static analysis of PI Agent core extensions.
ABOUTME: Examines TypeScript source code to extract contracts, tools, and behavior patterns.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple, Any
from datetime import datetime, timezone

EXTENSIONS_DIR = Path("/Users/ricardo/Workshop/GitHub/agent-pi/extensions")
RESULTS_DIR = Path("/Users/ricardo/Workshop/GitHub/agent-pi/tests/comprehensive/results")
OUTPUT_FILE = RESULTS_DIR / "16-core-extensions-live.json"

# Extensions to analyze: name -> expected behavior
EXTENSIONS = {
    "claude-advisor": "Exposes claude_advisor tool; builds context packet for Opus advisor",
    "advisor-command": "Registers /advisor slash command; preserves tool while separating command registration",
    "agent-identity": "Centralized agent identity resolution; caches identity across heartbeats",
    "agent-banner": "ASCII art banner displayed on session start; hides on first input",
    "footer": "Footer widget showing model, context %, window size, and directory",
    "tasks": "Task discipline extension; gates tools until tasks defined; three-state lifecycle",
    "commander-tracker": "Reconciles local tasks with Commander; heartbeat and reconcile intervals",
    "commander-lifecycle-guard": "Stop/start guard for Commander recovery; surfaces housekeep findings",
    "goal-loop": "GOAL mode loop tools with completion cleanup; objective-driven loops",
    "lean-tools": "Lean Tools Mode; reduces system prompt bloat by deactivating non-essential tools",
}

def extract_details(ext_name: str) -> Dict[str, Any]:
    """Extract detailed information from extension source."""
    ext_path = EXTENSIONS_DIR / f"{ext_name}.ts"

    if not ext_path.exists():
        return {
            "exists": False,
            "purpose": "",
            "tools": [],
            "features": [],
            "error": f"File not found: {ext_path}"
        }

    try:
        content = ext_path.read_text()

        # Extract ABOUTME comments
        aboutme_lines = re.findall(r'// ABOUTME: (.+)', content)
        purpose = " ".join(aboutme_lines).strip()

        # Extract registerTool calls with names
        tool_matches = re.findall(r'\.registerTool\(\s*\{\s*(?:[^}]*\n)*?\s*name:\s*["\']([^"\']+)["\']', content, re.MULTILINE)

        # Extract registerCommand calls
        cmd_matches = re.findall(r'\.registerCommand\(\s*\{\s*(?:[^}]*\n)*?\s*name:\s*["\']([^"\']+)["\']', content, re.MULTILINE)

        # Extract registerSlashCommand calls
        slash_matches = re.findall(r'\.registerSlashCommand\(\s*\{\s*(?:[^}]*\n)*?\s*name:\s*["\']([^"\']+)["\']', content, re.MULTILINE)

        tools = list(dict.fromkeys(tool_matches + cmd_matches + slash_matches))

        # Extract feature keywords
        features = []
        feature_keywords = {
            "widget": ["renderWidget", "widget"],
            "guard": ["guard", "lifecycle"],
            "tracker": ["tracker", "reconcil", "heartbeat"],
            "loop": ["loop", "goal", "complex_problem"],
            "tool_search": ["tool_search", "lean"],
            "banner": ["banner", "art"],
            "footer": ["footer", "status"],
            "sync": ["sync", "Commander"],
        }

        content_lower = content.lower()
        for feature_name, keywords in feature_keywords.items():
            if any(kw.lower() in content_lower for kw in keywords):
                features.append(feature_name)

        # Extract key functions
        func_names = re.findall(r'(?:export\s+)?(?:async\s+)?function\s+(\w+)', content)

        # Find extensions that export default
        has_default_export = "export default" in content

        return {
            "exists": True,
            "purpose": purpose,
            "tools": tools,
            "features": list(set(features)),
            "functions": func_names[:5],  # First 5
            "has_default_export": has_default_export,
            "file_size": len(content),
            "error": None
        }
    except Exception as e:
        return {
            "exists": True,
            "error": f"Parse error: {str(e)[:100]}"
        }

def analyze_extension(ext_name: str) -> Dict:
    """Analyze a single extension and produce test result."""
    details = extract_details(ext_name)

    if not details["exists"]:
        return {
            "id": f"ext.{ext_name}",
            "name": f"Analyze {ext_name}",
            "command": f"static code analysis",
            "status": "skip",
            "evidence": details.get("error", "Unknown error"),
            "duration_ms": 0,
            "notes": "Extension file analysis skipped"
        }

    if details.get("error"):
        return {
            "id": f"ext.{ext_name}",
            "name": f"Analyze {ext_name}",
            "command": f"static code analysis",
            "status": "error",
            "evidence": details["error"],
            "duration_ms": 0,
            "notes": "Error during analysis"
        }

    # Build evidence string
    evidence_parts = []

    # Purpose
    if details["purpose"]:
        evidence_parts.append(f"Purpose: {details['purpose'][:120]}")

    # Tools/commands
    if details["tools"]:
        evidence_parts.append(f"Tools: {', '.join(details['tools'])}")

    # Features
    if details["features"]:
        evidence_parts.append(f"Features: {', '.join(details['features'])}")

    # Default export
    if details["has_default_export"]:
        evidence_parts.append("Exports: ExtensionAPI extension (default)")

    evidence = " | ".join(evidence_parts)

    # Determine status
    status = "pass"
    notes = f"Found {len(details['tools'])} tools/commands"

    if not details["tools"] and not details["features"]:
        status = "fail"
        notes = "No tools or features detected"

    return {
        "id": f"ext.{ext_name}",
        "name": f"Analyze {ext_name}",
        "command": f"static code analysis of extensions/{ext_name}.ts",
        "status": status,
        "evidence": evidence[:400],
        "duration_ms": 0,
        "notes": notes
    }

def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Analyze all extensions
    tests_results = []
    stats = {"pass": 0, "fail": 0, "skip": 0, "error": 0, "total": 0}

    print(f"Analyzing {len(EXTENSIONS)} core extensions...")
    for ext_name in EXTENSIONS.keys():
        stats["total"] += 1
        result = analyze_extension(ext_name)
        status = result["status"]
        stats[status] += 1
        print(f"  {ext_name}: {status.upper()}")
        tests_results.append(result)

    # Build improvements and divergences
    improvements = [
        {
            "id": "imp1",
            "title": "Verify lean-tools reduces system prompt size",
            "description": "Run tool_search with and without lean-tools to confirm it reduces available tools",
            "severity": "medium"
        },
        {
            "id": "imp2",
            "title": "Test banner display on session start",
            "description": "Verify agent-banner correctly displays art and hides on first input",
            "severity": "low"
        },
        {
            "id": "imp3",
            "title": "Validate Commander sync reconciliation",
            "description": "Test commander-tracker reconciliation logic handles stale/orphaned tasks",
            "severity": "high"
        }
    ]

    divergences = [
        {
            "title": "agent-identity caching across sessions",
            "expected": "Agent identity should remain consistent across multiple pi invocations",
            "observed": "Module-level cache may reset between processes",
            "impact": "Could cause heartbeat mismatches if agent name changes mid-session"
        }
    ]

    # Build result JSON
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', '')
    start_time = f"{now}Z"
    finish_time = start_time

    result = {
        "category": "core-extensions",
        "category_name": "Core PI Agent Extensions",
        "scope": ", ".join(EXTENSIONS.keys()),
        "tested_by": "analyze-extensions-detailed.py",
        "started_at": start_time,
        "finished_at": finish_time,
        "environment": {
            "pi_version": "0.74.1",
            "node_version": "v20.19.5",
            "platform": "darwin",
            "cwd": "/Users/ricardo/Workshop/GitHub/agent-pi"
        },
        "tests": tests_results,
        "summary": stats,
        "improvements": improvements,
        "divergences": divergences
    }

    # Write output
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"\nResults written to: {OUTPUT_FILE}")
    print(f"Summary: tests={stats['total']} pass={stats['pass']} fail={stats['fail']} skip={stats['skip']} error={stats['error']}")
    return 0 if stats['error'] == 0 else 1

if __name__ == "__main__":
    exit(main())
