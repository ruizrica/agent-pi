# Consolidate OpenRouter Routing Sub-Files into Their Extension

Six implementation files in extensions/lib/ (openrouter-routing-api.ts, openrouter-routing-models.ts, openrouter-routing-picker.ts, openrouter-routing-provider.ts, openrouter-routing-state.ts, openrouter-routing-types.ts, totaling 984 lines) are all imported by a single extension: openrouter-routing.ts. No other file imports them directly. The split imposes navigation cost to understand routing logic with zero leverage benefit—a premature decomposition with no real seam to justify it.

Consolidate into at most 2 files: merge everything into openrouter-routing.ts, or optionally keep openrouter-routing-types.ts separately only if type exports are genuinely reusable across future extensions. The seam should be the extension's public interface, not the internal file structure.

This mirrors ADR-0005 (task lib consolidation): modules split before any caller demanded the break. Understand routing by reading one or two files, not seven. If a second extension later needs routing types, that's when to extract—not before.

**Status:** Accepted

**Considered Options:**
1. Keep current 6-file split — rejected; imposes navigation cost with zero leverage.
2. Merge everything unconditionally — acceptable; slightly less safe.

**Consequences:** Routing logic becomes locally readable. Future extraction happens only when a second caller justifies the seam.
