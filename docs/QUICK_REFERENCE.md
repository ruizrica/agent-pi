# Pi Provider Configuration - Quick Reference

## Quick Setup Examples

### 1. Add Local Model (Ollama)

Edit `~/.pi/agent/models.json`:
```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b", "name": "Llama 3.1" }
      ]
    }
  }
}
```

### 2. Route Through Corporate Proxy

Edit `~/.pi/agent/models.json`:
```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://proxy.corp.com/anthropic/v1"
    }
  }
}
```

### 3. Add Custom OpenAI-Compatible Provider

Edit `~/.pi/agent/models.json`:
```json
{
  "providers": {
    "my-api": {
      "baseUrl": "https://api.mycompany.com/v1",
      "api": "openai-completions",
      "apiKey": "MY_API_KEY",
      "models": [
        {
          "id": "my-model",
          "name": "My Model",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 1, "output": 5, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 128000,
          "maxTokens": 4096
        }
      ]
    }
  }
}
```

### 4. Override Built-in Model Settings

Edit `~/.pi/agent/models.json`:
```json
{
  "providers": {
    "anthropic": {
      "modelOverrides": {
        "claude-sonnet-4-5": {
          "name": "Claude Sonnet (Customized)",
          "contextWindow": 100000
        }
      }
    }
  }
}
```

## API Key Resolution

| Method | Priority | Example |
|--------|----------|---------|
| CLI flag | 1 (highest) | `pi --api-key sk-...` |
| auth.json | 2 | `~/.pi/agent/auth.json` |
| Environment var | 3 | `export ANTHROPIC_API_KEY=sk-...` |
| models.json | 4 (lowest) | `"apiKey": "sk-..."` in models.json |

## Supported APIs

Use in `api` field:
- `openai-completions` - OpenAI Chat API (most compatible)
- `openai-responses` - OpenAI Responses API
- `anthropic-messages` - Anthropic API
- `google-generative-ai` - Google Gemini
- `bedrock-converse-stream` - AWS Bedrock
- `azure-openai-responses` - Azure OpenAI

## Common Providers & Env Vars

| Provider | Env Variable |
|----------|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google | `GEMINI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

## Creating Custom Extensions

Create `~/.pi/agent/extensions/my-provider.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Override existing provider
  pi.registerProvider("anthropic", {
    baseUrl: "https://proxy.example.com"
  });

  // Register new provider
  pi.registerProvider("custom", {
    baseUrl: "https://api.custom.com/v1",
    apiKey: "CUSTOM_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "model1",
        name: "Model 1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096
      }
    ]
  });

  // Register with OAuth
  pi.registerProvider("corp-sso", {
    baseUrl: "https://ai.corp.com/v1",
    api: "openai-responses",
    models: [...],
    oauth: {
      name: "Corporate AI",
      login: async (callbacks) => { /* impl */ },
      refreshToken: async (creds) => { /* impl */ },
      getApiKey: (creds) => creds.access
    }
  });
}
```

## auth.json Format

```json
{
  "provider-name": {
    "type": "api_key",
    "key": "sk-... or !command or ENV_VAR"
  },
  "oauth-provider": {
    "type": "oauth",
    "refresh": "refresh_token",
    "access": "access_token",
    "expires": 1234567890
  }
}
```

## Key File Locations

- Models & Providers: `~/.pi/agent/models.json`
- API Keys: `~/.pi/agent/auth.json`
- Custom Extensions: `~/.pi/agent/extensions/*.ts`

## Useful Commands

```bash
# Use specific model
pi --provider anthropic --model claude-sonnet-4-5

# Set API key for session
pi --api-key sk-...

# View available models
pi /model

# Test with local Ollama
export OLLAMA_API_KEY=ollama
pi --provider ollama --model llama3.1:8b
```

## Common Compatibility Settings (OpenAI-compatible)

```json
{
  "compat": {
    "supportsReasoningEffort": true,
    "supportsUsageInStreaming": true,
    "maxTokensField": "max_completion_tokens",
    "thinkingFormat": "openai",
    "supportsStrictMode": true
  }
}
```

## Troubleshooting

**Problem:** Model not found  
**Solution:** Run `pi /model` to reload and see available models

**Problem:** API key not working  
**Solution:** Check resolution order (CLI > auth.json > env > models.json)

**Problem:** Models.json syntax error  
**Solution:** Validate JSON at `jsonlint.com` and check `pi /model` for errors

**Problem:** Custom extension not loading  
**Solution:** Ensure file is at `~/.pi/agent/extensions/name.ts` and named export is default function

---

For complete documentation, see `PROVIDER_EXPLORATION_REPORT.md`
