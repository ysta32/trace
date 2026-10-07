# DESIGN — Trace / design system "PLOTTER"
Code contract: `apps/web/src/design/` (tokens.css, base.css, icons.tsx, README.md). UI tasks (T05, T09, T10, T15, T16) consume it and do not fork it.

## 1. Research (Oct 2026)
- **vectorizer.ai**: best-in-class fitting (shape primitives such as circles and stars, symmetry, sub-pixel), corner control, palette count, SVG/EPS/PDF/DXF/PNG. The flow is drop → auto → interactive preview → pay. Gaps: paid download, **server upload with 24h retention**, a 3 MP / 30 MB cap, no batch in the web UI, no editing after fitting, opaque metrics, and an ambiguous privacy story.
- **Figma**: three-zone IA (tools left, canvas center, contextual inspector right). The inspector shows only what applies to the selection. Every value is a scrubbable numeric field. Its "premium" comes from zero-latency feedback, consistent 11–12px density and the multiplayer cursor polish.
- **Linear**: keyboard-first. The ⌘K palette covers every action, with shortcut hints shown inline in menus. Optimistic UI and undo toasts replace confirm dialogs. Motion is restrained and fast (about 150ms), and the voice is plain. Premium = speed + consistency.
- **Teenage Engineering**: instrument-panel honesty. It uses tiny mono uppercase labels, numerals as graphics, one loud signal color (orange) on neutral grey/paper, labeled hardware-like controls, a dry and witty voice, and spec sheets as marketing.
- **Linearity Curve (ex-Vectornator)**: Auto Trace sits inside a full vector editor, with a gentle onboarding of templates and tooltips. Its tracing is a means to an end, so presets are coarse. Gap: an account or app is required, and trace quality is mid.
- **Raycast**: command palette as the product. It has deterministic keyboard nav, crisp sectioning and great empty states that teach. **Things 3**: craft in micro-motion, generous restraint, and delight in tiny details (checkbox ease). **Vercel/Stripe**: docs as product, honest metrics, editorial marketing with code samples shown as first-class visuals.
- **Shared premium signals**: instant feedback; a keyboard path for everything; visible numbers; one accent; consistent density; undo over confirm; empty states that teach; no decoration that doesn't carry information.

## 2. Gaps Trace beats
| Them | Trace |
|---|---|
| Paid or credit-gated downloads | Free, MIT, no account, no watermark |
| Upload to server, retention policy | Runs in-browser (WASM). The image never leaves the device, and it works offline (PWA) |
| Black box | Transparent metrics: SSIM, paths, nodes, bytes, ms, shown live |
| Single file | Batch (drop a folder) and the same engine as CLI + npm `trace-vectorizer` |
| Export only | Edit before export: recolor, delete or merge shapes, simplify |
| DXF/EPS behind pro tiers | SVG/PDF/EPS/DXF/PNG, all free |

### Standout features (build these; they are the story)
1. **Diff Lens** (`D`): the error heatmap of raster vs. vector, using the per-pixel ΔE in Lab painted with `--diff-*`. Scrub it as a loupe or toggle it full-frame. It shows a single score (`0.973 ssim`) and "worst region" jump-to. Nobody else shows you where the trace is wrong.
2. **Budget**: set a target (`≤ 40 kb` or `≤ 2 000 nodes`) and Trace tunes simplify/palette to fit. A needle gauge appears in the status bar, and the inspector shows per-shape node count and bytes for the selection. "Heaviest shapes" are listed and can be simplified one by one.
3. **Palette Lab**: colors extracted from the image with coverage %. Lock a color (it survives re-trace), drag one swatch onto another to merge, and recolor with an eyedropper. Changes re-trace instantly.
4. **Copy as CLI**: any editor state can be copied as a `npx trace-vectorizer …` command, or as a JSON preset. It bridges the GUI to batch/automation, and it is honest about what the engine does.

