---
name: onboard
description: Onboard this project with the interconnected agent doc pack (AGENTS.md hub, CLAUDE.md pointer, DESIGN.md, STATE.md) pre-populated from real project context, plus doc-freshness hooks
argument-hint: "[--full] [--hooks]"
allowed-tools: ["bash", "read", "edit", "write"]
---

# /onboard — Project Doc-Pack Onboarding (pi)

Single implementation lives in the toolkit; this command drives the same flow
from pi.

1. Run the scaffold + scan:
   `bash ~/Workshop/GitHub/agent-toolkit/plugins/toolkit/scripts/onboard.sh $ARGUMENTS`
2. If CLAUDE.md/AGENTS.md already existed, re-run with `--absorb` (originals
   are backed up as `*.pre-onboard.bak`) and merge their content into the new
   AGENTS.md hub. Never silently drop an existing rule or convention.
3. Read `.context/onboard-scan.md` and fill every `{{PLACEHOLDER}}` in
   AGENTS.md / DESIGN.md / STATE.md / CLAUDE.md with real project context
   (overview, stack, conventions, architecture + mermaid, current focus from
   recent commits). Mark genuinely unknown values `(unknown)`.
4. Verify: `grep -rn '{{' AGENTS.md CLAUDE.md DESIGN.md STATE.md` returns
   nothing; header nav links resolve.
5. Report: created docs, absorbed content, unresolved gaps, hook status.
