# Network Security Chain Design Note

## Purpose
This design extends the existing Pi agent-chain framework with a defensive, local-network-focused workflow for:
- curated security news and advisory retrieval
- passive local network inspection
- safe, scope-restricted port analysis
- final security-oriented reporting

The goal is authorized local assessment only. This design is not intended to support offensive scanning, unrestricted reconnaissance, or aggressive probing.

## Non-Negotiable Safety Constraints
- Local/private targets only for any scan capability.
- Passive-first inspection; no active packet injection.
- No custom raw-socket scanner implementation in v1.
- No automatic privilege escalation, `sudo`, or capability changes.
- No promiscuous capture by default.
- No UDP sweeps, aggressive timing, or unrestricted user flags.
- No arbitrary web crawling for threat intelligence by default.
- Prefer mature, community-backed external tools over bespoke low-level implementations.

## Capability Decisions

### 1. Security News / Research
Implementation direction:
- Build a curated-source `security_news` tool.
- Default to official or highly reputable sources such as CISA, NVD, OWASP, CVE/MITRE, and selected vendor advisories.
- Attach trust metadata, timestamps, and source labels.
- Use allowlisted sources only; no generic search-engine scraping by default.

Why:
- Lower noise and easier verification.
- Better fit for a security-focused chain than broad web search.

### 2. Passive Network Inspection
Implementation direction:
- Build a `network_inspect` tool that prefers existing system tools.
- Start with low-risk actions such as interface discovery, local listener inventory, and passive capture summaries.
- Prefer spawning mature CLI tools and parsing bounded output.

Why:
- More portable and auditable than native Node packet-capture bindings.
- Better operational control around permissions and output limits.

### 3. Safe Port Analysis
Implementation direction:
- Build a `safe_port_scan` tool as a tightly controlled wrapper around a mature scanner.
- Restrict targets to loopback/private ranges.
- Restrict profiles to conservative, low-impact templates.
- Do not allow arbitrary user-supplied scanner flags.

Why:
- Established scanners are far more vetted than a custom implementation.
- Wrapper policy can enforce safety while preserving utility.

## UX / Policy Expectations
- All security-sensitive tools should state that they are for authorized, local/private defensive use.
- Errors should explain whether a refusal is due to scope, missing dependency, or permissions.
- Tools should expose dry-run or preflight-friendly behavior where practical.
- Reports should summarize what was checked, what constraints were enforced, and any skipped actions.

## Likely Files
- `agent/extensions/security-news.ts`
- `agent/extensions/network-inspect.ts`
- `agent/extensions/safe-port-scan.ts`
- `agent/.pi/agents/*.md` for specialist roles
- `agent/.pi/agents/agent-chain.yaml`
- documentation and tests under existing project conventions

## Verification Goals
- Target validation rejects public IPs/domains for scan actions.
- Generated commands are bounded and use allowlisted safe options only.
- Missing-tool and insufficient-permission errors are clear and non-destructive.
- Chain wiring remains additive and does not alter existing flows.
