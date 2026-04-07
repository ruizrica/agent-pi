---
name: gopher-test-viewer
description: >
  Load Gherkin and Playwright drafts from the Gopher CLI's .gopher/ directory
  and display them in the interactive test viewer for review, editing, and approval.
  Use when the user says "show tests", "preview gherkin", "review drafts",
  "open test viewer", "show my features", or wants to see generated test artifacts
  from the Gopher CLI in a rich HTML viewer with syntax highlighting and editing.
allowed-tools: Bash(ls:*) Bash(cat:*) Bash(find:*) Read show_test_viewer
---

# Gopher Test Viewer Skill

Preview, edit, and approve Gherkin feature files and Playwright test specs generated
by the Gopher CLI — displayed in a rich interactive HTML viewer with syntax highlighting.

## When to Use

- User wants to preview generated Gherkin drafts from `.gopher/gherkin/`
- User wants to review Playwright test drafts from `.gopher/playwright/`
- User says "show tests", "preview features", "review drafts", "open test viewer"
- After running Gopher CLI's gherkin or playwright generation commands
- When the user wants to edit generated tests before approving/exporting

## How It Works

### 1. Locate Drafts

The Gopher CLI stores generated artifacts in the workspace's `.gopher/` directory:

```
.gopher/
  gherkin/
    draft-{uuid}.feature       # Raw Gherkin feature file
    draft-{uuid}.meta.json     # Metadata: id, surfaceId, status, version, timestamps
  playwright/
    draft-{uuid}.spec.ts       # Generated Playwright test code
    draft-{uuid}.meta.json     # Metadata: id, scenarioIds, status, assumptions
```

### 2. Load Draft Data

Read all draft files and their metadata. For each Gherkin draft:

```bash
# List all gherkin drafts
ls .gopher/gherkin/draft-*.meta.json

# Read a draft's metadata
cat .gopher/gherkin/draft-{id}.meta.json
# Fields: { id, surfaceId, status, version, content, createdAt, updatedAt }

# Read a draft's feature content  
cat .gopher/gherkin/draft-{id}.feature
```

For each Playwright draft:

```bash
# List all playwright drafts
ls .gopher/playwright/draft-*.meta.json

# Read a draft's metadata
cat .gopher/playwright/draft-{id}.meta.json
# Fields: { id, scenarioIds, status, content, assumptions, createdAt, exportPath }

# Read a draft's spec content
cat .gopher/playwright/draft-{id}.spec.ts
```

### 3. Match Gherkin ↔ Playwright Pairs

Playwright drafts reference their source Gherkin drafts via `scenarioIds`. 
When both exist, pair them. When only Gherkin exists (no Playwright generated yet),
show a placeholder for the Playwright panel.

### 4. Display in Test Viewer

Call `show_test_viewer` with the loaded features:

```
show_test_viewer({
  features: [
    {
      name: "Feature name from Gherkin",
      gherkin: "<contents of .feature file>",
      playwright_code: "<contents of .spec.ts file or placeholder>",
      file_path: "<original draft file path>"
    }
  ],
  title: "Gopher CLI — Test Drafts",
  output_dir: "./tests"  // Where approved files get saved
})
```

### 5. Handle Approval

When the user approves in the viewer:
- `.feature` and `.spec.ts` files are written to `output_dir`
- Report back which files were saved
- Optionally update draft metadata status to 'approved' or 'exported'

When the user declines:
- No files are written
- Ask for feedback on what to change

## Draft Status Lifecycle

```
Gherkin:    draft → approved → stale
Playwright: draft → reviewed → exported → stale
```

Only show drafts with status `draft` or `reviewed` by default.
Include `approved` or `exported` drafts if user explicitly asks.

## Metadata Schema

### GherkinDraft
```json
{
  "id": "uuid",
  "surfaceId": "uuid",
  "workspaceId": "/path/to/workspace",
  "content": "Feature: ...",
  "status": "draft",
  "version": 1,
  "createdAt": 1775482509012,
  "updatedAt": 1775482509012,
  "versions": []
}
```

### PlaywrightDraft
```json
{
  "id": "uuid",
  "scenarioIds": ["gherkin-draft-id"],
  "workspaceId": "/path/to/workspace",
  "status": "draft",
  "content": "import { test, expect } from ...",
  "assumptions": ["Assumed base URL is /api"],
  "createdAt": 1775482509012,
  "exportPath": null,
  "updatedAt": 1775482509012
}
```

## Example Workflow

```
User: "show me the generated tests"

Agent:
1. ls .gopher/gherkin/draft-*.feature → find 5 drafts
2. For each: cat .meta.json → get name from Feature: line, check status=draft
3. ls .gopher/playwright/draft-*.spec.ts → find matching playwright specs
4. Pair them by scenarioIds
5. Call show_test_viewer with all pairs
6. User reviews, edits Gherkin scenarios, tweaks Playwright assertions
7. User clicks "Approve & Save Tests"
8. Files written to ./tests/
9. Agent confirms: "Saved 5 feature files and 5 spec files to ./tests/"
```

## Tips

- Extract the feature name from the first line: `Feature: <name>`
- If no playwright drafts exist, generate placeholder code: `// Playwright tests pending generation`
- Filter out `stale` drafts unless explicitly requested
- Show draft count and status in the viewer title: `"Gopher CLI — 5 Drafts (3 paired)"`
- The viewer supports editing — user can fix Gherkin or Playwright before saving
