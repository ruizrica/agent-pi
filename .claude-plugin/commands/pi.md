---
description: Run Pi orchestration from Claude Code via the pi-agent-orchestrator bridge (plan, spec, team, pipeline, chain).
argument-hint: <subcommand> [...args]
allowed-tools: Bash
---

Run the bridge with the user's arguments (modes **plan**, **spec**, **team**, **pipeline**, **chain** map to Pi workflows):

```bash
node scripts/pi-agent-orchestrator.mjs $ARGUMENTS
```

The bridge supports **dispatch** (single agent), **batch** (parallel agents), and **chain** (sequential chain execution). See `skills/pi-agent-orchestrator/SKILL.md` for full flags and examples.
