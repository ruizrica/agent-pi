# Plan: Extend Autoresearch — Implementation Chain, Session Persistence & Research Browser

## Context

Autoresearch currently ends at the completion report. The user sees results, diffs, and a summary — then the session is over. This is only half the story. Research findings need to become implemented code, and the whole research lifecycle (goal → research → implementation → final report) needs to be saved and resumable.

Three big additions are needed:

**1. Research → Implementation Chain:** The completion report currently says "here's what we found." Instead, it should present prioritized next steps as *actionable implementation tasks* — then offer to spawn a TEAM of specialist agents to execute those tasks. The report isn't the end; it's the handoff to implementation.

**2. Session Persistence:** Each autoresearch session (goal, plan, results log, findings, implementation work) should be saved as a JSON session file under `.context/research-sessions/`. Sessions can be resumed later — pick up where you left off, re-run with different approaches, or extend with more iterations.

**3. Research Browser:** A new web viewer (following the exact pattern of `reports-viewer.ts` + `reports-viewer-html.ts`) that lets users browse all saved research sessions. Search, filter by status (researching/implementing/complete), open any session to see the full lifecycle. Accessible via `/research` command and `show_research` tool.

The existing infrastructure is solid. The report-index system uses SQLite with JSON fallback. The reports-viewer is a self-contained HTML SPA served via local HTTP. The agent-team system dispatches specialist agents via `dispatch_agent`. We follow all these patterns.

### Key Files

| Existing Pattern | What We Reuse |
|-----------------|---------------|
| `agent/extensions/reports-viewer.ts` | HTTP server pattern, browser open, heartbeat |
| `agent/extensions/lib/report-index.ts` | SQLite + JSON storage pattern (but separate DB) |
| `agent/extensions/lib/reports-viewer-html.ts` | Full HTML SPA template pattern |
| `agent/extensions/completion-report.ts` | `show_report` tool registration pattern |
| `agent/extensions/agent-team.ts` | `dispatch_agent` tool, team spawning |
| `agent/.pi/commands/autoresearch/autoresearch.md` | Command definition (modify) |
| `agent/skills/autoresearch/SKILL.md` | Skill definition (modify) |

---

## Phase 1: Research Session Data Model & Persistence

**Why:** We need a structured way to save and load research sessions before we can build the chain or browser. This is the foundation everything else depends on.

**New file** → `agent/extensions/lib/research-session.ts`
- Define `ResearchSession` interface:
  ```typescript
  interface ResearchSession {
    id: string;                    // timestamp-slug
    status: "understanding" | "planning" | "researching" | "implementing" | "complete" | "paused";
    goal: string;                  // original goal
    metric: { name: string; direction: "higher" | "lower"; verifyCommand: string; baseline?: number; final?: number; target?: number };
    scope: { inScope: string[]; readOnly: string[]; outOfScope: string[] };
    plan: string;                  // markdown content of the research plan
    clarifyingQA: Array<{ question: string; answer: string }>;  // Q&A from understand phase
    iterations: Array<{ iteration: number; commit: string; metric: number; delta: number; status: string; description: string }>;
    findings: string;              // markdown: research findings/summary
    nextSteps: Array<{ priority: number; description: string; status: "pending" | "implementing" | "done" | "skipped" }>;
    implementation: { startedAt?: string; completedAt?: string; teamUsed?: string; tasksCreated?: number; summary?: string };
    createdAt: string;
    updatedAt: string;
    workingDirectory: string;
    tags: string[];
  }
  ```
- `saveResearchSession(session)` — write to `.context/research-sessions/{id}.json`
- `loadResearchSession(id)` — read from JSON file
- `listResearchSessions()` — scan directory, return sorted list
- `updateResearchSession(id, partial)` — merge update and save
- SQLite index (same pattern as `report-index.ts`) for searchable metadata
- `upsertResearchSessionIndex(session)` — persist to SQLite for browser search

**New directory** → `.context/research-sessions/`
- JSON files, one per session
- Automatically created on first save

---

## Phase 2: Update Autoresearch to Save Sessions

