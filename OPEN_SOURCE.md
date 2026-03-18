# Open Source Guide

This repo uses a **dual-remote workflow** to maintain both a private and public version of the codebase.

## Remote Setup

| Remote | Repo | Visibility | Branch |
|--------|------|------------|--------|
| `private` | `github.com/ruizrica/pi-dev` | Private | `master` |
| `public` | `github.com/ruizrica/agent-pi` | Public | `public` → `main` |
| `prodege` | `github.com/ricardo-ruiz_Prodege/agent` | Work | `master` |

## Push Workflow

```bash
# Day-to-day work (pushes to private repo — default)
git push

# Push cleaned public branch to open source repo
git push public public:main

# NEVER do this (guardrails will block it anyway):
# git push public master:main  ← blocked by pre-push hook
```

## How It Works

- **`master`** branch has the full codebase including proprietary skills
- **`public`** branch is a clean version with proprietary content removed
- A **pre-push hook** (`.githooks/pre-push`) blocks pushes to the `public` remote if any files match `.private-patterns`
- A **GitHub Actions workflow** (`.github/workflows/public-guard.yml`) provides a second layer of protection on the public repo

## Adding New Private Content

1. Add the file/pattern to `.private-patterns`
2. Make sure it's also in `.gitignore` (for the public branch)
3. Remove it from the `public` branch if it was already committed there
4. The pre-push hook and CI will automatically enforce the new pattern

## Syncing Public Branch

When you want to bring new (non-private) changes from `master` to `public`:

```bash
git checkout public
git merge master
# Verify no private content leaked:
grep -ri "swagbucks\|way-ios\|way-simulators" agent/ && echo "LEAK!" || echo "Clean ✅"
git push public public:main
```
