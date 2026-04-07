# Tasks: Fix Clarifying Questions Generation

## Task 1: Rewrite PLAN_PROMPT Phase 2b
> Refs: FR-1, FR-2, FR-3, FR-4

- [ ] 1.1: In `extensions/lib/mode-prompts.ts`, locate the PLAN_PROMPT Phase 2b section (starts at "### Phase 2b: Follow-up Questions")
- [ ] 1.2: Replace the existing 6-line section with the new question-writing protocol including lettered-options format, no-pre-answering rule, deduplication rule, conciseness rule, and the 3-8 count guideline
- [ ] 1.3: Include the inline example showing proper A) B) C) format with `_Default: X_`
- [ ] 1.4: Preserve the `show_plan` questions mode call instruction and the "use returned answers to refine your plan" instruction

## Task 2: Rewrite SPEC_PROMPT Phase 2 Question Bullets
> Refs: FR-1, FR-2, FR-3, FR-4, FR-5

- [ ] 2.1: In `extensions/lib/mode-prompts.ts`, locate the SPEC_PROMPT Phase 2 section ("### Phase 2: Shape Requirements")
- [ ] 2.2: Remove the three problematic bullets: "Generate 4-8 numbered clarifying questions with sensible defaults when needed", "Frame assumptions as 'I'm assuming X, is that correct?'", and "Use `_Default: value_` format for defaults"
- [ ] 2.3: Replace with the same question-writing rules used in PLAN_PROMPT Phase 2b (consistent format — FR-5)
- [ ] 2.4: Keep all non-question instructions intact: visual assets request, reusability check, EARS acceptance criteria, `commander_workflow` template calls, `commander_spec` tracking

## Task 3: Verify
> Refs: NFR-1, NFR-2

- [ ] 3.1: Run TypeScript compile check on `extensions/lib/mode-prompts.ts` — no errors
- [ ] 3.2: Grep the file for "I'm assuming" — should return zero matches
- [ ] 3.3: Grep the file for "Frame assumptions" — should return zero matches
- [ ] 3.4: Verify both prompts contain the same 5 question-writing rules (consistency check)
- [ ] 3.5: Verify the `show_plan` questions mode call instruction is preserved in both prompts
- [ ] 3.6: Verify total added lines per section is under 30 (NFR-2)