## 3. System: PLOTTER
Metaphor: a **pen plotter on a drafting table**. Warm paper, ink line, one signal-orange pen, and every control labeled like an instrument. Precise, quiet, tactile.

### Type (Google Fonts, SIL OFL)
- **Instrument Sans** (400/500/600) for UI and body. It is a slightly condensed grotesk with character, used where Inter would be the default.
- **Martian Mono** (400/500) for numbers, readouts, `.t-label` spec labels, kbd and code. Its wide, engineered shapes give the TE feel.
- **Instrument Serif** (regular + italic), marketing display only (hero words, pull quotes, big numerals). It is never used in the editor.
- App scale: 10/11/12/**13**/15/18/24. Marketing adds 32/48 and clamp-based display sizes (`--text-4xl/5xl`). Display tracking is −0.035em. Labels are mono 10px uppercase with +0.06em tracking.
- Numbers are always tabular with a slashed zero. Units are lowercase and follow a space.

### Color
- Neutrals run from warm paper to ink at hue ≈60° with low chroma: `paper-0 #fbfaf6` → `paper-1 #f4f1ea` (app bg) → `paper-2 #ebe7dd` (canvas, wells) → stone → `ink-10 #1a1917`. Dark mode inverts to ink panels `#131211` and text `#ece8df`, staying warm and never blue-black.
- **Signal `#ff5a1f`** (vermilion / safety orange) is the only accent. Text-safe variants: `#b5360a` on paper and `#ff7a45` on ink.
- Status is deliberately distinct from signal: ok `#2f7d4a` (bottle green), warn `#a86a00` (ochre), err `#c11f3a` (crimson), info `#3d5a73` (slate).
- Diff ramp: transparent → peach → signal → crimson.
- Rules: max **one** filled-accent element per region. Never use gradients on UI surfaces. No purple or blue anywhere except slate info. Images and vectors are the only real color on screen.

### Space, radius, elevation
- Spacing is on a 4px base: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128. The app uses 8/12, marketing uses 24/48/96.
- Radius: 2 (swatch/kbd), 4 (button/input), 6 (menu/toast), 10 (dialog/palette), full (toggles and dots only). Corners stay machined, never bubbly.
- Elevation: 0 = flat panel with a hairline border, 1 = card, 2 = popover, 3 = dialog/palette/toast. Shadows are warm ink, hairline-first.
- Controls are 24/28/36 high. Rail 48, inspector 296, top bar 44, status bar 26.

### Motion language: "pen down, pen up"
- Durations: instant 60 (hover/press), fast 120 (tooltip, toggle, segmented thumb), base 180 (popover, section), slow 280 (dialog, toast, panel), deliberate 480 (result reveal).
- Easing: `ease-out (.2,.8,.2,1)` for arrivals and `ease-in` for exits (about 30% shorter). `ease-in-out` handles a move between two states (split handle snap). `ease-detent` is a ≤4px overshoot for thumbs and toggles only.
- Signature moment: the first trace result **draws on** (stroke-dashoffset, 480ms, staggered ≤ 12 paths) and then fills. It plays once per image and never on re-trace.
- Values change by number tick-over (no count-up animations over 200ms). Popovers scale from 0.98 at their origin. Nothing bounces, floats, pulses or parallaxes.
- `prefers-reduced-motion`: all `--dur-*` → 0, draw-on is replaced by an instant fill, shimmer becomes static. State changes still happen, just without travel.

### Iconography
- 20×20 grid with 2px padding, a 1.5px stroke, round caps and joins, and currentColor. Fill is used only for one "active" cell or for dots. Sizes are 16 (inspector), 20 (default) and 24 (rail, large).
- Geometric and drafting-like: tools reference real objects (nib = line art, grid cell = pixel, camera = photo, primitives = logo). There are 42 icons in `icons.tsx`. Never mix libraries.

