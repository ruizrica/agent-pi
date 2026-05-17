---
name: @implement
description: "Process @implement comments in code files: perform the requested implementation, then convert the directive comments into durable documentation."
argument-hint: "[file or directory to process]"
allowed-tools: '["read", "bash", "edit", "write", "ask_user"]'
context: inline
---

# /@implement — Convert Directives to Implementation + Documentation

Use this Pi command when code contains `@implement` comments that describe a change to make.

## Input

Target: `$ARGUMENTS`

If no target is provided, inspect the current working directory for likely source files containing `@implement`.

## Workflow

1. Run memory-assisted recon when useful.
   - If the target is broad, the directive references prior decisions, or the implementation area is unfamiliar, search local memory first: `agent-memory search "<target or directive topic>" --json`.
   - If the codebase has been indexed, use `agent-memory code-nav "<target/module>" --json` or `agent-memory code-tree --json` to find likely files before broad scanning.
   - Treat memory/code-index results as leads and verify them against current files.
   - Continue gracefully if `agent-memory` is unavailable.
2. Locate directive blocks.
   - If `$ARGUMENTS` is a file, read that file.
   - If `$ARGUMENTS` is a directory or empty, search relevant source files for `@implement`.
   - Ignore generated/build/vendor directories such as `node_modules`, `dist`, `build`, `.git`, and similar.
3. For each directive, understand the requested change in local code context.
4. Implement the requested behavior using the smallest safe edit.
5. Convert the directive into durable documentation:
   - Remove the literal `@implement` marker.
   - Rephrase imperative implementation notes into documentation.
   - For functions, methods, classes, and modules, prefer the project’s existing doc comment style.
6. Run targeted verification appropriate to the touched files.
7. If the directive encodes a durable project convention or reusable implementation pattern, optionally add one concise `agent-memory` entry after verification.
8. Report:
   - Files changed.
   - Directives handled.
   - Verification run.
   - Any directives skipped and why.

## Guardrails

- Do not treat `@implement` as permission to bypass the user’s current task scope.
- If a directive asks for a large feature or ambiguous behavior, stop and ask a focused clarification question.
- If a directive conflicts with repository rules or active Pi mode instructions, follow the higher-priority project/Pi instructions and explain the conflict.
- Do not store secrets, full diffs, or unverified directive interpretations in `agent-memory`.
- Do not delete unrelated code while converting comments to documentation.
