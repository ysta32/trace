# Plotter — Trace design system (code)

Spec and rationale: `.orch/DESIGN.md`. This folder is the **contract**: UI tasks consume it and do not fork it.

## Files
| File | What |
|---|---|
| `tokens.css` | CSS custom properties: color (light/dark), type, spacing, radii, elevation, z, motion, focus |
| `base.css` | Reset, body type, focus ring, scrollbars, selection, `kbd`, `.skeleton`, reduced motion, 6 utilities |
| `icons.tsx` | `<Icon name size />`, `IconName` union, `ICON_NAMES` |

## Setup
```ts
// main.tsx — order matters
import "./design/tokens.css";
import "./design/base.css";
```
Fonts (Google Fonts, all SIL OFL). Put in `index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..600&family=Instrument+Serif:ital@0;1&family=Martian+Mono:wght@400;500&display=swap" rel="stylesheet" />
```
The editor (`/app`) may skip Instrument Serif — it is marketing-only. Self-hosting later: drop woff2 into `public/fonts/` and swap the link for `@font-face`; the stacks in `tokens.css` don't change.

## Theme
Light is default. Dark follows `prefers-color-scheme` unless `<html data-theme="light|dark">` forces one. A toggle sets the attribute and stores the choice in `localStorage` (wrapped in try/catch). Never read raw `--p-*` tokens in components. Use the semantic tokens (`--bg-*`, `--fg-*`, `--border-*`, `--accent*`, status).

## Rules of thumb
- **Accent is rationed.** `--accent` goes on one primary action per region, the active tool, the split-slider handle, selection outlines and focus. Do not use it for decoration, and never as large fills.
- Accent **text** on paper uses `--accent-fg` (contrast-safe), not `--accent`.
- Numbers use `.t-num` or `--font-mono` and are always tabular. Units are lowercase and follow a thin space: `1 284 nodes`, `42.1 kb`, `0.973 ssim`.
- Section and field labels use `.t-label` (mono, uppercase, tracked, tertiary).
- Spacing is `--space-*` only. App density: 8px between rows and 12px panel padding. Marketing uses 24/48/96.
- Radii: buttons and inputs `--radius-sm`, menus and toasts `--radius-md`, dialogs and the palette `--radius-lg`. Do not round anything more than that.
- Elevation: panels are flat with hairline borders. `--shadow-2` is for popovers. `--shadow-3` is for dialogs, the command palette and toasts.
- Motion: arrivals use `--ease-out`, exits use `--ease-in` and are about 30% faster. `--ease-detent` is only for small thumbs and toggles. Every transition reads `--dur-*` so reduced motion zeroes it automatically.
- Focus: `:focus-visible` gives the 2px signal ring automatically. Use `.focus-inset` inside tight toolbars.

## Icons
```tsx
import { Icon } from "./design/icons";
<Icon name="download" />                       // decorative (aria-hidden)
<Icon name="trash" aria-label="Delete shape" /> // meaningful, standalone
<Icon name="eye" size={16} />                   // 16 for dense inspector rows
```
Grid: 20×20 viewBox with 2px padding, a 1.5px stroke, round caps and joins, and `currentColor`. Use solid fill only for a single "active cell" accent (palette, grid) or for dots. Sizes: 16 (inspector), 20 (default), 24 (rail at 2x zoom only). Do not mix in other icon libraries. To add an icon, draw it on the same grid, add it to `IconName` and `ICONS`, and check it beside `image` and `layers` for optical weight.

Set: upload paste image vector split eye eye-off zoom-in zoom-out fit undo redo download palette layers wand pen grid camera shapes trash lock unlock command sun moon check x alert info chevron-down chevron-right plus minus batch terminal github external diff budget settings cursor.
