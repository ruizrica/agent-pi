---
description: "Interactive design system generator: gather brand tokens through Q&A, scaffold CSS/Tailwind/SCSS/iOS/Android outputs, then create sample UI with /frontend-design"
argument-hint: "[project name or path]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep", "AskUserQuestion", "Edit", "Skill"]
model: opus
---

# Interactive Design Token Pipeline

You are orchestrating an interactive design system generation workflow. You gather brand preferences through Q&A, generate semantic design tokens, scaffold multi-format outputs with Tailwind integration, then invoke `/frontend-design` for a visual showcase.

## User's Input

$ARGUMENTS

## Workflow Overview

The design pipeline has **5 phases**:
1. **Context Detection** — Scan for existing tokens, Tailwind config, framework hints
2. **Interactive Q&A** — Gather brand preferences through 7 sequential questions
3. **Token Generation** — Create canonical `tokens.json` with semantic color categories
4. **Output Scaffolding** — Generate Tailwind theme, CSS variables, and selected formats
5. **Sample Showcase** — Invoke `/frontend-design` to create components consuming the tokens

---

## PHASE 0: Context Detection

Before asking questions, scan the project for existing configuration:

1. **Glob for existing tokens:**
   - `**/tokens.json`, `**/design-tokens.*`, `**/tokens/**`
   - `**/tailwind.config.*`
   - `**/variables.css`, `**/_variables.scss`

2. **Check `package.json`** for framework hints:
   - `tailwindcss` — Tailwind CSS present
   - `sass` / `node-sass` — SCSS support
   - `react` / `vue` / `svelte` — frontend framework

3. **Check for mobile projects:**
   - `*.xcodeproj`, `Package.swift` — iOS
   - `build.gradle`, `AndroidManifest.xml` — Android

4. **Read existing `tokens.json`** if found — use as defaults for Q&A.

Store findings as context for default values in Phase 1.

---

## PHASE 1: Interactive Q&A

Ask **7 questions, one at a time** using AskUserQuestion. Use context from Phase 0 as defaults.

### Question 1: Project Context

**Skip if `$ARGUMENTS` provides a path.**

Ask where to output the design system:
- Current directory (Recommended)
- Specific subdirectory (e.g., `src/design-system`)
- Custom path

Store as `output_path`.

### Question 2: Colors

Ask about brand colors with options:
- **Enter hex values manually** — "I'll provide specific brand colors"
- **Extract from project** — "Scan my project for existing colors" (then grep CSS/config files for color values)
- **Use a starter palette** — "Generate a professional palette from a single accent color"

