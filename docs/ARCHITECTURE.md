# Architecture

## Runtime map

There are two entry points sharing the same bounded composer and renderer. The
native local server requires no dependency installation or build. The public
hosted edition uses an explicit static build, a small Vercel API, pinned Zod
validation and Upstash Redis over HTTPS. It does not expose the local project API.

### Native local mode

```text
Browser editor                      Node.js, 127.0.0.1 only
public/app.mjs                       server/app.mjs
        |                                  |
        | local API + application token    | /api/compose
        +--------------------------------->|    |
        |                                  |    +--> schema validation
        |                                  |    +--> pass 1: plan choices
        |                                  |    +--> hard locks / constraints
        |                                  |    +--> pass 2: variants + ordering
        |                                  |    +--> validated specification
        |                                  |
        | /api/render                      | server/jev.mjs
        +--------------------------------->|    +--> official TypeSafe API
        | sandbox srcdoc                   |
        |                                  | server/store.mjs --> local JSON
        | /api/export                      | server/zip.mjs   --> static ZIP
        +--------------------------------->|
```

The browser never calls TypeSafe directly. The same renderer supplies the preview
and standalone export; both use the same component CSS and fixed behavior script.
The browser needs no transpiler. Node loads and serves the CSS/runtime once at
startup, so restart after changing those files. `npm run dev` enables Node watch
mode for imported server-side code but is not a hot-reloading asset pipeline.

### Hosted mode

```text
Browser profile / tab                Cloudflare               Vercel API
IndexedDB projects                   API rate rules           signed guest session
local demo, preview and export        secret header overwrite  exact origin + CSRF
tab-memory provider key   ----------> -----------------------> strict Zod envelope
image-free live request                                      |
                                                             +--> Upstash atomic quota/lease
                                                             +--> fixed JEV provider
validated choices + local image restoration <-----------------+
```

`scripts/build-hosted.mjs` emits only selected static assets. Its browser composer
copy supports offline demo; credentials, hosted security/quota modules and the
local disk store are not public assets. The fixed preview runtime is hashed at
build time using the same normalized bytes that are embedded in documents.
`npm ci --ignore-scripts` installs the sole approved dependency, Zod 4.6.5; `npm run build` creates
the deployable static output. Node-only hosted modules are kept outside the
browser graph through the deployment allowlist and tests. There is no framework
bundler requiring a `server-only` marker package.

The hosted API consists of `GET /api/status`, `POST /api/connection` and
`POST /api/compose`. The status response bootstraps an expiring, signed UUIDv4
guest session and returns the session-bound CSRF token. Both `__Host-Forma-Session`
and `__Host-Forma-CSRF` cookies use Secure, HttpOnly, SameSite=Strict, Path=/ and no
Domain. Mutations require the exact configured HTTPS origin and a matching
`X-CSRF-Token` header. Guest identity always comes from the verified cookie.
The token returned by status lets the browser send the CSRF header without
reading either HttpOnly cookie. Clearing cookies creates a different guest;
provider-key, transport-IP and global quotas still apply.

Every hosted API request requires `X-Forma-Edge-Token` matching the server's
`FORMA_EDGE_SECRET`, before any quota or provider call. Cloudflare must overwrite
that header on incoming API traffic. This shared origin credential is never
sent to browser code. `PUBLIC_ORIGIN` binds request URL, Host and Origin to the
one actual app origin. Direct Vercel API access without the edge credential is
rejected, including status. This must be verified on the deployed proxy path.

The browser retains a visitor-supplied key only in tab memory and sends it per
connection or live request. An explicit key always selects BYOK, including on
provider failure: it never silently falls back to an operator credential.
When a compose request omits its key, the backend can use an optional operator key from
`TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`, with optional `JEV_PROVIDER`/`JEV_MODEL`
selection, only after the free-access reservation succeeds. That key stays in
the server environment and current provider request; it never reaches browser
assets, status responses, projects or Redis. Connection tests require a personal
key and use that key only. No provider SDK is involved.

