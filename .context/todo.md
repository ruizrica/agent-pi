# Scout Status Pill in Footer

## Goal
Add a compact scout agent status indicator to the far right of the footer status line (below the editor input). Single line, same colored background as subagent widgets, showing: animation + agent name + model name. The animation conveys whether the scout is active (spinning) or idle (checkmark). No "Standing by" text — the animation itself communicates state.

## Design

Current footer: ` opus 4 | 73% | Github-Work/pi-agent `

New footer:  ` opus 4 | 73% | Github-Work/pi-agent          ⠋ SCOUT | grok-4.1-fast `
                                                               ^^^^^^^^^^^^^^^^^^^^^^^^
                                                               colored pill, right-aligned

- The pill is right-aligned with the same dark steel blue/teal-gray background as subagent widgets
- Animation: braille spinner when running, checkmark when done/idle, X on error
- Shows: `{spinner} SCOUT | {short-model-name}`
- Colored background matches STATUS_BG from subagent-widget (running=steel blue, done=teal-gray, error=red)

## Scope
- This is ONLY for NORMAL mode's pre-spawned scout (reads `__piScoutId` and scout state from `__piScoutStatus`)
- Does NOT change subagent-widget.ts rendering or behavior
- Lives entirely in footer.ts, reading scout state from a global

## Implementation Steps

- [ ] 1. **Publish scout state from `subagent-widget.ts`** — Set `globalThis.__piScoutStatus` with `{ status, model, elapsed }` that updates as the scout runs. This is a lightweight global the footer can read without coupling to subagent internals. Update it in the `spawnAgent` close handler and timer interval for the pre-spawned scout only.

- [ ] 2. **Add scout pill rendering in `footer.ts`** — In the footer's `render()` function, check for `__piScoutId` and `__piScoutStatus`. If present, render a right-aligned colored pill with the braille animation, "SCOUT", and the model name. Use the same STATUS_BG ANSI codes from subagent-widget. Calculate available width = total width - left content width - pill width, fill gap with spaces.

- [ ] 3. **Test and verify** — Run test suite, verify no regressions.
