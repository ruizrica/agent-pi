# Test Plan — Checkbox Rendering

## Summary
This plan tests that numbered checkbox items render correctly.

## Steps
- [x] 1. Create the escape-cancel extension with double-tap ESC detection
- [x] 2. Add globalThis hooks to subagent-widget for kill-all functionality
- [x] 3. Modify agent-chain to track current chain process and expose kill hook
- [x] 4. Update pipeline-team with proc tracking and kill hook
- [ ] 5. Register extension in settings.json packages array
- [x] 6. Write comprehensive tests for double-tap detection

## Non-numbered items
- [ ] Simple unchecked item
- [x] Simple checked item
- [ ] Another unchecked item
