# Requirements Questions

1. What should count as in scope for this migration?
A) Only existing agent/subagent/advisor execution paths for Claude-family models
B) All runtime Claude-powered features, including non-agent utilities like viewers/analysis helpers
C) Any code path that invokes Claude models, whether agentic or utility-oriented
_Default: C_

**Answer:** C

2. How strict should enforcement be against direct Claude API/SDK usage after migration?
A) Replace known usages only
B) Replace usages and add tests to prefer the CLI path
C) Replace usages and add guardrails/tests that block new direct Claude API/SDK calls for runtime execution
_Default: C_

**Answer:** B

3. How should non-Claude providers behave after this change?
A) Leave non-Claude providers unchanged
B) Move other providers toward the same CLI pattern where feasible
C) Abstract all providers behind one new execution runtime now
_Default: A_

**Answer:** A

4. What level of behavioral compatibility should the migration preserve for current Claude-backed features?
A) Best-effort only
B) Preserve user-visible behavior where practical, allowing small output/streaming differences
C) Strictly preserve current UX, output shape, streaming semantics, and permissions behavior
_Default: B_

**Answer:** C

5. How should Claude CLI sessions be handled for migrated paths?
A) Mostly stateless one-off runs modeled on `/advisor`
B) Reuse/resume sessions where a feature already depends on conversation continuity
C) Design a new shared session manager as part of this migration
_Default: B_

**Answer:** B

6. What visual assets or diagrams should be included in `visuals/` for this spec?
A) No extra assets beyond mermaid diagrams in markdown
B) Add one execution routing diagram image if useful
C) Add a fuller visual set for architecture, migration phases, and validation flows
_Default: A_

**Answer:** A

7. For reusability, should the design explicitly prioritize extending existing Claude runtime helpers before adding new infrastructure?
A) Yes, reuse and extend existing `/advisor` Claude CLI helpers first
B) Reuse where convenient, but allow parallel new runtime modules
C) Build a fresh Claude runtime abstraction from scratch
_Default: A_

**Answer:** A

## Additional User Clarification
- This migration is driven by Claude restrictions on automated Agent SDK usage.
- Claude-family automation must route through the local Claude Code CLI path.
- The system must continue to work with all other existing models and flows.
