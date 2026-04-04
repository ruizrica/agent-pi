---
name: frontend-design
description: "Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, applications, or landing pages that need to look polished and memorable. Covers bold typography, distinctive color palettes, purposeful motion and animation, asymmetric layouts, and spatial composition. Triggers: 'make it look good', 'design this UI', 'build a landing page', 'create a dashboard', 'style this component', 'beautiful UI', 'modern web design', 'production-quality frontend', 'distinctive interface'."
---

# Frontend Design

Create distinctive, production-grade interfaces. Every design decision should be intentional — default choices produce default-looking interfaces.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a bold aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick a clear direction: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian. Use these as inspiration but design one that is true to the aesthetic.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this unforgettable? What is the one thing someone will remember?

Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Typography

Choose fonts that are beautiful, unique, and interesting. Pair a distinctive display font with a refined body font.

**Avoid**: Inter, Roboto, Arial, system fonts, and any font that has become a cliche through overuse (Space Grotesk converges too often — vary your picks).

**Seek out**: Bricolage Grotesque, DM Sans, DM Serif Display, Instrument Serif, Geist, Playfair Display, Sora, Outfit, Plus Jakarta Sans, Fraunces, Newsreader, Literata. These are starting points — explore beyond them.

- Font size scale with purpose, not arbitrary values
- Line height and letter spacing tuned for readability
- Unexpected weight combinations (light headlines with bold body, or vice versa)

## Color and Theme

Commit to a cohesive aesthetic. Use CSS variables for consistency.

- Dominant colors with sharp accents outperform timid, evenly-distributed palettes
- OKLCH color space for perceptual uniformity when computing scales
- Build palettes with intention, not random hex values
- Dark mode as a first-class consideration, not an afterthought

**Avoid**: Purple gradients on white backgrounds, generic blue, teal-to-purple transitions, rainbow palettes with no hierarchy.

**Seek out**: Bold monochromes, warm neutrals with unexpected accents, earth tones with neon pops, deep jewel tones, desaturated pastels with high-contrast typography.

## Motion and Animation

Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available.

- **High-impact moments**: One well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions
- **Scroll-triggered**: IntersectionObserver for reveal animations — elements that enter viewport with purpose
- **Hover states that surprise**: Scale, color shift, shadow depth, border animation, text effects
- **Timing**: Avoid linear easing — use custom cubic-bezier or spring physics
- **Performance**: Only animate `transform` and `opacity` for GPU compositing
- **Accessibility**: Always respect `prefers-reduced-motion`

## Spatial Composition

Break expectations with layout:

- **Asymmetry**: Not everything centered — offset grids, uneven columns, diagonal flow
- **Overlap**: Elements that break their containers, overlapping sections, negative margins with purpose
- **Whitespace**: Use as a design element, not empty space — generous negative space OR controlled density
- **Z-axis**: Layering, elevation, depth through shadows and stacking
- **Grid-breaking**: Full-bleed sections mixed with constrained content widths
- **Fluid sizing**: `clamp()`, `min()`, `max()` for fluid typography and spacing

## Backgrounds and Visual Details

Create atmosphere and depth rather than defaulting to solid colors:

- Gradient meshes, noise textures, geometric patterns
- Layered transparencies, dramatic shadows
- Decorative borders, custom cursors, grain overlays
- Contextual effects that match the overall aesthetic
- Subtle texture through CSS (repeating gradients, radial patterns)

## Anti-Patterns — The "AI Slop" Checklist

Never produce these generic patterns:

- Generic gradient backgrounds (purple-to-blue on white)
- Cards with identical rounded corners and shadows everywhere
- Inter/Roboto at default weights on everything
- Centered everything with no visual tension
- Stock illustration style (Undraw, Storyset)
- Rainbow color palettes with no hierarchy
- Excessive emoji as visual elements
- Glass morphism applied without purpose
- Overused border-radius (not everything is `rounded-xl`)
- Cookie-cutter component patterns with no context-specific character

## Implementation Notes

- Use CSS custom properties for all design tokens
- Prefer native CSS for complex compositions; utility classes for rapid iteration
- When using Tailwind, extend the config rather than fighting defaults
- Test at multiple viewport sizes during development, not after
- Lighthouse: animations must not cause layout shifts (CLS)
- Consistent spacing scale (4px/8px base)
- States: hover, focus, active, disabled should ALL be designed — not just hover
- Shadows that suggest a light source and material, not generic `shadow-md`

No design should look the same as the last one. Vary between light and dark themes, different fonts, different aesthetics. Interpret creatively and make unexpected choices that feel genuinely designed for the context.
