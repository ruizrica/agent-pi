# Plan: Build Soundcn Extension — `/sounds` Browser-Based Viewer with Hook Notifications

## Context

We're building a new Pi extension that integrates with [soundcn](https://github.com/ruizrica/soundcn) — an open-source registry of 813 UI sound effects with base64-encoded MP3s served at `soundcn.xyz`. Instead of a TUI overlay, we'll use the **browser-based viewer pattern** identical to `plan-viewer.ts`, `completion-report.ts`, and `file-viewer.ts` — a local HTTP server serving a self-contained HTML page that opens in the user's browser.

This is dramatically better than TUI for a sound browser because:
- **Web Audio API** works natively — play sounds directly from base64 data URIs, no temp files, no `afplay` hacks
- **Rich visual UI** — category cards, search with instant filtering, waveform-style indicators, detail modals, responsive grid layout
- **The pattern already exists** — `plan-viewer.ts` is ~280 lines, `plan-viewer-html.ts` is ~1547 lines. We copy the server/open/cleanup scaffold and build our own HTML page

The flow: user types `/sounds` → local HTTP server starts on random port → browser opens → user browses categories, searches, previews sounds (plays in browser via Web Audio API), selects sounds for Pi hooks → selections POST back to the server → extension saves config and wires up the Pi event hooks → server shuts down.

**Key architecture decisions:**
- The **registry catalog** (names, titles, descriptions, categories, tags, durations — NO audio data) is fetched once from `registry.json` on GitHub and cached in memory. It's ~900KB of JSON metadata.
- **Individual sound audio** is fetched on-demand from `soundcn.xyz/r/{name}.json` when the user clicks play in the browser. The browser fetches the sound JSON, extracts the base64 `dataUri`, and plays it via Web Audio API. No server involvement needed for preview playback.
- **Installed sounds** (assigned to hooks) have their base64 data saved to `~/.pi/agent/extensions/sounds/{name}.json` so they can be played offline/instantly. The Pi extension reads these cached files and plays audio via a Node.js audio approach (write temp mp3 + `afplay` on macOS, or pipe to player).
- **Hook playback in terminal** — when a Pi event fires (e.g. `agent_end`), the extension reads the installed sound's base64 from disk, decodes to a temp MP3, spawns `afplay` (macOS) / `aplay` (Linux), and cleans up. This is the only place we need system audio — the browser handles preview playback natively.

The extension file structure mirrors existing patterns exactly:
- `sounds.ts` — main extension (same structure as `plan-viewer.ts`: server + tool + command + hooks)
- `lib/sounds-viewer-html.ts` — self-contained HTML generator (same pattern as `plan-viewer-html.ts`)
- `lib/sounds-config.ts` — config persistence (same pattern as `persist-theme.ts`)
- `lib/sounds-player.ts` — Node.js audio playback for hook-triggered sounds

---

## Phase 1: Data Layer & Config

**Why:** We need the sound catalog types, config persistence, and Node.js audio playback before building any UI. These are small, focused modules.

**New file** → `~/.pi/agent/extensions/lib/sounds-config.ts`
- `SoundsConfig` type: `{ assignments: Record<HookName, string>, volume: number, enabled: boolean }`
- `HookName` union: `"agent_end" | "agent_start" | "tool_execution_start" | "tool_execution_end" | "turn_start" | "turn_end" | "session_start" | "session_compact"`
- `HOOK_DISPLAY_NAMES` map: `{ agent_end: "Task Complete", agent_start: "Agent Starting", ... }`
- `CONFIG_PATH` = `~/.pi/agent/extensions/sounds-config.json`
- `SOUNDS_DIR` = `~/.pi/agent/extensions/sounds/`
- `loadConfig()` / `saveConfig()` — JSON read/write with defaults
- `getAssignment(hook)` / `setAssignment(hook, soundName)` / `clearAssignment(hook)`

**New file** → `~/.pi/agent/extensions/lib/sounds-player.ts`
- `playInstalledSound(soundName: string, volume?: number)` — read cached base64 from `sounds/{name}.json`, decode MP3, write to temp file in `os.tmpdir()`, spawn `afplay` (macOS) or `aplay`/`mpv` (Linux), delete temp on process exit
- `installSound(name: string, dataUri: string)` — save `{ name, dataUri }` to `sounds/{name}.json`
- `uninstallSound(name: string)` — remove from `sounds/` dir
- `isInstalled(name: string)` — check if sound exists in cache
- Platform detection helper: `getAudioCommand()` → `"afplay"` | `"aplay"` | `"mpv"`

---

## Phase 2: Browser Viewer HTML

