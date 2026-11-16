# Security policy

## Supported use

Forma has a native local runtime and a separate hosted runtime. The local server
binds to IPv4 loopback and uses an in-memory process token, Host/Origin checks,
bounded schemas and request limits. Run it under a trusted OS account; do not
expose it through a public tunnel, reverse proxy or shared network listener.

The hosted edition runs on Vercel behind Cloudflare. Visitors can use an optional
operator-funded allowance or supply their own provider key. It has no login,
account synchronization or server project
store. Projects stay in IndexedDB for the site's origin and browser profile.
Signed UUIDv4 guest cookies, exact HTTPS origin checks, session-bound double-submit
CSRF validation, a Cloudflare origin credential and durable atomic Redis quotas
protect its four API routes. All three `__Host-` cookies (session, CSRF and the
browser-check pass) are Secure, HttpOnly, SameSite=Strict, Path=/ and have no
Domain attribute. Guest identity comes from the signed cookie, never a client
payload; it does not prove a human identity.

With `TURNSTILE_ENFORCE=on`, key tests and live compose also require a Cloudflare
Turnstile pass. `/api/challenge` sends one widget token to Siteverify and issues
the pass only when Cloudflare reports success for action `forma_live` on the
`PUBLIC_ORIGIN` hostname. The pass is an HMAC over the guest session and exact
visitor IP that expires with the session; a new session, any other IP (also in
the same IPv6 /64), expiry or rotating `TURNSTILE_SESSION_SECRET` invalidates it.
It is stateless: there is no server-side revocation before it expires. Turnstile
raises the cost of automated use; it does not prove a unique person, and a solved
pass can be used for the rest of its session from the same IP.

The Turnstile script is the hosted editor's one third-party script. It loads from
`https://challenges.cloudflare.com` on the first explicit live action, not at
page load, and then runs in the editor's own document for the rest of the tab's
life with the same access as Forma's code. It could therefore read a personal
key typed into Connect JEV, saved in this browser's localStorage, or sent in a
later live request. Visitor keys depend
on the integrity of Cloudflare's script as well as the operator's. The widget
must run in the page it protects, so this is an accepted residual. Offline demo,
projects, preview and export never load it, and the local runtime never uses it.

Cloudflare must overwrite `X-Forma-Edge-Token` with the operator's secret on all
API requests. The API rejects missing/wrong values before Redis or provider work.
This prevents direct-origin API bypass only while that credential remains secret
and the deployed checks pass. Vercel's overwritten `x-forwarded-for` is the only
application transport-IP source. Behind Cloudflare it identifies a Cloudflare
address shared by many visitors, so it serves as a separate coarse control whose
windows equal the deployment-wide ones; it is no per-source limit if the edge
credential leaks. After the Cloudflare edge credential has been verified,
a single valid `CF-Connecting-IP` is the visitor identity for all hosted API
admission: status, mutations, key tests and the free daily quota. No fallback
visitor header or client-supplied identity is accepted. Missing/invalid CF
visitor IP refuses the API route. The deployed Cloudflare/Worker path must
prevent caller-controlled identity replacement; visitor-IP burst limits also
apply at Cloudflare. Redis outages fail closed. Visitor, provider-key and global
limits complement guest-session limits because cookies can be cleared or recreated.

Status, parsing and key-test admission use replenishing one-minute windows and
concurrency leases, so no shared daily counter can lock JEV until midnight.
Personal-key composition requires Redis evidence from a validated connection test,
keyed by an HMAC of the resolved provider and exact key and revoked with a new
version on a provider credential rejection. Unknown-key tests have their own rate
and concurrency partition. Five credential failures from one network in 15
minutes pause key tests there for 15 minutes; verified and funded work continue.
IPv6 key tests are grouped by /64. Sustained distributed traffic can still
saturate the replenishing global windows until it subsides.

Funded access allows at most 10 actual provider calls per IP per UTC day; shared
public IPs share the allowance and cookie resets do not restore it. IPv6/address
rotation can evade per-IP fairness, so this is not proof of a unique person. A
deployment-wide funded budget defaults to 500 calls/day, alongside shared operator
and global provider rate limits. Reserve two units before a design, authorize each
pass in Redis before dispatch and settle unused passes once against the free
visitor/global daily counters only; other quotas retain reservations. Durable
receipts with an immutable acceptance deadline and cancellation tombstones stop
delayed commands from charging. Started failed calls, abandoned authorized passes
and uncertain charges remain counted. New funded designs pause in the final UTC
minute. Keep provider spend caps and a tested emergency stop.

