# Husky DI Design System

## Status

Draft

## Scope

This document is intentionally abstract. It defines the shared visual and
interaction language for `@husky-di/website`, not the information architecture
of a specific page.

It should be used as the design baseline for:

- landing pages
- documentation-like content pages
- code example blocks
- navigation chrome
- shared UI components

It should not be used to describe:

- page copy
- section order
- content strategy
- module outlines
- route-specific layout decisions

## Design Intent

- Modern geeky tone
- Clean technical-document feeling
- Minimal and low-noise presentation
- Dark-mode first
- Reading-oriented rather than promotional

## Core Principles

- Favor clarity over decoration.
- Let spacing, contrast, and typography carry hierarchy before color does.
- Use accent color sparingly and intentionally.
- Motion should explain state or structure, not add spectacle.
- Components should feel precise, calm, and deterministic.

## Color System

### Theme Strategy

- Dark mode is the default design target.
- Light mode must preserve the same technical tone and contrast discipline.
- A screen should rely on one accent family at a time.

### Core Tokens

| Token                    | Role                        | Value                       |
| ------------------------ | --------------------------- | --------------------------- |
| `--color-bg`             | primary page background     | `#0F111A`                   |
| `--color-bg-alt`         | alternate dark background   | `#121212`                   |
| `--color-surface`        | elevated surface            | `rgba(255, 255, 255, 0.04)` |
| `--color-surface-strong` | stronger elevated surface   | `rgba(255, 255, 255, 0.07)` |
| `--color-border`         | default border              | `rgba(228, 230, 235, 0.12)` |
| `--color-border-strong`  | emphasized border           | `rgba(228, 230, 235, 0.22)` |
| `--color-text`           | primary text                | `#E4E6EB`                   |
| `--color-text-muted`     | secondary text              | `#A0AAB5`                   |
| `--color-accent-green`   | primary green accent option | `#00E676`                   |
| `--color-accent-blue`    | primary blue accent option  | `#2979FF`                   |
| `--color-code-bg`        | code block background       | `rgba(255, 255, 255, 0.03)` |
| `--color-selection`      | text selection fill         | `rgba(41, 121, 255, 0.28)`  |

### Accent Rules

- Use one accent family globally per page or experience.
- Accent color is reserved for interactive focus:
  links, active states, highlighted borders, focus rings, and selected UI.
- Do not mix green and blue accents in the same viewport unless a future brand
  system explicitly defines dual-accent behavior.
- Avoid large accent-colored surfaces; accents should punctuate, not flood.

## Global Visual System

### Typography

### Font Families

- Sans-serif:
  `Inter`, `Roboto`, `ui-sans-serif`, `system-ui`, `sans-serif`
- Monospace:
  `JetBrains Mono`, `Fira Code`, `Source Code Pro`, `ui-monospace`, `monospace`

### Type Scale

| Token             | Size                         | Line Height | Usage                      |
| ----------------- | ---------------------------- | ----------- | -------------------------- |
| `--font-size-xs`  | `0.75rem`                    | `1.5`       | captions, meta labels      |
| `--font-size-sm`  | `0.875rem`                   | `1.6`       | support text, small labels |
| `--font-size-md`  | `1rem`                       | `1.7`       | body text                  |
| `--font-size-lg`  | `1.125rem`                   | `1.7`       | lead paragraphs            |
| `--font-size-xl`  | `1.5rem`                     | `1.35`      | section titles             |
| `--font-size-2xl` | `2rem`                       | `1.2`       | page titles                |
| `--font-size-3xl` | `clamp(2.5rem, 6vw, 4.5rem)` | `1.05`      | hero titles                |

### Typography Rules

- Body text should usually stay between `1rem` and `1.125rem`.
- Default text line height should stay in the `1.6` to `1.8` range.
- Heading tracking should be slightly tight, never exaggerated.
- Code must always use the monospace stack.
- Long-form reading width should be controlled to avoid overly wide text blocks.

### Spacing

### Scale

Use a `4px` base unit.

