# /secure Extension Plan

## Overview
A new `/secure` command that performs comprehensive security sweeps and installs AI protection (prompt injection guard, credential exfiltration prevention) on any AI project. Adapts our existing security guard into an installable, portable module.

## Architecture

### Files to Create
1. **`agent/extensions/secure.ts`** — Main extension entry point
   - Registers `/secure` command with subcommands: `sweep`, `install`, `status`, `report`
   - Hooks into agent-chain for multi-step security sweep
   - Manages the `/secure` slash command lifecycle

2. **`agent/extensions/lib/secure-engine.ts`** — Security sweep scanner
   - Project fingerprinting (detect stack, AI services, frameworks)
   - AI service detection (OpenAI, Anthropic, Cohere, etc.)
   - Prompt injection vulnerability scanning
   - Credential/secret exposure scanning
   - Dependency vulnerability checks
   - System prompt leakage detection
   - Input validation gap detection

3. **`agent/extensions/lib/secure-installer.ts`** — Protection installer
   - Generates a portable `security-guard.js/ts` for target projects
   - Generates `security-policy.yaml` tailored to the project's stack
   - Creates middleware/wrapper for AI API calls with injection filtering
   - Produces `.env.example` with secure defaults
   - Generates CI security check configs (GitHub Actions, etc.)

4. **`agent/extensions/__tests__/secure-engine.test.ts`** — Tests

### Chain Addition
Add `secure` chain to `agent/.pi/agents/agent-chain.yaml`:
- Phase 0: Scout — detect stack, AI services, entry points
- Phase 1: Red-team — attempt prompt injection, cred exfil, data leakage
- Phase 2: Reviewer — scan for vuln patterns, missing protections
- Phase 3: Planner — generate hardening plan + installable protections

### `/secure` Subcommands
- `/secure` or `/secure sweep` — Run full security sweep (uses chain)
- `/secure install` — Install AI protection into current project
- `/secure status` — Show current project's security posture
- `/secure report` — View last security report

## Key Features

### Security Sweep (Scanner)
1. **AI Service Detection** — Find OpenAI/Anthropic/etc. API usage
2. **Prompt Injection Audit** — Check if user inputs flow unfiltered to AI
3. **Credential Exposure** — Find hardcoded API keys, tokens, secrets
4. **System Prompt Leakage** — Check if system prompts are extractable
5. **Input Validation** — Check sanitization before AI calls
6. **Output Filtering** — Check if AI outputs are sanitized before use
7. **Rate Limiting** — Check for abuse prevention on AI endpoints
8. **Dependency Audit** — Check AI SDK versions for known vulns

### AI Protection Installer
Generates portable files that can be dropped into any project:
1. **`ai-security-guard.ts`** — Middleware that wraps AI API calls with:
   - Input sanitization (strip injection patterns)
   - Output filtering (redact sensitive data in responses)
   - Rate limiting wrapper
   - Audit logging
2. **`ai-security-policy.yaml`** — Configurable rules (adapted from our policy)
3. **`ai-security-middleware.ts`** — Express/Fastify/Next.js middleware
4. **`.github/workflows/ai-security-check.yml`** — CI check

## Approved: Yes
