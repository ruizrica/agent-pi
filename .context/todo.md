# Plan Viewer — Interactive Markdown Plan Viewer/Editor for Plan Mode

## Overview
A standalone Photon extension (`plan-viewer.ts`) that provides an interactive rendered markdown viewer/editor window. When Plan Mode completes a plan (written to `.context/todo.md`), the agent calls a `show_plan` tool to open a fullscreen overlay displaying the plan as beautifully rendered markdown. The user can review, edit, reorder, and approve the plan inline.

## Architecture

### File Structure
```
agent/extensions/
  plan-viewer.ts              ← Main extension (tool + overlay + command)
  lib/plan-viewer-render.ts   ← Rendering helpers (markdown view, edit mode)
  lib/plan-viewer-editor.ts   ← Inline editing logic (reorder, edit items, add sections)
```

### How It Works
```
Agent writes plan to .context/todo.md
         │
         ▼
Agent calls `show_plan` tool (file_path, title?)
         │
         ▼
┌─────────────────────────────────────────────┐
│  Fullscreen Overlay — Plan Viewer           │
│                                             │
│  ┌─── Rendered Markdown View ─────────┐     │
│  │ # Implementation Plan              │     │
│  │                                    │     │
│  │ ## Phase 1: Setup                  │     │
│  │ ☐ 1. Create extension file         │     │
│  │ ☐ 2. Register tool + command       │     │
│  │                                    │     │
│  │ ## Phase 2: Build                  │     │
│  │ ☐ 3. Implement overlay renderer    │     │
│  │ ☐ 4. Add edit capabilities         │     │
│  └────────────────────────────────────┘     │
│                                             │
│  [e] Edit  [r] Reorder  [m] Markdown View   │
│  [s] Save to Desktop  [c] Copy  [Esc] Close │
│  [Enter] Approve & Close                    │
└─────────────────────────────────────────────┘
         │
         ▼
Tool returns: "User approved plan" / "User edited plan: <changes>"
              / "User declined plan"
```

### Key Features
1. **Rendered Markdown View** — Uses Pi's built-in `Markdown` component from `@mariozechner/pi-tui`
2. **Checkbox Interaction** — `[ ]` / `[x]` items are navigable, toggle with Space
3. **Inline Edit** — Press `e` on a line to edit it in-place (text input overlay)
4. **Reorder Mode** — Press `r` to enter reorder mode; use ↑/↓+Enter to move items
5. **Add Section** — Press `a` to add a new section heading or list item
6. **Raw Markdown Toggle** — Press `m` to switch between rendered and raw markdown view
7. **Save to Desktop** — Press `s` to write the markdown file to `~/Desktop/plan-<timestamp>.md`
8. **Copy to Clipboard** — Press `c` to copy markdown content to system clipboard
9. **Approve/Decline** — Enter to approve, Esc to close without approval
10. **Scroll** — ↑/↓, PgUp/PgDn, Home/End for navigation

---

## Implementation Steps

- [x] 1. **Create `lib/plan-viewer-editor.ts`** — Plan data model and editing logic
  - Parse markdown into structured sections + items
  - Support: toggle checkbox, edit item text, reorder items, add section, add item
  - Serialize back to markdown string
  - Pure functions, no UI — testable independently

- [x] 2. **Create `lib/plan-viewer-render.ts`** — Rendering helpers
  - Rendered markdown view using Pi's `Markdown` + `Container` + `Spacer` components
  - Cursor highlighting for current item (navigation)
  - Status bar / footer rendering with keybind hints
  - Raw markdown view (plain text with syntax highlighting)
  - Handle view mode switching (rendered ↔ raw)

- [x] 3. **Create `plan-viewer.ts`** — Main extension file
  - **`show_plan` tool**: Opens the overlay, returns user's decision (approved/edited/declined)
    - Parameters: `file_path` (string, required), `title` (string, optional)
    - Reads the markdown file content
    - Opens fullscreen overlay via `ctx.ui.custom`
    - Returns structured result with user action and final markdown content
  - **`/plan` command**: Opens the overlay for the current `.context/todo.md` or a given file
  - **Overlay class `PlanViewerOverlay`**:
    - Modes: `view` (rendered markdown), `raw` (raw text), `edit` (inline editing), `reorder` 
    - Scrolling (↑/↓/PgUp/PgDn/Home/End)
    - Keyboard dispatch to mode-specific handlers
    - Footer bar with context-sensitive keybinds
  - Register in session_start with theme defaults

- [x] 4. **Update Plan Mode prompt** — In `lib/mode-prompts.ts`
  - Add instruction to use `show_plan` tool when presenting plan to user
  - Template: "After writing plan to .context/todo.md, call show_plan to present it"
  - Keep backward compatible — still works if tool call is skipped

- [x] 5. **Register in settings.json** — Add `extensions/plan-viewer.ts` to packages array

- [x] 6. **Wire up clipboard + file save utilities**
  - `pbcopy` (macOS) for clipboard
  - Write to `~/Desktop/plan-YYYY-MM-DD-HHMMSS.md`
  - Notify user via `ctx.ui.notify` on success/failure

- [x] 7. **Test the full flow end-to-end**
  - Switch to Plan Mode (Shift+Tab)
  - Ask agent to plan something
  - Verify overlay opens with rendered markdown
  - Test: scroll, toggle checkboxes, edit item, reorder, add section
  - Test: save to desktop, copy to clipboard
  - Test: approve and decline flows
  - Verify tool result is correct in both cases
