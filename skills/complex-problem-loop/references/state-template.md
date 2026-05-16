# Complex Problem Loop State Template

Use this template for `.context/complex-problem-loop.md` or a session-specific state file under `.context/complex-problem-sessions/`.

```markdown
# Complex Problem Session

## Goal
<What must be accomplished>

## Success Criteria
- <Observable outcome>
- <Verification condition>

## Constraints
- <Constraint>
- <Constraint>

## Current Understanding
- <Fact>
- <Fact>

## Active Hypothesis
- <Best current explanation or approach>

## Evidence
| Evidence | Source |
|----------|--------|
| <finding> | `path/to/file.ts:line` |

## Files in Play
| File | Role |
|------|------|
| `path/to/file.ts` | Read / Modify / Test |

## Open Questions
- <Question that still matters>

## Risks
- <Risk>

## Last Slice
- <What was just attempted or completed>

## Next Slice
- <Smallest high-value next step>

## Delegation Notes
- <Which subagent or specialist is working on what, if any>
```

## Guidance

- Keep this short enough to re-read quickly
- Update it after every meaningful slice on long tasks
- Record evidence, not just conclusions
- Replace stale hypotheses instead of accumulating contradictory notes