Status and funded compose responses expose a bounded `freeAllowance` object containing
`available`, `remaining`, `limit: 10`, `resetAt` (UTC milliseconds or null) and
an optional `reason`. The UI displays the remaining JEV-call count and offers Connect JEV
when free access cannot cover the operation. Status checks inspect configuration
and Redis without calling the model provider. Eligibility is optimistic until
the first explicit request tests that operator key. Provider 401/402/403/429 responses
trigger a 300-second deployment-wide cooldown for that operator key; visitors
receive an actionable BYOK prompt rather than a fabricated successful connection.
`shared/compose-transport.mjs` replaces images with a fixed presence marker
before transport and restores local bytes by validated identities afterwards.
The backend validates the image-free contract. Prompts and textual project data
reach the backend; only the composer's documented subset reaches the provider.
Requests and responses remain bounded, abortable and time-limited.

Hosted project data and checkpoints remain in IndexedDB for the current origin
and browser profile. They are not indexed by the guest cookie and are not
uploaded to a hosted project store. Tabs in one profile share projects; other
profiles, origins and devices do not. The browser handles demo composition,
preview and exports with the same shared validation and rendering rules.

`hosted/quota.mjs` reserves request budgets and provider-call units in one fixed
Redis Lua transaction. It uses Redis time, rolling minute windows, UTC daily
budgets and expiring concurrency leases. A compose reserves two provider units;
a personal-key connection test reserves one. Funded settlement refunds unused
provider passes to the free visitor and free global daily counters only, at most
once; burst, session and total-platform reservations are not refunded. A call
already started counts even if it fails or is cancelled.
An abandoned reservation stays charged conservatively when settlement cannot
complete. The handler releases leases in `finally`; a 60-second expiry recovers from an
interrupted function or failed cleanup. Redis records only session identifiers,
HMAC-derived IP/key identifiers, random request IDs and usage metadata. It stores
no raw provider key, IP address, prompt or project. Missing configuration or Redis
errors deny new work. See [PRODUCTION.md](PRODUCTION.md) for the exact defaults.

The REST adapter uses `QWEN3_KV_REST_API_URL` and the writable
`QWEN3_KV_REST_API_TOKEN` from the Vercel server environment. The existing Redis
database can serve another project: Forma prefixes every quota key with
`forma:{quota-v1}:`. This prevents key collisions while retaining shared capacity,
availability and credential access. TCP Redis URLs and read-only tokens are not
used. Local `.env` files are excluded from deployment; set the needed values in
Vercel, and use separate test infrastructure for live quota tests.
`QWEN3_LIMIT` sets provider units per rolling minute for session + transport
IP and personal provider key. It accepts integers from 1 to 120, defaults to 10 when
absent and fails closed when malformed. Connection tests consume one unit and
compositions reserve two; the separate daily and global budgets still apply.

Free access has an atomic limit of 10 actual provider calls per visitor IP per
UTC day. Changing guest cookies does not reset it; shared public IPs share the
allowance. `FORMA_FREE_GLOBAL_DAILY_LIMIT` bounds all operator-funded calls at
500/day by default (configurable from 1 to 5000). The shared operator key has
60 units/minute and 10 concurrent operations; the deployment's existing 5000/day
and 50-concurrent ceilings still cover both free and BYOK use. Session limits
also apply. Exact-IP accounting cannot prevent IP rotation or prove a human
identity, so the global budget is an essential cost boundary.
The displayed free allowance is a conservative capacity estimate, not a provider
billing meter; abandoned reservations may retain units for calls never started.

Transport IP comes only from Vercel's overwritten `x-forwarded-for` header. It
can identify a Cloudflare proxy, so it is not described as a verified visitor IP.
Cloudflare applies visitor-IP rate limits at the edge. For the free daily quota
only, the application accepts one valid `CF-Connecting-IP` address after the
Cloudflare edge credential has been verified. Missing/invalid visitor IP disables
free access while BYOK remains subject to the usual transport controls. Ordinary
BYOK and coarse request limits continue to use Vercel's `x-forwarded-for`.
The trusted Cloudflare path must not let callers or same-zone Worker code replace
the visitor identity. This is a scoped trust boundary, not general trust in
arbitrary forwarded headers; deployment acceptance must verify it.

