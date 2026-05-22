# ADR 0004 — Unify Provider CLI Adapters Behind a Shared Interface

- **Status:** Accepted
- **Date:** 2026-05-21
- **Owners:** Agent Architecture

## Context

Five provider CLI modules (`codex-cli.ts` 11 lines, `cursor-cli.ts` 11 lines, `gemini-cli.ts` 9 lines, `opencode-cli.ts` 10 lines, `droid-cli.ts` 113 lines) build argument arrays with no shared type or contract. `toolkit-cli.ts` (254 lines) imports all five and routes via switch/case plus two maps (`TOOLKIT_CLI_AGENTS`, `TOOLKIT_CLI_AGENT_ALIASES`). Adding a new provider requires changes in 5 places: new file, set entry, alias entry, switch case, and `spawnToolkitWorker` wiring. The seam is shallow — each module is a pass-through that adds a file jump without adding leverage. Applying the deletion test: if you deleted `codex-cli.ts`, the complexity wouldn't vanish — `toolkit-cli.ts` would still know about codex in its set and switch case.

## Decision

Define a `ProviderAdapter` interface (command name, arg builder, optional output normalizer) and register adapters in a map. `toolkit-cli.ts` becomes a deep module with the signature `spawnProvider(name, task, options) → Result`. Each provider contributes one adapter object; no changes to the router when adding a provider.

## Why

Adding a provider should cost one adapter object and one map entry, not five touch points across two files. Provider routing should be a single lookup, not scattered across sets, aliases, and switch cases. Testability improves: each adapter is testable in isolation, and the router is testable with a fake adapter.

## Considered Options

1. **Keep current switch/case.** Rejected — scales linearly with provider count and has poor locality.
2. **Make each provider a full class with spawn logic.** Rejected — spawning is properly owned by `toolkit-cli`; providers should only describe how to invoke their CLI.

## Consequences

- `toolkit-cli.ts` shrinks (switch/case collapses to a map lookup).
- Provider registration becomes O(1) and declarative.
- The `ProviderAdapter` type becomes the seam for all CLI integrations.
- Adding or removing a provider requires changes only to its adapter and the provider map, never to `toolkit-cli.ts` routing logic.

## Implementation notes

```typescript
interface ProviderAdapter {
  readonly commandName: string;
  readonly buildArgs: (task: WorkerTask) => string[];
  readonly normalizeOutput?: (raw: string) => unknown;
}

const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  codex: CodexAdapter,
  cursor: CursorAdapter,
  gemini: GeminiAdapter,
  opencode: OpencodeAdapter,
  droid: DroidAdapter,
};

// Router becomes a single lookup and spawn
async function spawnProvider(
  providerName: string,
  task: WorkerTask,
  options: SpawnOptions,
): Promise<Result> {
  const adapter = PROVIDER_ADAPTERS[providerName];
  if (!adapter) throw new Error(`Unknown provider: ${providerName}`);
  
  const args = adapter.buildArgs(task);
  const result = await spawn(adapter.commandName, args, options);
  return adapter.normalizeOutput ? adapter.normalizeOutput(result) : result;
}
```

This removes the need for `TOOLKIT_CLI_AGENTS`, `TOOLKIT_CLI_AGENT_ALIASES`, and the switch statement entirely.
