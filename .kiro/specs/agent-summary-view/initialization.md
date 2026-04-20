# Agent Summary View

## Raw feature idea
Create a new mode/view that shows a summary view of the working agent similar to the reference snapshot at `/Users/ricardo/Desktop/snapshots/snapshot_2026-04-17_094828.png`.

The user wants:
- a toggleable summary view for agents
- `/summary` to open this view for the current agent by default
- calling `/summary` again to toggle it off
- support for toggling the view for any agent
- possibly `/toggle-summary` as an explicit alias

## Notes
- Preserve the existing spec name once chosen: `agent-summary-view`
- Build the spec before implementation
- The view should fit the existing agent-pi UX patterns and viewer architecture where possible