## Key files

| File | Responsibility |
| --- | --- |
| `shared/catalog.mjs` | Semantic catalog, 40 variants, design-token presets |
| `shared/interfaces.mjs` | Application screen definitions, typed items and prepared content |
| `shared/interface-render.mjs` | Escaped authored markup for application frontends |
| `shared/schema.mjs` | Runtime schema, bounds, ID/link/image validation, escaping |
| `shared/design.mjs` | Semantic directions, visitor journeys and bounded presentation vocabulary |
| `shared/elements.mjs` | Internal slot controls, component applicability and composition budget |
| `shared/slots.mjs` | Authored part locations and effective reading order |
| `shared/parts.mjs` | Finite removable-part registry and inherited visibility |
| `shared/media.mjs` | Visible image owners, sizing defaults and bounds |
| `shared/structure.mjs` | Pure moves, locked positions, compatible transfers and library operations |
| `server/canvas-edits.mjs` | Bounded JEV targets, image sizes and shared move proposals |
| `server/interface-composer.mjs` | Application surface, layout, item-count and type choices |
| `shared/ui-catalog.mjs` | Local button component, glyph, prepared label and label-style catalogs |
| `shared/content.mjs` | Prepared draft copy, initial spec, exact quoted literals |
| `shared/pages.mjs` | Page registry, selected-page projections, templates, identity-based links |
| `shared/render.mjs` | Allowlisted HTML renderer, theme variables, document CSP |
| `shared/icons.mjs` | Original local SVG icon paths |
| `server/jev.mjs` | Fixed endpoint, authentication, timeouts, response validation |
| `server/composer.mjs` | Two-pass strategy/presentation decisions, locks, journey ordering, actual design diff |
| `server/element-edits.mjs` | Internal element questions, exact quoted-copy destinations, targeting and application |
| `server/demo.mjs` | Explicitly labeled keyword-based demo evaluator |
| `server/store.mjs` | Atomic file persistence, serialized updates, revision conflicts |
| `server/zip.mjs` | Small stored-entry ZIP encoder with CRC32 |
| `server/app.mjs` | HTTP routes, origin checks, body bounds, export assembly |
| `server/index.mjs` | Environment loading, loopback startup and lifecycle |
| `hosted/security.mjs` | Signed guest identity, strict origin and CSRF enforcement |
| `hosted/schemas.mjs` | Strict Zod envelopes, raw request byte limits and shared semantic validation |
| `hosted/quota.mjs` | Atomic durable quotas and expiring provider concurrency leases |
| `shared/compose-transport.mjs` | Image-free composition transport and local image restoration |
| `scripts/build-hosted.mjs` | Explicit static deployment allowlist and hashed runtime CSP |
| `public/app.mjs` | Editor state, manual editing, autosave, preview, download |
| `public/site-runtime.js` | Preview bridge, internal links and email-draft behavior |
| `public/interface-runtime.js` | Fixed local application interactions, with Inspect-mode suppression |
| `public/structure-controls.mjs` | Outline/inspector pointer controller and Move menus |
| `public/library-drag.mjs` | Parent capture, scaled frame coordinates and library-drop handshake |
| `public/site.css` | Component implementation and responsive layout |

## Editor localization

`public/i18n.mjs` provides plain-text translation, named `{parameter}` interpolation,
locale resolution and native `Intl` date/number formatting. Bundled ES-module
catalogs under `public/locales/` support `es`, `pt`, `de`, `it`, `ru`, `pl`, `fi`
and `sv`; English source messages are the fallback. There is no package, build,
remote translation service or dynamically constructed asset path for localization. The HTTP static
allowlist exposes only the eight known modules and the i18n entry point.

