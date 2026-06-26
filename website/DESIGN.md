# Homepage Design

> Extracted from reverse-engineering notes, 2026-06-25. Captured at 1440px (desktop) and 390px (mobile).

## Design Principles

- **Reader-first, not marketing-first.** Every section leads toward understanding, not conversion.
- **Long-scroll exhibition.** Chapters are tall vertical narratives, not compact cards.
- **Dark/light alternation.** Dark canvas chapters are reset by lighter interlude sections, reducing reading fatigue.
- **Scroll-primary, click-secondary.** The page tells its story through scrolling; clicks advance to deeper docs.

## Page Topology

```
1. Sticky site header            (dark, 72px pinned)
2. Hero chapter                  (dark, manifesto + install proof + CTA)
3. Problem contrast chapter      (light interlude, before/after)
4. Concept story chapters × 6    (dark, color-coded per concept)
5. Modular API chapter           (light interlude, package map)
6. Documentation jump chapter    (dark, stacked link rows)
7. Footer                        (dark, multi-column)
```

## Visual System

### Theme Tokens

Two palettes alternate: **dark surface** and **light paper**.

**Dark surface:**
| Token | Value | Role |
|-------|-------|------|
| `--bg-1` | `#252423` | Page background |
| `--bg-2` | `#2a2928` | Elevated surface |
| `--fg-1` | `#f6f4f2` | Primary text |
| `--fg-2` | `#d5d3d1` | Secondary text |
| `--fg-3` | `#b4b1af` | Body / muted |
| `--fg-4` | `#93908e` | Labels |
| `--fg-5` | `#625d5b` | Subtle |
| `--surface-soft` | `#ffffff08` | Soft panel bg |
| `--surface-strong` | `#2a2928b8` | Strong panel bg |
| `--surface-stroke` | `#93908e38` | Panel border |

**Light paper:**
| Token | Value | Role |
|-------|-------|------|
| `--paper-1` | `#dad5d0` | Light section bg |
| `--paper-2` | `#ece7e2` | Elevated light surface |
| `--ink-1` | `#252423` | Primary text |
| `--ink-2` | `#353433` | Secondary text |
| `--ink-3` | `#474543` | Muted |
| `--ink-4` | `#625d5b` | Labels |
| `--surface-light-stroke` | `#2524231f` | Light panel border |

### Accent Colors (per concept chapter)

| Concept | Accent |
|---------|--------|
| Container / composition root | `--accent-red-1` (`#ff4b4b`) |
| Registration & resolution | `--accent-orange-1` (`#ffa828`) |
| Lifecycle & scope | `--accent-turquoise-1` (`#0fa`) |
| Refs & escape hatches | `--accent-king-1` (`#4d9cff`) |
| Modules & boundaries | `--accent-sky-1` (`#05dbe9`) |
| Testing & replaceability | `--accent-lime-1` (`#b7ff54`) |

### Typography

| Role | Font | Weight | Notes |
|------|------|--------|-------|
| Body | DIN, Helvetica Neue, sans-serif | variable | `wdth` 125, variable weight 100–900 |
| Code | Mono (Berkeley Mono) | 400 | woff2 variable font |
| Display code | Digital-7 Mono Italic | — | specialty display face |

### Type Scale

| Level | Size | Weight | Line-height | Use |
|-------|------|--------|-------------|-----|
| Hero title | `3.75rem`–`5rem` | 700 | `0.86` | Main headline |
| Section heading (dark) | `3rem`–`3.75rem` | 700–800 | `0.9`–`0.95` | Concept chapter titles |
| Section heading (light) | `2.5rem`–`3rem` | 800 | `0.95` | Interlude headlines |
| Hero body | `1.25rem` | 600 | `1.25` | Supporting paragraph |
| Eyebrow | `0.75rem` | 700 | — | Uppercase, `0.22em` tracking |
| Nav link | `1rem` | 700 | `1.5` | Text-only (no pills) |

### Spacing & Layout

- Max content width: `1440px`
- Panel border-radius: `1.25rem`–`1.75rem`
- Panel shadow: `0 24px 80px rgba(0,0,0,0.24)`
- Header height: `72px`, sticky
- Section padding (desktop): `py-20`–`py-28`
- Two-column grid where applicable: `28rem` left rail + flexible right

## Component Specs

### Hero Section

- Dark chapter, begins immediately below header.
- **Left column:** eyebrow label → oversized editorial headline (3 lines max) → body paragraph → action row (install chip + "Start reading" CTA) → metrics grid.
- **Right column:** code panel (composition proof) + two inset cards explaining "why" and "how".
- Scroll-driven reveal via `motion` (fade + slide up, `once: true`).

### Problem Contrast Section (Light Interlude)

- Light paper background, dark text.
- Two-column: left headline + body, right "Before / After" comparison cards.
- Before: problems with direct construction. After: how DI solves them.

### Concept Story Chapters

- Six full-height dark chapters, one per DI concept.
- Each chapter: color-coded accent heading, eyebrow label, body paragraph, bullet points, plus a sticky right-panel demo.
- Demo panel shows concept-specific visualization (container graph, resolution trace, lifecycle grid, circular path, module import chain, production/test swap).

### Modular API Section (Light Interlude)

- Light background, two-column: left headline + body, right "package map" card + dark terminal-style code block showing first-success script.
- Package map lists `@husky-di/core`, `@husky-di/decorator`, `@husky-di/module`.

### Documentation Jump Section

- Dark chapter, two-column: left headline + body, right stacked link rows.
- Each row: accent-colored label, description, arrow icon that shifts on hover.
- Links point to: Getting Started, Why Husky DI, Guides, Reference, Core, Decorator, Modules.

### Footer

- Dark canvas, multi-column grouped link lists, subdued dividers, muted labels.
- Desktop: horizontal columns. Mobile: stacked with generous separators.

## Responsive Behavior

| Viewport | Layout |
|----------|--------|
| Desktop (`≥1024px`) | Two-column layout, sticky demo panels, generous whitespace |
| Tablet (`768px–1023px`) | Tighter columns, sticky panels remain where feasible |
| Mobile (`<768px`) | Stacked single-column, demos inline with text, same dark/light identity |

Key principle: **collapse density, keep identity.** Mobile still reads as long vertical chapters, not compact cards.

## Interaction Model

| Interaction | Implementation |
|-------------|---------------|
| Section reveal | `motion.div` with `whileInView`, `once: true`, fade + translateY |
| Nav hover | Color transition only, no background pills |
| Link hover | `-translate-y-px` lift + arrow slide |
| Copy button | Static icon, no animation |
| Code hover | Twoslash popups for type inspection |

## Implementation

- **Component:** `website/src/components/home-page.tsx`
- **Shell:** `website/src/routes/__root.tsx`
- **Animation:** `motion` (Framer Motion) for scroll-driven reveals
- **Code display:** `TwoslashCodeBlock` for type-inspectable snippets
- **Styling:** Tailwind CSS with CSS custom properties for theme tokens