**Why:** The autoresearch command/skill needs to create and update a research session throughout its lifecycle — from understanding through research completion.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Add `show_research` to allowed-tools (needed for session save)
- In Step 1 (Understand): After synthesizing understanding, save initial session with status "understanding" and the Q&A
- In Step 2 (Plan): After plan approval, update session with plan content and status "planning"  
- In Step 3 (Setup): Update session status to "researching"
- In Step 4 (Loop): After each iteration, append to session's iterations array (every ~5 iterations or on keep)
- At loop end (before show_report): Update session with findings, final metric, and prioritized next steps. Change status to "researching" → ready for implementation handoff

**Modify** → `agent/skills/autoresearch/SKILL.md`  
- Mirror all session persistence changes from the command file

**Modify** → `agent/skills/autoresearch/references/autonomous-loop-protocol.md`
- Add session save calls to the loop protocol (after log phase)

---

## Phase 3: Implementation Handoff — Chain Research to Team

**Why:** This is the core new feature. The completion report should present findings as actionable next steps, then offer to spawn a team to implement them.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Restructure the completion phase (after loop ends) into two sub-phases:
  
  **Step 5: Research Report & Implementation Handoff**
  1. Compile findings: what worked, what didn't, prioritized next steps
  2. Write findings to `.context/autoresearch-plan.md` (update the plan with results section)
  3. Save session with status "researching", findings, and next steps array
  4. Present completion report via `show_report` — but frame it as a handoff:
     - "Research Complete — Ready for Implementation"
     - Include "Prioritized Next Steps" section with numbered action items
     - Include "Recommended Implementation Approach" section
  5. After report closes, ask user: "Ready to implement these findings? I'll spawn a team."
     ```
     ask_user {
       question: "Research complete. Ready to implement the findings?",
       mode: "select",
       options: [
         { label: "Implement now — spawn a team to execute the findings", markdown: "..." },
         { label: "Save & pause — resume implementation later", markdown: "..." },
         { label: "Done — research only, no implementation needed", markdown: "..." }
       ]
     }
     ```
  
  **Step 6: Implementation (if user chooses "implement now")**
  1. Update session status to "implementing"
  2. Convert next steps into Commander task group
  3. Dispatch specialist agents (builders) via `dispatch_agent` or `subagent_create_batch` to implement each finding
  4. Track implementation progress via Commander
  5. When implementation completes:
     - Update session with implementation summary, status "complete"
     - Present a FINAL completion report that includes:
       - Original research goal
       - Research results (baseline → final metric)
       - Implementation work done (files changed, tasks completed)
       - Any remaining gaps or follow-up items
     ```
     show_report {
       title: "Research & Implementation Complete: <goal>",
       summary: "## Original Goal\n<goal>\n\n## Research Results\n<findings>\n\n## Implementation\n<what was built>\n\n## Gaps & Follow-up\n<remaining items>"
     }
     ```

**Modify** → `agent/skills/autoresearch/SKILL.md`
- Mirror the same handoff and implementation phases

---

## Phase 4: Research Session Browser — Extension & Web Viewer

**Why:** Users need to browse, search, and resume saved research sessions. Following the exact pattern of the existing reports-viewer.

**New file** → `agent/extensions/lib/research-viewer-html.ts`
- Self-contained HTML SPA (same dark theme as reports-viewer-html.ts)
- Card-based layout showing research sessions:
  - Status badge (color-coded: researching=blue, implementing=yellow, complete=green, paused=gray)
  - Goal title
  - Metric: baseline → current (with delta)
  - Iteration count (keeps/discards/crashes)
  - Created date, last updated
  - Tags
- Search bar (searches goal, findings, tags)
- Filter by status dropdown
- Click a session → detail view showing:
  - Full goal & clarifying Q&A
  - Research plan (rendered markdown)
  - Iteration timeline (table of all iterations)
  - Findings & next steps
  - Implementation status
  - "Resume" button that copies a resume command to clipboard
- Responsive layout, same CSS variables as reports-viewer