The `forma:locale` browser preference is validated against the fixed locale list.
Regional browser tags resolve to a supported base language. Storage failures leave
the editor usable with an in-memory preference. The editor updates its own HTML
`lang` and explicit text/attribute bindings; dynamic templates escape translated
text through the existing schema helper. Interpolation runs once and never treats
parameters as message keys or markup. Arbitrary DOM text is never translated.

The editor owns locale state independently of `spec.brand.language`. Language
switches preserve project values, prompts, page dialog fields and pending inspector
inputs, do not create Undo entries or save revisions, and do not invoke providers.
Catalog metadata is translated at display sites, keeping provider instructions,
IDs, prepared website copy, user titles, reports and exports stable.

Shared structural helpers accept an optional translator only for labels. The
canonical move proposals and permission rules are unchanged. Preview-only labels
travel as bounded plain-text messages through the existing source/origin/channel
checked bridge and are applied with `textContent`/`setAttribute`. The fixed runtime
remains authorized by its hash; no message can supply executable code. Exported
website content and built-in website labels retain their existing behavior.

To add interface text, use a complete English message and named parameters through
`t`, or a `data-i18n`/attribute binding in the static shell. Update the relevant
`*-messages.json` inventory and all eight catalogs. Inventory files are development
inputs, not public HTTP assets. Run `npm test` for coverage/placeholder parity,
locale fallback, literal interpolation and asset-route checks. The optional
`scripts/i18n-smoke.mjs` uses the same test-only Playwright setup as the other browser
scripts to verify all languages, unchanged website state, persistence, preview
controls, open dialog fields and narrow-screen layout. Server/provider diagnostics
and prepared English demo requests are intentionally kept verbatim.

App SEO metadata lives in the static `<head>` with accurate English fallbacks.
The title uses `data-i18n`; description and keywords use `data-i18n-content`,
which sets only the `content` attribute through the same explicit translation
pass. These describe the builder, independent of exported website metadata.
The header's language selector updates them at startup and on language changes.

The bottom-left help button opens a native modal dialog with 13 FAQ entries,
grouped into four topics. Native `details`/`summary` elements provide keyboard
expansion; dialog focus containment, Escape dismissal and focus return use browser
behavior. Questions, answers, headings and accessible control labels are in
`help-messages.json` and every locale catalog. Translation changes only bound text,
preserving the open dialog and expanded questions. Help opens without a network
request, saved project mutation or provider call.


## Composition contract

`create` starts from an internal empty page with default brand/theme and no
selection, locks, uploaded media, sections or sibling pages. Neither model pass
receives the previous project's content. Prospective prepared owners let explicit
image-size and movement choices target sections that are actually included.
The result is validated as a new single-page project and returned with
`freshProject: true`. The client first saves the old project, masks the preview
while composing, and changes project identity only after a valid response. Undo
keeps the full old canvas and its page/theme lock maps; failed/cancelled composition
leaves the current project intact. Refine/redesign still merge only the selected page.

The first pass also chooses a website or application surface and a bounded UI item
count. Application screens use the optional primary `hero` position for saved-page
compatibility, while the editor shows their actual screen names. Pass two selects
applicable layout/visibility controls and each item's authored type. Existing
screen content is preserved on refinement; explicitly switching screen types
installs the destination's prepared fields. Field counts append/trim from the end.
Exact quoted-copy destinations are resolved in pass two after owners exist, with
selection rebound by stable ID; a replaced field never inherits an old selection.
Typed UI items use the same reorder and exact-copy paths as website items.

The interface renderer escapes all saved text and selects fixed local markup.
Application interaction state lives in the page only; no entered credentials or
chat messages are sent to a server, saved in storage or sent to JEV. Forms prevent
network submission; authentication and chat controls do not fabricate successful
login or model responses. Chat and local additions have explicit limits. Native
and scripted controls are inactive during Inspect. Both fixed runtime files are
concatenated and newline-normalized before computing the single CSP script hash;
preview and export embed those exact bytes. The existing sandbox, source/channel
checks and `connect-src 'none'`/`form-action 'none'` policies remain in force.

