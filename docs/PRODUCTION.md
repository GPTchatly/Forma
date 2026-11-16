# Production and source releases

## Two supported runtimes

| Runtime | Storage and identity | Operation |
| --- | --- | --- |
| Native local | Private JSON directory, optional browser copies, process token | One trusted OS user; loopback only; no installation or build |
| Hosted | Projects in browser IndexedDB; signed guest-session cookies | Public Vercel app behind Cloudflare; optional operator-funded allowance and personal provider keys |

The hosted edition has no login, account synchronization or server project store.
It exposes only `GET /api/status`, `POST /api/challenge`, `POST /api/connection`
and `POST /api/compose`.
Demo composition, preview rendering and ZIP export run in the browser. Hosted
projects belong to the current origin and browser profile, including other tabs
in that profile. Clearing site data can delete them; keep important JSON exports.

This guide describes configuration and acceptance requirements. It does not
record a deployment, configured cloud account or completed live acceptance.
See [TEST-REPORT.md](TEST-REPORT.md) for checks actually run.

## Local operation

Use one server process per data directory and a standard OS account. Keep the
directory private, with sufficient disk space and protected backups. JSON and
browser project copies are unencrypted. Browser profiles, manual exports,
backups and downloaded reports have separate retention. Never store credentials
in project text or prompts. The local process token protects against unrelated
websites, not another process running under the same OS account.

