# ADR-009: Content-type colors go monochrome stone; color is reserved for meaning

- **Status**: Accepted
- **Date**: 2026-08

## Context

The UI carried a 9-hue "owned palette" (fern/sage/gold/teal/plum/mauve/slate/violet/clay) where each content type and chrome element had its own color — sources green, notebooks teal, podcasts mauve, the sidebar mark itself a tri-hue pebble. Adopting the Kubo design language means warm-stone neutrals everywhere, with color spent only where it carries meaning: destructive stays tinted red, warn/Gate stays amber. Everything else — content-type icons, decorative bars, the brand mark — collapses to a stone grayscale ramp.

## Decision

**Content-type and chrome colors are monochrome stone. Amber (`--clay`) is the one surviving hue, reserved for warn/Gate.** The CSS variable names (`--fern`, `--sage`, `--teal`, `--gold`, `--mauve`, `--plum`, `--slate`, `--violet`) stay as-is in `globals.css` — components already reference them through the `--type-*`/`--cite-*`/`--ctx-*` alias layer — but their raw values are now a 5-step stone ramp instead of distinct hues. Hardcoded hue utility classes in JSX with no semantic tie (`bg-teal`, `text-sage`, decorative bars/dots) were swapped to neutral tokens (`bg-muted-foreground`, `bg-border`, `bg-foreground`). Classes that still carry real meaning — destructive, warn, tinted status badges, AI-voice indicators (`bg-teal-tint`/`text-teal` on the bot avatar and context indicators) — were left untouched. The sidebar mark (`LogoPebbles`, a tri-hue pebble trio) is replaced by `OboMark`, a stone-and-pink sakura.

## Alternatives considered

- **Rename the CSS variables to neutral names** (`--teal` → `--accent-ai`) — rejected: would touch every component using those Tailwind utility classes across the app for zero functional gain; the alias layer already isolates call sites from the raw hue.
- **Partial reskin** (change surfaces/primary only, keep the tri-hue content-type system) — rejected: leaves color-coding half-dead — colors present but no longer meaningfully distinct — which reads as a bug, not a decision.

## Consequences

- Content-type color-coding (sources/notebooks/podcasts icons) is gone; differentiation between item types now relies on icon shape and label, not color.
- CSS variables keep color names but no longer carry that color (e.g. `--teal` resolves to stone-600). A future reader will see `text-teal` render gray — that's expected, not a bug.
- Any new component that reaches for a content-type hue via the existing alias layer inherits monochrome stone automatically — no extra work needed to stay consistent.
