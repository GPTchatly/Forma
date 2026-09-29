# Verification report

## Editor footer GitHub link — September 29, 2026

Target: the canvas footer shows the Octicons GitHub mark between the result label
and the page counts, linking to https://github.com/GPTchatly/Forma in a new tab with
`rel="noopener noreferrer"`. The link loads nothing; runs were on Windows with
Node.js 24.11.1.

| Executed check | Result |
| --- | --- |
| `npm test` | **487 passed, 0 failed, 3 skipped** |
| `node scripts/check.mjs`, `npm run build`, `node scripts/release-check.mjs` | **103 files, 0 syntax failures**; **49 static files**, preview CSP hash unchanged; **151 files, 0 findings** |
| Local editor in Chrome (Playwright) at 1440, 760 and 390 px, GitHub requests stubbed | Link between label and counts at every width; new tab opened the exact URL with `window.opener` null and an empty referrer; editor stayed open; **0 console errors** |

## Refine and Redesign never save an empty page — September 29, 2026

Target: a Refine or Redesign request whose choices pick an application screen (for
example "Frontend AI login form") but omit every section, Hero included, was saved
as an empty page. The composer now keeps Hero with the chosen screen in every
operation, and refuses with 422, leaving the page unchanged, an edit whose choices
remove every section the prompt does not name. Runs were on Windows with Node.js
24.11.1, using synthetic fixture choices; no live JEV call was made.

| Executed check | Result |
| --- | --- |
| `npm test` | **486 passed, 0 failed, 3 skipped** |
| `node scripts/check.mjs`, `npm run build`, `node scripts/release-check.mjs` | **103 files, 0 syntax failures**; **49 static files**; **151 files, 0 findings** |

## Node.js compatibility — September 29, 2026

