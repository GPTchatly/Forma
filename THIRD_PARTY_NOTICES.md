# Component provenance

Reviewed on September 27, 2026. The local runtime remains dependency-free.
Hosted installation includes the pinned Zod package described below. No remote
fonts, photos, runtime CDN assets or paid component packs are bundled.

## Zod 4.6.5 — MIT

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

## Octicons mark-github — MIT

The editor footer's GitHub link uses the unmodified path data of the
`mark-github-16` icon from `@primer/octicons` 19.38.0, inlined in
`public/index.html`. It is not part of exported websites. The GitHub mark is a
GitHub trademark and is used only to link to this project's GitHub repository.

Upstream: https://github.com/primer/octicons

```text
MIT License

Copyright (c) 2026 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Original code — MIT

All remaining named blocks, catalog metadata, design presets, geometric artwork,
icons, renderer, editor, server, exporter and tests are original code under
`LICENSE`. No claim is made that original blocks came from an external library.

## TypeSafe and OpenRouter services

JEV is an external, authenticated service. This bundle does not contain model
weights or a TypeSafe key. The component code is free; live API usage is billed
to the account whose TypeSafe or OpenRouter key is used. An optional hosted
free allowance is funded by the hosting operator, not by the component license
or a promise of free provider service. Personal-key requests use the visitor's
account. See https://docs.typesafe.ai/api,
https://openrouter.ai/~typesafe/jev-latest and
https://docs.typesafe.ai/models for the current service contract and pricing.
