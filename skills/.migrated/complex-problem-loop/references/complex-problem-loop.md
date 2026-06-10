# Complex Problem Loop Protocol

This protocol defines how to work through hard engineering tasks that need repeated back-and-forth while keeping state, evidence, and decisions coherent.

## Loop Stages

### 1. Understand

Build a precise statement of:

- Goal
- Constraints
- Known facts
- Important unknowns
- Definition of done

If the task is under-specified, ask narrow clarifying questions before proceeding.

### 2. Choose the Next Best Information Move

Before coding, decide what information would most reduce uncertainty. Common moves:

- Read the entry point and nearest implementation files
- Search for existing patterns
- Trace the data/control flow across boundaries
- Inspect tests and validation paths
- Dispatch scouts if the work spans multiple areas

Prefer the smallest move that increases confidence.

### 3. Synthesize

After gathering context, pause and summarize:

- What appears to be true
- What evidence supports it
- What competing hypotheses remain
- What path seems most promising
- What the next execution slice should test or accomplish

Do not let gathered information remain implicit.

### 4. Plan

When the task is non-trivial, write a phased plan before implementation. Tie the plan to real files, reusable components, and verification steps.

### 5. Execute One Slice

A slice should be one focused unit of progress. Good slices are:

- Introduce a test for one behavior boundary
- Refactor one seam so future changes are safer
- Implement one decision from the plan
- Add one integration point
- Resolve one uncertainty through a contained experiment

Avoid multi-part slices that mix unrelated changes.

### 6. Reflect

After each slice, answer:

- What changed?
- What did we learn?
- Did confidence increase or decrease?
- Is the current approach still valid?
- What should happen next?

Next action options:

- **Continue** when the next move is clear
- **Ask** when a user decision is needed
- **Hand off** when another specialist can reduce uncertainty faster
- **Re-plan** when discoveries invalidate the current plan

### 7. Preserve State

For long tasks, preserve:

- Current goal
- Active hypothesis
- Evidence gathered
- Files read or changed
- Open risks
- Next intended slice

Keep this state in `.context/` so future turns can resume quickly.

## Branching Rules

### If ambiguity blocks implementation
Ask the user a narrow question with a default when possible.

### If multiple subsystems are involved
Dispatch parallel scouts before planning.

### If a slice fails or creates new uncertainty
Do not blindly continue. Reflect, update state, and either revise the plan or run a smaller diagnostic slice.

### If context gets large
Persist state and use `cycle_memory` rather than carrying every detail in working memory.

### If another agent should own the next step
Use subagent continuation or queueing so work stays attached to the right context thread.

## Quality Bar

A good loop run should make the next step obvious. If each iteration leaves the state fuzzier than before, the loop is too large, too implicit, or insufficiently grounded in evidence.
