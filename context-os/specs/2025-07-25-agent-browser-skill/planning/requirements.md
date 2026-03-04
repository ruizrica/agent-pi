# Agent Browser Skill - Requirements

## Decisions from User

| # | Question | Answer |
|---|----------|--------|
| 1 | Reuse bundled skill or custom? | Reuse the bundled skill from the agent-browser npm package |
| 2 | Installation location | Global: `~/.pi/agent/skills/agent-browser/` |
| 3 | Browser binary setup | Yes, run `agent-browser install` as part of setup |
| 4 | Scope of use cases | All: navigation, forms, screenshots, data extraction, sessions, iOS, testing, automation |
| 5 | Web search workflow | Yes, add a search workflow pattern for navigating search engines and extracting results |
| 6 | Settings.json integration | Yes, ensure skills work by just dropping into the skills folder (no settings.json edit needed -- Pi auto-discovers `~/.pi/agent/skills/`) |
| 7 | Visual references | None provided |

## Functional Requirements

### FR-1: Skill Installation
- Create `~/.pi/agent/skills/agent-browser/` directory
- Symlink (preferred) or copy the bundled SKILL.md and all resources from the agent-browser npm package
- Source: `/Users/ricardo/.nvm/versions/node/v20.19.5/lib/node_modules/agent-browser/skills/agent-browser/`
- Include all references/ (6 docs) and templates/ (3 scripts)

### FR-2: Browser Binary Installation
- Run `agent-browser install` to install Playwright Chromium browser binaries
- This is a one-time setup step

### FR-3: Web Search Workflow
- Add a search workflow reference document to the skill
- Cover: navigating to DuckDuckGo/Google, entering queries, extracting search results
- Pattern: open search engine -> fill search box -> snapshot results -> extract links/text

### FR-4: Skill Discovery
- Pi auto-discovers skills in `~/.pi/agent/skills/` (confirmed by docs)
- No settings.json modification needed -- just dropping the skill folder in is enough
- Verify the skill appears when Pi loads

### FR-5: Complete Capability Coverage
The skill must teach the agent to handle:
- Web navigation and page interaction
- Form filling and submission
- Screenshot capture and PDF export
- Data extraction (text, HTML, attributes)
- Authentication flows with state persistence
- Responsive testing and viewport control
- Session management (parallel browsing)
- iOS Safari testing (via -p ios)
- Web search via search engine navigation
- Network monitoring and request interception

## Non-Functional Requirements

### NFR-1: Zero Configuration
Skill should work immediately after installation -- no settings.json edits required.

### NFR-2: Symlink Preferred
Use symlinks so the skill auto-updates when agent-browser is updated via npm.

### NFR-3: Idempotent Setup
Running the setup multiple times should be safe (no duplicate files, no broken links).

## Existing Code to Leverage

| Asset | Location | Purpose |
|-------|----------|---------|
| Bundled SKILL.md | `agent-browser/skills/agent-browser/SKILL.md` | Complete skill instructions |
| Reference docs (6) | `agent-browser/skills/agent-browser/references/` | commands, snapshot-refs, session-management, authentication, video-recording, proxy-support |
| Template scripts (3) | `agent-browser/skills/agent-browser/templates/` | form-automation.sh, authenticated-session.sh, capture-workflow.sh |
| Pi skills docs | docs/skills.md | Skill format specification |
| skill-expert agent | `.pi/agents/pi-pi/skill-expert.md` | Skill creation expertise |

## Out of Scope
- Custom SKILL.md rewrite (reusing bundled version)
- Cloudflare worker-based web testing (existing extension handles that separately)
- Building a new CLI tool
- skill-creator skill installation (separate concern)
