# Repository working rules

Forma is a local-first Node/browser site builder driven by bounded JEV choices.
Read README.md and docs/ARCHITECTURE.md before changing the flow. The native local
runtime remains dependency-free; the hosted runtime has the user-approved pinned
Zod 4.6.7 dependency, Vercel functions and Upstash Redis REST behind Cloudflare.

- Preserve installation-free local startup and native ES modules. Hosted deployment
  uses the explicit allowlisted build and locked Zod dependency; add no further
  dependency or provider/Redis SDK without approval. No runtime CDN, remote fonts
  or dynamically installed packages. The one owner-approved exception is the hosted
  editor's Cloudflare Turnstile `api.js`, loaded from its exact Cloudflare URL only
  on the first explicit live action (key test or live build), never at page load
  or in the local runtime. Once loaded it runs in the editor document and could
  read a typed or browser-saved personal key; that residual is documented, not
  prevented.
- Live JEV must call the real fixed endpoint; never silently fall back to demo.
  Fixture responses belong only in tests. Do not invent confidence or token usage.
- JEV is text-only and selects existing designs. Never describe prepared copy,
  abstract art, local demo rules or manual changes as JEV-generated content.
- All imported or model-influenced data must pass shared/schema.mjs. Keep the
  renderer allowlisted, escape text, restrict URLs, and never accept user script.
- Preserve fixed runtime CSP hashing, iframe sandboxing, message source/channel
  checks, local loopback binding, same-origin/Host validation and local API tokens.
- Hosted API identity comes from signed `__Host-` guest cookies; preserve Secure,
  HttpOnly, SameSite=Strict, Path=/, no Domain, exact HTTPS origin and bound CSRF
  double-submit checks. Require the Cloudflare-overwritten edge secret before
  Redis or provider work on every hosted API route. Use Vercel's overwritten
  x-forwarded-for as a separate coarse transport control. After verified Cloudflare
  ingress, accept exactly one valid CF-Connecting-IP as the visitor identity for all
  hosted API admission: status, mutations, key tests and the funded daily quota.
  Missing/invalid visitor IP refuses the hosted API route; never trust alternate
  client IP inputs. Key-test throttles also group IPv6 visitors by /64; funded
  quotas stay exact-IP. Keep the Cloudflare Worker/header path protected from overrides.
- Use strict Zod hosted envelopes, byte/aggregate caps, durable atomic Redis quotas,
  expiring concurrency leases and fail-closed behavior. Status, parsing, key-test
  and verified-work admission use replenishing rolling windows and leases; never
  add a shared anonymous, personal-key or deployment-wide daily counter that can
  lock the service until midnight. Keep server modules outside the browser build
  and never expose the local project API in hosted mode.
- Hosted Redis uses `QWEN3_KV_REST_API_URL` and writable `QWEN3_KV_REST_API_TOKEN`.
  Preserve the `forma:{quota-v1}:` namespace in the shared database; TCP URLs and
  read-only tokens are unused. Do not run live tests against that shared database.
  Set secrets in Vercel server environment settings; never deploy local `.env` files.
- Do not log, export or expose API keys. By owner decision, a personal key that
  passes a connection test is saved in that browser's localStorage
  (`forma:api-key` local, `forma:hosted:api-key` hosted) until Remove key deletes
  it; never in projects, IndexedDB, exports, cookies, sessions or Redis. Page load
  restores it without a provider request: into local server memory, or into hosted
  tab memory as an unverified key that server verification evidence still gates.
  Hosted keys travel only with the current explicit provider request. An optional operator key is server-environment-only. Explicit BYOK
  never falls back to the operator key. Page load/status must never probe a provider.
  Only compose can use the operator key; connection tests require a personal key.
  Personal-key compose requires Redis verification evidence: an HMAC of the resolved
  provider and exact key, recorded only after a validated connection test, expiring
  and revoked with a version on credential rejection so late successes cannot restore
  it. Unknown-key tests keep their own rate/concurrency partition and a probe-only
  cooldown after repeated credential failures; they never use verified/funded capacity.
  Preserve free 10 actual calls/IP/UTC-day, global funded budget, atomic reservation
  and once-only unused-pass settlement against free daily counters; other quotas
  retain reservations and started failed calls count. Funded work keeps durable
  per-visitor receipts (active/closed/cancelled tombstone) with an immutable
  acceptance deadline, Redis authorization of each pass before dispatch, idempotent
  settlement retried once, bounded expiry reconciliation that keeps authorized or
  uncertain passes charged, and no new funded design in the final UTC minute. Hosted
  projects stay in browser IndexedDB; opening, editing, saving and export never wait
  for the API. The fixed build marker selects hosted startup; live JEV shows
  checking/unavailable and never silently falls back to demo. Status responses
  older than a connection or live change must not replace newer allowance state.
  With `TURNSTILE_ENFORCE=on`, hosted key tests and live compose require the signed
  `__Host-Forma-Human` pass, bound to the guest session and exact visitor IP and
  expiring with the session; a request without it is refused before Redis, body
  or provider work. Only `/api/challenge` issues it, after Siteverify confirms
  success, action `forma_live` and the `PUBLIC_ORIGIN` hostname. Status never
  requires a pass or calls Siteverify. `off` is the only opt-out; unset or
  invalid Turnstile settings fail closed for live routes.
  Upload bytes are excluded from JEV state and hosted compose transport. Only
  explicit live/test actions contact the provider.
- Add components through catalog + renderer + CSS + prepared content + tests.
  Preserve relevant MIT notices and distinguish adapted from original work.
- Locks, project revision checks, checkpoint bounds and failed-request immutability
  are enforced outside the model. Preserve them when changing composition.
- Run `npm test`, `node scripts/check.mjs`, `npm run build` and
  `node scripts/release-check.mjs` after the change phase (`npm ci --ignore-scripts` first for the
  hosted dependency). The test script scopes Node to `tests/*.test.mjs` so extracted
  release artifacts are not recursively retested. Update
  docs/TEST-REPORT.md only with checks actually run. Never imply a live model test
  from a synthetic transport fixture or a Windows test from a Linux run.
- Keep changes local; no deployment, publishing, commits or PRs unless requested.
