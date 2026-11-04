---
name: build
description: Build a new feature or module deep from the start — the greenfield counterpart to improve-codebase-architecture. Reads the project's domain language (CONTEXT.md) and decisions (docs/adr/), designs the interface twice, builds one deep module behind a small interface, tests at the seam, and writes new terms/ADRs back as it goes. Runs a preflight that detects or bootstraps lightweight architecture setup files. Use when starting a new feature, module, service, or slice and you want it in great architectural shape from the first commit.
---

# Build

`/improve-codebase-architecture` retrofits *existing* shallow modules into deep ones. `/build` does the same thing **forward** — it grows new code deep from the first line, so there's nothing to retrofit later.

It is both a **consumer** of the project's arch docs (reads `CONTEXT.md` + `docs/adr/` for language and constraints) and a **producer** (adds terms and records decisions as they crystallize), then **git-syncs** docs and code together so they never drift.

## The heart — non-negotiable principles

These are the same principles `/improve-codebase-architecture` enforces; here they shape new code instead of repairing old code. Use the vocabulary **exactly** — full definitions in [LANGUAGE.md](../improve-codebase-architecture/LANGUAGE.md). Don't drift into "component," "service," "API," or "boundary."

- **Module / interface / implementation** — build the thing as a module with a deliberate interface (everything a caller must know: types, invariants, ordering, error modes, config — not just the signature).
- **Build deep, not shallow.** Aim for a lot of behaviour behind a small interface. Do **not** pre-extract "helper" functions for testability — that manufactures shallow modules and scatters the real bugs across call sites. Keep logic local behind one interface.
- **The deletion test, run forward.** Before adding a module, ask: if I *didn't* add it, would complexity reappear across N callers? If yes, it earns its keep. If it would just pass calls through, fold it into its caller.
- **The interface is the test surface.** You will test across the module's external seam, asserting observable outcomes — not internal state. Design the interface so that's possible without reaching past it.
- **One adapter = hypothetical seam. Two adapters = real seam.** Introduce a port only where something actually varies (typically production + test). A single-adapter seam is just indirection — don't add it.

This skill is *informed by* the domain model: `CONTEXT.md` names the good seams; ADRs record decisions you must not re-litigate.

## Process

### 0. Preflight — detect, and create if needed

The project needs to be in "arch shape" before building, because `/build` writes domain terms to `CONTEXT.md` and reads the issue-tracker + domain-doc layout. Detect what exists:

- The `## Agent skills` block in `CLAUDE.md` / `AGENTS.md`, and `docs/agents/{domain,issue-tracker,triage-labels}.md` — bootstrapped from this skill's bundled [arch setup reference](references/arch-setup.md).
- `CONTEXT.md` (or `CONTEXT-MAP.md`) and `docs/adr/` — the glossary and decision log.
- Whether the target repo is a git repo (`git rev-parse --is-inside-work-tree`).

Then:

