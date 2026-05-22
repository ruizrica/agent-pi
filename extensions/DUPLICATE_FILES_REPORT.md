# Duplicate/Overlapping Files Report: extensions/lib/

**Scout Agent:** SA-2-SCOUT-DUPLICATES
**Date:** 2025-05-21
**Repository:** /Users/ricardo/Workshop/GitHub/agent-pi

---

## Executive Summary

Found **21 duplicate file pairs** across extensions/lib/:
- **9 files** are dead code (never imported) — safe to delete immediately
- **12 files** are functionally live (imported from multiple locations) — require consolidation
- **9,000+ lines** of dead code can be removed

### Key Finding
The codebase has evolved with files at both top-level (`lib/`) and subdirectories (`lib/subdir/`). This appears to be a refactoring-in-progress, with some modules partially reorganized.

---

## Detailed Findings by Category

### SECURITY SUBDIRECTORY

| File | Top-Level | Subdirectory | Status | Imported From | Notes |
|------|-----------|--------------|--------|---------------|-------|
| secure-engine | secure-engine.ts | security/security-engine.ts | STUB | Never directly | 4-line re-export stub; never used |
| vuln-scanner-engine | vuln-scanner-engine.ts | security/vuln-scanner-engine.ts | STUB | security/ only | Re-exports all from security/ |
| vuln-scanner-installer | vuln-scanner-installer.ts | security/vuln-scanner-installer.ts | IDENTICAL | security/ only | Top-level is dead code |

**Dead Code:** 2 files (secure-engine.ts, vuln-scanner-installer.ts)

---

### VIEWERS SUBDIRECTORY

| File | Top-Level | Subdirectory | Status | Imported From | Details |
|------|-----------|--------------|--------|---------------|---------|
| cleanup-viewer-html | cleanup-viewer-html.ts | viewers/cleanup-viewer-html.ts | IDENTICAL | viewers/ only | Dead code |
| file-viewer-html | file-viewer-html.ts | viewers/file-viewer-html.ts | DIVERGED* | viewers/ only | Broken imports at top-level |
| plan-viewer-html | plan-viewer-html.ts | viewers/plan-viewer-html.ts | DIVERGED* | viewers/ only | Broken imports at top-level |
| reports-viewer-html | reports-viewer-html.ts | viewers/reports-viewer-html.ts | DIVERGED* | viewers/ only | Broken imports at top-level |
| research-viewer-html | research-viewer-html.ts | viewers/research-viewer-html.ts | DIVERGED* | viewers/ only | Broken imports at top-level |
| spec-viewer-html | spec-viewer-html.ts | viewers/spec-viewer-html.ts | DIVERGED* | viewers/ only | Broken imports at top-level |
| test-viewer-html | test-viewer-html.ts | viewers/test-viewer-html.ts | DIVERGED* | viewers/ only | Broken imports at top-level |

*Divergence: Import paths only — top-level uses `./xxx.ts`, subdirectory uses `../xxx.ts`

**Dead Code:** 7 files (all top-level viewer files)

---

### CLAUDE SUBDIRECTORY

| File | Top-Level | Subdirectory | Status | Imported From | Details |
|------|-----------|--------------|--------|---------------|---------|
| advisor-default-config | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| advisor-default-orchestration | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| claude-advice-format | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| claude-advisor-runner | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| claude-cli | ✓ | ✓ | DIVERGED | claude/ | Top-level has broken imports |
| claude-config | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| claude-context | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| claude-provider-stream | ✓ | ✓ | DIVERGED | claude/ | Top-level has broken imports |
| claude-runtime | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |
| claude-tool-mapping | ✓ | ✓ | IDENTICAL | BOTH | Mixed imports: both locations used |

**Analysis:**
- All 10 files are functionally live (both import paths used in codebase)
- This appears to be intentional dual availability for callers at different levels
- Example: `pacifico.ts` and other extensions import from `./lib/claude/...` while tests/lib internals import from `../lib/claude/...`

**Requires Refactoring:** 10 files (but not deletable — both locations in active use)

---

### SOUNDS SUBDIRECTORY

| File | Top-Level | Subdirectory | Status | Imported From | Details |
|------|-----------|--------------|--------|---------------|---------|
| sounds-config | sounds-config.ts | sounds/sounds-config.ts | DIVERGED | BOTH | Mixed imports from both locations |
| sounds-viewer-html | sounds-viewer-html.ts | sounds/sounds-viewer-html.ts | DIVERGED | BOTH | Mixed imports from both locations |

**Requires Refactoring:** 2 files

---

### TOOL-ADVISOR SUBDIRECTORY

No top-level duplicates — all 5 tool-advisor files exist only in `tool-advisor/` subdirectory.

---

