# Production and source releases

## Two supported runtimes

| Runtime | Storage and identity | Operation |
| --- | --- | --- |
| Native local | Private JSON directory, optional browser copies, process token | One trusted OS user; loopback only; no installation or build |
| Hosted | Projects in browser IndexedDB; signed guest-session cookies | Public Vercel app behind Cloudflare; optional operator-funded allowance and personal provider keys |

The hosted edition has no login, account synchronization or server project store.
It exposes only `GET /api/status`, `POST /api/connection` and `POST /api/compose`.
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

Forma starts on Node.js 18.17+ (18.x), 20.3+ (20.x) and every later release. For production use, install the newest
security update in Node.js 24 LTS (at least 24.21.0) or 22 LTS (at least 22.23.3),
and use a current browser. Older runtimes start with a notice. That baseline is
offline and was reviewed September 27, 2026; it cannot detect future advisories.
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
directory. Zod 4.6.5 is the only approved dependency and is used on hosted server
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

Generate secrets in a private secret-management workflow, keep them out of
terminal captures and commit history, and never give them a browser-public
environment prefix. Enter the hosted values in Vercel's server environment
settings; do not upload the local `.env` file. The deployment file allowlist
excludes every `.env` file. An optional operator key enables the funded allowance
described below; it remains server-only and is never returned to visitors.
Visitors can supply their own key in Connect JEV; it stays in tab
memory and is sent only with that tab's explicit provider requests. Neither
Redis nor browser persistent storage stores that key. The backend and provider
necessarily process it during those requests, so visitors must trust the host.

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
application's edge secret or origin checks. Never cache `/api/*` or
`/.well-known/vercel/*`. Preserve the documented port-80 ACME challenge exception
for `/.well-known/acme-challenge/*` so certificate validation can work. Coordinate
cache purges on deployment; retain asset revalidation instead of forcing long
cache lifetimes on filenames that do not contain content hashes. Check existing
redirect, WAF and cache rules for conflicts before enabling the app.

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
proxy's external client IP. Ordinary API/BYOK transport limits use only that
Vercel header; behind Cloudflare it may identify the proxy. Shared proxy-IP
limits may affect multiple visitors. See [Vercel's
request-header contract](https://vercel.com/docs/headers/request-headers).

The free daily allowance has a narrower, explicit exception: after verifying
`X-Forma-Edge-Token`, the server requires a single valid `CF-Connecting-IP` value
and uses its HMAC-derived identity for the free IP quota. Missing or malformed
visitor IP makes free access unavailable; it does not relax BYOK transport
checks. Never accept that header before verifying the edge credential or replace
it with an untrusted query, body, alternate header or browser-supplied IP.

Ensure the actual Cloudflare path preserves the visitor IP. Same-zone Worker
subrequests can derive `CF-Connecting-IP` from mutable `x-real-ip`; cross-zone
Workers use a special shared address, and Pseudo IPv4 can overwrite the header.
Do not route funded API traffic through caller-controlled Workers or transforms
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
IP/key identities, resetting those scopes; it does not reset the global counters.

The following defaults come from `hosted/quota.mjs`. Minute limits are rolling
windows; day limits use the Redis clock and reset at UTC midnight. A connection
test with a personal key reserves one provider-call unit and a live compose
reserves two before either provider pass starts. Funded settlement returns only
the passes that never started to the free visitor and free global daily counters,
at most once. Other burst, session and platform quotas retain their reserved units.
A started provider call counts even on failure or
cancellation. An abandoned reservation remains charged if settlement cannot
complete, so uncertainty cannot grant extra free calls. The displayed allowance
is not a provider billing meter. `QWEN3_LIMIT` controls
the session and personal-key minute budgets; it is not a daily or currency limit.
Its default of 10 allows at most five complete two-pass compositions per minute
within either budget when no connection tests consume units. A malformed
configuration fails closed instead of silently choosing a different limit.

| Budget | Default |
| --- | --- |
| Status/bootstrap per transport IP | 60 requests/minute |
| Status/bootstrap, deployment-wide | 30,000 requests/day |
| Mutation API requests per session + transport IP | 120 requests/minute |
| Mutation API requests per transport IP | 300 requests/minute |
| Mutation API requests, deployment-wide | 100,000 requests/day |
| Provider units per session + transport IP | `QWEN3_LIMIT`/minute; default 10 |
| BYOK provider units per personal key | `QWEN3_LIMIT`/minute; default 10 |
| Provider units per transport IP | 120/minute |
| Provider units per session | 200/day |
| BYOK provider units per personal key | 200/day |
| Free calls per verified Cloudflare visitor IP | 10/day |
| Free calls, deployment-wide | `FORMA_FREE_GLOBAL_DAILY_LIMIT`/day; default 500 |
| Shared operator provider units | 60/minute |
| Provider units, deployment-wide | 5,000/day |
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
2. Call status and both mutation paths through the direct Vercel hostname without
   the edge credential: expect rejection before any Redis/provider call. Test
   wrong edge credentials and bypass attempts using forged forwarding headers.
3. Use two separate browser profiles. Verify distinct signed guest sessions,
   independent projects and keys, and no project sharing or credential reuse.
   Verify reload clears a visitor-supplied key while browser projects persist.
   Verify cookies/profile changes do not reset the shared-IP free allowance.
4. Verify missing/wrong Origin, missing/invalid cookies, mismatched CSRF headers,
   oversized bodies and unexpected fields are rejected without provider calls.
5. Verify the real Vercel transport-IP behavior and Cloudflare visitor-IP rules.
   Exercise concurrency and quotas across two function instances; restart an
   instance and confirm daily limits survive. Interrupt an operation and confirm
   lease release or expiry. Disconnect Redis and confirm provider work fails closed.
   Verify missing, malformed and spoofed CF visitor headers cannot enable free
   access; test the exact Worker/proxy route, shared public IP and IPv6 behavior.
6. With an explicitly authorized, tightly capped test key, check connection and
   live composition, cancellation, provider failure and normal editing/export.
   Inspect a synthetic upload's request to confirm image bytes stay in the browser.
   Confirm page load/status makes zero provider calls, funded access reserves
   two design calls, unused passes settle once, started failed calls count, and
   exhausted free/global budgets offer BYOK. Verify an explicit personal key never
   falls back to the operator key. Exercise operator-key cooldown with fixtures
   or a separately authorized test setup without spending against the shared Redis.
7. Review Vercel, Cloudflare and Redis logging/observability settings. Verify no
   provider key, edge secret, cookies, CSRF value, prompt or project payload is
   captured by application logs, tracing, WAF payload logging or error reporting.
   Verify direct-origin rejection, usage alerts and the emergency disable procedure.

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
attackers can create sessions and exhaust global budgets. Exact-IP free quotas
cannot prevent address rotation or distinguish people behind one NAT. Cloudflare
controls, global operator budgets, monitoring and an operator response remain
part of the deployment boundary.
See [SECURITY.md](../SECURITY.md) for reporting and incident response.
