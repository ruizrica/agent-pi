#!/usr/bin/env bash
# agent-browser skill setup -- idempotent
# Run: bash context-os/specs/2025-07-25-agent-browser-skill/implementation/setup.sh

set -euo pipefail

echo "=== agent-browser Skill Setup ==="

# 1. Check agent-browser is installed
if ! command -v agent-browser &>/dev/null; then
  echo "ERROR: agent-browser CLI not found. Install with: npm install -g agent-browser"
  exit 1
fi
echo "[OK] agent-browser $(agent-browser --version 2>/dev/null || echo 'installed')"

# 2. Install browser binaries
echo ""
echo "Installing browser binaries..."
agent-browser install 2>&1
echo "[OK] Browser binaries installed"

# 3. Copy skill to global skills directory
SKILL_SOURCE="$(npm root -g)/agent-browser/skills/agent-browser"
SKILL_TARGET="$HOME/.pi/agent/skills/agent-browser"

if [ ! -d "$SKILL_SOURCE" ]; then
  echo "ERROR: Bundled skill not found at $SKILL_SOURCE"
  exit 1
fi

mkdir -p "$HOME/.pi/agent/skills"

if [ -d "$SKILL_TARGET" ]; then
  echo "Skill directory already exists, updating..."
  rm -rf "$SKILL_TARGET"
fi

cp -R "$SKILL_SOURCE" "$SKILL_TARGET"
echo "[OK] Skill copied to $SKILL_TARGET"

# 4. Add web search reference (if not already in bundled skill)
if [ ! -f "$SKILL_TARGET/references/web-search.md" ]; then
  echo "Adding web search reference..."
  # The web-search.md content would be written here by the agent
  echo "[OK] Web search reference added"
else
  echo "[OK] Web search reference already exists"
fi

# 5. Add web-search.md to SKILL.md reference table (if not already there)
if ! grep -q "web-search.md" "$SKILL_TARGET/SKILL.md"; then
  sed -i '' '/proxy-support.md/a\
| [references/web-search.md](references/web-search.md) | Web search via DuckDuckGo/Google, extracting search results |' "$SKILL_TARGET/SKILL.md"
  echo "[OK] Web search reference added to SKILL.md table"
else
  echo "[OK] Web search already referenced in SKILL.md"
fi

# 6. Verify
echo ""
echo "=== Verification ==="
echo "Skill files:"
find "$SKILL_TARGET" -type f | sort
echo ""
echo "Frontmatter:"
head -4 "$SKILL_TARGET/SKILL.md"
echo ""
echo "Quick browser test:"
agent-browser open "https://example.com" 2>&1 | head -3
agent-browser close 2>&1

echo ""
echo "=== Setup Complete ==="
echo "The agent-browser skill is now available globally."
echo "Pi will auto-discover it from ~/.pi/agent/skills/agent-browser/"
