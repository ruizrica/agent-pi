# Qwen Builder Prototype

This throwaway prototype evaluates a Qwen builder on a self-contained repository analysis task.

## What it does

`analyze-extensions.mjs` scans the repository `extensions/` directory and generates a markdown report that summarizes:

- top-level extension entry files
- likely viewer/report-related files
- nearby test files under `extensions/__tests__/`

The script is intentionally isolated under `experiments/qwen-builder-prototype/` so it can be reviewed or discarded without affecting production extension code.

## Usage

From the repository root:

```bash
node experiments/qwen-builder-prototype/analyze-extensions.mjs
```

Write the report to a file:

```bash
node experiments/qwen-builder-prototype/analyze-extensions.mjs experiments/qwen-builder-prototype/sample-report.md
```

## Scope and constraints

- Uses only Node built-ins
- Scans only the local `extensions/` tree
- Uses filename heuristics for viewer/report classification
- Uses basename similarity to infer matching tests

## Limitations

- Test associations are heuristic, not semantic
- Viewer/report detection is filename-based and may over- or under-match
- The report is optimized for human inspection, not as a stable machine-readable format
