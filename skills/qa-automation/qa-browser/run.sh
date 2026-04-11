#!/bin/bash
# Run the Web QA test
#
# Usage: bash .pi/skills/qa-automation/qa-web/run.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  Web Application QA                              ║"
echo "║  Started: $(date '+%Y-%m-%d %H:%M:%S')            "
echo "╚═══════════════════════════════════════════════════╝"
echo ""

bash "$SKILL_DIR/flows/example-web-test.sh"
EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Exit code: $EXIT_CODE"
echo "  Screenshots: /tmp/qa-tests/screenshots/web-form-test/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $EXIT_CODE