Pass 1 supplies scope, site-family, visual direction, visitor journey, unlocked
theme choices, section-presence questions, supported-request classification,
application surface/item count and four targeted canvas actions.
Canvas targets name an owner and operation using stable IDs, including bounded
placement targets for sections being added in the same request. Refinement and redesign both offer
`keep`; refinement asks for only the requested local changes, while redesign
allows a coordinated change of unlocked visual settings and variants. Redesign
clones existing content even when it is still marked as draft. Membership changes
are requested separately; redesign alone is not an instruction to discard content.
Each question includes its purpose in the instructions, because TypeSafe does not
send question IDs to the underlying model.

Pass 2 receives the chosen theme/family/direction/journey and available sections,
with bounded content-shape metadata (text lengths, item counts, image presence and
action presence). It chooses a concrete variant and applicable presentation axes
for each unlocked section. Image bytes, bodies and destinations are not added to
provider state. Existing brand/tagline/section-title context is still included.

Internal controls come from one shared registry consumed by schema, inspector and
composer. Pass 2 also chooses supported internal elements and individual feature
icons. The renderer uses fixed SVG paths, authored button components and prepared
labels; it never consumes arbitrary SVG, HTML, CSS or new model-written text.
Button label presets are independent of custom saved wording; a custom label edit
resets that preset. Broad redesign preserves feature icons and button wording unless
explicitly requested. Inapplicable choices are ignored with a warning when relevant.

Editor selection uses page, section, item and optional authored-part identities.
JEV requests carry the stable item ID, derived ordinal and selected part. The server
checks ID/index agreement and validates the part against the authored-part registry.
It is reference context, not a lock: an explicit request may target
another section. Existing item text stays local; only IDs, ordinals, icon/placement/image-size values and a
boolean indicating whether its title occurs in the user's prompt are sent. A quote
destination is chosen from bounded existing fields, then ordinary code copies the
user's literal with that field's bounds. Links must pass URL and page-target checks.
No unquoted copywriting is implied. Whole-section locks still govern all its slots.

Each pass enforces at most 160 questions and each question at most 255 options.
Composition retains the same two evaluation calls and timeout budget. These are
application bounds, not a claim that larger question sets have been live-evaluated
for quality. See [ELEMENT-EDITING.md](ELEMENT-EDITING.md) for supported slots,
the original failure mechanism and the remaining limits.

Creation/redesign use a selected journey recipe filtered to the present sections,
reordered within unlocked segments. Locked body sections form barriers.
Explicit section, item and inner-part movement uses `shared/structure.mjs` proposals
chosen in pass 2 for the targets selected in pass 1. Navigation, hero and footer
remain anchored. Item reorder and lossless Services/Process transfer use the same
identity, artwork, highlighted-plan, capacity and lock rules as manual moves.
Copy and ordinal-based icon edits run before stable-ID movements. Every proposal
is revalidated after earlier edits; incompatible choices produce a warning.
Later part edits follow an earlier successful transfer through an explicit owner
map, never by guessing among legacy IDs in unrelated sections.
Uploaded section images exclude
hero/about variants that would hide them. A text-only selected variant ignores
inapplicable media-proportion changes.

Global heading scale and width, and per-section tone, spacing, heading alignment,
surface and media ratio are enum values in the shared schema. Missing fields in
old version-one projects normalize to defaults; invalid fields do not become CSS.
The renderer emits data attributes and fixed CSS tokens. The editor uses the same
vocabulary and validated commits, and saved projects/exports carry the values.

Reports contain strategy choices, raw decision distributions and a separate actual
design diff computed from the normalized input and validated result. The diff
lists design settings, membership and order, plus generic notices of changed
wording without the text itself. It does not include image payloads. It describes the
completed request, not later manual edits. Reports and selected strategy metadata
remain session-only; the resulting visual settings persist in the spec.

The model is not asked to invent component IDs, numeric colors, arbitrary markup,
CSS, prose, imports or actions. Concrete props are assembled locally. The resulting
specification is validated again before it can replace the current page.