Follow [the production guide](docs/PRODUCTION.md), including deployed origin-bypass,
session, quota and logging checks, before public launch. Local synthetic tests do
not certify the cloud configuration. Exported websites can be served as static
files after content review; their login/payment/chat screens are local interfaces,
not real authentication, payment processing or connected AI services.

Use a currently maintained Node.js release that satisfies `package.json` and
install its security updates. The project currently distributes one development
line and does not promise maintenance for previous snapshots.

## Data and provider credentials

Projects and local browser backups are not encrypted. Any process or person with
access to the operating-system account may read them. Keep `.data/`, environment
files, raw reports and screenshots private, and back up important projects to a
protected location. Uploads stay in validated project data; they are not executed.

A personal key that passes a connection test is saved in that browser's
localStorage so it need not be re-entered; Remove key in Connect JEV deletes it.
Anyone using the browser profile, and any script running in the editor's origin,
can read it there, so remove it on shared computers. Page load restores it
without a provider request. In local mode it returns to server memory until
Remove key or restart; local environment-provided keys remain the operator's
responsibility. In hosted mode it returns to tab memory and passes through the
backend only for an explicit connection or live request; the server still refuses
a restored key before any provider work unless it holds unexpired verification
evidence for it. Keys are not saved in projects, IndexedDB, sessions or Redis. The
hosting operator and provider necessarily process them during requests; use
trusted operators and provider-side spend controls. Only explicit
live composition and connection tests call the selected fixed provider endpoint.
An optional operator key lives only in the Vercel server environment and the
provider request. It is never returned to a visitor. An explicit visitor key
always selects BYOK and never falls back to the operator key on failure.
Only compose requests may use the operator key; connection tests require a
personal key. Status/page-load checks do not probe the provider or verify operator
credits; provider 401/402/403/429 errors trigger a 300-second cooldown for the affected operator
key and an actionable personal-key prompt. Public funded use spends the operator's
provider balance, so the global call budget and external spend cap are essential.
Prompts and documented design context are sent to that provider. Never type
secrets or confidential personal information into a prompt.

Hosted image bytes stay in the browser; live request payloads use a fixed
image-presence marker. Textual project context and prompts still reach the hosted
backend. Browser storage is shared by tabs in the same origin/profile and can be
read by someone with profile access. There is no cross-device recovery service.
Redis holds pseudonymous quota identifiers and accounting metadata, not raw
keys, IP addresses, prompts or projects. Review hosting, WAF and tracing settings
to prevent request-header or body logging; application redaction alone cannot
control third-party observability settings.

The configured Redis database may also serve another project. Forma uses the
`forma:{quota-v1}:` key namespace; this prevents collisions but does not isolate
database capacity or limit the writable credential to those keys. Protect that
credential for both projects and assess the impact on both if it is exposed.
Hosted functions use the writable REST URL/token supplied through Vercel server
environment settings, never a deployed copy of the local `.env` file.

## Reporting a vulnerability

Use the source repository host's private vulnerability-reporting feature when
the maintainer has enabled it. This source snapshot has no configured private
reporting address. If that feature is unavailable, request a private reporting
channel from the maintainer without including exploit details or sensitive data
in a public issue. Include the affected version, reproduction steps, impact and
a minimal synthetic example once a private channel is available.

Never attach real keys, private projects, full user logs or identifying
screenshots. Preserve license attribution when reporting third-party code issues.

## Credential exposure response

1. Revoke or rotate the exposed key at its provider immediately; deleting a file
   or commit does not make a leaked credential safe.
2. Disconnect affected provider keys, remove compromised environment values and
   restart/redeploy affected processes. Rotate an exposed edge credential in
   both Cloudflare and Vercel, then verify direct-origin rejection. Rotating the
   session secret invalidates all guest sessions and changes keyed quota IDs;
   keep the global quota in place and monitor usage during that transition.
   Check provider usage and revoke unexpected access.
3. Remove the value from public files, release archives, logs and Git history as
   appropriate. Coordinate a history rewrite with repository maintainers.
4. Record the date, affected service, exposure surface, revocation confirmation
   and remediation in a private incident record. Never put the key itself in it.
5. Rerun the release checks and review the new release manifest before sharing.

The release gate reports file locations and finding categories without printing
matched values. A passing scan is supporting evidence, not a security guarantee.
