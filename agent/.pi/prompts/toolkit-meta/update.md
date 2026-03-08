---
name: toolkit-update
description: "Pull latest toolkit from GitHub and sync agents, commands, and skills into Pi"
allowed-tools: ["Bash"]
---

# Update Toolkit

Pull the latest version of the toolkit plugin from https://github.com/ruizrica/toolkit and sync all agents, commands, and skills into Pi's extension directories.

## Instructions

Run the sync script:

```bash
bash ~/.pi/agent/scripts/sync-toolkit.sh
```

After the script completes, report what changed to the user.

If the script is not found, inform the user:
- The sync script should be at `~/.pi/agent/scripts/sync-toolkit.sh`
- They can manually pull from: `cd ~/.toolkit && git pull`
- Then copy files manually from `~/.toolkit/plugins/toolkit/` to Pi directories
