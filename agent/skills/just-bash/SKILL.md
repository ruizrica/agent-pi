# Just Bash Skill

ABOUTME: Skill for sandboxed bash execution using just-bash from Vercel Labs.
ABOUTME: Enables safe script execution with read-only filesystem, no network, and in-memory writes.

---

## Overview

Use this skill when you need to:
- Run bash commands safely without modifying the real filesystem
- Process and transform data files (CSV, JSON, YAML, text)
- Test shell scripts in an isolated sandbox
- Run exploratory commands where mistakes can't cause damage
- Execute complex pipelines (grep, awk, sed, jq, xan, rg)
- Validate scripts before running them for real

**When to use just-bash vs the regular Bash tool:**
- **just-bash**: Exploratory work, data processing, script testing, untrusted input, bulk file operations where you want safety
- **Regular Bash**: git operations, npm/pip commands, running servers, anything needing network or real writes

## Prerequisites

```bash
# Install globally
npm install -g just-bash

# Or use via npx (no install needed)
npx just-bash -c 'echo hello'
```

## Core Usage

### Run Inline Commands

```bash
# Simple command
just-bash -c 'ls -la'

# Multi-line script
just-bash -c '
for f in *.ts; do
  echo "$(wc -l < "$f") $f"
done | sort -rn | head -10
'
```

### Run Script Files

```bash
just-bash ./scripts/analyze.sh
```

### Pipe Scripts from Stdin

```bash
echo 'find . -name "*.ts" | head -5' | just-bash
```

## Key Options

```bash
--root <path>      # Mount a specific directory (default: cwd)
--cwd <path>       # Set working directory inside sandbox
--allow-write      # Enable in-memory writes (writes don't touch real FS)
--python           # Enable python3 commands
--json             # Output as JSON: {"stdout", "stderr", "exitCode"}
-e, --errexit      # Exit on first error
```

## Security Model

- **Read-only by default** - reads real files via OverlayFS, blocks writes
- **No network access** - cannot curl, wget, or make connections
- **No escape** - sandboxed to the root directory
- **In-memory writes** - with `--allow-write`, writes go to memory only, not disk
- Real filesystem is mounted at `/home/user/project`

## Available Commands (75+)

### Text Processing
`awk` `sed` `grep` `egrep` `fgrep` `rg` `cut` `tr` `sort` `uniq` `wc` `head` `tail` `tac` `rev` `nl` `fold` `expand` `unexpand` `column` `comm` `join` `paste` `split` `strings`

### Data Formats
`jq` (JSON - older build, lacks `-R`/`-s` flags) `xan` (CSV) `html-to-markdown`

### Broken in v1.0.0
`yq` (YAML - "Dynamic require of process" error) `sqlite3` (SQL - "DataView constructor" error)

### File Operations
`ls` `find` `cat` `cp` `mv` `rm` `mkdir` `rmdir` `ln` `touch` `chmod` `stat` `file` `tree` `du` `basename` `dirname` `readlink`

### Compression
`gzip` `gunzip` `zcat` `tar`

### Checksums
`md5sum` `sha1sum` `sha256sum` `base64`

### Utilities
`date` `seq` `expr` `env` `printenv` `whoami` `hostname` `sleep` `timeout` `time` `which` `xargs` `tee` `diff`

## Workflow Patterns

### Pattern 1: Data Analysis Pipeline

```bash
# Analyze a CSV file with xan
just-bash -c '
xan headers data.csv
xan count data.csv
xan frequency data.csv -s status
' --root /path/to/project
```

### Pattern 2: JSON Processing

```bash
# Transform JSON data with jq
just-bash -c '
cat api-response.json | jq ".items[] | {name: .name, count: .total}" | head -20
'
```

### Pattern 3: Codebase Exploration

```bash
# Find patterns across a project (safe, read-only)
just-bash -c '
echo "=== File counts by extension ==="
find . -type f | sed "s/.*\.//" | sort | uniq -c | sort -rn | head -10

echo "=== TODO/FIXME comments ==="
rg -c "TODO|FIXME" --type ts 2>/dev/null | sort -t: -k2 -rn | head -10

echo "=== Largest files ==="
find . -type f -name "*.ts" | xargs wc -l 2>/dev/null | sort -rn | head -10
'
```

### Pattern 4: Script Testing with In-Memory Writes

```bash
# Test a script that writes files - nothing touches disk
just-bash --allow-write -c '
mkdir -p /tmp/output
for f in *.json; do
  jq ".version = \"2.0\"" "$f" > "/tmp/output/$f"
done
ls -la /tmp/output/
cat /tmp/output/package.json
'
```

### Pattern 5: Text Processing Pipeline

```bash
# Combine awk, sed, sort for analysis
just-bash -c '
echo "=== Functions per file ==="
rg -c "function " --type ts 2>/dev/null | sort -t: -k2 -rn | head -10

echo "=== Lines by extension ==="
find . -type f -not -path "./.git/*" | sed "s/.*\.//" | sort | uniq -c | sort -rn | head -10
' --root /path/to/project
```

### Pattern 6: JSON Output for Programmatic Use

```bash
# Get structured output
just-bash --json -c 'echo "hello world"'
# Returns: {"stdout":"hello world\n","stderr":"","exitCode":0}
```

## Tips for AI Usage

1. **Default to just-bash for exploration** - when reading/analyzing files, use the sandbox for safety
2. **Use `--json` flag** when you need to parse the output programmatically
3. **Use `--allow-write` for temp files** - writes stay in memory, safe to experiment
4. **Chain with pipes** - all standard Unix pipelines work (grep | sort | uniq -c | head)
5. **Use `--root`** to scope the sandbox to a specific project directory
6. **Combine tools** - jq for JSON, xan for CSV, rg for search, awk/sed for transforms
7. **Test destructive scripts safely** - rm, mv, overwrites all happen in memory with --allow-write

## Limitations

- No network access (no curl, wget, npm, git, pip, etc.)
- No persistent writes (in-memory only, lost when command exits)
- No interactive commands (no vim, nano, less, etc.)
- No package managers or language runtimes (except python with --python flag)
- No system administration commands (no sudo, systemctl, etc.)
- No process substitution (`<()` syntax not supported)
- `jq` is an older build - `-R` (raw input) and `-s` (slurp) flags are missing
- `yq` is broken in v1.0.0 ("Dynamic require of process" error)
- `sqlite3` is broken in v1.0.0 ("DataView constructor" error)
- `tree` lacks some flags (e.g. `--dirsfirst`)
