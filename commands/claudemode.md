---
name: claudemode
description: Toggle between Claude Code CLI and Direct API modes
argument-hint: Optional: show current mode
allowed-tools: []
context: inline
---

# /claude-mode

Toggle between Claude Code CLI and Direct API modes for Claude interactions.

## Description

This command allows you to switch between two execution modes for Claude AI interactions:
- **Code CLI mode** (default): Uses the Claude Code CLI for enhanced capabilities
- **Direct API mode**: Uses the direct Claude API calls

The selected mode is persisted between sessions.

## Usage

### Toggle Mode
```
/claudemode
```
This will switch between Code CLI and Direct API modes and show confirmation.

### Checking Current Mode
```
/claudemode
```
Running the command without arguments will show the current mode and toggle it.

## Notes

- The default mode is Code CLI
- Your preference is saved in `~/.pi/claudemode`
- This affects all Claude-related operations in the system
- You can also use the `claude_advisor` tool which will respect the selected mode