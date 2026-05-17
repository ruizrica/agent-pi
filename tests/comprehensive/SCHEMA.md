# PI Agent Comprehensive Test — Result Schema

Each subagent writes its result file to `tests/comprehensive/results/NN-slug.json` matching this schema:

```json
{
  "category": "cli-basics",
  "category_name": "Core CLI Surface",
  "scope": "pi help/version/list-models/list/install/config",
  "tested_by": "haiku-agent-01",
  "started_at": "2026-05-17T12:00:00Z",
  "finished_at": "2026-05-17T12:05:00Z",
  "environment": {
    "pi_version": "0.74.1",
    "node_version": "v20.19.5",
    "platform": "darwin",
    "cwd": "/Users/ricardo/Workshop/GitHub/agent-pi"
  },
  "tests": [
    {
      "id": "cli.help",
      "name": "pi --help prints usage",
      "command": "pi --help",
      "status": "pass",
      "evidence": "first 5 lines / error trace / vitest summary",
      "duration_ms": 120,
      "notes": "Observed behavior, divergence, or improvement"
    }
  ],
  "summary": { "total": 0, "pass": 0, "fail": 0, "skip": 0, "error": 0 },
  "improvements": [
    { "id": "imp1", "title": "...", "description": "...", "severity": "low|medium|high" }
  ],
  "divergences": [
    { "title": "...", "expected": "...", "observed": "...", "impact": "..." }
  ]
}
```

Statuses:
- `pass` — observed behavior matches expectation
- `fail` — observed behavior contradicts expectation (verified)
- `skip` — could not run (env limitation, missing key, interactive-only)
- `error` — tooling/harness crashed; result inconclusive
