# Agent Browser Skill - Raw Idea

## User Request
"lets make a web browser skill named agent-browser using our local cli tool agent-browser. our agent should just know to use it to test webpages, to web search, and automation tasks. lets build this."

## Key Points
- Skill name: `agent-browser`
- Based on the locally installed CLI tool `agent-browser` (v0.9.2, globally installed via npm)
- Use cases: webpage testing, web search, browser automation
- Agent should "just know" how to use it (skill-based progressive disclosure)

## Discovery Notes
- `agent-browser` is a Playwright-based CLI at `/Users/ricardo/.nvm/versions/node/v20.19.5/bin/agent-browser`
- The npm package already ships with a bundled skill at: `/Users/ricardo/.nvm/versions/node/v20.19.5/lib/node_modules/agent-browser/skills/agent-browser/SKILL.md`
- The bundled skill includes references/ (6 docs) and templates/ (3 shell scripts)
- Pi skills system supports: `~/.pi/agent/skills/`, `.pi/skills/`, settings.json `skills` array
- No skills are currently configured in the user's Pi settings
- Browser binaries need installation (`agent-browser install`) - Playwright chromium not yet installed
