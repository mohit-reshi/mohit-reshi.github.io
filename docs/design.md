# Design: tokens, art direction and motion

Screenshots are in `docs/site/` (`*-dark.webp`, `*-light.webp`, `mobile-*.webp`, `tour.mp4`). The live token page is `/design/` in dev and sample builds (not in production, not in the sitemap).

## Art direction (decided; change in one file)
Dark base, **one vivid accent** (signal amber `#ffc83d`, a nod to Power BI yellow), a data-visualisation sensibility (bars, thin axis lines, mono labels), large confident type and generous space.
The 3D hero is a field of instanced bars that react to the pointer and scroll. Everything else stays calm so the work is the loudest thing on the page.

Options that were considered (all are token swaps in `site/src/styles/tokens.css`; tell me if you prefer one):

| Option | Accent | Feel |
|---|---|---|
| **A (chosen)** | amber `#ffc83d` (text role `#8a4b00` on light) | warm, confident, ties to Power BI |
| B | electric teal `#2dd4bf` | cooler, more "platform" |
| C | magenta `#ff4fa3` | louder, more editorial |

Fonts, all self-hosted (no third-party requests): **Bricolage Grotesque** (display), **Inter** (body), **JetBrains Mono** (labels and code). Alternatives to try: Space Grotesk + IBM Plex Sans; Fraunces + Inter for a more editorial look. Swap the three `@fontsource-variable/*` imports in `site/src/layouts/Base.astro` and the `--font-*` tokens.

## Tokens (`site/src/styles/tokens.css`)
| Token group | Values |
|---|---|
| Surfaces | `--bg #0b0f14`, `--bg-elev #121823`, `--bg-sunken #070a0e` (light: `#f7f5ef`, `#ffffff`, `#efece3`) |
| Text | `--fg #eef1f6`, `--fg-muted #a3adbd`, `--fg-faint #7d8899` (light: `#10141b`, `#4a5463`, `#5f6877`) |
| Accent | `--accent #ffc83d` (fills), `--accent-text` (text and links: amber on dark, `#8a4b00` on light), `--accent-line` (borders: amber on dark, `#9a6400` on light), `--accent-ink #1a1300` (text on amber) |
| Data series | `--viz-1…5`: amber, teal, periwinkle, rose, violet (darker variants in light) |
| Type scale | fluid `--step--1 … --step-5` (hero headline up to 5.75rem) |
| Space | `--s-1 … --s-9` (0.25rem to 7rem), `--gutter`, `--max: 76rem` |
| Shape and motion | radii 8/14/22px, durations 140/280/560ms, one easing curve |

Contrast is enforced by `npm --prefix site run contrast` (WCAG AA: body text 7:1, muted text 4.5:1, accent text 4.5:1, borders and focus ring 3:1) in both themes. axe-core (WCAG 2.2 AA) runs on every page in both themes in the browser tests.

## Components
Header (clock, status pill, search, theme, info), hero, marquee, project card (hover-to-play preview), filter chips, case-study chapters, gallery and lightbox, before/after slider, "Under the hood" (counts, SVG relationship diagram, RLS roles, technique chips, DAX), command palette, info slide-over, custom cursor, intro, Live Lab host.

## Motion, and what each fallback is
| Element | Motion | Fallback |
|---|---|---|
| Intro | short "data loading" sequence once per session on the home page | Skip button (focused on show), Esc/Enter/Space; never shown with reduced motion; hidden without JS |
| 3D hero (Three.js, lazy after first paint) | bars react to pointer and scroll; paused off-screen and in background tabs | CSS bars: no WebGL, reduced motion, Save-Data, ≤2 CPU cores or ≤2 GB memory, narrow screens |
| Smooth scroll (Lenis) and reveals (GSAP + ScrollTrigger) | loaded at idle | skipped with reduced motion; content is never left hidden (3.5 s safety net) |
| Marquee | CSS animation, pauses on hover and focus | static wrapped list |
| Work grid | FLIP reflow when filtering | instant |
| Custom cursor | fine pointers only | native cursor |
| Case study | sticky chapter rail, reading progress bar, reveals | static layout |

## Performance and quality (measured here)
Lighthouse mobile (simulated 4x CPU, slow 4G), local preview build:

| Page | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| Work | 99 | 98 | 100 | 100 |
| Case study | 99 | 100 | 100 | 100 |
| About | 99 | 100 | 100 | 100 |
| Apps | 99 | 98 | 100 | 100 |
| Home (3D hero skipped on this viewport) | 99 | 100 | 100 | 100 |

Initial JavaScript is about 14 KB gzipped (router, page script, prefetch). GSAP, ScrollTrigger and Lenis (about 50 KB gz) load at idle; Three.js (about 184 KB gz) loads only when the 3D hero actually runs. Fonts are three latin variable files (about 130 KB).

## What I could not judge
Motion feel. I can verify that things animate, respect reduced motion and clean up, and `docs/site/tour.mp4` is a screen recording, but whether the easing and pacing feel right is your call. Tune durations in `tokens.css` (`--dur-*`), the intro length in `site/src/scripts/intro.ts` and the hero in `site/src/scripts/hero3d.ts`.
