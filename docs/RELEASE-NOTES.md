# Forma 0.3.0

This release publishes the hosted edition beside the native local editor. The
hosted edition runs on Vercel behind Cloudflare with an Upstash Redis REST
database: signed guest sessions, CSRF checks, edge-secret verification, rolling
rate limits, expiring concurrency leases, an optional operator-funded allowance
of 10 JEV calls per IP per UTC day with a global budget, bring-your-own-key
verification, and an optional Cloudflare Turnstile check before the first key
test or live build. Hosted projects stay in the visitor's browser. See
docs/PRODUCTION.md for deployment and SECURITY.md for the threat model.

The catalog grows to 132 MIT-licensed components across 16 section families,
with design-reference application screens and a wider range of site types. The
editor's sample canvas has a refreshed presentation, and the request box shows
an example brief as its placeholder.

The native local runtime still needs no package installation. Hosted builds use
one pinned dependency (Zod 4.6.7) through `npm ci --ignore-scripts` and
`npm run build`. Node.js 22 (22.23.3 or newer) or 24 (24.21.0 or newer) is
required. No credentials are included; configure secrets only in your hosting
provider's server environment, starting from `.env.hosted.example`.

# Forma 0.2.0

This release contains the complete native local editor, 105 blocks, 24 reusable
elements, 12 styles, 12 palettes and eight editable showcase projects. It adds
stable repeated body sections and lossless version-one project migration.

The library offers sandboxed previews, style application, editable element slots,
keyboard controls and reduced-motion behavior. All component source and required
MIT notices are included. Examples contain labeled prepared content.

The distribution is dependency-free and contains local API safety checks,
meaningful regression tests and portable release tooling. The public source and
publication history permit only the maintainer's documented contact address.
Runtime checks and independent scans are summarized in TEST-REPORT.md.

Start with start.cmd, sh start.sh or node server/index.mjs --open. Use Offline
demo without a key, or connect your own TypeSafe/OpenRouter key for live choices.
Exported app interfaces retain temporary local state and need a separate backend
for connected services. Protect unencrypted projects and browser-saved keys.