**New file** → `agent/extensions/research-viewer.ts`
- Register `show_research` tool:
  ```typescript
  {
    name: "show_research",
    description: "Open the research sessions browser. Browse, search, and resume saved autoresearch sessions.",
    parameters: { title?: string, session_id?: string }
  }
  ```
  - If `session_id` provided, open directly to that session's detail view
  - Otherwise, open the browser listing all sessions
- Register `/research` command (same as tool but command-line invoked)
- HTTP server pattern (same as reports-viewer.ts):
  - `GET /` — serve HTML
  - `GET /logo.png` — serve agent logo
  - `POST /heartbeat` — keep alive
  - `GET /api/sessions` — return all sessions as JSON
  - `GET /api/sessions/:id` — return single session detail
  - `POST /result` — close viewer
- Server lifecycle: cleanup on session_shutdown, single active server

---

## Phase 5: Update Allowed Tools & Integration

**Why:** The new tools need to be wired into the autoresearch command, and the extension needs to be loadable.

**Modify** → `agent/.pi/commands/autoresearch/autoresearch.md`
- Add `show_research` to allowed-tools
- Add session persistence calls throughout (as designed in Phase 2)
- Update the Commander lifecycle table with new phases

**Modify** → `agent/skills/autoresearch/SKILL.md`
- Mirror allowed-tools update
- Add session persistence section

**Modify** → `agent/skills/autoresearch/references/autonomous-loop-protocol.md`
- Add "Session Save" note to Phase 7 (Log Results)
- Add implementation handoff section after the completion section

---

## Phase 6: Verify & Polish

**Why:** Ensure the full lifecycle works end-to-end and all components integrate correctly.

- Read all modified files for consistency
- Verify the session JSON schema is complete and covers all phases
- Confirm the research browser HTML renders correctly with sample data
- Test that the autoresearch flow: Understand → Plan → Loop → Handoff → Implement → Final Report is coherent in the instructions
- Verify session persistence survives across separate autoresearch invocations
- Ensure backward compatibility: existing autoresearch sessions (without save) still work
- Check that the `/research` command and `show_research` tool are properly registered

---

## Critical Files

| File | Action |
|------|--------|
| `agent/extensions/lib/research-session.ts` | New — session data model & persistence |
| `agent/extensions/lib/research-viewer-html.ts` | New — HTML SPA for research browser |
| `agent/extensions/research-viewer.ts` | New — extension with show_research tool & /research command |
| `agent/.pi/commands/autoresearch/autoresearch.md` | Modify — add implementation chain, session saves, new tools |
| `agent/skills/autoresearch/SKILL.md` | Modify — mirror command changes |
| `agent/skills/autoresearch/references/autonomous-loop-protocol.md` | Modify — add session save + implementation phases |
| `agent/extensions/reports-viewer.ts` | Reference — reuse server pattern |
| `agent/extensions/lib/report-index.ts` | Reference — reuse SQLite pattern |
| `agent/extensions/lib/reports-viewer-html.ts` | Reference — reuse HTML SPA pattern |
| `agent/extensions/agent-team.ts` | Reference — dispatch_agent integration |

## Reusable Components (no changes needed)

- **report-index.ts** — SQLite + JSON persistence pattern. We create a separate `research-session.ts` following the same architecture but with its own DB table and schema.
- **reports-viewer.ts** — HTTP server lifecycle, browser open, heartbeat pattern. Cloned directly for research-viewer.ts.
- **reports-viewer-html.ts** — Full HTML SPA template with dark theme, search, cards. Used as the design template for research-viewer-html.ts.
- **completion-report.ts** — show_report tool pattern. The research viewer follows the same registration approach.
- **agent-team.ts** — dispatch_agent tool for spawning specialist agents during implementation.

## Verification

1. `node -e "require('./agent/extensions/lib/research-session.ts')"` — module loads without errors
2. Create a test session, save it, list sessions, load it back — data round-trips correctly
3. Open `/research` browser — sessions display with correct status badges, search works
4. Click a session — detail view shows all sections (Q&A, plan, iterations, findings)
5. Run a full autoresearch cycle — session is created and updated at each phase
6. At completion, "implement now" option spawns agents and tracks implementation
7. Final report includes both research results AND implementation summary
8. Paused session can be browsed and resumed from the research viewer
