# Clarifying Questions: Open Source Strategy

1. **Private repo name and host?** Should I create the private remote on GitHub (e.g., `github.com/rruizdev/context-os-private`) or do you already have one set up? _Default: Create new private repo on GitHub as `origin`, rename current to `public`_

2. **Which is the "primary" working copy?** When you do day-to-day development, should `git push` go to the private repo by default (with explicit pushes to public), or vice versa? _Default: Private is `origin` (default push), public is a separate remote called `public`_

3. **History scrubbing?** Swagbucks content is already in git history. For the public repo, do you want to: (a) create a fresh "clean" initial commit with swagbucks removed, (b) use `git filter-repo` to scrub swagbucks from all history, or (c) just remove it going forward and accept the history contains it? _Default: Fresh clean branch for public — simplest and safest_

4. **What counts as "private" beyond Swagbucks?** Should ALL skills be private, or just specific ones? Are there other directories/files beyond `skills/` that should stay private? _Default: The entire `skills/` directory is private, plus any work-specific configs_

5. **Pre-push guardrail strength?** For the public remote, do you want: (a) a git pre-push hook that blocks pushes if private files are detected, (b) a CI check on the public repo, or (c) both? _Default: Pre-push hook locally + a simple CI check_

6. **Open source tonight timeline?** Is tonight a hard deadline, meaning we should focus only on the essentials (remove swagbucks + set up dual remotes), or can the guardrails come in a follow-up pass? _Default: Do it all now — removal + dual remotes + guardrails_
