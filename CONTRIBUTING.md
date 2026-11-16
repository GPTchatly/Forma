# Contributing

Forma's local runtime uses native Node.js and browser modules without installation
or a build. The hosted runtime uses the single pinned Zod dependency, a static
build, Vercel, Cloudflare and Upstash Redis REST. Use the patched Node.js LTS
versions in `package.json` and read `AGENTS.md`, `README.md`,
`docs/ARCHITECTURE.md` and `SECURITY.md` before changing a trust boundary.

Run the required checks from the project root:

```sh
npm ci --ignore-scripts
npm test
node scripts/check.mjs
npm run build
node scripts/release-check.mjs
```

Use isolated temporary project storage and synthetic provider responses for
tests. Live provider calls must be deliberate and use the operator's own key.
Keep credentials out of patches, fixtures, screenshots and logs. Examples use
reserved `example.com` or `.test` addresses and invented business content.
Preserve the MIT notices and the adapted-component attribution.

Describe the changed behavior, relevant validation and any limitations in a
contribution. Add regression coverage for security-sensitive fixes. Do not
relax local loopback binding, origin checks, session/token validation, hosted CSRF
or edge-secret enforcement, atomic quota reservations, fixed provider endpoints,
schema allowlists, iframe isolation or CSP to make a test pass. Keep browser-only
project data and tab-memory visitor keys out of server persistence. Operator
credentials belong only in server environment configuration. Model and
quota fixtures verify application contracts; real Cloudflare/Vercel/Redis behavior
requires the live acceptance procedure in `docs/PRODUCTION.md`.

The hosted Redis adapter reads `QWEN3_KV_REST_API_URL` and the writable
`QWEN3_KV_REST_API_TOKEN`; TCP URLs and read-only tokens are unused. Preserve the
`forma:{quota-v1}:` namespace because the configured database can serve another
project. Use synthetic quota fixtures by default and separate test infrastructure
for authorized live checks; do not run tests against the shared production Redis.

Optional funded access must retain the 10-call IP/UTC-day limit and the global
funded budget. Tests must cover same-IP sessions, cookie resets, missing/spoofed
CF headers, atomic two-pass reservation, per-pass authorization, receipts,
tombstones, recovery, the final-minute pause, once-only refunds to free daily
counters and charging calls that started but failed. After verified Cloudflare
ingress, CF-Connecting-IP is the visitor identity for all hosted API admission;
Vercel's x-forwarded-for remains a separate transport control. Do not add a
shared daily counter that can lock JEV until midnight; use replenishing windows
and leases. Verify unverified personal keys cannot reach compose, key tests stay
in their own partition, explicit BYOK never falls back to the operator key,
status makes no provider probes, and operator-key access/credit failures
activate the shared cooldown without exposing credentials.

## Preparing source for publication

Run `node scripts/release-source.mjs` after the checks. It creates a source ZIP
under ignored `artifacts/`, including a SHA-256 manifest of the selected files.
The archive contains source, prepared examples, documentation and license notices.
The release script checks the exact bytes that are archived and rejects symbolic
links, unexpected files inside source folders, known secret formats, non-example
email addresses and personal home-directory paths. It never publishes anything.

The allowlist excludes `.env` files except the blank `.env.example`, `.data/`,
`.impeccable/`, `artifacts/`, `docs/test-results/`, `docs/screenshots/`, editor
metadata and Git metadata. These local files may contain private projects,
prompts, credentials, machine details or identifying screenshots. Do not share a
ZIP made from the whole working folder. Import the source ZIP into a clean
repository if the original directory includes private material.

The selected source scan is not a scan of the complete private working folder.
Installed dependencies and hosted build output are excluded from the source ZIP;
the lockfile reproduces the approved dependency and the build reproduces assets.
The pattern scan cannot recognize every secret or personal detail. Review new
prose, examples and visual assets, and check the manifest before publication.
The original checkout did not include Git metadata, so no historical commits
were available to inspect. If publishing existing Git history, audit all refs,
deleted blobs and tracked ignored files with a dedicated history scanner first;
`.gitignore` does not remove previously tracked files. Remove sensitive history
before publication and rotate exposed credentials as described in `SECURITY.md`.
Set your desired public Git author name and a privacy-preserving commit email
before creating the public repository. Enable a private vulnerability reporting
channel on the chosen repository host before announcing a release.