### Voice & tone
- Plain, precise, confident. Say what happened and give the number. Write like a spec sheet with a dry sense of humor (TE), never like a pitch.
- Use sentence case and verbs on buttons (`Export SVG`, `Merge colors`). Errors say what failed, why, and the next action, with no apology theater.
- ✓ "Traced in 312 ms. 48 paths, 1 204 nodes, 18.4 kb." ✓ "Your image never leaves this tab." ✓ "That file is a HEIC. Convert it to PNG or JPG first."
- ✗ "Oops! Something went wrong 😅" ✗ "Supercharge your workflow with AI-powered magic."
- **Banned words:** supercharge, unlock, unleash, revolutionize, seamless(ly), effortless(ly), magic(al), game-changer, cutting-edge, next-gen, AI-powered (we're algorithmic; say what it does), leverage, empower, elevate, robust, blazing(ly) fast, delightful, simply, just, oops, whoops, harness, world-class, stunning.
- Don't use exclamation marks in UI. Use emoji nowhere.

## 4. Component inventory (each needs default/hover/active/focus/disabled + dark)
- **Toolbar / tool rail**: 48px vertical icon buttons (28px hit, 16–20 icon) with a tooltip+kbd on hover. The active tool gets an ink bg with paper icon. There is one signal dot for "unsaved/processing" only.
- **Segmented control**: sunken track with a raised thumb that slides (`fast`, `ease-detent`). Used for preset (Logo, Line art, Pixel, Photo, Icon) and view (Original/Split/Vector/Diff). Arrow keys move the selection.
- **Slider + numeric readout**: a 2px track with an ink fill and a 12px square-ish thumb (radius 2) with detent ticks. A mono readout on the right is directly editable, and dragging the label scrubs (Figma). Shift jumps ×10, Alt fine. Double-click resets to the default.
- **Swatch**: 20px square (radius 2) with a hex in mono on hover and coverage % under it. It carries lock/merge affordances, a selected 2px ink ring plus 1px paper gap, and a drag target state.
- **Toast with undo**: bottom-center, elevation 3, ink bg in light mode (inverse). Message + `Undo ⌘Z` + dismiss. Lasts 5s and pauses on hover. Destructive actions never confirm; they toast.
- **Command palette (⌘K)**: 560px wide, radius 10, sections (Actions, Presets, Export, View, Help) with right-aligned kbd hints, fuzzy match highlighting in signal-fg, and a recent-first order. The empty query shows shortcuts.
- **Skeleton**: `.skeleton` sweep. The canvas skeleton is a checker + pen-line progress (determinate when WASM reports progress).
- **Empty state**: an instrument-panel drop zone with a dashed 1.5px ink border, a big mono label, three actions (Upload / Paste ⌘V / Try a sample) and 5 sample thumbnails. The privacy line is mandatory.
- **Kbd hint**: `<kbd>` keycap with a 2px bottom border, shown in tooltips, menus and the palette.
- **Tooltip**: ink bg, paper text, 11px, a 400ms delay, then instant for siblings within 300ms (Figma behavior). Label + kbd.
- **Dialog**: radius 10, elevation 3, scrim, max 480. Title, body, actions right-aligned (secondary, primary). Esc closes. Focus is trapped and restored.
- Also: button (primary = ink fill; accent fill only for the single export CTA), icon button, input, select/menu, checkbox, switch, tag, progress bar, metric readout (`.t-label` over a mono value), status bar, split handle (signal 2px line + 24px grip).

## 5. States checklist (every surface ships all six)
- [ ] **Empty**: teaches the next action, offers a sample, states privacy.
- [ ] **Loading**: skeleton shaped like the result. Progress is shown above 300ms and stays determinate when possible. The UI never blocks; Esc cancels.
- [ ] **Error**: inline, at the cause, `--err` icon + plain sentence + action (Retry, Try smaller size, Report). Files that are too large offer to downscale.
- [ ] **Offline**: the app works fully. Marketing links show a quiet "offline, editor still works" pill. No error toasts for offline.
- [ ] **First-run**: one 3-step coach strip (drop → pick preset → compare with split) that is dismissible, never shows again, and is replayable from Help. No modal tours.
- [ ] **Success**: the result draws on and the metrics receipt appears in the status bar. After export a toast reads "Saved trace.svg · 18.4 kb" with Show in folder or Copy.
- Plus: focus visible, ≥4.5:1 contrast, 375px layout, dark mode, reduced motion, RTL-safe spacing (logical props).

## 6. Layout
**App (Figma-like), ≥1024px:**
```
┌ topbar 44: wordmark · file name · view segmented (Orig/Split/Vector/Diff) · zoom · ⌘K · Export ┐
│ rail 48 │                canvas (checker, centered artwork)                 │ inspector 296 │
│ tools   │      split handle · diff lens loupe · selection outlines          │ preset/palette│
│         │                                                                   │ simplify/budget│
└ statusbar 26: ssim · paths · nodes · kb · ms · budget gauge · "local · wasm" ─────────────────┘
```
- The inspector holds collapsible sections with `.t-label` headers, and every row is label (left) + control + readout (right, mono).
- Below 1024px the inspector becomes a bottom sheet (snap 40%/90%) and the rail becomes a top scroll strip. Below 640px only View and Export stay in the top bar.

**Marketing:** a 12-column grid with a 1200 max width and 24px gutters (16 mobile), asymmetric editorial.
- The hero is set left on cols 1–7 with an Instrument Serif headline and a live mini-editor (real WASM) on cols 6–12 overlapping the edge. It is not centered.
- Sections alternate 5/7 and 8/4 splits, with spec-sheet tables, mono numerals as graphics (`0 bytes uploaded`), a real before/after split and a CLI block treated as a hero visual.
- The feature list is a numbered index (01–08) with rules between rows, not a card grid. Comparison is a plain table. Footer: a large wordmark + colophon (fonts, license, commit hash).

## 7. Banned vibe-coded tells
- Purple/blue/indigo gradients, gradient text, glows, aurora/mesh blobs, glassmorphism, noise overlays used as decoration.
- Identical 3-column icon cards, everything center-aligned, "Trusted by" fake logo walls, testimonials we don't have.
- Inter-only typography, oversized rounded-2xl everything, pill buttons, drop shadows on every card.
- Emoji in UI, sparkles ✨ for "AI", exclamation marks, "Get started for free →" bounce arrows.
- Fake numbers ("10,000+ users"), dashboards of vanity stats, lorem/placeholder copy shipped.
- Hover-scale on cards, floating/parallax illustrations, scroll-jacking, toast spam, confirm dialogs where undo works.
- Default focus outlines removed without replacement. Unstyled scrollbars in dark mode. Light-only screenshots.
- Inconsistent radii and spacing off-scale (any px value not from tokens is a review failure).

## 8. Review gate (design critic, per UI task)
Screenshots at 375/768/1280/1920 × light/dark. Fail if any of these are found: a §7 tell, a missing §5 state, an off-token value, more than one filled accent per region, a banned word, or a value with no unit or readout.

## Progress log
- 2026-10-07 17:36 — Research pass (vectorizer.ai, Teenage Engineering fetched live; Figma, Linear, Linearity Curve, Raycast, Things 3, Vercel, Stripe from prior knowledge). PLOTTER system defined; tokens, base styles and 42-icon set landed.
- 2026-10-07 17:55 — Design brief v2 adopted: narrative order (hook → problem → product → proof → depth → action) for marketing, cinematic-but-purposeful motion, paper-grain depth, ≥3 screenshot critique rounds per surface. Editor frame (T15a), Palette Lab/Diff Lens (T15b), Export/Batch/Budget (T15c) and marketing core (T16a) in progress.