**Why:** The HTML page IS the UI. This is the most substantial file — a self-contained page with all CSS/JS inlined, featuring a full sound browser with categories, search, detail views, and hook assignment. Modeled directly on `plan-viewer-html.ts`.

**New file** → `~/.pi/agent/extensions/lib/sounds-viewer-html.ts`
- `generateSoundsViewerHTML(opts)` — returns complete HTML string
- Takes: `{ catalog, config, port }` where catalog is the filtered registry items and config is current hook assignments
- **Page structure:**
  - **Header**: Logo + "Sound Browser" badge + accent border (identical styling to plan-viewer header)
  - **Search bar**: Full-width input with debounced filtering, search icon, result count
  - **Category sidebar/pills**: Horizontal scrollable category tabs or sidebar — "All", then each category with count badge. Click to filter.
  - **Sound grid**: Responsive card grid (1-3 cols). Each card shows:
    - Sound title + category badge
    - Description (truncated)
    - Duration • Size • License metadata row
    - **Play button** — fetches sound on-demand from soundcn.xyz API, plays via Web Audio API. Shows loading spinner → playing animation → idle. Discards audio data after playback.
    - **Assign button** — opens a dropdown/modal to pick which hook to assign this sound to
  - **Detail modal/panel**: Click card title or expand → full description, all tags/keywords, author, license. Play button + assign dropdown. Shows if sound is currently assigned to any hooks.
  - **Current assignments panel**: Fixed sidebar or bottom panel showing all 8 hooks and their current sound assignments. Click to preview, click × to unassign.
  - **Footer**: "Apply & Close" button (POSTs config back) + "Cancel" button
- **JavaScript (inlined):**
  - `fetchAndPlaySound(name)` — `fetch('https://soundcn.xyz/r/${name}.json')` → extract files[0].content → regex-extract dataUri → Web Audio API decode+play
  - `assignSound(hookName, soundName)` — update local state, re-render assignments panel
  - `submitConfig()` — POST `/result` with `{ action: "applied", assignments, volume, enabled }`
  - Search/filter logic (client-side, instant)
- **Styling**: Dark theme matching existing viewers (`--bg: #1a1d23`, etc.), same CSS variables

---

## Phase 3: Extension Server & Wiring

**Why:** Connect the HTML viewer to Pi via the HTTP server pattern, register the `/sounds` command, and wire up the `show_sounds` tool.

**New file** → `~/.pi/agent/extensions/sounds.ts`
- **Server** (copied from `plan-viewer.ts` scaffold):
  - `startSoundsServer(catalog, config)` — create HTTP server on random port
  - `GET /` → serve HTML from `generateSoundsViewerHTML()`
  - `GET /logo.png` → serve agent logo (same as plan-viewer)
  - `POST /result` → receive config updates `{ action, assignments, volume, enabled }` → resolve promise
  - `POST /install` → receive `{ name, dataUri }` → save to sounds dir via `installSound()`
  - `POST /uninstall` → receive `{ name }` → remove from sounds dir via `uninstallSound()`
- **`/sounds` command**:
  - Fetch registry catalog from GitHub (with loading notification)
  - Load current config
  - Start server, open browser, wait for result
  - On result: save config, install/uninstall sounds as needed, update hook listeners
  - Cleanup server on close
- **`show_sounds` tool** (for agent-initiated opening):
  - Same as command but callable by the LLM
  - Returns summary of applied configuration
- **Lifecycle hooks** — register handlers for all hookable events:
  - `pi.on("agent_end", ...)` → check config → `playInstalledSound()` if assigned
  - `pi.on("agent_start", ...)`, `pi.on("tool_execution_start", ...)`, etc.
  - Each handler: `if (!config.enabled) return; const sound = config.assignments[hookName]; if (sound) playInstalledSound(sound, config.volume);`
- **Status**: `ctx.ui.setStatus("sounds", "🔊 3 hooks")` showing count of active assignments
- **Session lifecycle**: `session_start` → load config, `session_shutdown` → cleanup

**Modify** → `~/.pi/agent/extensions/lib/viewer-session.ts`
- Add `"sounds"` to `ActiveViewerKind` union type

---

## Phase 4: Catalog Fetch, Install Flow & Polish

**Why:** The catalog needs to be fetched from GitHub, sounds need to be downloaded and installed when assigned, and we need proper error handling and edge cases.