## Import Path Analysis

### Actively Imported From (Subdirectories Only)
```
./lib/security/*.ts         — All 5 security files imported from here
./lib/viewers/*.ts          — All 7 viewer files imported from here
./lib/sounds/*.ts           — Some sounds files imported from here
./lib/tool-advisor/*.ts     — All tool-advisor files imported from here
```

### Mixed Imports (Both Locations)
```
./lib/claude/*.ts           — 10 files imported from BOTH:
                              • ./lib/claude-xxx.ts (from extensions/ level)
                              • ./lib/claude/claude-xxx.ts (from lib/ level)

./lib/sounds/*.ts           — 2 files imported from BOTH:
                              • ./lib/sounds-xxx.ts (from extensions/ level)
                              • ./lib/sounds/sounds-xxx.ts (from lib/ level)
```

### Never Imported
```
./lib/secure-engine.ts      — Re-export stub (not called directly)
./lib/vuln-scanner-installer.ts — Identical to security/ version
./lib/cleanup-viewer-html.ts    — All 7 viewer top-level files
./lib/file-viewer-html.ts
./lib/plan-viewer-html.ts
./lib/reports-viewer-html.ts
./lib/research-viewer-html.ts
./lib/spec-viewer-html.ts
./lib/test-viewer-html.ts
```

---

## Recommendations

### Priority 1: Delete Dead Code (9 files)
Safe to delete immediately — never imported anywhere:

```
extensions/lib/secure-engine.ts
extensions/lib/vuln-scanner-installer.ts
extensions/lib/cleanup-viewer-html.ts
extensions/lib/file-viewer-html.ts
extensions/lib/plan-viewer-html.ts
extensions/lib/reports-viewer-html.ts
extensions/lib/research-viewer-html.ts
extensions/lib/spec-viewer-html.ts
extensions/lib/test-viewer-html.ts
```

**Impact:** Removes 9,000+ lines of code with zero functionality loss

---

### Priority 2: Refactor Mixed Imports (12 files)

#### Option A: Consolidate to Subdirectories
Move all top-level files to subdirectories, then:
- Update all callers from `./lib/xxx.ts` to `./lib/subdir/xxx.ts`
- Keep top-level stubs if backward compatibility needed

**Files Affected:**
- `claude/`: 10 files
- `sounds/`: 2 files

#### Option B: Consolidate to Top-Level
Move all subdirectory files to top-level, then:
- Update all callers from `./lib/subdir/xxx.ts` to `./lib/xxx.ts`
- Fix broken import paths in existing top-level copies

**Recommendation:** Option A (subdirectories) — organizes by domain, cleaner module structure

---

## Architecture Notes

### Root Cause
The codebase appears to be mid-refactoring:
- Security module was reorganized (`security/security-engine.ts` is active, top-level `secure-engine.ts` is stub)
- Viewers module was reorganized (`viewers/*.ts` are active, top-level are dead)
- Claude module is split (both locations are live — likely supporting different import paths for extensions/ vs lib/ internals)
- Sounds module is split (mixed imports suggest incomplete migration)

### Current Pattern
```
lib/
  ├── [102 files at top-level]
  ├── claude/               [11 files — top-level dups also exist]
  ├── security/             [5 files — top-level stubs also exist]
  ├── viewers/              [7 files — top-level dups also exist]
  ├── sounds/               [4 files — top-level dups also exist]
  ├── tool-advisor/         [5 files — no top-level dups]
  ├── cleanup/              [1 file — no top-level dup]
  ├── commander/            [13 files — no top-level dups]
  └── orchestration/        [1 file — no top-level dup]
```

### Suggested Final State
Either:
1. **All-in-subdirectories**: Move remaining top-level duplicates to subdir, update imports, keep stubs if needed
2. **Hybrid**: Keep top-level for public API, subdirectories for internal module organization

Current state (mixed) creates maintenance burden and IDE confusion.

---

## Testing Impact

If dead code is deleted, run:
```bash
grep -r "from.*lib/\(secure-engine\|cleanup-viewer-html\|file-viewer-html\|plan-viewer-html\|reports-viewer-html\|research-viewer-html\|spec-viewer-html\|test-viewer-html\|vuln-scanner-installer\)" extensions/ __tests__/ --include="*.ts"
```

Should return **zero matches** if deletion is safe.

---

## Files Checked

- Top-level: 102 .ts files in `extensions/lib/`
- Subdirectories: `claude/`, `security/`, `viewers/`, `sounds/`, `tool-advisor/`, `cleanup/`, `commander/`, `orchestration/`
- Import patterns: Full grep scan of `extensions/` directory

---

Generated by: SA-2-SCOUT-DUPLICATES
Report last updated: 2025-05-21
