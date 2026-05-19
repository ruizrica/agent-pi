# Journal

Daily session journals preserve decisions, attempts, verification, and lessons in plain English.

## File Naming

Use one file per local day:

```text
journal/YYYY-MM-DD.md
```

## Entry Template

```markdown
## <HH:MM> — <short session or milestone title>

### Shipped / Changed
- <What changed, with file/task/commit pointers.>

### Decisions
- <Decision> — <brief rationale.>

### Tried / Did Not Work
- <Attempt> — <result or why it was abandoned.>

### Verification
- <Command/manual check> — <outcome.>

### Next
- <Concrete next step.>
```

## Rules

- Keep entries concise and useful six months later.
- Prefer pointers to plans, tasks, commits, PRs, and files over pasted diffs.
- Record failed attempts and rationale when they would prevent repeated work.
- Do not include secrets, credentials, full transcripts, full diffs, or noisy logs.
