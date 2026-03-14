# Plan: Adapt Plan Mode to Follow Claude Code Plan Format

## Context

Our current PLAN mode produces flat numbered-step plans (Context → Steps → Testing → Rollback). The user wants to adopt the rich, structured format from Claude Code plans which feature:

1. **Title line** — "Plan: <action> — <specifics>"  
2. **Context narrative** — detailed situational description, not just a summary  
3. **Data tables** — inline mapping tables (e.g. color mapping, config mapping)  
4. **Phased approach** — each phase has: Why, Test-first, New files, Modify files, with detailed specifics  
5. **Critical Files section** — table of files with Action column (New, Modify, Reference, Read-only)  
6. **Reusable Components** — callout of existing code that stays untouched  
7. **Verification checklist** — numbered, specific, actionable verification steps  

This requires changes to: (a) the PLAN_PROMPT system prompt that teaches the AI how to write plans, (b) the planner agent definition, and (c) the plan viewer HTML to render the richer format beautifully (tables, phased sections, callout boxes).

## Proposed Steps

- [x] 1. Update PLAN_PROMPT in `agent/extensions/lib/mode-prompts.ts` to teach the new plan format with explicit structure template
- [x] 2. Update planner agent definition in `agent/.pi/agents/planner.md` to match the new output format
- [x] 3. Enhance plan viewer HTML rendering in `agent/extensions/lib/plan-viewer-html.ts` to style phase blocks, data tables, file tables, and callout sections
- [x] 4. Test that the updated plan viewer renders a sample Claude Code-style plan correctly
- [ ] 5. Present completion report

## Critical Files

| File | Action |
|------|--------|
| `agent/extensions/lib/mode-prompts.ts` | Modify (PLAN_PROMPT) |
| `agent/.pi/agents/planner.md` | Modify (output format) |
| `agent/extensions/lib/plan-viewer-html.ts` | Modify (CSS + rendering) |

## Verification

1. Open a sample plan in the viewer — verify phase blocks, tables, and callout boxes render correctly
2. Confirm the PLAN_PROMPT includes the full format template with examples
3. Confirm the planner agent definition matches the new format
