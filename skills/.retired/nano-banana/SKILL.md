---
name: nano-banana
description: Generate or edit images with OpenRouter using the google/gemini-3.1-flash-image-preview model. Use when the user asks for image generation, wants a new visual from a text prompt, or wants modifications to an existing screenshot or image and expects an image file back.
allowed-tools: Bash(node agent/skills/nano-banana/generate-image.js:*)
---

# Nano Banana Image Generation

Use this skill when the user wants an image back, either from a fresh prompt or from editing an existing image.

## Model

- Provider: OpenRouter
- Model: `google/gemini-3.1-flash-image-preview`
- Friendly name: Nano Banana

## Supported workflows

1. **Text-to-image**: user provides a prompt, you generate an image.
2. **Image edit**: user provides an image or screenshot plus instructions, you generate a modified image.

## Before you run

- Make sure the prompt is explicit enough to produce the desired image.
- If editing an image, first save or locate the input image path in the workspace.
- The script writes generated files to `.context/generated-images/` by default.

## Usage

### Generate a new image

```bash
node agent/skills/nano-banana/generate-image.js \
  --prompt "A clean product hero shot of a matte black coffee grinder on a soft beige background, studio lighting" \
  --output .context/generated-images/coffee-grinder.png
```

### Edit an existing image

```bash
node agent/skills/nano-banana/generate-image.js \
  --prompt "Keep the layout the same, but change the CTA button to green, replace the headline with 'Ship faster', and make the page look more premium" \
  --input-image path/to/screenshot.png \
  --output .context/generated-images/edited-screenshot.png
```

## Response handling

- The script prints JSON with an `output` field containing the saved image path.
- After running it, tell the user the output file path.
- If the model returns no image, inspect the JSON warning and summarize the failure clearly.

## Notes

- Prefer PNG outputs unless the user asks for another format.
- Preserve existing composition when the user asks for modifications to a screenshot.
- If the user’s request is ambiguous, clarify what should change and what must remain untouched.