- **`docs/agents/` missing → bootstrap it inline.** Read [references/arch-setup.md](references/arch-setup.md), then write the chosen setup files into `docs/agents/`, editing only the option-specific details: tracker pick, any relabelled triage strings, and single- vs multi-context. Do not retype from memory when the bundled reference gives the canonical wording. Then write the `## Agent skills` block. This "create if needed" step is reusable in any repo and leaves the project genuinely set up, not just decorated.
- **`CONTEXT.md` / `docs/adr/` missing → proceed silently.** Per [references/arch-setup.md](references/arch-setup.md), these are created **lazily** — the moment Step 4 resolves the first term or decision, not upfront. Don't block building on their absence.
- **Not a git repo → note it** and ask whether to `git init` (Step 5's sync needs git). If the user declines, build without the sync step.

**Interactive vs. defaults posture.** By default, walk the user through the three setup decisions **one at a time** (issue tracker, triage labels, domain-doc layout), as the setup skill does. But if the user signalled "just go" / "use defaults" / a non-interactive run, **infer and announce** instead of asking: tracker from the git remote (GitHub/GitLab remote → that tracker; no remote → local markdown), canonical triage labels, single-context. State each inferred pick in the summary so the user can override later. **`CLAUDE.md` vs `AGENTS.md`:** if exactly one exists, edit it; if **both** exist, prefer `CLAUDE.md` (matching the setup skill). If **neither** exists, defer to the setup skill and **ask** which to create — except in the non-interactive "just go" posture, where you default to `CLAUDE.md` (this is a Claude Code ecosystem) and announce it. Never create both.

State what you found and what you created in one short summary, then continue.

### 1. Understand the work

Read the ticket/feature from wherever this repo tracks work (follow `docs/agents/issue-tracker.md`). Then read the domain docs **before** designing — per [references/arch-setup.md](references/arch-setup.md):

- `CONTEXT.md` (or the relevant context via `CONTEXT-MAP.md`) for the language you must use.
- The ADRs in `docs/adr/` that touch the area you're about to build in — these are constraints, not suggestions. If your plan contradicts one, surface it (_"contradicts ADR-0007 — but worth reopening because…"_) rather than silently overriding.

Name everything in the domain's vocabulary from the start. If the concept you need isn't in the glossary, that's a Step 4 signal.

### 2. Locate the seam and classify dependencies

Decide where the new module sits and what it depends on. Classify each dependency into the four categories in [DEEPENING.md](../improve-codebase-architecture/DEEPENING.md) — this decides the test strategy and whether a port is justified:

1. **In-process** (pure/in-memory) — no adapter; test through the interface directly.
2. **Local-substitutable** (PGLite, in-memory fs) — internal seam; test with the stand-in. No port at the external interface.
3. **Remote but owned** — define a port; inject an HTTP/gRPC adapter in prod, in-memory in tests.
4. **True external** (Stripe, Twilio) — inject a port; mock adapter in tests.

Apply seam discipline: only categories 3 and 4 (or two genuine adapters) justify a port at the interface.

### 3. Design the interface twice

Your first interface idea is rarely the best (Ousterhout, "Design It Twice"). For any non-trivial module, sketch **at least two** candidate interfaces inline and pick the deepest — most leverage per unit of interface a caller must learn.

**Escalate to the parallel sub-agent panel** ([INTERFACE-DESIGN.md](../improve-codebase-architecture/INTERFACE-DESIGN.md) — 3+ agents, each a different constraint: minimal / flexible / common-case / ports-and-adapters, then synthesize) when **any** of these hold: the module has a category-3 or category-4 dependency (a port whose shape is hard to undo), it exposes more than ~2 entry points, the interface will be consumed by code outside this module's own package, or the user asks. Otherwise the two inline sketches are enough — don't spin up agents for a two-verb module. Feed each agent both [LANGUAGE.md](../improve-codebase-architecture/LANGUAGE.md) and `CONTEXT.md` vocabulary so names stay consistent.

Show the chosen interface (types, invariants, ordering, error modes) and a usage example before writing the implementation.

### 4. Build deep, and document side effects inline

Implement the module behind the chosen interface. Keep the logic local; hide the parts that vary behind the seams you justified in Step 2. As decisions crystallize, capture them **there and then** — same discipline as `/improve-codebase-architecture` and `/grill-with-docs`:

- **Naming the module (or a concept inside it) with a term not in `CONTEXT.md`?** Add the term, using [CONTEXT-FORMAT.md](../grill-with-docs/CONTEXT-FORMAT.md). Create `CONTEXT.md` lazily if absent. Keep it a glossary — no implementation details.
- **Made a hard-to-reverse, surprising, real-trade-off decision while building** (architectural shape, a tech choice with lock-in, a deliberate deviation)? Offer an ADR using [ADR-FORMAT.md](../grill-with-docs/ADR-FORMAT.md). Only when all three tests hold — don't record the obvious.

### 5. Test at the interface, verify, and git-sync

- Write tests that cross the module's **external** seam, asserting observable outcomes, not internal state (see the testing strategy in [DEEPENING.md](../improve-codebase-architecture/DEEPENING.md)). Use the stand-in / in-memory adapter from the dependency category. Tests should survive internal refactors.
- Run the build and tests. Report failures with their output; don't claim done until they're green.
- **Language check.** Before committing, grep the new code and tests for the synonyms `CONTEXT.md` lists under `_Avoid_` (e.g. "short URL", "long URL"). If the shipped names drifted from the glossary, fix them — the glossary is only worth keeping if the code obeys it.
- **Git-sync.** Commit the code **and** the doc changes (`CONTEXT.md`, new ADRs, any `docs/agents/*` from preflight) **in the same commit**, so the glossary and decisions never drift from the code they describe. **Stage an explicit pathset — the files this build created or touched — never `git add -A`/`git add .`**, which would sweep unrelated work-in-progress into the build commit. First run `git status`: if unrelated files are already staged, stop and surface them rather than committing over them. Use a message that names the module in the domain's vocabulary. Push only if the user asks. If `docs/agents/issue-tracker.md` is GitHub/GitLab, reference the issue in the message.

## Reuse

`/build` is repo-agnostic. In a fresh repo the preflight bootstraps the arch setup; in a set-up repo it skips straight to building. The principles and formats live in the linked files, so this skill stays lean and every engineering skill keeps speaking the same language.
