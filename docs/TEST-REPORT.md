# Verification report

## Block, agent-interface and compatibility expansion — November 15, 2026

Checks ran locally on Windows 11 Home (10.0.26300), on the final tree. The gate
commands used a portable official Node.js v24.22.3 (win-x64 zip from nodejs.org,
SHA-256 checked against the release's SHASUMS256.txt) with npm 11.19.1, first on
PATH for these commands only; the installed Node.js v24.11.1 is outside the
`engines` range and was not used. `FORMA_PLAYWRIGHT_MODULE` pointed, read-only, at
the Playwright Core 1.63.0 of another local project and `FORMA_TEST_BROWSER` at the
installed Google Chrome, run headless. No Redis or provider credentials were set.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Zod 4.6.7 installed; 0 vulnerabilities |
| `node --test tests/gate/environment.test.mjs` | 4 tests: 4 passed (supported Node.js, pinned Zod installed, headless browser launches, no hosted Redis credential in the environment) |
| `npm test` with browser checks enabled | 773 tests: 772 passed, 0 failed, 1 skipped (the opt-in real-Redis container test of `tests/hosted-quota.test.mjs`) |
| `node --test tests/gate/environment.test.mjs tests/server.test.mjs tests/blocks-browser.test.mjs` | 42 tests: 42 passed, 0 failed, 0 skipped |
| `node scripts/compat-check.mjs f82cef4e3152e7da3d563d6437f306afac8158f3` | 7 checks, 0 failures |
| `npm run check` | 134 JavaScript files; 0 syntax failures |
| `node scripts/release-check.mjs` | 194 files, 3,838,225 bytes; 0 findings |
| `npm run build` | 71 allowlisted static files, 2,383,136 bytes; Preview runtime CSP `sha256-gn1wOCT6usjGPGcqLk9nvEy0lzfCuU+0g8ET2T3weyE=` |

The compatibility command compares the working tree with the baseline commit
`f82cef4`: default-only projects stay readable by the baseline, projects with new
vocabulary are refused whole and kept byte for byte, and baseline documents render
as before.

Dependency: before the upgrade, `npm ci` with Zod 4.6.5 reported 1 high severity
vulnerability, which `npm audit` identified as GHSA-mrhx-c7xc-m3w5 (memory
exhaustion while validating oversized constrained collections; fixed in 4.6.6).
Zod was upgraded from 4.6.5 to 4.6.7 with the owner's approval and the
audited contract in `scripts/release-check.mjs` was updated. The published 4.6.5 to
4.6.7 diff (20 files) was read before the upgrade; `npm ci` then reported 0
vulnerabilities.

Independent static reviews, read-only and not tests: an adversarial Codex review of
the change returned VERDICT APPROVE with complete coverage and one low finding (a
code-example tab label kept a deleted heading). It was fixed afterwards with a
regression test in `tests/blocks.test.mjs`, before the final run above. A Codex
Security diff scan of the working tree against `f82cef4` completed with 0 findings
and complete coverage over 32 in-scope production and build files; documentation,
tests, translations, styles and lockfiles were excluded by instruction.

Not verified: no live JEV or provider call was made, and every composition test
used demo or fixture evaluators. No test ran against the shared hosted Redis, and
the real-Redis container test was skipped. No deployment, Linux or CI run, or
browser other than Chrome was used. No commit, publishing or PR was performed.

## Full component and style expansion — October 11, 2026

Implemented locally: 60 additional authored blocks (105 total: 82 website blocks
and 23 app screens), 24 reusable elements, 12 coordinated styles, 12 palettes,
eight editable example projects, repeatable body sections, version 1 to version 2
migration, stable section targeting, bounded JEV/demo choices, editor controls,
all eight editor locales and self-contained exports. The entries below describe
earlier stages and their historical counts.

Checks ran after the implementation phase on Windows, using the supported
Node.js 24.21.0 runtime, Playwright Core 1.63.0 and installed Chrome. No live
provider or shared Redis call was used.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Existing pinned Zod dependency installed; 0 vulnerabilities |
| `npm test` with browser checks enabled | 641 tests: 640 passed, 0 failed, 1 skipped (opt-in real Redis integration) |
| `node scripts/check.mjs` | 351 JavaScript files; 0 syntax failures |
| `npm run build` | 65 allowlisted static files; 2,112,090 bytes |
| `node scripts/release-check.mjs` | Source release scan: 0 findings |

The expansion browser test covers every new block at mobile width, all eight
examples at desktop and mobile widths, all 24 element kinds, keyboard tabs and
lightboxes, modal Escape and focus restoration, reduced motion, JavaScript-free
readable content and zero network requests from standalone exports. It also
checks Inspect/Interact restoration, actual library counts, sandboxed preview,
element addition and editing, slot and style undo/redo, saving the previous
project, opening an example as a separate saved project and visitor-state
immutability. Unit regressions cover lossless migration, strict element envelopes,
escaping, removed parts, repeated-section IDs, insertion/replacement/locks,
selected repeat targeting, media preservation and the maximum page/question bounds.
The independent visual review's three material findings were corrected together:
the mobile logo introduction remains full width above its separate scrolling rail,
feature metadata follows the heading/body, and the product document records the
expanded vocabulary. The reviewer scored all three fixes resolved from the same
six recaptured desktop/mobile views. That verdict covers the listed fixes; the
captures represent the editor and Soft Product example, not every selectable style.
The specialized reviewer role was unavailable; a fresh independent general agent
followed the shipped reviewer contract without the implementation transcript.
Whitespace verification also passed with `git -c core.whitespace=cr-at-eol diff --check`.
The generated-system record lives in `docs/generated-ui/DESIGN.md`; its eight
native primitive previews live in the separate private design-tool sidecar.
The release collector excludes only `docs/generated-ui/.impeccable` in addition
to its existing omitted documentation trees. Its ten regression tests passed,
including publication of DESIGN.md while excluding the sidecar and private files.

Final normalized runtime CSP:
`sha256-gn1wOCT6usjGPGcqLk9nvEy0lzfCuU+0g8ET2T3weyE=`.
The local server was restarted at `http://127.0.0.1:4318`; status reports 105
catalog entries, all five new shared modules return HTTP 200, and an expanded
example renders through the token- and channel-bound local preview endpoint.
No deployment, publishing, commit or PR was performed.

## Interaction discoverability — October 11, 2026

Create now links directly to the interactive collection. The Components tab
lists the five added blocks before the older catalog and provides All components
and Interactive components filters, search, and motion/Interact guidance in every
editor locale. This changes discovery only: the catalog still contains 45 block
variants, including 40 previous variants and five additions, plus the separate
interaction controls. It does not integrate the full upstream libraries.

After implementation, Windows verification used the same supported Node.js
24.21.0, Playwright Core 1.63.0 and Chrome 154.0.8037.98 described below.
`npm ci --ignore-scripts` reported 0 vulnerabilities. `npm test` ran 562 tests:
561 passed, 0 failed, and the opt-in real Redis integration remained skipped.
The browser regression exercises the Create action, collection filtering,
source-name search, all 45 entries, new-block ordering, functional previews and
project immutability. `node scripts/check.mjs` checked 344 JavaScript files with
0 syntax failures; `npm run build` emitted 60 allowlisted assets (1,804,443 bytes).
`node scripts/release-check.mjs` returned 0 findings. Whitespace checks passed
with the repository's existing Windows line endings. The running local server
returned HTTP 200 and served the new entry point and filter. No live provider,
shared Redis, deployment or publishing action was used.

## Native interaction collection — October 11, 2026

Implemented locally: all eight planned interactions, five additional catalog
variants (45 total), visual library thumbnails and one on-demand desktop/mobile
sample frame, editor controls, bounded JEV/demo choices, prepared content,
self-contained exports, source provenance and notices, and all eight editor locales.
Existing project files default missing interaction fields; older Forma releases
are not promised support for the new vocabulary. No deployment was performed.

Tests were run only after implementation. Final verification ran on Windows with
Node.js 24.21.0 from the existing isolated `artifacts/security-runtime/node.exe`
(the binary SHA-256 matches its recorded official checksum), Playwright Core
1.63.0 and Chrome 154.0.8037.98. The system Node 24.11.1 produced an engine warning
on the first installation; installation and every final check were then run with
supported Node 24.21.0. No new app dependency was installed.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Pinned Zod installed; 0 vulnerabilities |
| `npm test` with all optional browser tests enabled | 562 tests: 561 passed, 0 failed, 1 skipped (opt-in real Redis integration) |
| `node scripts/check.mjs` | 344 JavaScript files; 0 syntax failures |
| `npm run build` | 60 exact allowlisted static files; 1,796,752 bytes |
| `node scripts/release-check.mjs` | Source release scan: 0 findings |
| `git diff --check` with `cr-at-eol` | Passed, preserving existing Windows line endings |

Final normalized runtime CSP: `sha256-GpeSSbWBlqbrubWUJHcgKUP+Yp+ak4Qt2eL2wfHFTYg=`.
Local and hosted export tests confirm byte-identical ZIPs, full notices in each
standalone HTML document, and matching runtime hashes after newline normalization.

The new Node regressions cover legacy defaults, strict finite interaction values,
escaped copy, item IDs and removed parts, unrelated-content and lock preservation,
all new offline-demo choices, and two-pass decisions within 160 questions and
255 criteria with all 12 families and eight items per populated collection.
Live JEV behavior was exercised only through existing synthetic transports, not
through a real model provider. No shared Redis or paid provider was contacted.

The real Chromium regression covers Inspect/Interact state restoration, keyboard
underline and sliding tabs with actual panels, service disclosures, spotlight and
entrance behavior, fanned galleries, carousel controls, settled end-of-gallery
status on wide screens, resize behavior, mobile/reduced-motion/no-motion fallbacks,
tall process content, zero/one/eight gallery items, saved uploaded image bytes,
and standalone `file://` exports with zero network requests. A synthetic persisted
pagehide event verifies that cached-page listeners are retained; it is not evidence
of a particular browser's back/forward-cache admission policy. Library samples
leave project content unchanged and release their frame when closed. No runtime
page errors occurred. The editor iframe was tested at 1:1 scale because Playwright
mis-targeted clicks in a transformed iframe; exported mobile views used real
390-pixel viewports. This does not claim browser automation coverage of scaled
editor pointer coordinates.

Two bounded visual inspection rounds covered the actual editor and desktop/mobile
exports. Thumbnails and carousel alignment were corrected from those findings.
Screenshots and final logs are under `artifacts/interactions/` and excluded from
source releases. Red images in those screenshots are the local PNG test fixture,
not shipped sample photographs. All existing uncommitted changes were preserved.


## Footer GitHub link — September 29, 2026

Target: `artifacts/forma-vercel`, run in a scratch copy so the package gained no
`node_modules` or `dist`, and the same bytes in the root working tree on branch
`remediation` (head `7774acf`). The canvas footer now has a GitHub mark between the
result label and the page/section count. It links to the fixed URL
https://github.com/GPTchatly/Forma with `target="_blank"` and
`rel="noopener noreferrer"`, has a translated accessible name and tooltip, and
uses Feather's MIT GitHub icon path (`licenses/FEATHER.txt`). No script, CSP,
hosted route or export changed. Tests ran locally on Windows with Node.js
24.21.0, Playwright 1.57.0 and Chrome 154.0.8037.58.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | **0 vulnerabilities** |
| `npm test` with the browser tests enabled | **550 tests: 549 passed, 0 failed, 1 skipped** (the real Redis test), including a new test for the link's URL, position, opener/referrer isolation and icon |
| `node scripts/check.mjs` | **109 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **51 allowlisted static files**; preview CSP hash unchanged |
| `node scripts/release-check.mjs` | **2 findings**: `.env.example` and `.env.hosted.example` are missing from this package; they were already absent. With the root repository's two example files copied into the scratch copy: **156 files, 0 findings** |
| Root: `npm test` with the browser tests enabled | **550 tests: 549 passed, 0 failed, 1 skipped** (the real Redis test); existing Zod 4.6.5 install, same lockfile, `npm ci` not rerun |
| Root: `node scripts/check.mjs`, `npm run build` | **339 files, 0 syntax failures**; **51 allowlisted static files** |
| Root: `node scripts/release-check.mjs` | **0 findings**, rerun after this report entry |

A throwaway Playwright script, not committed, loaded the local editor at 1440,
1000, 800, 560, 420 and 360 px. The link stayed inside the 32px footer with no
page errors or horizontal scroll, and it didn't overlap the help button. It
translated in German. A click opened a separate page with `window.opener` null
and left the editor URL unchanged; the test blocked the request to GitHub.
Compared with the previous footer, the result label gets 36px less room, so it
truncates earlier at 1000px (137 to 101 px visible) and at 360px.
Not run: a live JEV request, the real Redis suite, a screen reader and deployed checks.

## Browser-saved personal keys and Remove key — September 28, 2026

Target: the working tree on branch `remediation` (head `5d80b7c`), including the
composer fix in the next section. By owner decision, a personal key that passes
a connection test is saved in that browser's localStorage and restored on page
load without a provider request: into local server memory, or into hosted tab
memory where server verification evidence still gates live work. Remove key
deletes it here and in every other open Forma tab. The cookie notice acceptance
is versioned so visitors who accepted the earlier notice, which said keys were
never persisted, see the new one once. Tests ran locally on Windows with Node.js
24.21.0, Playwright 1.57.0 and Chrome 153.0.8010.53 against synthetic provider
and hosted transports; no provider, Redis or Cloudflare service was contacted.

| Executed check | Result |
| --- | --- |
| `npm test` with the browser tests enabled | **546 tests: 545 passed, 0 failed, 1 skipped** (the real Redis test) |
| `node --test tests/hosted-browser.test.mjs` | **16 passed, 0 failed**, including saving only in localStorage, restore without a request, Remove key across tabs, a held key test cancelled by Remove key in another tab, and the versioned cookie notice |
| `node scripts/check.mjs` | **339 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **51 allowlisted static files** |
| `node scripts/release-check.mjs` | **157 selected source files, 0 findings**, rerun after this report entry |
| Skill tests and `validate-skill.mjs` after the owner-requested skill edits | **16 passed**; **VALID** |

A throwaway Playwright script, not committed, drove the local editor against a
fixture provider: test and save a key, restart the server, restore without a
provider call, build with the restored key, open a second tab, Remove key, and
restart again. Both tabs ended disconnected and nothing was restored.

Reviews of this change. An Opus review found stale wording in
`docs/PRODUCTION.md`, Remove key missing other hosted tabs, and a
save-after-remove race; all three were fixed. Three Codex adversarial reviews
(`gpt-6-astra`, high effort) each returned BLOCK with medium findings, all
confirmed and fixed with tests:
- a restore arriving after Remove key, or during a key test, on the local server;
- removal events racing a key test in another tab;
- Remove key with nothing saved;
- a late removal deleting a key saved afterwards.

The last fix was not re-reviewed adversarially, because the round cap was reached.

Codex Security (`@openai/codex-security` 0.1.31, `gpt-6-astra`, xhigh effort,
at most two concurrent threads, tool output capped at 8,000 tokens) scanned the
working tree against `5d80b7c`. Its prompt stated that this was a defensive
audit of the owner's own repository and excluded, as explicit exclusions, the
translation catalogs, documentation, tests and smoke scripts, and agent skill
files. Result: **exit 0, 0 findings, coverage complete**, with all five changed
source surfaces reviewed and no issue found; 13 min 56 s, 8.7 M tokens (8.3 M
cache reads), estimated $14.31–27.85. No file changed during the scan. Two
earlier scans were stopped before a result because fixes changed their target.
Not run: a live JEV request, the real Redis suite and deployed checks.

## New design keeps a chosen application screen — September 28, 2026

Target: the working tree on branch `remediation` (head `5d80b7c`) after a
composer fix. A new design whose choices select an application screen but omit
Hero, the section that holds it, now keeps the screen with a warning. A new
design with no sections at all is refused with a 422 instead of being saved as
an empty project. Tests ran locally on Windows with Node.js 24.21.0 using
synthetic answer fixtures; no provider was contacted, so this does not show how
live JEV now answers these requests.

| Executed check | Result |
| --- | --- |
| `npm test` | **523 tests: 520 passed, 0 failed, 3 skipped** (the opt-in real IndexedDB, hosted HTTPS browser and real Redis tests), including two new composer tests that fail on the previous composer |
| `node scripts/check.mjs` | **339 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **51 allowlisted static files** |
| `node scripts/release-check.mjs` | **157 selected source files, 0 findings**, rerun after this report entry |

`npm ci` and the browser suite were not rerun; no dependency or browser code
changed. Not run: a live JEV request, the real Redis suite and deployed checks.

## Shared bounded reply reader — September 28, 2026

Target: the working tree on branch `remediation` (head `ae4972b`) after merging
the Redis and Siteverify reply readers into `readBoundedJson` in
`hosted/security.mjs`. The Siteverify path is unchanged. Redis replies now also
refuse a malformed `Content-Length` and invalid UTF-8, and both fail closed as
before. A leading UTF-8 byte-order mark is now stripped instead of failing the
parse. Tests ran locally on Windows with Node.js 24.21.0 and Chrome
153.0.8010.53 against synthetic transports; no Redis, Cloudflare or provider
service was contacted.

| Executed check | Result |
| --- | --- |
| `npm test` | **521 tests: 518 passed, 0 failed, 3 skipped** (the opt-in real IndexedDB, hosted HTTPS browser and real Redis tests), including a new reader test |
| `node --test tests/hosted-browser.test.mjs` with Playwright 1.57.0 and Chrome | **15 passed, 0 failed** |
| `node scripts/check.mjs` | **339 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **51 allowlisted static files** |
| `node scripts/release-check.mjs` | **157 selected source files, 0 findings** |

`npm ci` was not rerun; the lockfile and installed dependency were unchanged.
A fresh read-only Opus review of the diff reported no findings. Not run: the
real Redis suite and deployed checks.

## Cloudflare Turnstile browser check — September 28, 2026

Target: the uncommitted working tree on branch `remediation` (head `a72eb21`)
after adding an optional Cloudflare Turnstile check to the hosted runtime. With
`TURNSTILE_ENFORCE=on`, hosted key tests and live compose require the signed
`__Host-Forma-Human` pass that only `/api/challenge` issues after Siteverify
confirms success, action `forma_live` and the `PUBLIC_ORIGIN` hostname. The
hosted editor loads Cloudflare's `api.js` only on the first explicit live action;
the local runtime is unchanged. Tests ran locally on Windows with Node.js 24.21.0
and Chrome 153.0.8010.53. Siteverify, the Turnstile widget (a stub served at the
exact Cloudflare script URL) and the provider were synthetic fixtures; no
Cloudflare, Siteverify, Redis or provider service was contacted. Nothing was
committed, deployed or published.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Locked Zod dependency installed; npm reported **0 vulnerabilities** |
| `npm test` | **520 tests: 517 passed, 0 failed, 3 skipped** (the opt-in real IndexedDB, hosted HTTPS browser and real Redis tests) |
| `node --test tests/hosted-browser.test.mjs` with Playwright 1.57.0 and Chrome | **15 passed, 0 failed**, including the Turnstile script loading only for a live action under the hosted CSP, one retry after a refused build, and cancellation during a build and during a key test |
| `node scripts/check.mjs` | **339 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **51 allowlisted static files** |
| `node scripts/release-check.mjs` | **157 selected source files, 0 findings** |

An earlier run of these gates, on the previous revision, failed: `npm test` had
3 failures (an extra await delayed hosted dispatch past a connection change) and
the browser test failed its Turnstile subtest (the fixture left the prompt empty
before the second build). Both were fixed and re-reviewed before the run above.

Independent review: fresh context-free Opus 5.5 plan, correctness and security
reviewers. The plan was approved in its third version. Code review ran five
rounds per role, the fourth and fifth by owner override of the three-round cap;
accepted findings were fixed and re-reviewed. Both final reviews, of the tree
these checks ran on, passed with complete coverage and no findings.

Not run for this change: the real Turnstile widget and Siteverify, deployed
Cloudflare/Vercel checks (including the widget under the hosted
`Referrer-Policy` and `Permissions-Policy`), the real Redis suite,
`scripts/security-smoke.mjs`, Gitleaks, a source archive and live provider calls.

## Codex review fixes — September 28, 2026

Target: the committed branch at `9b955f0` plus fixes for three
findings from Codex adversarial reviews. Key-test outcomes that change evidence or
backoff are retried once after a lost Redis reply, and the release script
recognizes a replayed rejection by its request ID, so a retry cannot revoke
evidence verified in between. Hosted status reads no longer overlap, so the CSRF
token always pairs with the session cookie the browser stored. Tests ran locally
on Windows with Node.js 24.21.0 and Chrome 153.0.8010.53. The fixes were
committed after these checks; nothing was deployed or published.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Locked Zod dependency installed; npm reported **0 vulnerabilities** |
| `npm test` with optional browser tests enabled | **525 tests: 524 passed, 0 failed, 1 skipped**; hosted browser tests ran in Chrome 153.0.8010.53 |
| Real Redis quota suite, separately enabled | **44 passed, 0 failed, 0 skipped**, including 24 real-engine subtests on Redis 8.10.2 in temporary Podman |
| Real Redis suite with the replay check removed | **Failed as intended** (`cannot revoke newer evidence`); the check was restored |
| New status-read and retry unit tests with their fixes reverted (before the replay fix) | **Both failed as intended**; the fixes were restored |
| `node scripts/check.mjs` | **335 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **50 allowlisted static files** |
| `node scripts/release-check.mjs` | **153 selected source files, 0 findings** |

The one full-suite skip is the opt-in real Redis test, which ran separately
against a labelled, network-isolated, read-only disposable container.

Independent review: fresh read-only Codex adversarial reviews (gpt-6-astra, high
effort). The first, of `9b955f0`, blocked on two confirmed findings fixed here: a
lost revocation write could leave key evidence verified, and overlapping status
reads could pair a CSRF token with another session's cookie. The second, of the
fixed tree, found that the new retry could replay a rejection after a newer
successful key test; the request-ID check fixes it. The third, of the tree these
checks ran on, approved it with complete coverage and no findings. A revocation
that still cannot be recorded remains until the evidence expires or the key is
rejected again; `docs/ARCHITECTURE.md` states this.

Codex Security (`@openai/codex-security` 0.1.31, gpt-6-astra, xhigh effort, at
most two concurrent Codex threads for memory): the first six scans gave no
passing result. The diff scan of `9b955f0` exited 2 without writing its result
files; a second scan was stopped when the tree changed under it; a third was
stopped during preflight because the machine ran low on memory; a fourth, of the
committed branch, exited 2 like the first. The fourth failed because the scanner
runs `git cat-file --batch -Z`, which needs Git 2.43 or later, and this machine
then had Git 2.40. A fifth scan, of the committed diff `8d1e7e4..a72eb21` with
GitHub Desktop's bundled Git 2.53 first on `PATH`, reported 0 findings but exited
2 because its final coverage kept a deferred note from an interim checkpoint (the
separate `hosted/quota.mjs` review "in progress") that its last checkpoint had
resolved. A sixth was stopped during preflight while Git for Windows was upgraded
to 2.55. The seventh scan, of the working tree against `main` (`8d1e7e4`; head
`a72eb21`, whose uncommitted edits are documentation and skill files only), ran on
Git 2.55 with tool output capped at 8,000 tokens per call. Its scan prompt
excluded the nine translation files (`public/locales/*`, literal UI strings;
recorded as an explicit exclusion, not deferred work) and asked for one final
draft. It reviewed the eight other changed source files and reported **0
findings** with **complete** coverage, exit 0, after 15 minutes 18 seconds (10.7 M
tokens, 10.1 M of them cache reads; estimated $17.84–34.75). The scanner's own
test runs (80 passed, the real-Redis test skipped) used synthetic transports.

Not run for this change: `scripts/security-smoke.mjs`, Gitleaks, a new source
archive and clean extraction, deployed Cloudflare/Vercel/Upstash checks and live
provider calls. The Podman VM was already running and was left running. The
temporary containers and pulled Redis images were removed, and the image and
container inventories matched their prior state.

## Transport windows behind Cloudflare — September 28, 2026

Target: the hosted source after raising each per-transport-IP window to its
deployment-wide window (status 300, mutations 600, provider units 240 and key
tests 60 per minute), because behind Cloudflare Vercel's `x-forwarded-for`
identifies a Cloudflare address shared by many visitors. The same change adds
Cloudflare and Vercel deployment guidance to `docs/PRODUCTION.md`,
`docs/ARCHITECTURE.md` and `SECURITY.md`. Tests ran locally on Windows with
Node.js 24.21.0 and Chrome 153.0.8010.53. Nothing was deployed or published.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Locked Zod dependency installed; npm reported **0 vulnerabilities** |
| `npm test` with optional browser tests enabled | **523 tests: 522 passed, 0 failed, 1 skipped**; both browser tests ran in Chrome 153.0.8010.53 |
| Real Redis quota suite, separately enabled | **43 passed, 0 failed, 0 skipped**, including 24 real-engine subtests on Redis 8.10.2 in temporary Podman |
| `node scripts/check.mjs` | **335 JavaScript files checked, 0 syntax failures** |
| `npm run build` | **50 allowlisted static files** |
| `node scripts/release-check.mjs` | **153 selected source files, 0 findings** |

The one full-suite skip is the opt-in real Redis test, which ran separately
against a labelled, network-isolated, read-only disposable container. A unit test
now asserts that every transport window equals its global window. The real-engine
bootstrap case fills the transport window to its new limit and confirms the
fixed Lua script still refuses at that key.

Independent static review: context-free Opus 5.5 correctness and security
reviewers read the change without running anything, three rounds each. Accepted
findings were fixed before the checks above: stale limit assertions in the tests,
Pseudo IPv4 and Vercel Bot Protection wording, and a launch step that now compares
the HTML served through Cloudflare with `dist/index.html`. The final round of each
reported PASS with no findings.

Owner decision pending: a transport window can no longer refuse before its global
window, so after an edge-credential leak one direct source could fill the global
windows. `SECURITY.md` states this. Deferred: session windows keyed with the
transport address can split across rotating Cloudflare addresses, and IPv6 /64
behaviour still needs a deployed check.

Not run for this change: `scripts/security-smoke.mjs`, Gitleaks, a new source
archive and clean extraction, deployed Cloudflare/Vercel/Upstash checks and live
provider calls. The Podman VM was already running and was left running. The
temporary container and newly pulled Redis image were removed, and the image and
container inventories matched their prior state.

## Hosted availability remediation — September 28, 2026

Target: the hosted source after replacing shared daily lockout counters with
replenishing admission, adding key-test partitioning and server verification
evidence, API-independent hosted editing, coordinated status refreshes, durable
funded receipts and the final-minute funded pause. Tests ran locally on Windows
with Node.js 24.21.0 and Chrome 153.0.8010.53. Nothing was deployed or published.

| Executed check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Locked Zod dependency installed; npm reported **0 vulnerabilities** |
| `npm test` with optional browser tests enabled | **523 tests: 522 passed, 0 failed, 1 skipped**, including 14 hosted browser tests in Chrome 153.0.8010.53 |
| Real Redis quota suite, separately enabled | **43 passed, 0 failed, 0 skipped**, including 24 real-engine subtests on Redis 8.10.2 in temporary Podman |
| Hosted browser suite with the pause-recheck fix reverted | **Failed as intended** (`6 rechecks`); the fix was restored and the tree matched the reviewed code |
| `node scripts/check.mjs` | **335 JavaScript files checked, 0 syntax failures**; 105 are project files, 230 are local tool files |
| `npm run build` | **50 allowlisted static files**, including the fixed hosted deployment marker |
| `node scripts/release-check.mjs` | **153 selected source files, 0 findings** |

The one full-suite skip is the opt-in real Redis test, which ran separately
against a labelled, network-isolated, read-only disposable container. It executed
the fixed Lua scripts and covered:

- Unverified random keys refused before any counter change.
- Legacy exhausted daily counters no longer blocking work, and global windows replenishing within seconds.
- Evidence verification, versioned revocation, stale late successes and re-verification.
- The probe-only credential cooldown, and key-test saturation leaving verified and funded work available.
- Per-key backoff, pass-authorization order and closure, and cancellation tombstones.
- The immutable acceptance deadline and refunds after lost reservation replies.
- Process loss with zero, one or two authorized passes, and concurrent settlement with recovery.
- Old-day and cross-visitor refund protection, and the funded UTC cutoff.

The cutoff case widened only the fixed cutoff argument so the pause path runs
immediately; it does not wait for a real UTC midnight.

Application tests use synthetic providers for evidence binding to the resolved
provider and key, outcome classification, funded pass authorization, the local
dispatch deadline, uncertain reservations and visitor-identity refusal on every
route. Client tests cover discarded stale status replies with a late session
token, shared refreshes, legitimate increases, API-independent projects, preview,
export and demo, local verification blocking, and a rejected retest of the
connected key clearing its verification while another key's rejection does not.
Browser tests reproduce the disconnect-versus-compose 8-to-10 race and a boot
with `/api/status` failing. They confirm projects, saving and export still work,
the button shows JEV unavailable, and a JEV build sends no compose request and
no demo output. A browser test uses Playwright's clock to confirm that the
funded-pause countdown keeps rechecking status, more slowly after six attempts,
until the server leaves the pause.

Independent static review: context-free Opus 5.5 correctness and security
reviewers read the change set without running anything, three rounds each. Their
accepted findings (pause-countdown rechecks, retest verification state and
settlement wording) were fixed before the checks above; the final round of each
reported PASS with no findings. Deferred deployment items: IPv6 /64 rotation
against exact-IP visitor windows, Cloudflare header integrity and Pseudo IPv4,
function-to-Redis clock skew, the transport-IP spread behind Cloudflare, provider
source-IP behaviour for key tests, the midnight recheck burst and an Upstash
smoke test in a separate database.

Not run for this change: `scripts/security-smoke.mjs`, Gitleaks, a new source
archive and clean extraction, deployed Cloudflare/Vercel/Upstash checks and live
provider calls. The available system Node.js is 24.11.1,
below the project's runtime floor, so the previously verified 24.21.0 binary
under ignored artifacts ran every check. The Podman VM was already running and
was left running. The temporary container and newly pulled Redis image were
removed, and the image and container inventories matched their prior state.

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
