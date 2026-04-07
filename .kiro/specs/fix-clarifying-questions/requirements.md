# Requirements: Fix Clarifying Questions Generation

## Overview

When Pi generates clarifying questions during SPEC mode (Phase 2 — Shape Requirements) or PLAN mode (Phase 2b — Follow-up Questions), the output is broken: questions overlap, the AI pre-answers its own questions with "I'm assuming X" language, options are missing or unclear, and the user doesn't get to actually choose. The root cause is in the prompt instructions in `extensions/lib/mode-prompts.ts` which explicitly teach these bad patterns.

## User Stories

### US-1: Clean Option Selection
As a Pi user receiving clarifying questions, I want each question to present clear, lettered options (A/B/C) so that I can quickly scan and pick the one I want without reading narrative paragraphs.

### US-2: No Pre-Answered Questions
As a Pi user, I want questions that ask me what I think — not questions that tell me what the AI already decided, so that my input actually matters.

### US-3: No Duplicate Questions
As a Pi user, I want each question to cover exactly one distinct decision, with no overlap between questions, so I'm not confused about what I'm being asked twice.

### US-4: Concise Questions
As a Pi user, I want questions to be short — the question text, the options, and an optional default — not multi-paragraph explanations of what the AI found in the codebase.

---

## Functional Requirements

### FR-1: Option Format
WHEN the AI generates a clarifying question with multiple choices, it SHALL present options as lettered items (A, B, C, etc.) on separate lines, each with a short label.

**Acceptance Criteria:**
- [ ] Each option is on its own line, prefixed with a letter: `A)`, `B)`, `C)`
- [ ] Option labels are one line maximum — no multi-sentence descriptions
- [ ] The `_Default: X_` tag appears on a separate line after the options, where X is a letter

### FR-2: No Assumptions or Pre-Answering
WHEN the AI generates clarifying questions, it SHALL NOT include any language that pre-selects, justifies, or assumes an answer on the user's behalf.

**Acceptance Criteria:**
- [ ] No "I'm assuming", "I think", "I'd recommend", or "Based on my investigation" language in questions
- [ ] No narrative paragraphs explaining why one option is better
- [ ] The AI presents options neutrally — all options are equal until the user picks one
- [ ] The `_Default:_` tag is the only hint, and it's a simple value not a justification

### FR-3: Question Deduplication
WHEN the AI generates clarifying questions, each question SHALL cover exactly one distinct decision with no overlap between questions.

**Acceptance Criteria:**
- [ ] No two questions ask about the same concern from different angles
- [ ] Related sub-decisions are merged into a single question with compound options if needed
- [ ] Total question count stays between 3-8 (existing guideline maintained)

### FR-4: Concise Format
WHEN the AI generates a clarifying question, the total content for that question SHALL be: one question line, the option lines, and optionally a default line — nothing else.

**Acceptance Criteria:**
- [ ] No preamble paragraphs before the question
- [ ] No "context" or "background" sections within individual questions
- [ ] A brief heading or topic label is allowed (e.g. `## Scope`) but not a paragraph

### FR-5: Consistent Format Across Modes
The same question-writing rules SHALL apply in both SPEC mode (Phase 2) and PLAN mode (Phase 2b).

**Acceptance Criteria:**
- [ ] SPEC_PROMPT and PLAN_PROMPT use the same question format instructions
- [ ] A shared reference example is included in both prompts

---

## Non-Functional Requirements

### NFR-1: Backward Compatibility
The `show_plan` questions mode viewer SHALL continue to auto-detect questions using existing markers (`?` line endings, `Default:` presence). No viewer code changes required.

### NFR-2: Prompt Size
The updated instructions SHALL add no more than ~30 lines to each prompt section, keeping the total prompt size reasonable.

---

## Out of Scope
- Changes to the `show_plan` questions mode HTML/UI
- Changes to the plan-viewer-html.ts question detection logic
- Adding new tools or commands
- Changes to any skill files (the fix is entirely in mode-prompts.ts)