Refinement/redesign choices below 0.25 distribution confidence retain the previous value where
supported. This is an explicit heuristic, not a calibrated quality threshold.
Confidence and probability are reported as returned. There is no claim of image
understanding or visual scoring. The threshold and prompts need evaluation against
real requests and live JEV outputs before production use.

The local English explicit-omission guard handles narrow forms such as “no pricing”
or “remove the gallery and contact.” It is not a general natural-language parser.
Locks take priority over omissions. Other interpretation remains with the model.

The demo evaluator implements only simple English keyword rules. It is not used
when a live request fails and does not produce model probability estimates.

## Structural editing contract

Legacy item IDs are backfilled deterministically, avoiding existing identifiers;
new items receive UUID-based IDs. Item artwork is stored, effective feature glyphs
are materialized before reordering, and highlighted pricing uses `featuredItemId`.
Service/process numbering and leading-card sizing remain positional. Item-owned
placements and pricing button icons override section defaults without duplicating
the content tree. Authored placements change DOM order in preview and export.

All structural UI paths use `shared/structure.mjs`. Proposals are strict, bounded
ID/catalog references. Sections retain navigation/hero/footer anchors and locked
barriers. Items reorder within their collection; plain text Services and Process
items also have an explicit lossless transfer policy, with both owner locks,
capacity, required field compatibility and target ID uniqueness checked. Other
cross-container conversions remain unsupported. Library insertions cannot shift
locked slots; replacements preserve the section's content and identity.

Sections are optional: a page may contain zero to twelve sections, with no required
hero or navigation. Existing anchors constrain movement only while present.
`shared/pages.mjs` removes whole sections and repairs incoming links atomically:
local fragments to the deleted section are cleared, while explicit cross-page
fragments retain their page destination. Undo restores both content and links.
Whole-item deletion preserves remaining item identities, effective feature icons
and highlighted-pricing references. Locked sections reject structural deletion.

Section/item `removedParts` arrays contain only bounded, unique keys from
`shared/parts.mjs`. Missing arrays in older projects normalize to `[]`. Shared
operations validate the key against the owner's applicable parts; the renderer
omits their actual markup in preview and export, while saved copy/assets remain
available for Restore. Deleting a button hides its label/icon descendants without
destroying their independent removal state. Removed parts cannot be moved or
targeted by ordinary text/icon refinement. Explicit library icon replacement can
restore that icon, but cannot resurrect its deleted parent button.

Canvas and inspector Delete controls share these operations. Preview deletion
checks source window, opaque origin, channel, ready frame, page, content counter
and selection before one Undo commit; it cancels any active gesture. Keyboard
shortcuts ignore editable fields, dialogs, Interact mode and busy composition.
An empty page has nullable selection and an editor-only Add control; export is
valid without editor controls. Bounded JEV canvas choices can remove authored
parts or whole stable-ID items in the existing two-pass budget; ordinary redesign
preserves removal flags and absent sections. Live model adherence still requires
live evaluation; deterministic fixtures test the application contract only.

The sandbox measures actual rendered rectangles without mutating saved HTML.
The editor validates source window, opaque origin, channel, one-use drag session,
active page and local content counter, then applies one canonical commit. Pending
preview responses are invalidated at pickup without replacing the active channel.
Background save revisions alone do not invalidate a drag. Undo snapshots retain
page/section/item/part selection; image uploads resolve stable target identities
again after asynchronous processing.

Scrolling is scoped to its owning viewport. Preview navigation and selection use
the iframe's `window.scrollTo` with the target's authored scroll margin; they never
ask `scrollIntoView` to reveal embedding ancestors. Inspector/outline reveals
scroll only their `.inspector-scroll` or `.left-scroll` container. The editor root,
canvas and scaled-preview shell use `overflow:clip` so browser focus or accidental
programmatic scrolling cannot displace the fixed workspace. Scrollable panels,
dialogs and the iframe document retain their own scrolling.

