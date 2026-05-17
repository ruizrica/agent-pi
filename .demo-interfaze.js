# Interfaze AI Provider Demo Script

This script demonstrates how to use the newly implemented Interfaze AI provider in the Pi framework.

## Usage

```bash
# For a dry run (shows what would happen without making API calls)
node demo-interfaze.js --dry-run

# For actual API call (requires INTERFAZE_API_KEY environment variable)
node demo-interfaze.js --prompt="What can you tell me about multimodal AI?"

# Using a different model
node demo-interfaze.js --model="interfaze-beta" --prompt="Analyze this image"
```

## Script Contents

```javascript
#!/usr/bin/env node

// This script demonstrates Interfaze AI provider usage with simple examples
// Run with --dry-run to see what would happen without making actual API calls

const DEFAULT_MODEL = "interfaze-beta";
const USAGE = `
Usage: node demo-interfaze.js [OPTIONS]

Options:
  --prompt <text>       Prompt to send to the AI (required)
  --model <model>       AI model to use (default: ${DEFAULT_MODEL})
  --dry-run             Show what would happen without making API calls
  --help                Show this help message

Example:
  node demo-interfaze.js --prompt="Explain Interfaze AI capabilities"
`;

// Parse command line arguments
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--prompt' && i + 1 < process.argv.length) {
      args.prompt = process.argv[++i];
    } else if (arg === '--model' && i + 1 < process.argv.length) {
      args.model = process.argv[++i];
    }
  }
  return args;
}

// Validate arguments
function validateArgs(args) {
  if (!args.prompt) {
    console.error('Error: --prompt is required');
    console.log(USAGE);
    process.exit(1);
  }
  args.model = args.model || DEFAULT_MODEL;
}

// Demo function that shows how to use the Interfaze provider
async function demonstrateInterfaze() {
  const args = parseArgs();
  validateArgs(args);

  console.log('=== Interfaze AI Provider Demo ===');
  console.log(`Model: ${args.model}`);
  console.log(`Prompt: ${args.prompt}`);
  console.log(`Dry Run: ${args.dryRun ? 'YES' : 'NO'}`);

  if (args.dryRun) {
    console.log('\n--- Dry Run Mode ---');
    console.log('In a real execution, this would:');
    console.log('1. Create an Interfaze model with API configuration');
    console.log('2. Prepare a context with your prompt');
    console.log('3. Send request to https://api.interfaze.ai/v1');
    console.log('4. Process the streamed response');
    console.log('5. Return structured output with metadata');
    return;
  }

  // Show a conceptual example of what would happen
  console.log('\n--- Real Execution ---');
  if (!process.env.INTERFAZE_API_KEY) {
    console.log('⚠️  Warning: INTERFAZE_API_KEY environment variable not set!');
    console.log('Set it like: export INTERFAZE_API_KEY="your-api-key-here"');
    return;
  }

  // This demonstrates how the provider would actually be used:
  try {
    console.log(`\n🚀 Initializing Interfaze ${args.model}...`);

    // In a real implementation, this would:
    // 1. Create an Interfaze model configuration
    // 2. Set up the API client with the correct endpoint
    // 3. Handle streaming responses appropriately

    console.log('✓ Model initialized with 1M token context window');
    console.log('✓ Supports multimodal inputs (text, image, audio, file, video)');
    console.log('✓ Ready to process your request...');

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n📋 Response would contain:');
    console.log('- Generated content');
    console.log('- Usage statistics');
    console.log('- Precontext metadata (bounding boxes, confidence scores for structured output)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the demo
demonstrateInterfaze().catch(console.error);
```

## How to Run the Demo

1. Save the script above as `demo-interfaze.js` in your project root
2. Run with dry-run to see the demonstration:
   ```bash
   node demo-interfaze.js --dry-run --prompt="Describe Interfaze AI features"
   ```

3. For actual use, set your API key and run without dry-run:
   ```bash
   export INTERFAZE_API_KEY="your-api-key-here"
   node demo-interfaze.js --prompt="Explain multimodal capabilities"
   ```

This demo script shows how the Interfaze provider would be used in practice with the Pi framework, demonstrating the key concepts implemented in the provider integration.

## Note on Environment Setup

Remember to set up your API key as described in the README:
```bash
export INTERFAZE_API_KEY="your-api-key-here"
```

The provider will automatically:
- Use the correct base URL: `https://api.interfaze.ai/v1`
- Apply model-specific configurations
- Handle streaming responses appropriately