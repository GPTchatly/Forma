# Component provenance

Reviewed on September 27, 2026. The local runtime remains dependency-free.
Hosted installation includes the pinned Zod package described below. No remote
fonts, photos, runtime CDN assets or paid component packs are bundled.

## Zod 4.6.7 — MIT

Zod is used for hosted server request and session validation. `package-lock.json`
pins the package version and integrity. The source release contains the lockfile;
`npm ci --ignore-scripts` installs the package and its upstream MIT license. Preserve that license
when redistributing the installed dependency. Zod is not required for native local
startup and is excluded from public browser assets.

Upstream: https://github.com/colinhacks/zod

## Hosted platform services

Cloudflare, Vercel and Upstash Redis are separately operated hosted services under
their respective terms. Their infrastructure and SDKs are not distributed in
this source release. The quota adapter uses native HTTPS and authored Lua scripts;
no Redis or provider SDK is installed.

## HyperUI — MIT

Copyright (c) Mark Mead. Full notice: `licenses/HYPERUI.txt`.

Source collections:

- https://www.hyperui.dev/components/marketing/pricing/
- https://www.hyperui.dev/components/marketing/faqs/
- https://www.hyperui.dev/components/marketing/cards/
- https://www.hyperui.dev/components/marketing/banners/
- https://github.com/markmead/hyperui/blob/main/LICENSE

Adapted code lives in `shared/render.mjs` and `public/site.css`:

- `pricing-cards`, `pricing-featured`: responsive plan-card structure, highlighted
  option, separate pricing and included-features areas, checkmark feature list.
- `faq-accordion`, `faq-cards`: native details/summary, chevron state, divided and
  filled FAQ variants.
- `features-cards`, `services-cards`, `gallery-grid`, `gallery-strip`: adapted
  bordered-card and image-card structures.
- `cta-band`, `cta-card`: adapted responsive banner/call-to-action arrangement.

Changes: Tailwind utility classes replaced with authored, theme-token CSS;
static example copy replaced with escaped project data; external image URLs
removed; imported SVG icons replaced with the original local icon set;
responsive behavior and keyboard focus styles adapted to the renderer.

These are adaptations of source patterns, not a full installed copy of HyperUI.
The catalog identifies each derivative. The exact vendored implementation is
in this bundle and does not fetch newer components at runtime.

## Feather — MIT

Copyright (c) 2013-2023 Cole Bemis. Full notice: `licenses/FEATHER.txt`.

Source: https://github.com/feathericons/feather (`icons/github.svg`)

The `github` path in `shared/icons.mjs` is Feather's GitHub icon path, used
unchanged except that the editor draws it with the local 1.6 stroke. It appears
only in the editor footer link to the project repository, never in exported
sites or the content icon choices. GitHub and the GitHub logo are trademarks of
GitHub, Inc.

## Original code — MIT

All remaining named blocks, catalog metadata, design presets, geometric artwork,
icons other than the Feather GitHub mark, renderer, editor, server, exporter
and tests are original code under `LICENSE`. No claim is made that original blocks came from an external library.

## TypeSafe and OpenRouter services

JEV is an external, authenticated service. This bundle does not contain model
weights or a TypeSafe key. The component code is free; live API usage is billed
to the account whose TypeSafe or OpenRouter key is used. An optional hosted
free allowance is funded by the hosting operator, not by the component license
or a promise of free provider service. Personal-key requests use the visitor's
account. See https://docs.typesafe.ai/api,
https://openrouter.ai/~typesafe/jev-latest and
https://docs.typesafe.ai/models for the current service contract and pricing.

## Design references without code — November 2026

The family-section and thin-group manifests (`shared/blocks-site.mjs`) are original
Forma markup and CSS. The reference labels `shadcn-html` and `tailark` and the names
Basecoat, Untitled UI, assistant-ui, AI Elements and ReUI identify design references
only: no upstream source was read or copied, so no notice is added. Verify each
licence before any future extraction.

The AI application set (`shared/blocks-agent.mjs`) is likewise original Forma markup
and CSS. GradientDeck (reference label `gradientdeck`) is a design reference only: it
publishes no licence, and nothing was copied or adapted from it.

The page recipes (`shared/design.mjs`), the copy packs (`shared/copy.mjs`), the
backdrop and heading-layout rules and the compatibility script are original Forma
work. No third-party text, markup or code was used.

## Native interaction adaptations — October 11, 2026

The generated-site interaction pack adapts the following MIT source patterns:

| Source | Native adaptation | Complete notice |
| --- | --- | --- |
| Fancy Components / Daniel Petho | Underline actions and stacked process; stacking reference credits Khoa Phan | `licenses/FANCY.txt` |
| Watermelon UI / Watermelon Contributors | Gallery interaction and sliding application tabs | `licenses/WATERMELON.txt` |
| useLayouts / Urvish Mali | Fanned gallery with saved project images | `licenses/USELAYOUTS.txt` |
| Cult UI / Nolly Studio | Service disclosure with natural content height | `licenses/CULT.txt` |
| Velora UI / Aigars Silkalns | Theme-colored pointer spotlights | `licenses/VELORA.txt` |

Reviewed repository revisions, component locations and SHA-256 snapshot evidence
are in `docs/INTERACTION-SOURCES.json`. Registry snapshots have their own hashes;
a license repository revision is not a claim that a published registry snapshot
has identical bytes. `docs/INTERACTIONS.md` describes those limitations.

Adapted implementation: `shared/render.mjs`, `shared/interface-render.mjs`,
`public/site.css` and `public/interaction-runtime.js`. React, Tailwind and animation
library imports, remote example photographs and fixed example copy were removed.
Native disclosure, scrolling, sticky positioning, observers and transitions replace
the upstream framework runtime. Source ideas were adapted to finite validated
project choices, item identities, editing, content removal and self-contained export.
The entrance effect and arrow slide use original local CSS.

All runtime code is bundled into every generated HTML page. The full upstream
notices, including HyperUI and Feather, are consequently embedded in every HTML
page and included as separate files in each export ZIP, regardless of which
variants are currently selected. Keep these notices when redistributing the code.
No other researched library is bundled by this implementation.
