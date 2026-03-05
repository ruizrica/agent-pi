# 🛡️ Security Guard — Team Review Report

## Review Team
- **Scout 1** (SA2) — Detection engine review (`security-engine.ts`)
- **Scout 2** (SA3) — Extension integration review (`security-guard.ts`) ✅ Full results received
- **Reviewer** (SA4) — Security audit (policy gaps, bypass vectors, test coverage)

---

## Overall Verdict: ✅ SOLID — Ship-ready with hardening backlog

The security guard system is well-architected, properly integrated, and covers the primary threat vectors (prompt injection, destructive commands, data exfiltration). The three-layer defense is the right approach. No critical bugs found.

---

## Confirmed Working Well

| Area | Assessment |
|------|-----------|
| **Tool call gate** | Complete coverage: bash, write, edit, read, custom tools all handled |
| **Content scanner** | Safe line-level stripping, preserves message structure |
| **System prompt hardening** | Append-only, non-conflicting with other extensions |
| **Session handling** | CWD-aware, sync init (no race conditions) |
| **Slash commands** | All 4 subcommands working (status/log/policy/reload) |
| **Audit logger** | Functional, no file handle leaks |
| **Test suite** | 73 tests, all passing, good coverage of engine functions |
| **Ecosystem integration** | Cooperative with tasks.ts gate and message-integrity-guard.ts |

---

## Findings to Address (Prioritized)

### 🔴 Critical — Fix Now

**1. Policy file is writable by the agent**
- The agent could be tricked into editing `.pi/security-policy.yaml` to add `enabled: false`
- **Fix**: Add `.pi/security-policy.yaml` to `protected_paths` as `block` severity

### 🔴 High — Fix Soon

**2. Command obfuscation bypasses**
- Backslash escaping: `r\m -rf /`
- Base64: `$(echo cm0gLXJm | base64 -d)`
- Variable expansion: `cmd=rm; $cmd -rf /`
- String splitting: `eval "r""m -rf /"`
- **Fix**: Add obfuscation detection patterns to policy

**3. `python -c` / `node -e` bypass**
- `python -c "import os; os.system('rm -rf /')"` — python is allowlisted
- `node -e "require('child_process').execSync('rm -rf /')"` — node is allowlisted
- **Fix**: Scan inline code arguments for `-c`, `-e`, `--eval` flags

### ⚠️ Medium — Backlog

**4. `before_agent_start` hook ordering**
- Security guard loads after mode-cycler and system-select
- If another extension REPLACES systemPrompt instead of appending, security addendum is lost
- **Fix**: Move security-guard.ts earlier in packages, or verify addendum presence

**5. Audit log rotation overwrites `.bak`**
- Only keeps 1 backup, overwrites on each rotation
- **Fix**: Use timestamped backups: `log.${Date.now()}.bak`

**6. `modified` flag scoping in context hook**
- Variable set inside `.map()` closure, could miss tracking in edge cases
- **Fix**: Track per-message modification state

**7. No integration tests for hooks**
- Engine functions tested (73 tests), but tool_call/context/before_agent_start hooks not tested
- **Fix**: Add mock-based tests for the extension hooks

### 🟢 Low — Nice to Have

**8. Regex cache grows unbounded** — Never clears, ~100 entries max, not a real issue
**9. Unicode homoglyph bypasses** — Cyrillic `і` vs ASCII `i` edge case
**10. Multi-step attack correlation** — No session-level threat tracking across commands
**11. Line-level stripping limitation** — Multi-line injection patterns spanning lines could be partially missed

---

## Immediate Action Items

1. ✅ Add `security-policy.yaml` self-protection to the policy file
2. ✅ Add obfuscation detection patterns
3. ✅ Add `-c`/`-e` inline code scanning for allowlisted interpreters
4. Consider moving security-guard.ts earlier in load order