| Token       | Value     |
| ----------- | --------- |
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem`  |
| `--space-3` | `0.75rem` |
| `--space-4` | `1rem`    |
| `--space-5` | `1.5rem`  |
| `--space-6` | `2rem`    |
| `--space-7` | `3rem`    |
| `--space-8` | `4rem`    |
| `--space-9` | `6rem`    |

### Spacing Rules

- Intra-component spacing should stay tight and rhythmic.
- Inter-section spacing should create a clear reading cadence.
- Dense technical UI should prefer `--space-2` to `--space-5`.
- Major page sections should usually use `--space-7` or larger.

### Layout

| Token                  | Value    | Role                          |
| ---------------------- | -------- | ----------------------------- |
| `--content-width`      | `72rem`  | main reading width            |
| `--content-width-wide` | `88rem`  | wide editorial or grid layout |
| `--header-height`      | `3.5rem` | compact sticky header target  |

### Layout Rules

- Content should feel centered and stable.
- Reading layouts should favor measure over maximum width.
- Wide layouts may expand for card grids, but text columns should remain
  controlled.
- Sticky chrome should remain narrow and unobtrusive.

### Radius

| Token         | Value     | Usage                  |
| ------------- | --------- | ---------------------- |
| `--radius-sm` | `0.5rem`  | chips, inline controls |
| `--radius-md` | `0.75rem` | buttons, code blocks   |
| `--radius-lg` | `1rem`    | panels                 |
| `--radius-xl` | `1.5rem`  | framed sections        |

### Border Rules

- Borders should be thin and quiet by default.
- Use border emphasis before shadow emphasis.
- Hover and focus may increase border visibility slightly.

### Shadow And Blur

| Token           | Value                             | Usage                      |
| --------------- | --------------------------------- | -------------------------- |
| `--shadow-sm`   | `0 8px 24px rgba(0, 0, 0, 0.18)`  | low elevation              |
| `--shadow-md`   | `0 18px 48px rgba(0, 0, 0, 0.24)` | panels                     |
| `--blur-header` | `12px`                            | sticky header glass effect |

### Depth Rules

- Shadows should be soft and shallow.
- Blur should mainly appear in sticky or overlay chrome.
- Avoid glossy surfaces, bright bloom, or heavy layered glassmorphism.

## Motion System

### Timing

| Token           | Value   |
| --------------- | ------- |
| `--motion-fast` | `120ms` |
| `--motion-base` | `180ms` |
| `--motion-slow` | `280ms` |

### Easing

- Default easing:
  `cubic-bezier(0.22, 1, 0.36, 1)`
- Emphasis easing:
  `cubic-bezier(0.16, 1, 0.3, 1)`

### Motion Rules

- Motion should clarify state change, hierarchy, or flow.
- Prefer opacity, border, and small translate transitions.
- Avoid large bounce, elastic spring, floating idle motion, and decorative
  parallax.
- Repeated ambient motion should be minimal.

### Reduced Motion

- All non-essential animations must reduce or stop when reduced-motion is
  requested.
- Essential state feedback should remain visible without relying on motion.

## Interaction States

### Hover

- Use subtle border brightening, surface lift, or accent tint.
- Hover should never move content enough to disrupt reading.

### Focus

- All interactive controls must expose a visible keyboard focus ring.
- Focus indication should use the active accent family.
- Focus rings should remain readable on both themes.

### Active And Selected

- Active state may use stronger border contrast and restrained accent fill.
- Selected state should be obvious without becoming visually loud.

### Disabled

- Disabled controls should remain legible but clearly inactive.
- Disabled state should not rely on opacity alone.

## Component Tone

### Buttons

- Prefer outline, ghost, or low-fill styles over heavy solid fills.
- Primary actions may use accent borders and accent text.
- Secondary actions should stay neutral and quiet.

### Panels

- Panels should feel like restrained technical containers.
- Use soft elevation and careful borders.
- Panel density should support both prose and code content.

### Code Blocks

- Code blocks require:
  monospace typography, copy affordance, quiet contrast, and clear scroll
  behavior.
- Code highlighting should be readable but not rainbow-heavy.
- Line highlights should use subtle surface emphasis plus accent support.

### Navigation

- Navigation chrome should feel compact and architectural.
- Sticky headers may use backdrop blur and stronger separation on scroll.

## Accessibility

- Maintain strong foreground and background contrast.
- Do not communicate important state by color alone.
- Focus-visible styling is required for interactive elements.
- Interactive hit areas should remain usable on touch devices.
- Typography choices must preserve legibility in dense technical content.

## Non-Goals

- Do not drift into SaaS dashboard aesthetics.
- Do not overuse gradients, glow, or neon effects.
- Do not use playful motion that undermines the engineering tone.
- Do not make the interface feel sterile by removing all depth and warmth.

## Implementation Guidance

- Prefer CSS custom properties for shared tokens.
- Keep light and dark themes token-driven rather than component-hardcoded.
- Shared components should consume tokens instead of inventing local values.
- Route-level design documents may extend this file, but should not redefine the
  core token system without a strong reason.

## Acceptance Criteria

- A designer or developer can derive a consistent palette, type scale, spacing
  scale, radius scale, and motion system from this document alone.
- The document remains reusable across multiple pages.
- The document does not prescribe route-specific copy or page structure.
- Dark-mode-first behavior and single-accent discipline are explicit.
- The specification is concrete enough to implement shared tokens directly.
