# ArchFlux System Design Icon Library — 200 SVGs

A function-first library of 200 neutral system-design icons for architecture diagrams, documentation, and developer tooling.

## Style
- 24 × 24 viewBox; transparent background
- SVG outline style with rounded caps and joins
- Main strokes use `currentColor`
- Electric-violet details use `#8B83FF`
- Suitable for recoloring, theming, and use on Graphite / Electric Violet UI

## Categories
- Compute (25)
- Storage (20)
- Database (20)
- Network (25)
- Messaging (20)
- Security (25)
- Observability (20)
- Architecture & APIs (25)
- Data & AI Flow (20)

## Files
- One standalone SVG per icon (200 files)
- `archflux-icons-sprite.svg` with symbols keyed by `archflux.<icon-name>`
- `icon-catalog.json` metadata: id, name, file, category, provider, tags, version
- This README

## Use a standalone SVG
```html
<img src="/icons/microservice.svg" alt="Microservice" />
```

## Use the sprite
```html
<svg width="24" height="24" aria-hidden="true">
  <use href="/icons/archflux-icons-sprite.svg#archflux.microservice"></use>
</svg>
```

## Recoloring
Primary line color inherits `currentColor`. Violet accents can be changed globally by replacing `#8B83FF` in the SVG files. For strict theme-token control, replace that literal with a CSS variable after inlining the SVG.

## Product guidance
Keep function-first categories as the primary taxonomy. Treat cloud-provider branding (AWS, Azure, GCP, etc.) as a separate icon pack rather than mixing provider logos into the neutral architecture set. Review every icon at 16px, 20px, 24px, and 32px before shipping.
