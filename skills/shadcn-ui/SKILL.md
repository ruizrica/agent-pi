---
name: shadcn-ui
description: "shadcn/ui v4 component system and CLI. Use when working with shadcn/ui components, running shadcn CLI commands (init, add, search, view, docs, diff, info, build), configuring components.json, theming with CSS variables and OKLCH colors, using presets, authoring custom registries, or using Radix/Base UI primitives. Triggers: 'add a shadcn component', 'init shadcn', 'shadcn theme', 'use --preset', 'registry authoring', 'components.json', 'shadcn diff', 'customize colors', 'dark mode with shadcn', 'install from registry'."
allowed-tools: Bash(npx:*) Bash(npm:*)
---

# shadcn/ui v4

A code distribution system for UI components. Components are copied into your project and fully owned — not installed as a dependency. Supports Radix and Base UI primitives, React 19, Next.js, Vite, React Router, Astro, Laravel, and TanStack Start.

## Project Detection

The skill activates when a `components.json` file exists in the project root.

Use `shadcn info --json` to get the full project configuration: framework, Tailwind version, aliases, base library (radix or base), icon library, installed components, and resolved file paths. Always do so before generating component code to match the project setup.

```bash
npx shadcn@latest info --json
```

## CLI Reference

### Initialization

```bash
# Interactive setup — picks framework, style, colors
npx shadcn@latest init

# From a preset code (colors, theme, icons, fonts, radius)
npx shadcn@latest init --preset a1Dg5eFl

# Pick a project template (Next.js, Vite, TanStack Start, React Router, Astro, Laravel)
npx shadcn@latest init -t next

# Monorepo setup
npx shadcn@latest init -t next --monorepo

# Choose primitives library
npx shadcn@latest init --base radix
npx shadcn@latest init --base base
```

### Adding Components

```bash
# Add one or more components
npx shadcn@latest add button card dialog

# Preview what will be added without writing files
npx shadcn@latest add button --dry-run

# Show diff against registry version
npx shadcn@latest add button --diff

# View component source without installing
npx shadcn@latest add button --view

# Overwrite existing local components
npx shadcn@latest add button --overwrite

# Add from a third-party registry
npx shadcn@latest add @tailark/hero-section
npx shadcn@latest add @clerk/sign-in
```

### Discovery

```bash
# Search for components
npx shadcn@latest search combobox

# View component source
npx shadcn@latest view button

# Get docs, examples, and API links for a component
npx shadcn@latest docs combobox
```

### Maintenance

```bash
# Show diff between local components and registry
npx shadcn@latest diff

# Show full project info
npx shadcn@latest info
npx shadcn@latest info --json
```

### Building Custom Registries

```bash
# Build registry from registry.json
npx shadcn@latest build
```

## Presets

A preset encodes your entire design system config into a short code: colors, theme, icon library, fonts, radius. Build presets at shadcn/create, preview live, and grab the code.

```bash
# Init with a preset
npx shadcn@latest init --preset a1Dg5eFl

# Switch presets in an existing project (reconfigures everything including components)
npx shadcn@latest init --preset ad3qkJ7
```

Agents can use presets directly:
- "create a new next app using --preset adtk27v"
- "let's try --preset adtk27v"

## Pattern Enforcement

When generating component code, follow these composition rules:

- **Forms**: Use `FieldGroup` to wrap form fields — not raw inputs
- **Option sets**: Use `ToggleGroup` for multi-option selection
- **Colors**: Use semantic color tokens (`--primary`, `--destructive`, `--muted`) — never raw hex or oklch values in component code
- **Composition**: Prefer compound components over prop drilling
- **Base-specific APIs**: Check whether the project uses Radix or Base UI primitives via `shadcn info --json`, then use the correct API surface

## Theming

### CSS Variables

All colors are defined as CSS custom properties using OKLCH color space for perceptual uniformity:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0.042 264.695);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --muted: oklch(0.97 0 0);
  --accent: oklch(0.97 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}
```

### Dark Mode

Class-based toggling with separate variable sets:

```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... dark variants for all tokens */
}
```

### Customization

- Override variables in `globals.css` or `app.css`
- Create custom color scales by computing OKLCH lightness ramps
- Adjust `--radius` for global border radius
- Supports both Tailwind v3 (`@apply`) and v4 (CSS-first config)

## Registry Authoring

Build and publish custom component registries using `registry.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "my-registry",
  "homepage": "https://my-registry.com",
  "items": [
    {
      "name": "my-component",
      "type": "registry:component",
      "files": [{ "path": "registry/my-component.tsx", "type": "registry:component" }],
      "dependencies": ["@radix-ui/react-dialog"]
    }
  ]
}
```

### Registry Types

- `registry:component` — UI components
- `registry:base` — entire design system (components, deps, CSS vars, fonts, config)
- `registry:font` — font configuration as a first-class type

```json
{
  "name": "font-inter",
  "type": "registry:font",
  "font": {
    "family": "'Inter Variable', sans-serif",
    "provider": "google",
    "import": "Inter",
    "variable": "--font-sans",
    "subsets": ["latin"]
  }
}
```

Install fonts like components:

```bash
npx shadcn@latest add font-inter
```

## Updating Components

Check for registry updates and merge with local changes:

```bash
# See what changed
npx shadcn@latest add button --diff

# Or ask your agent: "check for updates from @shadcn and merge with my local changes"
```

## MCP Server

The shadcn MCP server lets agents search, browse, and install components from registries programmatically. Configure it in your MCP settings if available for direct registry access without CLI.

## Workflow for Agents

1. Run `npx shadcn@latest info --json` to understand project config
2. Use `npx shadcn@latest docs <component>` to get API docs before generating code
3. Use `npx shadcn@latest search <query>` to discover available components
4. Use `--dry-run` before `add` to preview changes
5. Use `--diff` to check for updates to existing components
6. Follow pattern enforcement rules when generating component code
7. Use semantic color tokens from the project's CSS variables
