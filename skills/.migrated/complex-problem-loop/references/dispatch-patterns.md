# Dispatch Patterns for Complex Problem Loop

This document explains when the skill should stay single-agent and when it should use Pi's multi-agent primitives.

## Stay Single-Agent When

- The task is confined to one subsystem
- You can gather the needed context with a few reads
- The next execution slice is obvious
- Delegation would cost more coordination than it saves

## Dispatch Scouts When

Use `subagent_create_batch` with focused scout prompts when:

- The problem spans multiple directories or subsystems
- You need both pattern analysis and flow tracing
- Tests, config, and runtime behavior all matter
- You need faster reconnaissance before planning

Recommended scout roles:

1. Structure scout
2. Pattern scout
3. Flow scout
4. Test or config scout

Wait for all scouts before synthesizing findings.

## Use Planner-Style Thinking When

- The work touches many files
- There are multiple phases or migration concerns
- The user needs approval before implementation
- The solution requires explicit verification steps

Align with the repository's phased planning contract.

## Use Reviewer or Tester Follow-Ups When

- The slice changed behavior that could regress elsewhere
- You need a second pass on correctness or edge cases
- The next best move is validation rather than more implementation

## Use Persistent Subagents When

- A specialist has already gathered deep context
- Follow-up work belongs to the same narrow thread
- You want to queue the next task without losing the local context that agent built up

Prefer queueing or continuation over spawning a fresh agent when continuity matters.

## Suggested Dispatch Sequence

1. Clarify the goal
2. Dispatch scouts if complexity warrants it
3. Synthesize findings
4. Externalize a plan
5. Execute one slice
6. Dispatch reviewer/tester follow-up if needed
7. Update state and continue or hand off

## Anti-Patterns

- Spawning agents before defining what each one should learn
- Delegating the same ambiguous prompt to multiple agents
- Treating delegation as a substitute for synthesis
- Re-spawning new agents when an existing subagent already owns the thread