Image sizing uses `shared/media.mjs` to identify visible hero, split-about and
gallery media owners. Schema-normalized `imageSize` stores integer width percent
(25–100), optional integer height in CSS pixels (80–1200, null for the component
default), and cover/contain fit. Older projects normalize to the original layout.
Only these validated values become renderer CSS variables, in both preview and
export. Explicit sizes override component image proportions and minimum heights;
width remains bounded by its responsive container. Resizing is a structural edit
and requires an unlocked section. The JEV canvas adapter offers these same fields
for visible media owners, with 25–100% width, Auto or prepared pixel-height choices,
and cover/contain. Up to 32 exact bounded heights written in the user's prompt can
augment the choices. Model output cannot introduce a number or CSS string outside
those choices. Target and field choices below the confidence threshold preserve
the existing value. No additional API endpoint or evaluation pass is introduced.
Canvas resize sessions share the source/channel/page/counter and replay checks
used for moves; temporary geometry is discarded on cancellation, and pointer
release commits one validated update. Inspector controls use stable owner IDs.

For library gestures, the parent captures the pointer and converts coordinates
into iframe CSS pixels. The child returns only an approved semantic destination
and the point sequence ID. Release requires a fresh matching target reply before
the parent commits. Cancellation clears capture, temporary overlays and scrolling.
No new API endpoint, provider call, runtime dependency or executable content path
is introduced. Handles, part identities and Move controls are preview-only.

## Page and navigation contract

Version-one specs retain the original root fields as Home and normalize a missing
`pages` array to empty. Up to seven child records contain stable IDs, bounded unique
slugs, titles, navigation visibility, family, brief, theme and sections. Brand is
shared. Page-local content and design remain independent. The original four-million
character budget applies to the complete project, not separately to each page.
Custom, About, Services, Portfolio, Pricing, FAQ, Contact, Blog and Article starters
assemble existing catalog sections and prepared draft copy. They do not restrict
subsequent section editing or introduce special page execution paths.

`page:<id>#<optional-section>` links resolve only through the validated registry.
Slugs cannot contain paths, extensions or reserved filenames. Renaming a slug keeps
identity-based links intact; deleting a page clears incoming links in the same
undoable transaction. Removing an individual section with incoming page links fails
validation until those links are changed. Legacy brand `#section` actions that match
Home sections become explicit Home destinations when pages are added.

Render and compose accept `pageId` (default `home`), validated against the supplied
site. Refinement/redesign project only that page into both model stages, then merge the
validated result into the full site. Sibling copy and images do not enter provider
state. Saves, revision checks, undo and checkpoints always carry the complete site.
Theme locks are session-local and retained per page; section locks live in the spec.

Preview navigation resolves before generic section inspection. The fixed runtime
sends bounded page/section IDs and add-menu choices through the existing source and
channel-checked bridge. The parent verifies targets against current state, ignores
mutations while composing, invalidates stale channels on page changes, and applies
pending scroll only when the new frame is ready. The + menu is preview-only and
hidden in Interact. Export creates one self-contained HTML document per page;
relative filenames work from a file browser or a static host, without editor controls.

## Intentional scope choices

- Websites and local application frontends with up to eight pages, one block per
  section family and at most 12 sections per page. Blog indexes/articles are
  authored pages, not a CMS. The primary screen can be an application interface.
- Optional theme-aware blocks rather than hundreds of incompatible libraries.
- Local HTML/CSS HyperUI adaptations rather than a React dependency chain.
- An independent bounded composer rather than json-render's unreleased JEV adapter.
- No generator model, telemetry, vector database, package registry fetch or agent
  with filesystem/terminal access at runtime.
- Local forms, conversations, cart and workspace controls; no backend generation,
  live account system, payment processing, booking service or hosting.
- No persistent report transcript. Creation briefs/checkpoint labels are stored;
  full decision reports can be downloaded separately.

## Native local API

The production scope is the local, single-user editor and exported static sites;
see [PRODUCTION.md](PRODUCTION.md). Startup requires the Node.js feature floor (18.17+, 20.3+, 21 and later)
in `server/runtime.mjs` and prints a notice below its reviewed security baseline. API envelopes reject unknown fields and apply raw
byte caps before JSON parsing. The process-scoped API window permits 240 requests
per minute and 12 active requests; provider work is serialized with its separate
eight-per-minute limit. Disconnect invalidates pending connection tests and aborts
provider work. Fixed provider responses are capped while streaming, with the same
deadline covering headers and body. These are local safety bounds, not SaaS quotas.