Install the newest security update in Node.js 24 LTS (minimum 24.21.0) or 22 LTS
(minimum 22.23.3), and use a current browser. The startup floor is an offline
baseline reviewed September 27, 2026; it cannot detect future advisories.
Follow the [Node release schedule](https://nodejs.org/en/about/previous-releases)
and [security announcements](https://nodejs.org/en/blog/vulnerability).

Start with `node server/index.mjs` or the supplied launcher. Set `DATA_DIR` to a
private writable location and optionally `PORT`; the listener remains loopback.
Keep provider credentials in process memory where possible. Environment files
must stay private. Local throttles reset on restart. Do not publish this server
through a tunnel or reverse proxy; use the separate hosted entry point.

## Hosted configuration

Use the maintained Node.js 24 runtime on Vercel. The native startup floor and
Vercel's managed runtime patching are separate checks. Install exactly the
lockfile dependencies and build from reviewed source:

```sh
npm ci --ignore-scripts
npm test
node scripts/check.mjs
npm run build
node scripts/release-check.mjs
```

The hosted build copies an explicit asset allowlist rather than the working
directory. Zod 4.6.7 is the only approved dependency and is used on hosted server
boundaries. Redis and model providers use native HTTPS requests, with no SDK.
Do not publish `.data`, environment files, the local server or the whole checkout
as a static directory. Follow the checked-in Vercel configuration for build
output and function routing.

The checked-in `.vercelignore` also limits source uploads to exact build and API
files before the build runs; see [Vercel's upload allowlist documentation](https://vercel.com/docs/deployments/vercel-ignore).

The hosted adapter can use the existing Upstash Redis database configured by
`QWEN3_KV_REST_API_URL` and `QWEN3_KV_REST_API_TOKEN`. All application quota keys
use the isolated `forma:{quota-v1}:` namespace to avoid collisions with the other
project's keys. This is key separation, not separate authorization or capacity:
the applications share database availability, limits and the impact of a leaked
writable credential. Monitor combined usage and move to a separate database if
independent capacity or stronger isolation is needed. Use an isolated test
database for live infrastructure tests; do not run them against the shared
production database.

The functions need the writable REST token; a read-only token cannot reserve
usage. The TCP connection strings `QWEN3_KV_URL` and `QWEN3_REDIS_URL` and the
read-only REST token are unused. Fixed Lua scripts make the quota check and
reservation atomic through Redis `EVAL`; a REST pipeline alone is not
an atomic conditional reservation. See [Upstash's REST API](https://upstash.com/docs/redis/features/restapi)
and [atomic Lua operations](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http).

Set these values as server-side production environment variables in Vercel:

| Variable | Required value |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS app origin, for example `https://studio.example.com`, with no trailing slash, path or wildcard |
| `FORMA_SESSION_SECRET` | Independently generated, canonical base64url encoding of 32–64 random bytes |
| `FORMA_EDGE_SECRET` | Independent canonical base64url encoding of 32–64 random bytes, shared only with the Cloudflare request-header transform |
| `QWEN3_KV_REST_API_URL` | Existing database's HTTPS `*.upstash.io` REST endpoint |
| `QWEN3_KV_REST_API_TOKEN` | Existing database's writable REST token |
| `QWEN3_LIMIT` | Integer from 1 to 120; provider-call units per minute for session + transport IP and personal provider key; defaults to 10 when absent |
| `TYPESAFE_API_KEY` / `OPENROUTER_API_KEY` | Optional server-only operator credential enabling funded access; never copied into browser configuration |
| `JEV_PROVIDER` / `JEV_MODEL` | Optional operator provider/model selection using the same fixed-provider configuration as local mode |
| `FORMA_FREE_GLOBAL_DAILY_LIMIT` | Integer from 1 to 5000; maximum operator-funded provider calls per UTC day across the deployment; defaults to 500 |
| `TURNSTILE_ENFORCE` | Exactly `on` or `off`. Unset or any other value makes key tests and live compose answer 503 `configuration` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widget sitekey (public; the browser receives it only from `/api/status`). Cloudflare test sitekeys are refused |
| `TURNSTILE_SECRET_KEY` | Server-only Turnstile secret key for Siteverify. Cloudflare test secrets are refused |
| `TURNSTILE_SESSION_SECRET` | Independent random value of 32–512 printable characters, different from `FORMA_SESSION_SECRET`; signs the browser-check pass. Rotating it invalidates every pass |
| `TURNSTILE_ALLOWED_HOSTNAMES` | Comma-separated hostnames that must include the `PUBLIC_ORIGIN` hostname. Only that hostname is accepted from Siteverify; other entries, such as `localhost`, have no effect |

Generate secrets in a private secret-management workflow, keep them out of
terminal captures and commit history, and never give them a browser-public
environment prefix. Enter the hosted values in Vercel's server environment
settings; do not upload the local `.env` file. The deployment file allowlist
excludes every `.env` file. An optional operator key enables the funded allowance
described below; it remains server-only and is never returned to visitors.
Visitors can supply their own key in Connect JEV. After a successful connection
test it is saved in that browser's localStorage until Remove key, which also
clears it from every open Forma tab. Page load restores it into tab memory
without a request; it is sent only with explicit provider requests, and the
server still refuses it before provider work without unexpired verification
evidence. Redis never stores the key. The backend and provider necessarily
process it during those requests, so visitors must trust the host.

## Cloudflare Turnstile

With `TURNSTILE_ENFORCE=on`, key tests and live builds need a Turnstile pass.
Create a Managed widget whose hostname is the `PUBLIC_ORIGIN` host; Cloudflare
recommends that production widgets do not allow local domains. The hosted CSP
allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` only;
pre-clearance is not used, so `connect-src` stays `'self'`. The browser loads
`api.js` from that exact URL on the first live action; do not proxy or cache it.
The edge rule scoped to `/api/` already covers `/api/challenge`.

Roll out in this order. Set every Turnstile variable in Vercel's server
environment, including `TURNSTILE_ENFORCE=on`, before deploying this version:
if it is unset, key tests and live builds answer 503 `configuration` while
editing, saving, export and Offline demo keep working. After deploying, run a
key test or live build on the production hostname and confirm the check finishes
and the console shows no CSP errors. Forma sends `Referrer-Policy: no-referrer`,
and Cloudflare does not document how the widget behaves with it, so this check
on the real hostname is required. If the widget fails there, set
`TURNSTILE_ENFORCE=off` and redeploy; live JEV then works without the check
once open editor tabs are reloaded.

## Optional operator-funded access

With an operator key configured, a visitor can use up to **10 actual JEV calls
per IP per UTC day**, subject to the shared operator and deployment budgets.
A normal design reserves two calls before starting; ten calls therefore cover
at most five normal designs. Connection tests require and use a visitor's own
key and do not draw from the funded allowance. The UI displays remaining calls,
not a promise of ten two-pass designs.
One remaining call cannot fund a normal two-pass design. People behind the same
public IP share the allowance; clearing cookies or changing browser profiles
does not replenish it. Daily accounting uses Redis time and resets at UTC midnight.
New funded designs pause during the last 60 seconds of each UTC day. Status then
reports `reason: "resetting"` and the build button counts down to the reset;
personal keys, editing and Offline demo keep working.

Each funded design keeps a durable Redis receipt. The reservation carries an
immutable acceptance deadline, each provider pass is authorized in Redis before
dispatch, and the function enforces a conservative local deadline before each
fetch. Settlement closes the receipt once, retries a lost reply once, and refunds
only passes that were never dispatched. A cancelled tombstone refuses a delayed
reservation. Later status and reservation calls reconcile a bounded batch of
expired receipts and keep their authorized passes charged. An uncertain charge
is never refunded.

Omitting a compose request's key selects funded access only when the backend authorizes
it. Supplying a personal key selects BYOK explicitly and never falls back to the
operator credential on failure. When no operator key is configured, free access
is exhausted, or the operator key is unavailable, the UI offers Connect JEV.
Keys entered there are billed to the visitor's provider account.

Page load and `/api/status` do not make provider probes. They report eligibility
from configuration and Redis through `freeAllowance` (`available`, `remaining`,
`limit: 10`, `resetAt` as UTC milliseconds or null, and optional `reason`). They cannot
prove an operator key is funded before an explicit provider request. Provider
401/402/403/429 failures place that operator key on a 300-second deployment-wide
cooldown and give an actionable BYOK response. Fix the operator's access/credit
issue rather than retrying continuously or displaying a false verified status.

Operator-funded access exposes the operator's provider balance to public use.
Set a provider-side spend cap, keep the mandatory Cloudflare origin protection,
and choose `FORMA_FREE_GLOBAL_DAILY_LIMIT` before enabling it. The default is
500 actual calls/day across all free visitors; the accepted range is 1–5000.
These are request counts, not currency or token budgets. IPv6 address rotation,
multiple public IPs and automation can evade per-IP fairness, so the global
budget and monitoring remain necessary. Remove the operator key from the Vercel
environment and redeploy to disable funded access while retaining BYOK; use the
emergency API block/deployment disable procedure for active abuse.

Hosted image bytes are removed before the compose request reaches Vercel. A
fixed presence marker preserves the composer's image-aware layout constraints;
the client restores its local image bytes after validating the response. Prompts
and textual project data do reach Vercel, and the documented design context
reaches the selected provider. This is not end-to-end encrypted computation.

Use the app's real hostname consistently in Cloudflare, Vercel and
`PUBLIC_ORIGIN`. Keep HTTPS from visitor to Cloudflare and from Cloudflare to
Vercel using Cloudflare **Full (Strict)** TLS and a valid origin certificate.
Do not rewrite the request to an
unrelated Host or weaken the exact-origin check to accommodate a misconfigured
proxy. Preview hostnames require a separate complete configuration and isolated
quota database; production sessions are not valid on arbitrary preview origins.

Check Vercel's [reverse-proxy prerequisites](https://vercel.com/docs/security/reverse-proxy):
Cloudflare is supported by Verified Proxy Lite, but this does not replace the
application's edge secret or origin checks. Vercel's firewall then sees Cloudflare
addresses. Vercel warns that behind a proxy its Bot Protection can challenge
legitimate visitors and re-challenge them as proxy addresses rotate, so keep Bot
Protection off for this project and apply bot and rate controls at Cloudflare.
Test Vercel Attack Mode through Cloudflare before relying on it during an
incident. Never cache `/api/*` or
`/.well-known/vercel/*`. Preserve the documented port-80 ACME challenge exception
for `/.well-known/acme-challenge/*` so certificate validation can work. Coordinate
cache purges on deployment; retain asset revalidation instead of forcing long
cache lifetimes on filenames that do not contain content hashes. Check existing
redirect, WAF and cache rules for conflicts before enabling the app. Turn off
Cloudflare features that rewrite HTML or challenge API calls wherever they would
apply to this hostname, such as Rocket Loader, Email Address Obfuscation,
automatic Web Analytics injection and Bot Fight Mode. They inject or rewrite
scripts that the fixed Content Security Policy was not built for (Cloudflare notes
that Rocket Loader needs CSP changes), and API requests cannot answer a challenge.

## Cloudflare origin protection and rate rules

Proxy the app hostname through Cloudflare. Create a **Request Header Transform
Rule** for this app's `/api/` paths that **sets/overwrites** `X-Forma-Edge-Token`
to the value of `FORMA_EDGE_SECRET`. Never append to a visitor-supplied value,
set it as a response header or place it in browser code. Later transforms must
not replace it. Cloudflare's [request-header transform documentation](https://developers.cloudflare.com/rules/transform/request-header-modification/)
describes the overwrite behavior and rule ordering.

The API verifies this credential before contacting Redis or a provider, including
on the status route. This protects the origin API when a visitor bypasses the
Cloudflare hostname and calls a Vercel deployment URL directly. The value is a
credential: leaking it bypasses that layer, so protect operator access and rotate
it immediately if exposed. Static files may remain reachable on the Vercel URL;
that is not permission to call the API.

For an apex domain and its subdomains, the Rules-language host expression is:

```text
(http.host eq "example.com" or ends_with(http.host, ".example.com"))
```

The dot before the suffix matters. For this application, prefer the narrower
scope below so unrelated applications do not share the same limit or origin
credential:

```text
(http.host eq "studio.example.com" and starts_with(http.request.uri.path, "/api/"))
```

Where the selected Cloudflare plan permits the fields, number of rules and
60-second period, begin with these visitor-IP limits and tune from real traffic:

| Scope | Starting edge rule |
| --- | --- |
| `/api/connection` and `/api/compose` on the app host | 10 requests per minute per visitor IP |
| All `/api/` paths on the app host | 60 requests per minute per visitor IP |

These are suggested edge settings, not hard-coded application quotas. Choose
an API-compatible block response and a short mitigation period, then verify
normal use and throttling. Do not apply a low API threshold to the whole site:
one page load fetches HTML and more than 30 local assets/modules.

Cloudflare Free currently offers one rate rule, a 10-second counting period and
restricted expression fields; host matching and one-minute periods depend on
the plan. Do not enter a 10-second value and describe it as a one-minute quota.
Use only supported path criteria on that plan, choose and test an appropriate
10-second threshold, and retain the application's durable limits. Check the
current [plan availability and periods](https://developers.cloudflare.com/waf/rate-limiting-rules/)
and [rule parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/)
before applying the examples. A rule is not effective until enabled and tested.

Vercel overwrites `x-forwarded-for` and normally does not preserve an upstream
proxy's external client IP. With Cloudflare in front, Vercel's Verified Proxy Lite
treats the Cloudflare address as the client, so the header identifies a Cloudflare
address that many visitors share. The application keeps it as a separate coarse
transport control whose windows equal the deployment-wide ones, so a shared
Cloudflare address never lowers the ceiling below the global limits; visitor
fairness comes from `CF-Connecting-IP`. See [Vercel's
request-header contract](https://vercel.com/docs/headers/request-headers).

After verifying `X-Forma-Edge-Token`, the server requires a single valid
`CF-Connecting-IP` value on every hosted API route. Its HMAC-derived identity
drives the visitor limits for status, mutations, key tests and the free daily
allowance. Missing or malformed visitor IP refuses the route with a `visitor`
error before any Redis or provider work. Key-test limits also group IPv6
visitors by /64; the free allowance stays exact-IP. Never accept that header
before verifying the edge credential or replace it with an untrusted query, body,
alternate header or browser-supplied IP.

Ensure the actual Cloudflare path preserves the visitor IP. Same-zone Worker
subrequests can derive `CF-Connecting-IP` from mutable `x-real-ip`; cross-zone
Workers use a special shared address, and Pseudo IPv4 can overwrite the header.
Keep Pseudo IPv4 **Off** or **Add header**: **Overwrite headers** replaces the
visitor IP with a Class E address hashed from the IPv6 address. The application
treats it as an exact IPv4 address, so its own /64 grouping for key tests no
longer applies. The **Remove visitor IP headers** Managed Transform removes
`CF-Connecting-IP`, so every API route refuses with `visitor`.
Do not route API traffic through caller-controlled Workers or transforms
that permit visitor-identity replacement. Inspect existing Worker routes and
Managed Transforms, disable inappropriate visitor-header removal/overwriting,
and test IPv4 and IPv6 through the deployed path. These Cloudflare behaviors are
documented in [its HTTP-header reference](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
Continue to apply visitor-IP rate rules at Cloudflare as a separate burst control.

## Durable application limits and cost control

Keep Upstash's data-size eviction option disabled for the quota database. Evicting
or deleting counter keys resets limits; a full database must reject writes so
the application fails closed. Coordinate this setting with the other application
using the database. Upstash documents the distinction between durable storage
and optional data eviction in its [eviction guide](https://upstash.com/docs/redis/features/eviction).
Rotating `FORMA_SESSION_SECRET` invalidates guest sessions and changes the hashed
IP/key identities, resetting those scopes, and requires personal keys to be
tested again because verification evidence is keyed by it. It does not reset the
global counters.

The following defaults come from `hosted/quota.mjs`. Minute limits are rolling
60-second windows that replenish continuously; day limits use the Redis clock and
reset at UTC midnight. Only session, personal-key and operator-funded budgets are
daily. No status, request, key-test or deployment-wide provider counter waits for
midnight, so random sessions and keys cannot lock the service until the next day.
These rolling global limits bound request rates over time, not daily totals; tune
them against the hosting budget and load-test them before deployment.

A live compose reserves two provider units before either pass starts. A personal
key must first pass Connect JEV: a validated provider response records Redis
evidence bound to the resolved provider and exact key. Compose without current
evidence returns `verification_required` before any provider call or counter
change. Unknown-key tests use a separate probe partition and never consume
verified or funded capacity. Funded settlement returns only passes never
dispatched to the free visitor and free global daily counters, at most once. Other
burst, session and personal-key quotas retain their reserved units. A started
provider call counts even on failure or cancellation. An abandoned or uncertain
reservation remains charged, so uncertainty cannot grant extra free calls. The
displayed allowance is not a provider billing meter. `QWEN3_LIMIT` controls the
session and personal-key minute budgets; it is not a daily or currency limit. Its
default of 10 allows at most five complete two-pass compositions per minute
within either budget. A malformed configuration fails closed instead of silently
choosing a different limit.

| Budget | Default |
| --- | --- |
| Status/bootstrap per verified visitor IP | 10 requests/minute |
| Status/bootstrap per transport IP | 300 requests/minute |
| Status/bootstrap, deployment-wide | 300 requests/minute |
| Mutation API requests per verified visitor IP | 30 requests/minute |
| Mutation API requests per session + transport IP | 120 requests/minute |
| Mutation API requests per transport IP | 600 requests/minute |
| Mutation API requests, deployment-wide | 600 requests/minute |
| Key tests per verified visitor IP | 3/minute, 1 concurrent |
| Key tests per visitor network (IPv6 /64, exact IPv4) | 6/minute |
| Key tests per transport IP | 60/minute |
| Key tests, deployment-wide | 60/minute, 10 concurrent |
| Key-test cooldown after 5 credential failures per network in 15 minutes | 15 minutes, key tests only |
| Personal-key backoff after provider 402/429 | 60 seconds for that key |
| Verification evidence lifetime | 12 hours; revoked on provider 401/403 |
| Provider units per session + transport IP | `QWEN3_LIMIT`/minute; default 10 |
| BYOK provider units per personal key | `QWEN3_LIMIT`/minute; default 10 |
| Provider units per transport IP | 240/minute |
| Provider units, deployment-wide | 240/minute |
| Provider units per session | 200/day |
| BYOK provider units per personal key | 200/day |
| Free calls per verified Cloudflare visitor IP | 10/day |
| Free calls, deployment-wide | `FORMA_FREE_GLOBAL_DAILY_LIMIT`/day; default 500 |
| Shared operator provider units | 60/minute |
| New funded designs | Paused during the last 60 seconds of each UTC day |
| Funded receipt dispatch window | At most 50 seconds, ending no later than UTC midnight |
| Concurrent provider operations | 1/session, 2/personal key, 10/shared operator key, 50/deployment |
| Provider lease expiry | 60 seconds |
| Operator-key cooldown after provider 401/402/403/429 | 300 seconds |

The API reserves and decrements quotas atomically before provider work. It
releases concurrency leases in `finally`; expiry recovers abandoned leases when
a function terminates or cleanup fails. Redis failures and missing configuration
deny new work with a service-unavailable response. There is no in-memory fallback.
Provider keys and IP addresses are HMAC-derived before quota storage; Redis
retains only pseudonymous identifiers and bounded accounting metadata.

These limits bound calls, not currency. Visitors pay their provider for BYOK;
the operator pays for funded calls and Vercel, Cloudflare and Redis costs. Set provider spend caps
and Vercel/Upstash usage alerts, review current account budgets and billing
controls, and choose an explicit maximum operating budget before launch. An
alert is not a hard spending cap. Use available platform hard caps and keep a
manual response ready: block the app's `/api/` paths at Cloudflare and disable
the Vercel deployment if spending or abuse exceeds the budget. Requests rejected
by the origin can still incur platform costs. Cancellation cannot undo a provider
call already accepted or billed. No platform billing controls are configured
by the source code.

## Required live acceptance before public launch

Run these on the intended deployed hostname and record the results privately
without credentials, cookies, request bodies or personal IP addresses:

1. Confirm static delivery and API routing, exact `PUBLIC_ORIGIN`, HTTPS and
   Cloudflare proxying. Confirm API responses are never cached and session cookies
   retain `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` and no `Domain`.
   Compare the HTML served through Cloudflare with the built `dist/index.html`:
   it must contain no added scripts, such as `/cdn-cgi/` loaders, which the
   same-origin script policy would allow. Confirm the browser console reports no
   Content Security Policy violations and API responses are JSON, not challenge pages.
2. Call status and both mutation paths through the direct Vercel hostname without
   the edge credential: expect rejection before any Redis/provider call. Test
   wrong edge credentials and bypass attempts using forged forwarding headers.
3. Use two separate browser profiles. Verify distinct signed guest sessions,
   independent projects and keys, and no project sharing or credential reuse.
   Verify reload restores a tested key in the same profile only, Remove key
   deletes it, and browser projects persist.
   Verify cookies/profile changes do not reset the shared-IP free allowance.
4. Verify missing/wrong Origin, missing/invalid cookies, mismatched CSRF headers,
   oversized bodies and unexpected fields are rejected without provider calls.
5. Verify the real Vercel transport-IP behavior and Cloudflare visitor-IP rules.
   Exercise concurrency and quotas across two function instances; restart an
   instance and confirm daily limits survive. Interrupt an operation and confirm
   lease release or expiry. Disconnect Redis and confirm provider work fails closed.
   Verify missing, malformed and spoofed CF visitor headers are refused on every
   API route; test the exact Worker/proxy route, Pseudo IPv4, shared public IP,
   IPv6 spelling and /64 rotation behavior.
6. With an explicitly authorized, tightly capped test key, check connection and
   live composition, cancellation, provider failure and normal editing/export.
   Inspect a synthetic upload's request to confirm image bytes stay in the browser.
   Confirm page load/status makes zero provider calls, funded access reserves
   two design calls, unused passes settle once, started failed calls count, and
   exhausted free/global budgets offer BYOK. Verify an explicit personal key never
   falls back to the operator key. Exercise operator-key cooldown with fixtures
   or a separately authorized test setup without spending against the shared Redis.
   With `TURNSTILE_ENFORCE=on`, confirm the first key test or live build shows the
   browser check, later live actions reuse the pass, and a direct compose
   request without the pass returns `human_required` without a provider call.
   Confirm a random key sent directly to compose returns `verification_required`
   without a provider call, repeated bad-key tests reach the probe-only cooldown
   while verified and funded work continue, and saturated key tests or status
   traffic recover within a minute instead of at UTC midnight.
7. Review Vercel, Cloudflare and Redis logging/observability settings. Verify no
   provider key, edge secret, cookies, CSRF value, prompt or project payload is
   captured by application logs, tracing, WAF payload logging or error reporting.
   Verify direct-origin rejection, usage alerts and the emergency disable procedure.
8. Block `/api/status` for a browser profile and confirm saved projects open,
   editing, saving and export work, the button shows JEV unavailable, and a JEV
   build sends no compose request and produces no demo output. Near 23:59 UTC,
   confirm the funded pause, visible countdown and post-midnight recovery; check
   the deployed function's cancellation and receipt reconciliation behavior.

Synthetic local tests do not establish these deployed facts, live billing
behavior or model design quality. Source hardening is not production certification.

## Static website publication

Review all exported pages, including pages hidden from navigation, for private
information, accurate copy, image rights and intended contact destinations.
Publish the HTML pages together over HTTPS. Each embeds assets and a CSP allowing
only the fixed script hash. Preserve that policy and runtime. `project.json`
contains the creation brief, unused/removed content and original data; keep it
private unless all of it is intended for publication. Preserve MIT notices.

The chosen static host should set `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` and appropriate framing restrictions. The app does
not configure that host. Contact forms prepare email drafts; exported login,
checkout and chat screens are local interfaces, not authentication or payment
backends or connected AI services.

## Source-release procedure

1. Work from reviewed source and a patched runtime. Run `npm ci --ignore-scripts`, `npm test`,
   `node scripts/check.mjs` and `npm run build`.
2. Run `node scripts/release-check.mjs`. Resolve findings without logging matched
   values. The scanner detects common token patterns, credential assignments,
   private keys, personal home paths and non-example email addresses; it is not
   a general personal-information classifier.
3. Run `node scripts/release-source.mjs`. It archives exactly the scanned bytes,
   includes `SOURCE-MANIFEST.sha256` and prints the archive SHA-256. The binary
   favicon is visually reviewed and pinned by hash; changing it needs a new review.
4. Extract into a separate clean directory. Check local startup, install the
   lockfile dependency, and verify the tests and hosted build there. Initialize
   a new public repository from this tree when publishing a source snapshot.
5. If publishing existing Git history, inspect all branches, tags, deleted blobs,
   tracked ignored files and author/committer metadata. This checkout had no
   `.git`, so history was unavailable for review. `.gitignore` does not erase
   historical disclosures. Rotate exposed credentials before publication.
6. Configure private vulnerability reporting, secret scanning/push protection,
   branch protection and required checks on the chosen host. Source preparation
   does not create a repository, deploy an app or enable these host settings.

Share the selected source archive, not the private working directory. Packaging
excludes environment credentials, projects, tool metadata, installed dependencies,
build output, screenshots, raw logs and other artifacts. It does not delete
private local data or prove the whole working tree contains no sensitive data.
Review new prose, examples, encoded data and assets before publication. Retain
license-required public attribution and the pinned dependency's license.

## Deployment, mixed versions and rollback

Deploying this version needs no data migration: `schemaVersion` stays 2, and
nothing new is stored unless a project uses it. Projects that use only earlier
vocabulary are byte-for-byte what the previous version saves. Projects that use the
newer block ids, agent item types or a non-default section backdrop or heading
layout are forward only; see "Compatibility with earlier versions" in
[ARCHITECTURE.md](ARCHITECTURE.md). Before promoting a build, the maintainer can run
`node scripts/compat-check.mjs <previous-commit>` after `npm ci --ignore-scripts`;
it compares this tree with the previous version's own code and exits non-zero on a
failure.

- **Mixed versions during a deployment.** A tab left open across a deployment keeps
  the editor it loaded. A new editor talking to an earlier function works for
  projects without new vocabulary and is refused whole, before any provider work,
  for projects with it. An earlier editor talking to the new function sends valid
  requests, but if the composition that comes back contains new vocabulary, that
  tab's own validation refuses it after the provider calls were made; the project is
  unchanged and the call counts against the usual quotas. Static assets revalidate
  on every load, so reloading the tab fetches the new editor and ends the problem.
  The response also gains `report.alternatives`, `report.rhythm` and
  `report.strategy.recipe`, which earlier editors ignore. Treat this as a residual
  risk of any rolling deployment, not as something the service prevents.
- **Rollback.** Rolling back the code while projects use new vocabulary makes those
  projects unavailable: the earlier code refuses each whole (the local store skips
  it in the project list; a hosted browser project is refused when opened) and does
  not delete or rewrite it. Restoring the newer version makes them available again.
  No downgrade converter exists, and an export taken before the rollback has the
  same limit. Projects that use only earlier vocabulary are unaffected.

## Remaining boundaries

Rendering uses a shared allowlist, escaped text, restricted URLs, a fixed-runtime
CSP and an opaque-origin iframe with checked source/channel messages. The app
does not accept arbitrary HTML/Markdown or execute model-generated code, so it
does not add DOMPurify or an in-process code sandbox. Hosted server boundaries
use strict Zod validation plus shared semantic checks; the native local protocol
retains its dependency-free validators and cookie-free process token.

Raster metadata checks bound container dimensions and reject animation, but do
not validate every compressed pixel instruction. AVIF bitstream dimensions can
contradict container metadata; use a patched browser. Large valid local histories
can be slow to list. Browser storage is subject to profile access, eviction and
clearing. Hosted guest quotas deter abuse without proving a human identity;
attackers can create sessions and exhaust global budgets. Sustained distributed
traffic can still saturate the replenishing global windows or key-test capacity;
those recover within a minute instead of locking JEV until midnight. Exact-IP free quotas
cannot prevent address rotation or distinguish people behind one NAT. Cloudflare
controls, global operator budgets, monitoring and an operator response remain
part of the deployment boundary.
See [SECURITY.md](../SECURITY.md) for reporting and incident response.
