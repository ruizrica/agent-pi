# Feature: Fix Clarifying Questions Generation

## Raw Idea

The clarifying questions generated during SPEC mode (Phase 2 — Shape Requirements) and PLAN mode (Phase 2b — Follow-up Questions) are broken in several ways:

1. **Questions overlap / duplicate** — Two questions that should be one (e.g. "Chain scope" and "Module discovery approach" are really the same architectural decision)
2. **AI pre-answers its own questions** — Every question has "I'm assuming X" or "I'm assuming C — Both" language, which defeats the purpose of asking the user
3. **Missing clear options** — Some questions don't present proper A/B/C choices, just narrative
4. **Narrative bloat** — Questions are wrapped in paragraphs of justification instead of being concise option pickers
5. **The user doesn't get to choose** — The AI makes the decision and then asks "is that correct?" instead of presenting neutral options

## Root Cause

The SPEC_PROMPT in `extensions/lib/mode-prompts.ts` explicitly instructs:
- "Frame assumptions as 'I'm assuming X, is that correct?'"
- "Generate 4-8 numbered clarifying questions with sensible defaults"

The PLAN_PROMPT Phase 2b says:
- "Include sensible defaults in `_Default: value_` format where possible"

Neither prompt includes rules for:
- Question deduplication (each question = one distinct decision)
- Clean option format (lettered A/B/C choices)
- Prohibition on pre-answering or justifying assumptions
- Conciseness (question + options, nothing else)

## Affected Files

- `extensions/lib/mode-prompts.ts` — SPEC_PROMPT Phase 2 + PLAN_PROMPT Phase 2b
- `extensions/lib/plan-viewer-html.ts` — questions mode UI (reference only, may need format awareness)

## Source Investigation

From the scout analysis completed in the prior conversation turn:
- Questions are 100% AI-generated from prompt instructions (no templates)
- The `show_plan` questions mode auto-detects questions by `?` endings and `Default:` markers
- The plan-viewer-html renders question cards with optional default display
- No skill files or config files contribute to question format — it's all in mode-prompts.ts