`shared/raster.mjs` inspects MIME signatures, bounded raster containers and
dimension metadata before upload decoding and when validating imported images.
It accepts only still PNG/JPEG/WebP/AVIF images; it is not a complete codec parser.
Saved files have bounded byte reads and validated metadata and checkpoint specs.
Project creation is serialized through its quota check and atomic write, and
unreadable project files consume quota. Only one store process per directory is
supported. Source packaging uses `scripts/release-check.mjs` to select and scan
files, then `scripts/release-source.mjs` archives those exact bytes with a manifest.

`GET /api/status` bootstraps the application token. All other API routes require
`X-Forma-Token`, including reads. All requests pass Host and Origin checks.

| Method / path | Purpose |
| --- | --- |
| `GET /api/status` | Token, provider, model and connection state; never the key |
| `GET /api/catalog` | Approved components and design presets |
| `POST /api/connection` | Test/configure a server-memory TypeSafe or OpenRouter key |
| `DELETE /api/connection` | Clear/disable credentials for this process |
| `POST /api/compose` | Compose/refine/redesign `{mode, operation, prompt, spec, locks, pageId?}` |
| `POST /api/render` | Render `{spec, channel, pageId?}` into a sandbox preview document |
| `POST /api/export` | Produce a standalone website ZIP |
| `GET /api/projects` | List saved project metadata |
| `POST /api/projects` | Validate and save a new project |
| `GET /api/projects/:id` | Read a saved spec and checkpoint metadata |
| `PUT /api/projects/:id` | Update with `expectedRevision` |
| `DELETE /api/projects/:id` | Delete with `expectedRevision` |
| `GET /api/projects/:id/history/:historyId` | Retrieve a checkpoint |
| `POST /api/shutdown` | Gracefully stop this local app |

The TypeSafe or OpenRouter key is not part of the editable spec. Preview requests contain a
fresh random channel identifier. The iframe uses `sandbox="allow-scripts"` without
`allow-same-origin`. Message receivers validate the sending window and the channel.
User content is never interpolated into JavaScript. The CSP allows only the known
runtime hash, which is recomputed from the bundled file at startup/export.

## Adding a component

1. Add a semantically distinct variant in `shared/catalog.mjs`, including accurate
   provenance. Reuse an existing family unless you also update the family schema.
2. Implement its markup under the existing allowlisted renderer and theme-aware
   styles in `public/site.css`. Use no remote assets or user-controlled code.
3. Reuse the established text/image/item props, or explicitly extend validation
   and editing UI for new props. Document meaningful responsive behavior.
4. Add prepared draft content only where necessary. Never fabricate client logos,
   metrics, reviews, property photographs or prices presented as real.
5. Add renderer/escaping/responsive tests and inspect desktop/mobile screenshots.
6. Preserve source-license notices in both the app and site export.

## Primary references

Reviewed September 26, 2026:

- TypeSafe HTTP API: https://docs.typesafe.ai/api
- OpenRouter JEV model & System One API: https://openrouter.ai/~typesafe/jev-latest
- Choice primitive: https://docs.typesafe.ai/primitives/choice
- Models: https://docs.typesafe.ai/models
- Model limitations: https://docs.typesafe.ai/model-jaggedness/jev-1.13
- Experimental json-render integration: https://json-render.dev/docs/jev
- HyperUI pricing: https://www.hyperui.dev/components/marketing/pricing/
- HyperUI FAQ: https://www.hyperui.dev/components/marketing/faqs/
- HyperUI cards: https://www.hyperui.dev/components/marketing/cards/
- HyperUI banners: https://www.hyperui.dev/components/marketing/banners/
- HyperUI license: https://github.com/markmead/hyperui/blob/main/LICENSE