Target: the local startup check now accepts Node.js 18.17+ (18.x), 20.3+ (20.x) and
every later line, printing a notice below the reviewed security baseline instead of
refusing to start. All runs were on Windows with official win-x64 `node.exe` builds,
verified against the nodejs.org SHA-256 sums. No live JEV call was made; nothing was
deployed or published.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` on Node.js 24.11.1 | 1 package added, **0 vulnerabilities** |
| `node --test tests/*.test.mjs` on 24.11.1 and 24.21.0 | **484 passed, 0 failed, 3 skipped** on each |
| Same test files, listed explicitly, on 20.11.1, 20.20.2, 22.23.3, 23.11.1, 25.9.0 and 26.10.0 | **484 passed, 0 failed, 3 skipped** on each |
| Same on 21.7.3 | 481 passed, **3 failed**: browser-render tests whose `t.mock.method(globalThis, 'fetch')` Node 21 rejects |
| Same on 18.17.0 and 18.20.8 with `--experimental-global-webcrypto`, the global `server/index.mjs` supplies | 483 passed, **1 failed**: a hosted body-timeout test that uses the newer `mock.timers` options |
| `server/index.mjs` with a quoted `.env`: page, status, demo compose, project save, then `scripts/stop.mjs` | **Passed** on 18.17.0, 18.20.8, 20.11.1, 20.20.2, 21.7.3, 22.23.3, 23.11.1, 24.11.1, 24.21.0, 25.9.0 and 26.10.0 |
| Same startup on 16.20.2, 19.9.0 and 20.2.0 | Exit 1 with the runtime requirement message, as intended |
| `node scripts/check.mjs`, `build-hosted.mjs`, `release-check.mjs` on 24.11.1 and 24.21.0 | **103 files, 0 syntax failures**; **49 static files**; **151 files, 0 findings** |
| `node scripts/release-source.mjs` on 24.11.1 | Archive created, **0 findings** |

Node 18.x and 20.11.1 have no `process.loadEnvFile`, so those runs used the fallback
`.env` reader. Without the flag, Node 18 test runs fail wherever tests import shared
code directly, because Node 18 lacks the `crypto` global that the app entry supplies.
Before Node 21, `node --test` does not expand `tests/*.test.mjs` under Windows `cmd`,
so the older runs listed the files explicitly. Linux and macOS were not tested.

## Vercel, Cloudflare and funded JEV calls — September 27, 2026

Target: the no-login hosted source and generated static artifact, alongside the
existing loopback application. Tests ran locally on Windows with Node.js 24.21.0
and Chrome 153.0.8010.53. Nothing was deployed or published.

| Executed check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` (the `npm test` command) | **498 passed, 0 failed, 1 skipped**; optional browser tests enabled |
| Real Redis quota suite, separately enabled | **31 passed, 0 failed, 0 skipped**, using Redis 8.10.2 in temporary Podman |
| `node scripts/check.mjs` | **103 JavaScript files checked, 0 syntax failures** |
| `node scripts/build-hosted.mjs` | **49 allowlisted static assets**, matching fixed-runtime CSP; exact upload allowlist checked |
| `node scripts/security-smoke.mjs` | **22 local-mode browser checks passed**, including AVIF, with no unexpected errors or provider calls |
| `node scripts/release-check.mjs` | **151 selected source files, 0 findings** |
| Gitleaks 8.30.1 on extracted hosted release source | **0 findings**, default rules and fully redacted output |
| Source archive and clean extraction | Exact entry set and SHA-256 manifest verified; lockfile installed with scripts disabled; **480 tests passed, 0 failed, 3 optional checks skipped**; hosted build and local startup/shutdown passed |
| Zod 4.6.5 installation and lockfile review | One pinned dependency, install scripts disabled; npm reported **0 known vulnerabilities** |

The one full-suite skip is the opt-in real Redis test after its temporary
container was removed. That test and its subtests passed in the separate run.
The clean extraction did not receive external browser/Redis test-tool settings;
its three optional skips are covered by the separate root/browser/Redis runs.
The root test glob intentionally excludes extracted historical source copies
under ignored artifacts. The broader bare `node --test` command was also run,
but its duplicated historical tests are not counted as current-source coverage.

Hosted boundary tests exercise the real Web Request handler and fixed provider
adapter with synthetic upstream replies: signed guest sessions, exact Origin and
Host, Cloudflare ingress credential, CSRF, strict Zod envelopes, byte/text limits,
request-scoped keys, redacted failures, cancellation, quota admission before
provider work and final lease release. Funded-call tests additionally cover
operator-only credential selection, explicit personal-key isolation, verified
Cloudflare visitor identities, authoritative free counters and provider-credit
failure responses. These use synthetic upstream replies, not live credentials.
The Redis suite executes the actual fixed
Lua scripts, including concurrent session/key/global limits, daily accounting,
UTC rollover, replay rejection and lease recovery. Funded cases verify the
10-call visitor cap across cookie/transport changes, the shared 500-call cap,
read-only status, concurrent once-only settlement, cross-visitor/day refund
protection and free-only provider cooldown recovery. It does not establish Upstash
cloud latency, durability, eviction settings or billing behavior.

Actual Chrome tests open a frozen hosted artifact on a fixture HTTPS origin,
using its Vercel CSP and synthetic session/provider responses. They cover opaque
preview isolation, the fixed preview runtime, deliberately blocked script
injection, escaped imports, real image conversion, IndexedDB save/reload and
cross-profile isolation, client-only demo composition, ZIP contents, tab-only
keys, and truthful hosted privacy/settings text after locale changes. Funded UI
checks exercise the button counter, depletion, explicit-click daily refresh,
personal-key override, disconnect/reload, and unavailable-credit fallback without
automatic provider retries. They do
not verify deployed cookie handling or a live model. Newly added hosted messages
use explicit English fallbacks in the other language catalogs.

Independent review found a key-replacement race; live compose is now blocked
while connection verification is pending. Sixteen targeted client tests passed
again during independent review of the final funded feature. That review also
checked atomic reservations and once-only, day-bound refunds of unused free
calls, without finding a new concrete cost bypass or credential disclosure.
No unresolved source-level finding remained
in the reviewed hosted boundaries. This does not certify the deployed service.

The existing local `.env` was inspected only through variable presence, bounded
limit and endpoint-format checks, without printing credentials or contacting
the shared cloud Redis database. The hosted limiter uses the existing QWEN3 REST
variables and an isolated `forma:{quota-v1}:` key namespace. `QWEN3_LIMIT=10` is
interpreted as provider units per minute; a design reserves two units. Other
applications still share Redis capacity. Environment files are excluded from
both the source release and the exact Vercel upload allowlist.

The temporary Redis container and newly pulled image were removed. The original
13-image inventory was verified unchanged and the previously stopped Podman VM
was returned to its stopped state. No live provider key, paid cloud resource,
deployment, Git commit or publication was created. Git history remains unavailable
because this checkout has no `.git` metadata. Required deployed acceptance,
Cloudflare configuration, Redis eviction settings and spending controls are
documented in [PRODUCTION.md](PRODUCTION.md).

Current local evidence includes ignored `artifacts/hosted-node-tests.txt`,
`artifacts/hosted-local-smoke.txt` and `artifacts/security-smoke/results.json`.

## Production and source-release hardening — September 27, 2026

Target: the documented single-user loopback editor and exported static websites.
This is not verification of a publicly hosted multi-user service.

| Executed check | Result |
| --- | --- |
| `node --test` | **367 passed, 0 failed, 0 skipped** |
| `node scripts/check.mjs` | **79 JavaScript files checked, 0 syntax failures** |
| `node scripts/security-smoke.mjs` | **22 real-browser checks passed**, including AVIF; no unexpected browser errors |
| `node scripts/release-check.mjs` | **123 selected source files, 0 findings** |
| Gitleaks 8.30.1 on extracted release source | **0 findings**, default rules and fully redacted output |
| Gitleaks on private project data, tool metadata and historical test logs | **0 detected secrets**; those trees remain excluded from release |
| Source ZIP verification and clean extraction | Exact entry set and every SHA-256 manifest entry verified; **367 tests passed** from extracted source |
| Extracted `server/index.mjs` startup | Loopback HTTP, unconfigured credentials, CSP headers and graceful shutdown passed |
| Installed outdated runtime startup | Node.js 24.11.1 rejected before listener or project-store startup, as intended |

Final runtime and browser checks above used **Windows, Node.js 24.21.0 and Chrome
153.0.8010.53**. The Node binary and independent Gitleaks scanner were downloaded
from their official distributions and checked against published SHA-256 manifests;
they are local verification tools under ignored artifacts, not bundled runtime
dependencies. The globally installed Node.js was not changed. Initial focused
worker checks also passed on 24.11.1, before the production runtime floor was added.

The regression suite covers strict request envelopes, malformed/exact origins,
body limits including chunked `413`, simultaneous request bounds, provider stream
size/cancellation, connection/disconnect races, quota races, invalid saved metadata
and histories, image signatures/container dimensions and malformed imports, release
allowlists/symlinks, modified binary assets and runtime-version rejection. One
Windows checkpoint run encountered a transient atomic-rename `EPERM`; replacement
now retries bounded Windows sharing failures without deleting the prior save.
Both final full-suite runs passed.

Browser checks exercise actual PNG/JPEG/WebP/AVIF uploads, saved image preservation
on rejected uploads/imports, literal hostile markup and prototype-looking text,
save/reopen, strict-envelope offline composition, opaque preview isolation, a
deliberately blocked inline-script CSP probe, ZIP export and exported HTML. Test
data was isolated and synthetic. There were **no live provider calls, credentials,
remote browser requests or deployment actions**. Test-only Playwright and Sharp
came from an existing external tool installation, not application dependencies.

Source review and scanning removed personal support contact details, a private
project name and personal home paths from distributable material/historical text
logs. License-required public attribution is retained. The binary favicon was
visually reviewed and pinned by hash after independent review found that checking
only its ICO header could miss appended sensitive data. Private projects, tool
state, screenshots and raw logs remain on the owner's machine and are excluded
from the source archive. No confirmed live credential was found requiring rotation.

Coverage limits: there is **no `.git` metadata**, so commits, refs, deleted objects
and author identities could not be audited. Pattern scanning is not proof that all
possible secrets or personal information are absent, and private screenshots were
not OCR-reviewed. Image metadata validation is not complete codec validation,
particularly for AVIF bitstreams. Large valid histories can make project listing
expensive. Limits and file serialization apply to one process per data directory.
GitHub CI was authored and reviewed locally but not run on a remote host; Linux,
Node.js 22, public hosting and live JEV behavior were not tested in this change.

Evidence remains in ignored `artifacts/security-node-tests.txt`,
`artifacts/security-extracted-tests.txt`, `artifacts/security-smoke/results.json`
and redacted `artifacts/gitleaks-*-redacted.json`. The source ZIP carries a manifest
of its exact source bytes. See [PRODUCTION.md](PRODUCTION.md) and
[SECURITY.md](../SECURITY.md) for operations, residual risks and incident response.

To reproduce the optional browser check, set `FORMA_PLAYWRIGHT_MODULE` to an
existing Playwright `index.mjs`, `FORMA_TEST_BROWSER` to the browser executable and
`FORMA_SHARP_MODULE` to an existing Sharp ES-module entry point for the AVIF fixture.
Then run `node scripts/security-smoke.mjs`. Without Sharp, AVIF coverage is explicitly
reported as skipped rather than claimed as tested.

## Navigation keeps the editor anchored — September 27, 2026

- `node --test`: **315 passed, 0 failed, 0 skipped**.
- `node scripts/check.mjs`: **67 JavaScript files checked; 0 syntax failures**.
- `node scripts/navigation-scroll-smoke.mjs`: **32 browser checks passed**, with
  no observed JavaScript/CSP errors, using isolated temporary data and no model calls.

Windows, Node.js **24.11.1**, Chrome **153.0.8010.53**. Browser coverage includes
1898, 1280, 800 and 390px editor widths, scaled previews, Inspect and Interact,
pointer/keyboard navigation, mobile preview menus, footer anchors, nested-item
selection and image-settings focus. The tests check header/workspace/frame bounds,
root/body/canvas/shell scroll positions and successful destination reveal. Explicit
programmatic scroll attempts verify the shell stays anchored while the inspector
and preview remain scrollable. Results, geometry and desktop/mobile screenshots
are in `artifacts/navigation-scroll/`; full Node output is in
`docs/test-results/navigation-scroll-node-tests.txt`.

The user's exact jump was not reproduced by navigation alone in the isolated
current-Chrome baseline. Source review found unrestricted ancestor-scrolling paths
and hidden-overflow containers that permitted programmatic scrolling. The fix
replaces those paths with viewport-specific scrolling and clips the outer shell;
the browser results establish the resulting containment across the tested cases.

## Section, item and inner-element deletion — September 27, 2026

| Check | Result |
| --- | --- |
| `node --test` | **315 passed, 0 failed, 0 skipped** |
| `node scripts/check.mjs` | **66 JavaScript files checked; 0 syntax failures** |
| `node scripts/deletion-smoke.mjs` | **25 browser checks passed; no observed JavaScript or CSP errors** |

Executed on Windows with Node.js **24.11.1** and Chrome **153.0.8010.53**.
Browser verification used temporary isolated server data and test-only Playwright;
no user projects or credentials were used, and **no live model calls** were made.
Full Node output is saved in `docs/test-results/deletion-node-tests.txt`; browser
results and screenshots are in `artifacts/deletion/`. The empty-page and chat
suggestion screenshots were visually inspected.

The 47 new unit/integration tests cover optional navigation/hero, empty pages,
incoming-link repair, pure immutable operations, lock and owner checks, schema
normalization, part restoration, stable item visuals, pricing highlights, library
icon restoration, all thirteen application-screen renderers, deleted form fields,
and bounded composition choices. Synthetic model responses and offline rules
verify application behavior, not live JEV instruction adherence.

Browser checks exercised canvas/inspector deletion, Delete-key behavior inside
and outside text fields, Undo/Redo/Restore, locked-section controls, stale/wrong-page
and malformed iframe requests, nested SVG/card removal, hero/navigation removal,
cross-page links, save/reopen, standalone HTML and empty-page ZIP export, rebuilding
an empty page, independently removable form labels/inputs, inspector disclosure
continuity and correct ownership of mirrored chat-suggestion labels.

Initial validation caught and corrected inspector disclosure closure, mirrored
item selection, selected-part composition targeting, and overlapping demo button
removal settings. Existing tests were updated for the intentional linked-section
repair contract and to check rendered markup for accidental `undefined` text
without rejecting legitimate JavaScript in the fixed runtime. Browser fixture
initialization was scoped to the top window to respect the sandbox's storage
isolation. Final results above are from the corrected implementation and fixtures.

## Remove saved-project branding from editor space — September 27, 2026

Removed the uppercase brand caption (`#canvas-caption` and `.live-dot`) from `.canvas-caption` in `public/index.html` and `updateHeader` in `public/app.mjs`, deleted the selected saved project from `.data/projects/`, and updated `refreshPastProjects` and `loadProject` in `public/app.mjs` to prune deleted server projects from IndexedDB so removed projects are not resurrected. Ran `node scripts/check.mjs` (**60 JavaScript files checked; 0 syntax failures**) and `node --test` on Windows (**268 passed, 0 failed, 0 skipped**; no live model calls made).

## Past projects sidebar tab and IndexedDB persistence — September 27, 2026

Added the `"Past projects"` tab (`[data-left-tab="projects"]`, `#past-projects-count`) and panel (`#projects-content`, `#sidebar-import-button`, `#sidebar-new-button`, `#past-projects-list`) to the left sidebar in `public/index.html`, styled the three-tab sidebar header and project cards in `public/app.css`, wired `IndexedDB` persistence (`forma-projects-db` / `'projects'` object store with `validateSpec` verification and server workspace synchronization) in `public/app.mjs`, and added translations across `public/locales/editor-messages.json` and all eight non-English locale modules (`es`, `pt`, `de`, `it`, `ru`, `pl`, `fi`, `sv`). Ran `node scripts/check.mjs` (**60 JavaScript files checked; 0 syntax failures**) and `node --test` (**268 passed, 0 failed, 0 skipped**) on Windows (Node.js 24.11.1; no live model calls made).

## Header/eyebrow cleanup, FAQ contact and cookie/localStorage banner — September 27, 2026

Removed the `"FROM IDEA TO INTERFACE"` sidebar eyebrow and `"JEV SITE STUDIO MVP"` top header label from `public/index.html`, added contact and cookie/localStorage FAQ entries (`#help-question-13`, `#help-question-14`, `.help-contact`) plus the bottom cookie/localStorage acceptance banner (`#cookie-banner`, `#cookie-accept-button`) in `public/index.html`, `public/app.mjs` and `public/app.css`, and translated all new strings across all nine supported locales (`en`, `es`, `pt`, `de`, `it`, `ru`, `pl`, `fi`, `sv`). Also aligned `createSpec()` default `imageSize`, removed literal `undefined` tokens from `public/site-runtime.js`, and updated test expectations so the entire test suite passes. Ran `node --test` (**267 passed, 0 failed, 0 skipped**) and `node scripts/check.mjs` (**60 JavaScript files checked; 0 syntax failures**) on Windows (Node.js 24.11.1; no live model calls made).

## Brief intro heading copy update — September 27, 2026

Updated the brief intro `<h1>` heading and `data-i18n` key in `public/index.html`, `public/locales/preview-messages.json`, and all eight locale catalogs (`public/locales/{de,es,fi,it,pl,pt,ru,sv}.mjs`) from `"Give your next idea a home."` to `"Express your ideas. Let JEV help"`. Ran `node scripts/check.mjs` (**60 JavaScript files checked; 0 syntax failures**), `node --test tests/i18n.test.mjs` (**6 passed, 0 failed**), and `node --test` on Windows (existing unrelated suite failures unchanged; no live model calls made).

## Workspace footer note clearance for FAQ button — September 27, 2026

Updated `.local-note` in `public/app.css` with `padding-left: 84px; padding-right: 16px` on desktop/tablet viewports (`> 570px`, with `72px` retained on `<= 570px`) so the "Your workspace. Your files. Saved on this computer. No account needed." block shifts right and clears the fixed bottom-left `.help-fab` (`?`) button (`left: 18px; width: 52px`). Ran `node scripts/check.mjs` (**60 JavaScript files checked; 0 syntax failures**) and `node --test` on Windows (existing unrelated suite failures in `tests/server.test.mjs`, `tests/structure.test.mjs` and `tests/i18n.test.mjs` unchanged; no live model calls made).

## Fresh projects and application UI — September 27, 2026

Source inspection only for this change. At the user's request, no tests, syntax
checks, builds, browser/runtime checks or live provider requests were run.

Implementation includes a blank server-side creation baseline, separate fresh
project saves with Undo, thirteen application screen types, typed UI controls and
local interactions, product-image editing/resizing, and JEV access to surface,
layout, visibility, count, type, copy and existing canvas operations. Source review
covered owner identity after screen/count changes, empty-item growth, preservation
of family-specific prepared content, Inspect gating, escaped rendering, and the
combined fixed-runtime CSP hash. Runtime behavior, visual appearance, persistence,
live JEV adherence and export interactions remain unverified by execution.

Older results below describe their own earlier changes; they do not verify this
application UI implementation.

## Localized app metadata and FAQ — September 27, 2026

| Check | Result |
| --- | --- |
| `node scripts/i18n-smoke.mjs` | **111 browser assertions passed; no JavaScript/CSP errors** |
| Localization tests within `node --test` | **6 passed, 0 failed** |
| `node scripts/check.mjs` | **56 JavaScript files checked; 0 syntax failures** |
| `node --test` (complete current workspace) | **216 passed, 37 failed, 0 skipped** |

Windows, Node.js **24.11.1**, Chrome **153.0.8010.53**. Browser checks used isolated
local data; **no live provider calls** were made. Results are in
`artifacts/i18n/results.json`, with FAQ screenshots in `faq-german-desktop.png`
and `faq-russian-mobile.png`. Both screenshots were visually inspected. Full Node
output is saved in `docs/test-results/faq-node-tests.txt`.

The app's title, description and keywords now describe local website editing,
bounded JEV design selection and standalone HTML export. English values exist in
the original HTML without JavaScript; all nine supported interface languages
(including English) update all three metadata fields through explicit bindings.
Exported website metadata and authored content remain independent.

The round bottom-left help button opens a native dialog with 13 questions grouped
into four topics. The expanded browser checks cover translated questions/answers,
keyboard opening and accordion expansion, Escape dismissal and focus return,
focus containment, 390px layout in every language, the round touch target,
language changes while help stays open, and unchanged project/source state.
The catalogs now contain **832 messages each**, including 38 new metadata/help
messages; coverage and named-placeholder tests pass.

The full suite retains the same **37 failures outside this change** as the prior
run: image-size normalization, composition/selection expectations and legacy
renderer assertions scanning inline JavaScript for `undefined`. They remain
visible in the saved output and have not been suppressed.

## JEV canvas capability follow-up — September 27, 2026

Source inspection only. No tests, syntax checks, browser/runtime checks or live
provider requests were executed, as instructed by the user. The implementation
adds bounded JEV targets for image sizing, section/item/part movement, compatible
transfers and individual icon replacement; stable selection; shared lock rules;
and actual-change reporting. The deterministic demo adapter has narrow local
rules and is not evidence of live JEV quality. Provider adherence, combined edits,
selection after transfers, persistence and undo remain unverified by execution.

## Editor localization — September 27, 2026

| Check | Result |
| --- | --- |
| `node --test tests/i18n.test.mjs` | **6 passed, 0 failed** |
| `node scripts/i18n-smoke.mjs` | **52 browser assertions passed; no JavaScript/CSP errors** |
| `node scripts/check.mjs` | **55 JavaScript files checked; 0 syntax failures** |
| `node --test` (complete current workspace) | **216 passed, 37 failed, 0 skipped** |

Environment: Windows, Node.js **24.11.1**, Chrome **153.0.8010.53**. The browser
run used isolated temporary app data and no provider credentials. **No live model
requests were made.** Results are in `artifacts/i18n/results.json`; desktop German
and mobile Russian screenshots are alongside it. The full suite output is in
`docs/test-results/i18n-node-tests.txt`.

All eight catalogs cover **794 interface messages** with matching named
placeholders. Focused checks verify supported/unsupported and regional locale
resolution, English fallback, literal interpolation, complete static/dynamic
message coverage, date/number formatting, fixed locale asset routes and origin
checks, and the preview script CSP hash after HTML newline normalization.

Browser checks exercise English and all eight requested languages, live locale
switching, preserved prompt/brand/source content and pending inspector fields,
translated preview controls with separate language metadata, persistence on reload,
open page-dialog values, and a 390px viewport in every language. Language switches
made no project-save, compose or connection request. Screenshots were inspected.

The complete workspace suite is **not green**. The remaining failures concern
image-size normalization and composition/selection expectations in concurrently
changing features, plus renderer assertions that search the complete HTML
(including its fixed JavaScript) for the word `undefined`. The localization tests
pass; these broader failures have not been suppressed or reported as success.
Earlier sections below describe their own historical revision and coverage.

## Drag-and-drop implementation — September 27, 2026

No tests, browser checks, syntax checks, or live provider calls were run for this
change, at the user's explicit request. Code was inspected only. New and updated
test sources are unexecuted; the earlier passing results below do not verify this
implementation.

The changes include stable item identities and migration, shared structural
operations, canvas and outline handles, Move menus, selection-aware Undo/Redo,
authored text/button/icon/image placements, and a bounded library-to-preview
bridge. Library drops support section insertion, same-family component replacement,
and explicit feature/button icon replacement. Plain text Services and Process
items can transfer between their collections when no unsupported fields or
duplicate target identity would be introduced. Hero media has selection, placement,
and image-editing controls. The Move popup is constrained to the iframe viewport.
The follow-up adds persisted sizing for hero, split-about and gallery images,
canvas resize handles, numeric controls, cover/contain fit and a default-size
reset. This follow-up was also inspected only; no tests or runtime checks ran.

Actual pointer behavior, touch, scaled preview geometry, scrolling, replay/cancel
handling, persistence and exports still require execution-based verification.
No deployment, publication, commit or PR was made.

## Historical verification — September 26, 2026

### Internal-element verification at that revision

| Check | Result |
| --- | --- |
| `node --test` | **217 passed, 0 failed, 0 skipped** |
| `node scripts/check.mjs` | **36 JavaScript files; 0 syntax failures** |
| `node scripts/elements-smoke.mjs` | **21 browser checks passed; no observed JavaScript/CSP errors** |
| `node scripts/pages-smoke.mjs` | **36 regression browser checks passed; no observed JavaScript/CSP errors** |
| `node scripts/redesign-smoke.mjs` | **100 regression browser checks passed; no observed JavaScript/CSP errors** |
| Screenshot inspection | Edited feature glyphs, centered two-column layout, removed icon and exported exact copy |

Environment: Windows, Node.js **24.11.1**, Chrome **153.0.8010.53**. Browser runs
use isolated temporary data directories and offline rules. Synthetic provider
fixtures test the live adapter contract; **no live JEV requests were made**.
The 157 repeatable browser checks use native keyboard activation inside transformed
iframes and pointer interaction in the editor. The Python browser workflow was not
rerun; its static module allowlist was updated to match the shared modules.

New Node coverage verifies legacy defaults, finite SVG/element enums, prototype and
markup rejection, per-item selection validation, exact quoted copy/link routing,
confidence guards, locks, sibling pages, compatible renderer controls, visible action
changes and actual diffs. Regressions cover wrong-section item targeting, explicit
section-heading precedence, supported icon removal, icon/card style separation,
prepared labels conflicting with custom text, and qualified colon-style text
requests being mistaken for global literal fields. The expanded decision budget is
160 questions per pass and 255 choices per question, with the same two-call limit.

The element browser test verifies SVG paths actually change, Undo/Redo, selecting
a linked item in Inspect, selection-aware composition, copy escaping, computed
columns/alignment/icon size, no-icon geometry, independent button parts, custom
label override, action hiding, save/reopen, mobile collapse and portable HTML/JSON
export. Gallery links are now exercised in Interact in the page regression test;
Inspect selects the card so it can serve as request context.

Additional focused Windows Chrome checks during implementation exercised 59
geometry/runtime assertions across the six grid families, three viewport widths,
list gaps, bridge selection and explicit choices on plain card surfaces. They
revealed CSS precedence collisions in bento column spans and pricing emphasis;
both were corrected before the final suite. These ad hoc assertions are separate
from the 157 repeatable checks above.

Evidence: `artifacts/elements/node-tests.txt`, `artifacts/elements/results.json`,
`artifacts/elements/editor-elements-desktop.png`,
`artifacts/elements/editor-elements-mobile-preview.png`,
`artifacts/elements/exported-elements.png` and the test-only exported HTML/ZIP.
The page and redesign `results.json` files were refreshed by the regression runs.
Screenshots show offline/manual results, not live model output.

## Earlier navigation and independent-page verification

| Check | Result |
| --- | --- |
| `node --test` | **171 passed, 0 failed, 0 skipped** |
| `node scripts/check.mjs` | **29 JavaScript files; 0 syntax failures** |
| `node scripts/pages-smoke.mjs` | **36 browser checks passed; no observed JavaScript/CSP errors** |
| `node scripts/redesign-smoke.mjs` | **100 regression browser checks passed; no observed JavaScript/CSP errors** |
| Screenshot inspection | Desktop blog editor, mobile page controls, exported article |

Environment: Windows, Node.js **24.11.1**, Chrome **153.0.8010.53**. Both browser
runs used isolated temporary data directories with no credentials. No live JEV
requests were made. The page smoke script uses native keyboard activation inside
the transformed sandbox iframe and pointer clicks for editor controls; it also
follows exported links from actual local HTML files.

Page coverage includes navigation jumps in Inspect, adding a section from +,
choosing among all nine starters, creating blog/article/services/custom pages,
independent themes, shared contact destinations,
per-page session locks, linking cards to hidden articles, address changes, invalid
bridge targets/channels, disabled page changes during composition, preservation of
sibling content, delete/Undo including restored incoming links, save/reload,
mobile navigation and menu closure, Escape, Interact-mode controls, whole-site
export and local-file navigation. The browser run exposed and fixed an invalid
HTML `pattern` under current Chromium's Unicode regular-expression mode.

Node coverage additionally verifies legacy migration, aggregate project limits,
reserved/traversal/duplicate filenames, link-target validation, provider-state
privacy, selected-page composition, shared brand edits preserving child titles,
whole-site checkpoint/revision behavior and portable ZIP entries.

Evidence: `artifacts/pages/node-tests.txt`, `artifacts/pages/results.json`,
`artifacts/pages/editor-blog-desktop.png`, `artifacts/pages/editor-nav-mobile.png`,
`artifacts/pages/exported-article.png`, and the test-only `artifacts/pages/website.zip`.
The regenerated redesign artifacts retain their existing locations below. Template
copy and decorative art are prepared examples, not model-generated content.

## Earlier redesign verification

| Check | Result |
| --- | --- |
| `node --test` | **141 passed, 0 failed, 0 skipped** |
| `node scripts/check.mjs` | **24 JavaScript files; 0 syntax failures** |
| `node scripts/redesign-smoke.mjs` | **100 browser checks passed; no observed JavaScript/CSP errors** |
| Screenshot inspection | Desktop editor, phone editor, editorial and product demonstrations inspected |

Environment: Windows, Node.js **24.11.1**, Chrome **153.0.8010.53**. The browser
used native navigation to an isolated loopback server, the real editor modules,
server routes and sandboxed preview. No HTTP bridge or browser-policy changes
were used for this run. The test server was started with a temporary data directory
and no credentials, then stopped. The existing user workspace data was not used.

Evidence from the current run:

- `artifacts/redesign/node-tests.txt`: complete Node test output.
- `artifacts/redesign/results.json`: browser version, transport, individual checks
  and observed errors.
- `artifacts/redesign/editor-redesign-desktop.png` and
  `artifacts/redesign/editor-redesign-mobile.png`: actual editor screenshots.
- `artifacts/redesign/editorial-1280.png`, `editorial-390.png`,
  `product-1280.png`, `product-390.png`: rendered offline demonstrations.

These images use prepared copy, original decorative CSS art and local demo
selection rules. They are not live JEV-generated sites or business photographs.

## What changed and what was tested

The Node suite includes the existing validation, provider-contract, HTTP security,
persistence, revision, checkpoint, export and all-27-component tests. Additional
coverage verifies:

- Old schema-version-one projects normalize absent presentation fields without
  changing content; normalization is idempotent.
- Invalid enums, unexpected presentation properties, nulls, objects and CSS/HTML
  injection attempts are rejected.
- Refinement preserves unrelated section design; redesign changes the visual
  system while retaining existing copy, IDs, images, review flags and brief.
- Locks protect all seven global design axes and whole sections. Journey recipes
  retain locked slots; ordering conflicts and blocked moves are explained.
- Uploaded hero/about images exclude variants that would hide them.
- Low-confidence results preserve prior values, and provider failure does not
  partially mutate the input.
- Provider context includes bounded shape metadata and excludes image bytes,
  bodies, item text, email and destinations (existing brand/tagline/title context
  remains part of the documented protocol).
- Actual change reports distinguish applied changes from returned choices and
  report literal wording changes without repeating the wording.
- At this earlier stage, choice counts remained below 100 per pass; composition used
  at most two evaluations. Synthetic usage comes from explicit test fixtures.
- New design values survive HTTP save/reopen/render/export, and unsafe values are
  rejected before rendering.
- Contrast-section token pairs exceed 4.5:1 for the tested text, muted text and
  button combinations across the six palettes. This is not a whole-site
  accessibility certification.

The browser checks verify native module loading and the sandbox runtime,
redesign reports, new manual settings, undo/redo, literal-only edits and
nonadjacent ordering through the real UI. Computed geometry checks exercise
heading scales, page width, section spacing, alignment overrides, list/card
surfaces and every supported media-bearing variant's landscape/square/portrait
frames at **390px and 1280px**. Representative full pages and the phone editor
have no horizontal overflow in those checks.

Screenshot inspection exposed a pre-existing selector collision: the outer
`gallery-grid` section was itself a two-column grid. It is now explicitly a
block container; a browser regression verifies that its inner container occupies
the full intended page width.

## Reproduce the focused browser checks

Playwright and Chromium are test-only tools. The app still has no third-party
runtime dependencies. Point these environment variables at an existing
Playwright installation and browser, then run:

```powershell
$env:FORMA_PLAYWRIGHT_MODULE = 'C:\path\to\playwright\index.mjs'
$env:FORMA_TEST_BROWSER = 'C:\path\to\chrome.exe'
node scripts/redesign-smoke.mjs
node scripts/pages-smoke.mjs
```

The script starts its own isolated server. `FORMA_TEST_ARTIFACTS` can select an
output directory. The existing Python `scripts/browser_smoke.py` remains available;
its test-only HTTP bridge includes the shared design and pages modules. That older
27-check workflow was **not rerun** during this change. Its previously documented
September 25 Linux baseline is historical evidence, not verification of this build.
The updated Python harness passed an AST syntax check only.

## Limits

- **No live TypeSafe or OpenRouter request was sent.** Provider tests use synthetic
  fixtures; demonstrations use local rules. No claim is made about live design
  quality, request adherence, latency, multilingual behavior or actual billing.
- The Windows Node/browser flow was verified. The double-click `start.cmd` and
  `stop.cmd` launch experience was not retested.
- Browser coverage is Chrome at the stated dimensions, not exhaustive cross-browser,
  screen-reader, keyboard-accessibility or responsive-layout certification.
- No formal penetration test, production load test or visual preference benchmark.
- No real email was sent; contact forms prepare mailto drafts.
- No site was deployed or published, and no commits or pull requests were created.

The next quality gate is a deliberate live brief set with user-authorized provider
usage and human evaluation. See `docs/REDESIGN-RESEARCH.md` for the proposed evaluation
and subsequent architecture steps.
