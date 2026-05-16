---
description: "Open Text Tools — lightweight text manipulation app with stackable operations and diff view"
allowed-tools: ["Bash"]
---

Open the Text Tools app in the browser. Run this command; it locates the registered Pi package by looking for `tex/index.html` instead of relying on a repository folder name:

```bash
PI_PKG=$(node -e "const fs=require('fs');const os=require('os');const path=require('path');const settings=path.join(os.homedir(),'.pi/agent/settings.json');const s=JSON.parse(fs.readFileSync(settings,'utf-8'));const p=(s.packages||[]).find(pkg=>fs.existsSync(path.join(pkg,'tex/index.html')));console.log(p||'')")
open "$PI_PKG/tex/index.html"
```

Report back: "Text Tools opened in browser."
