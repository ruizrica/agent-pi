---
name: reco-qa
description: Public QA Reco pre-release automation workflow for Basic Feed, Scrolling, Liking, and Commenting. Use when preparing a Reco release report, running /qa-reco, validating feed engagement, or assembling QAReportData from simulator results.
allowed-tools: Bash(agent-device:*) Bash(node:*) Bash(bash:*) Bash(xcrun:*) Bash(adb:*) Read
---

# Reco QA Pre-release Automation

This public skill runs and assembles the QA Reco pre-release gate used by `/qa-reco` and `show_qa_reco`.

The suite is intentionally catalog-driven so more automations can be added cleanly:

- Catalog: `extensions/lib/qa-reco-prerelease.ts`
- Runner manifest: `skills/qa-automation/qa-test-flows/reco-prerelease/manifest.json`
- Shared helpers: `skills/qa-automation/qa-test-flows/lib/reco-prerelease-helpers.sh`
- Flow scripts: `skills/qa-automation/qa-test-flows/flows/reco-prerelease/*.sh`
- Report assembler: `skills/qa-automation/qa-test-flows/lib/build-qa-reco-report.mjs`

## Required Configuration

Set these in the project-local `.pi/skills/qa-automation/qa.config.sh`, shell env, or local wrapper:

| Variable | Purpose |
| --- | --- |
| `PROJECT_DIR` | Reco app checkout root or mobile app root |
| `APP_BUNDLE_ID` | iOS bundle id / Android package used by `agent-device open` |
| `QA_PLATFORMS` | `ios`, `android`, or `ios android` |
| `IOS_AGENT_SESSION` | agent-device session for iOS, usually `default` |
| `ANDROID_AGENT_SESSION` | agent-device session for Android, usually `android` |
| `SCREEN_EXPLORE` | Optional screen name for feed navigation helpers |
| `TEST_OUTPUT_DIR` | Output root, default `/tmp/qa-tests` |

## Run Commands

From this repo or a project that mirrors `.pi/skills/qa-automation`:

```bash
# iOS only
bash /Users/ricardo/Workshop/GitHub/reco/mobile/.pi/skills/qa-automation/qa-test-flows/run-all.sh reco-prerelease --platform ios

# Android only
bash /Users/ricardo/Workshop/GitHub/reco/mobile/.pi/skills/qa-automation/qa-test-flows/run-all.sh reco-prerelease --platform android

# Both platforms
bash /Users/ricardo/Workshop/GitHub/reco/mobile/.pi/skills/qa-automation/qa-test-flows/run-all.sh reco-prerelease --platform both

# One or more sections
bash /Users/ricardo/Workshop/GitHub/reco/mobile/.pi/skills/qa-automation/qa-test-flows/run-all.sh reco-prerelease --platform ios --sections basic-feed,scrolling
```

## Assemble the Report

```bash
node skills/qa-automation/qa-test-flows/lib/build-qa-reco-report.mjs \
  --input /tmp/qa-tests \
  --output /tmp/qa-tests/qa-reco-prerelease-report.json
```

Then open the public report viewer:

```text
show_qa_reco mode=report report_data=<contents of /tmp/qa-tests/qa-reco-prerelease-report.json>
```

## Release Sections

1. **Basic Feed** — app foreground, feed navigation, feed data, first visible card, no error overlay, media evidence.
2. **Scrolling** — CDP next, gesture fallback, index progression, 3-5 item stress, scroll back, foreground stability.
3. **Liking** — initial state, action rail tap, state/count toggle, optional double tap, scroll persistence, cleanup.
4. **Commenting** — initial state, open sheet, empty-send disabled, unique comment, submit, count/list evidence, close/reopen persistence.

## Status Rules

- `passed`: evidence proves the check completed.
- `blocked`: missing simulator, auth, backend write permission, dev hook, selector, or other dependency prevents a valid result.
- `failed`: check ran and produced an invalid app behavior.
- `partial`: best-effort evidence exists but needs human review.
- `skipped`: intentionally not attempted with a reason.

Do not mark auth/backend issues as passed. Record them as blocked so the report gate can make an honest release decision.
