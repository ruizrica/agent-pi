The `/theme` command still works for direct picking. If you had a muscle-memory binding to `Ctrl+X`, the new key keeps the same mnemonic ("T" for Theme) and avoids the terminal conflicts.

---

## Interfaze AI Provider

This package includes experimental support for the [Interfaze AI API](https://interfaze.ai/), which offers:

- Text and image inputs
- 1 million token context window
- 32K maximum output tokens
- Reasoning capabilities
- Structured output support

### Setup
Load the Interfaze extension and configure the API key:

```bash
export INTERFAZE_API_KEY="your-api-key-here"
```

### Usage

Interfaze registers the `interfaze` provider through `extensions/interfaze.ts`, so `interfaze-beta` is available after the extension loads.

```typescript
import interfazeExtension from "extensions/interfaze.ts";
import { createInterfazeModel, streamInterfaze } from "extensions/lib/interfaze-helper.ts";
```

The primary model available is `"interfaze-beta"`.

Example usage:

```typescript
const interfazeModel = createInterfazeModel("interfaze-beta");
const stream = streamInterfaze("interfaze-beta", context, options);
```

`INTERFAZE_API_KEY` is the provider auth key used by `pi.registerProvider("interfaze", ...)`.

### Demo script

```bash
node scripts/demo-interfaze-provider.mjs
export INTERFAZE_API_KEY="your-api-key-here"
node scripts/demo-interfaze-provider.mjs --live --prompt "Summarize Pi in one sentence."
```

### Provider load check

```bash
node scripts/check-interfaze-provider-loaded.mjs
```

If `interfaze-beta` is found, Pi has loaded the provider. Use the load check first, then the demo script for dry-run or live API validation.

### Complete workflow demo

```bash
node scripts/demo-interfaze-complete-workflow.mjs
export INTERFAZE_API_KEY="your-api-key-here"
node scripts/demo-interfaze-complete-workflow.mjs --live --prompt "Say hello from Interfaze."
```
