---
name: to-prd
description: Turn the current conversation context into a PRD and publish it as a cmd task. Use when user wants to create a PRD from the current context.
---

> Imported from mattpocock/skills@main · hand-ported to use `cmd` (Commander v2) instead of a generic issue tracker.

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

The triage label vocabulary is defined in the `triage` skill — see `skills/triage/SKILL.md`.

> 🛑 **`cmd task add` requirements** for the PRD root task (see also `CLAUDE.md` → "MANDATORY Pre-flight Checklist"):
> - `--mission-brief "1-3 sentence what & why"` is **REQUIRED**. A PRD is always a root task. Write the brief BEFORE running `cmd task add` — don't let `cmd` warn you about a missing brief.
> - Always pass `--runtime claude-code --model <name>` on every write.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

2. Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these modules match their expectations. Check with the user which modules they want tests written for.

3. Write the PRD using the template below, then publish it as a `cmd` task. Apply the `prd` and `triage:ready-for-agent` labels — no need for additional triage.

```bash
RUNTIME="--runtime claude-code --model claude-opus-4-7"

cmd task add "PRD: <feature name>" \
  --mission-brief "<one-sentence what & why for the dashboard mission card>" \
  --labels prd,triage:ready-for-agent \
  --description "$(cat <<'EOF'
## Problem Statement
...

## Solution
...

## User Stories
...

## Implementation Decisions
...

## Testing Decisions
...

## Out of Scope
...

## Further Notes
...
EOF
)" \
  $RUNTIME
```

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>
