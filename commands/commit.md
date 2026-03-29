---
name: commit
description: "Save all current work as one or more local commits on the current branch, splitting unrelated changes into separate commits when needed."
argument-hint: "[optional hint for the primary commit theme]"
allowed-tools: ["Bash", "Read", "ask_user"]
---

# Commit — Save all current work locally

You are handling the `/commit` slash command.

## Goal

Save **all current repository work** on the **current branch** as local commits only.

This command is different from the normal commit policy:
- You **must not omit changes** that are already part of the current working tree.
- If unrelated changes exist, you should **separate them into multiple coherent commits** instead of forcing everything into one commit.
- You must **never** merge, rebase, push, open PRs, switch branches, or otherwise change branch topology.

The user-provided hint is:

`$ARGUMENTS`

Use it as a clue for the **primary** commit grouping if it helps, but do not let it cause you to ignore other existing changes.

## Required workflow

Follow this workflow exactly.

### 1. Verify repo state first

1. Confirm you are inside a git repository.
2. Show the current branch name.
3. Run and show:
   - `git status --short`
   - `git status --branch --short`
4. If there are no changes, reply that there is nothing to commit and stop.

### 2. Inspect everything before committing anything

Inspect the full working tree before creating commits.

At minimum, gather:
- modified / added / deleted / renamed files
- staged vs unstaged state
- untracked files
- high-level diffs or file summaries sufficient to understand what changed

Use git commands such as:
- `git diff --stat`
- `git diff --cached --stat`
- `git diff --name-only`
- `git diff --cached --name-only`
- `git ls-files --others --exclude-standard`
- targeted `git diff -- <path>` when needed

### 3. Group changes into coherent commit sets

Create one or more commit groups using these heuristics:
- keep files together when they clearly serve the same feature, fix, refactor, docs update, test update, or config change
- split groups when changes are obviously unrelated by directory, purpose, or diff content
- keep tests with the implementation they validate
- keep docs with the feature they document when clearly related
- do not create excessive micro-commits if the files are one coherent unit

If the working tree contains both:
- one clear primary body of work, and
- one or more unrelated side changes,

then commit the primary body in one commit and the unrelated work in separate commits.

### 4. Present the grouping plan before writing commits

Before any `git add` or `git commit`, present a short summary:
- branch name
- all detected files
- proposed commit groups
- proposed commit message for each group

If the grouping is ambiguous, ask the user **one concise clarifying question** before proceeding.
If the grouping is clear, proceed without asking.

### 5. Create local commits group by group

For each commit group:
1. stage only that group
2. verify staged content with `git diff --cached --stat`
3. create a clear local commit message
4. run `git commit -m "..."`
5. show the resulting commit summary briefly

After each commit, continue until the working tree is fully committed.

### 6. Finish with proof

At the end, show:
- `git log --oneline -n <number of commits created>`
- final `git status --short`
- a concise summary of what was saved in each commit

## Commit message rules

Prefer descriptive, scoped messages. Use common prefixes when they fit naturally:
- `feat:` for new functionality
- `fix:` for bug fixes
- `refactor:` for internal restructuring
- `docs:` for documentation-only changes
- `test:` for test-only changes
- `chore:` for tooling, config, cleanup, or maintenance

Guidelines:
- write in imperative mood
- mention the actual subject area
- do not use vague messages like `updates` or `wip` unless the diff truly cannot be described better
- if `$ARGUMENTS` gives a good primary theme, use it to improve the first commit message

## Hard constraints

- **Do not push**
- **Do not merge**
- **Do not rebase**
- **Do not switch branches**
- **Do not stash as a substitute for committing**
- **Do not omit unrelated changes** — separate and commit them too
- **Do not rewrite prior commits**

## Safety and judgment

- If a path appears sensitive or surprising, mention it explicitly in the grouping summary before committing.
- If a file is hard to classify, inspect it before deciding.
- If commit grouping is still unclear after inspection, ask a concise question rather than guessing a misleading commit history.

## Success condition

Success means:
1. all current work has been saved as local commits on the current branch,
2. unrelated work has been split into separate coherent commits when appropriate,
3. no push/merge/branch operations occurred, and
4. the final working tree is clean or any intentionally uncommitted state is explicitly explained.