**Modify** → `~/.pi/agent/extensions/sounds.ts`
- **Catalog fetching**: `fetchCatalog()` — fetch `registry.json` from GitHub raw URL, filter to `type: "registry:block"` items, extract metadata only (no file contents). Cache in memory for session duration. Show `ctx.ui.notify("Loading sound catalog...", "info")` while fetching.
- **Install flow** (triggered from browser):
  - When user assigns a sound to a hook, the browser fetches the full sound JSON from soundcn.xyz
  - Browser POSTs `{ name, dataUri }` to `/install` endpoint
  - Server calls `installSound(name, dataUri)` to cache the MP3 data
  - When user unassigns, browser POSTs `{ name }` to `/uninstall` → removes cached file (only if not assigned to another hook)
- **Error handling**:
  - Network failure fetching catalog → `ctx.ui.notify("Failed to fetch sound catalog. Check your internet connection.", "error")`
  - Sound fetch failure in browser → show error toast in HTML UI
  - Missing audio player binary → graceful message, sounds disabled
- **`/sounds toggle`** sub-command → quick enable/disable without opening browser
- **`/sounds status`** sub-command → show current config in a compact notification

**Modify** → `~/.pi/agent/extensions/lib/sounds-viewer-html.ts`
- Loading states: skeleton cards while catalog loads
- Empty state: "No sounds match your search" with clear button
- Sound playing indicator: pulsing animation on active card
- Assigned sound badges: show which hooks a sound is assigned to on its card
- Toast notifications for actions (assigned, unassigned, installed, error)
- Keyboard shortcuts: `Escape` to close, `/` to focus search

**Modify** → `~/.pi/agent/settings.json`
- Add `"extensions/sounds.ts"` to packages array

**Modify** → `~/.pi/agent/extensions/lib/themeMap.ts`
- Add `"sounds": "midnight-ocean"` to THEME_MAP

---

## Critical Files

| File | Action |
|------|--------|
| `~/.pi/agent/extensions/sounds.ts` | New — Main extension: HTTP server, /sounds command, show_sounds tool, hook listeners |
| `~/.pi/agent/extensions/lib/sounds-viewer-html.ts` | New — Self-contained HTML/CSS/JS for the browser-based sound viewer |
| `~/.pi/agent/extensions/lib/sounds-config.ts` | New — Config types, persistence, hook assignment management |
| `~/.pi/agent/extensions/lib/sounds-player.ts` | New — Node.js audio playback for hook-triggered sounds (afplay/aplay) |
| `~/.pi/agent/extensions/sounds/` | New — Directory for installed sound cache files |
| `~/.pi/agent/extensions/sounds-config.json` | New — User config file (auto-created on first save) |
| `~/.pi/agent/extensions/lib/viewer-session.ts` | Modify — Add "sounds" to ActiveViewerKind union |
| `~/.pi/agent/settings.json` | Modify — Add sounds.ts to packages array |
| `~/.pi/agent/extensions/lib/themeMap.ts` | Modify — Add sounds theme mapping |

## Reusable Components (no changes needed)

- **`plan-viewer.ts` server scaffold** — HTTP server setup, browser opening, result promise, cleanup pattern (reference only, we copy the pattern)
- **`viewer-session.ts`** — Active viewer tracking and cleanup (we register our viewer here)
- **`viewer-standalone-export.ts`** — If we want standalone export capability later
- **`report-index.ts`** — If we want to persist sound config snapshots to reports
- **`applyExtensionDefaults()`** — Session start theming
- **`outputLine()`** — Tool result rendering
- **`persist-theme.ts`** — Pattern reference for config persistence

## Verification

1. **Extension loads**: Add `"extensions/sounds.ts"` to `settings.json`, restart Pi → no errors, status shows `🔊 Sounds`
2. **`/sounds` command**: Opens browser to sound viewer → shows categories, search bar, sound grid
3. **Category filtering**: Click a category pill → grid filters to that category's sounds
4. **Search**: Type in search bar → instant filtering by name/title/tags/keywords
5. **Sound preview**: Click play on any card → sound fetches from soundcn.xyz and plays in browser → audio discarded after playback (not saved)
6. **Detail view**: Click a card → see full metadata, tags, description, play button, hook assignment dropdown
7. **Hook assignment**: Select a hook from dropdown → sound assigned → shown in assignments panel → POST to server saves config + installs sound
8. **Apply & Close**: Click "Apply & Close" → browser closes, config persisted, hooks active
9. **Auto-play**: With a sound assigned to `agent_end`, send a message → after Pi responds, completion sound plays in terminal via `afplay`
10. **`/sounds toggle`**: Disables all hook sounds → no sounds play → re-enable
11. **`/sounds status`**: Shows compact list of current hook assignments
12. **Persistence**: Restart Pi → config loaded, assigned sounds still cached and playing on hooks