After initial selection, follow up to collect:
- Primary brand colors with **semantic names** (e.g., "brand-green" → #2D6B1E, "brand-orange" → #ea580c)
- Content colors: content-primary, content-secondary, content-muted
- Surface colors: surface-default, surface-muted, surface-elevated
- Border colors: border-default, border-muted

If user provides just hex values, ask them to name each one semantically (e.g., "What would you call #2D6B1E? brand-green? primary?").

### Question 3: Typography

Ask about font choices:
- **System fonts** (Recommended) — `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Google Fonts** — "I'll specify Google Font names" (then ask for heading + body fonts)
- **Custom fonts** — "I have custom font files"

Collect: heading font family, body font family, mono font family.
Also collect font size scale preference:
- Tailwind default (sm/base/lg/xl/2xl...)
- Type scale ratio (e.g., 1.25 Major Third)

### Question 4: Spacing

Ask about spacing base unit:
- **4px base (Tailwind)** (Recommended) — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- **8px base (Material)** — 8, 16, 24, 32, 40, 48, 64, 80, 96
- **Custom** — "I'll specify my own scale"

### Question 5: Border Radius

Ask about corner style:
- **Rounded** (Recommended) — sm: 4px, md: 8px, lg: 12px, xl: 16px, full: 9999px
- **Sharp** — all 0px (no rounding)
- **Pill** — generous rounding, buttons get full radius
- **Custom** — "I'll specify values"

### Question 6: Shadows

Ask about shadow style:
- **Subtle** (Recommended) — soft, low-opacity shadows for depth
- **Elevated** — more pronounced Material-style elevation
- **None** — flat design, no shadows
- **Custom** — "I'll specify shadow values"

### Question 7: Output Formats

**MultiSelect question.** Ask which additional formats to generate (Tailwind + tokens.json are always generated):
- CSS Custom Properties (`css/variables.css`)
- SCSS Variables (`scss/_variables.scss`)
- iOS Swift (`ios/DesignTokens.swift`)
- Android XML (`android/design_tokens.xml`)
- Style Dictionary JSON (`tokens/style-dictionary.json`)

---

## PHASE 2: Generate `tokens.json`

Create the canonical token source at `<output_path>/design-system/tokens.json`.

### Structure

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "metadata": {
    "name": "<project name>",
    "version": "1.0.0",
    "generated": "<ISO timestamp>",
    "generator": "claude-design-pipeline"
  },
  "colors": {
    "brand": {
      "<name>": {
        "DEFAULT": "<hex>",
        "50": "<lightest>",
        "100": "...",
        "200": "...",
        "300": "...",
        "400": "...",
        "500": "<base>",
        "600": "...",
        "700": "...",
        "800": "...",
        "900": "...",
        "950": "<darkest>"
      }
    },
    "content": {
      "primary": "<hex>",
      "secondary": "<hex>",
      "muted": "<hex>",
      "inverse": "<hex>"
    },
    "surface": {
      "default": "<hex>",
      "muted": "<hex>",
      "elevated": "<hex>",
      "inverse": "<hex>"
    },
    "border": {
      "default": "<hex>",
      "muted": "<hex>"
    }
  },
  "typography": {
    "fontFamily": {
      "heading": "<font stack>",
      "body": "<font stack>",
      "mono": "<font stack>"
    },
    "fontSize": { ... },
    "fontWeight": { ... },
    "lineHeight": { ... }
  },
  "spacing": { ... },
  "borderRadius": { ... },
  "shadows": { ... }
}
```

### Color Shade Generation

For each brand color, generate a full shade scale (50–950) using HSL interpolation:
- **50**: Very light tint (high lightness, low saturation)
- **100–400**: Progressive tints toward the base
- **500**: Base color (the user-provided value)
- **600–900**: Progressive shades toward dark
- **950**: Very dark shade (low lightness)

Use the HSL color model: keep hue constant, adjust saturation and lightness progressively.

---

## PHASE 3: Generate Output Formats

**Always generate these three files:**

### 1. `design-system/tokens.json` (from Phase 2)

### 2. `design-system/tailwind/theme.js`

Generate a Tailwind theme extension exporting all tokens as Tailwind-compatible values:

```js
// ABOUTME: Tailwind theme extension with semantic design tokens.
// ABOUTME: Auto-imported by tailwind.config — provides brand-*, content-*, surface-* classes.
module.exports = {
  colors: {
    'brand-<name>': { DEFAULT: '<hex>', 50: '...', ..., 950: '...' },
    // ... more brand colors
    'content-primary': '<hex>',
    'content-secondary': '<hex>',
    'content-muted': '<hex>',
    'content-inverse': '<hex>',
    'surface-default': '<hex>',
    'surface-muted': '<hex>',
    'surface-elevated': '<hex>',
    'surface-inverse': '<hex>',
    'border-default': '<hex>',
    'border-muted': '<hex>',
  },
  fontFamily: {
    heading: ['<font>', ...fallbacks],
    body: ['<font>', ...fallbacks],
    mono: ['<font>', ...fallbacks],
  },
  fontSize: { ... },
  spacing: { ... },
  borderRadius: { ... },
  boxShadow: { ... },
};
```

This enables utility classes: `text-brand-green`, `bg-brand-green-50`, `text-content-primary`, `bg-surface-muted`, `border-border-default`, `font-heading`, `shadow-sm`, etc.

### 3. Auto-patch or create Tailwind config

**If `tailwind.config.*` exists:**
- Read the existing config
- Add the theme import to `theme.extend`:
  ```js
  const designTokens = require('./design-system/tailwind/theme');
  // ... in module.exports:
  theme: {
    extend: {
      ...designTokens,
      // ... existing extensions
    }
  }
  ```

**If no Tailwind config exists:**
- Generate a fresh `tailwind.config.js` that imports the design tokens:
  ```js
  // ABOUTME: Tailwind CSS configuration with design system tokens.
  // ABOUTME: Extends theme with semantic tokens from design-system/tailwind/theme.js.
  const designTokens = require('./design-system/tailwind/theme');

  /** @type {import('tailwindcss').Config} */
  module.exports = {
    content: ['./src/**/*.{html,js,jsx,ts,tsx,vue,svelte}', './index.html'],
    theme: {
      extend: {
        ...designTokens,
      },
    },
    plugins: [],
  };
  ```

### 4. `design-system/README.md`

Generate a usage guide covering:
- Token structure overview
- Tailwind class examples (`text-brand-green`, `bg-surface-muted`, `text-content-primary`)
- CSS variable usage (if generated)
- How to regenerate tokens
- Link to the showcase (Phase 4)

### Additional formats (based on Q7 selections):

#### CSS Custom Properties — `design-system/css/variables.css`
```css
/* ABOUTME: CSS custom properties generated from design tokens. */
/* ABOUTME: Semantic variables for brand-*, content-*, surface-* colors. */
:root {
  /* Brand Colors */
  --color-brand-green: #2D6B1E;
  --color-brand-green-50: #f0fdf4;
  /* ... full scale ... */

  /* Content Colors */
  --color-content-primary: #1E293B;
  --color-content-secondary: #64748B;
  --color-content-muted: #94a3b8;

  /* Surface Colors */
  --color-surface-default: #ffffff;
  --color-surface-muted: #f8fafc;
  --color-surface-elevated: #ffffff;

  /* Typography */
  --font-heading: ...;
  --font-body: ...;
  --font-mono: ...;

  /* Spacing */
  --spacing-1: 0.25rem;
  /* ... */

  /* Border Radius */
  --radius-sm: 4px;
  /* ... */

  /* Shadows */
  --shadow-sm: ...;
  /* ... */
}
```

#### SCSS Variables — `design-system/scss/_variables.scss`
```scss
// ABOUTME: SCSS variables and maps generated from design tokens.
// ABOUTME: Provides $brand-*, $content-*, $surface-* variables and maps.

// Brand Colors
$brand-green: #2D6B1E;
$brand-green-50: #f0fdf4;
// ...

// Color Maps
$brand-colors: (
  'green': $brand-green,
  // ...
);

// Typography
$font-heading: ...;
// ...

// Spacing
$spacing: (1: 0.25rem, 2: 0.5rem, ...);
```

#### iOS Swift — `design-system/ios/DesignTokens.swift`
```swift
// ABOUTME: Design tokens for iOS generated from canonical tokens.json.
// ABOUTME: Provides Color, Typography, Spacing enums with semantic naming.
import SwiftUI

enum DesignTokens {
    enum Colors {
        enum Brand {
            static let green = Color(hex: "#2D6B1E")
            // ...
        }
        enum Content {
            static let primary = Color(hex: "#1E293B")
            // ...
        }
        // ...
    }
    // Typography, Spacing, etc.
}
```

#### Android XML — `design-system/android/design_tokens.xml`
```xml
<!-- ABOUTME: Design tokens for Android generated from canonical tokens.json. -->
<!-- ABOUTME: Provides color, dimen, and string resources with semantic naming. -->
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Brand Colors -->
    <color name="brand_green">#2D6B1E</color>
    <!-- Content Colors -->
    <color name="content_primary">#1E293B</color>
    <!-- Spacing -->
    <dimen name="spacing_1">4dp</dimen>
    <!-- ... -->
</resources>
```

#### Style Dictionary — `design-system/tokens/style-dictionary.json`

Generate CTI (Category/Type/Item) format compatible with Style Dictionary build pipelines.

**IMPORTANT:** Every generated file MUST start with a 2-line `ABOUTME:` comment (using the file's comment syntax).

---

## PHASE 4: Sample Showcase via `/frontend-design`

After all token files are generated, invoke the `/frontend-design` skill to create sample components.

Use the `Skill` tool to invoke `frontend-design` with a prompt describing:

1. The design system tokens location (`<output_path>/design-system/`)
2. The Tailwind theme from `tailwind/theme.js` with semantic class names
3. Request these sample components:
   - **Card component** — with surface colors, border, shadow, and content typography
   - **Button set** — primary, secondary, and ghost variants using brand colors
   - **Form input** — with border, focus states, and content colors
   - **Hero section** — showcasing brand colors, typography scale, and spacing
4. Reference CSS custom properties from `css/variables.css` as fallbacks (if generated)
5. Output to `<output_path>/design-system/showcase/`

The `/frontend-design` skill will apply its aesthetic guidelines (distinctive typography, cohesive theme, motion, spatial composition) to produce production-grade sample components that demonstrate the design system.

---

## PHASE 5: Summary

Print a completion summary:

### Generated Files
List every file created with a brief description.

### Tailwind Classes Available
Show examples of the utility classes now available:
```
text-brand-green       bg-brand-green-50     border-brand-green
text-content-primary   bg-surface-muted      border-border-default
font-heading           font-body             font-mono
shadow-sm              rounded-lg            p-4
```

### Showcase
Link to the generated showcase page and suggest how to view it.

### Import Instructions
Per-format import examples:
- **Tailwind**: Already integrated — just use utility classes
- **CSS**: `@import './design-system/css/variables.css';`
- **SCSS**: `@import './design-system/scss/variables';`
- **iOS**: `import DesignTokens`
- **Android**: `@color/brand_green`

### Regeneration
Explain that running `/design` again will detect existing `tokens.json` and use current values as defaults, making it easy to iterate.

---

## Execution Instructions

**BEGIN NOW by:**

1. Running Phase 0: Context Detection (glob for existing tokens, check package.json)
2. Starting Phase 1: Ask Question 1 (project context) via AskUserQuestion
3. Continue through all 7 questions sequentially
4. Generate tokens.json (Phase 2)
5. Generate all output formats (Phase 3)
6. Invoke `/frontend-design` for showcase (Phase 4)
7. Print summary (Phase 5)

**CRITICAL RULES:**

1. **ONE QUESTION AT A TIME** — Use AskUserQuestion for each question sequentially
2. **SEMANTIC NAMING** — Always use semantic color categories: brand-*, content-*, surface-*, border-*
3. **DUAL OUTPUT** — Always generate both standalone tokens AND Tailwind integration
4. **ABOUTME COMMENTS** — Every generated file must start with 2-line ABOUTME comment
5. **AUTO-PATCH TAILWIND** — Detect and extend existing tailwind.config, or create fresh one
6. **tokens.json IS SOURCE OF TRUTH** — All other formats derive from it
7. **INVOKE /frontend-design** — Always call the Skill tool to generate the showcase
8. **NO SUB-AGENTS** — Execute everything directly (no Task tool spawning)
9. **HSL INTERPOLATION** — Generate shade scales (50-950) for brand colors using HSL model

Start execution now with Phase 0.
