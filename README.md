# Forma - JEV-aided Website Site Studio

A local-first website and application UI builder aided by JEV-classifier. Describe a website or
frontend; JEV selects its design settings, component variants, typed fields and
panels, internal UI elements and section order. Edit the result, save projects,
and export standalone HTML.

<p align="center">
  <img src="./Forma_video_intro.gif" alt="Forma JEV-based website editor Intro" width="800" />
</p>

## Start on Windows

1. Have **Node.js 18.17 or newer** installed; any later version works except the
   short-lived 19.x and 20.0–20.2 releases. Forma prints
   a one-line notice, but still starts, on a release older than the security
   updates it was reviewed with (24.21.0 in 24.x, 22.23.3 in 22.x).
2. Extract the entire ZIP to a normal folder. Do not run it inside the ZIP viewer.
3. Double-click **`start.cmd`**. Keep its terminal window open.
4. The app opens at **http://127.0.0.1:4318**.
5. Click **Connect JEV**, enter your TypeSafe or OpenRouter API key, and test the connection.
6. Write a request and click **Build with JEV**.

There is **no package installation, build step, Docker, database server, Python or
cloud deployment required to run the local app**. Its runtime uses native Node.js
and browser APIs. Hosted deployment uses the pinned Zod dependency, `npm ci --ignore-scripts`,
`npm run build`, Vercel, Cloudflare and an Upstash Redis database.

To stop, press **Ctrl+C** in the server terminal or double-click **`stop.cmd`**.
The stop script contacts this application's local shutdown endpoint; it does not
kill other Node.js processes.

### Command-line alternative

```sh
node server/index.mjs --open
```

`npm start` does the same thing. On macOS/Linux, `sh start.sh` also starts the app.
All commands should be run from the extracted app folder.

### Try it without a key

Choose **Offline demo** beside the design-operation selector, use an inspiration
card or write a request, and click **Build offline demo**. You can edit, save,
reopen and export the result. Demo reports show zero JEV API calls and no invented
model confidence. Demo rules are intentionally basic; they are not a substitute
for evaluating the live model.

## What is included

- 40 editable, free MIT-licensed components across 12 section families: navigation,
  hero, features, about, services, gallery, process, pricing, FAQ, contact, CTA and footer.
- Application screens for login, signup, chat, dashboards, tables, boards, settings,
  inboxes, calendars, storefronts, checkout and document editing, plus a custom
  workspace combining typed fields, lists, metrics, products and actions.
- HyperUI-derived pricing, card/gallery, FAQ and CTA blocks, plus original
  theme-aware compositions. These are local HTML/CSS implementations, not a React
  or Tailwind package downloaded at runtime. License notices are included.
- Six coordinated palettes, three typography presets, heading scale and page width,
  spacing and corner controls, plus explicit motion settings. Sections have their
  own background, alignment, spacing, card treatment and image proportions.
- Two-pass live JEV composition: design direction, visitor journey and theme first;
  content-aware component variants, section presentation and internal elements second. Explicit
  order changes use shared move choices; normal page flow uses bounded journeys.
- New design starts with an empty composition and a fresh project, using only the
  new request. The previous project stays saved and the canvas can be restored with
  Undo. Its copy, images, brand, pages and locks are not inherited. Focused
  refinement and deeper redesign remain available. Redesign rethinks
  unlocked visual choices while preserving existing content and assets. Design
  locks and section locks are applied in ordinary code, outside the model.
- A real HTML preview at desktop, tablet and mobile widths. Navigation links jump
  to their destinations in Inspect and Interact modes. The navigation **+** menu
  adds sections or independent pages directly from the canvas.
- Up to eight related pages with independent sections, copy and design. Custom,
  About, Services, Portfolio, Pricing, FAQ, Contact, Blog and Article starters
  share the project brand. Page
  navigation, article cards and buttons can link to other pages.
- Manual text, link, item, component, layout and image editing. Images are resized
  locally, embedded in the project and not sent to JEV.
- A local element library inside blocks: individual feature SVG icons, card columns
  and alignment, icon treatments, numbering, featured pricing, action visibility,
  and independently selectable button container, icon, prepared label and label style.
  Click an item in Inspect to use it as request context; choose Interact to follow its link.
  Supply exact replacement wording in double quotes to edit existing item or section text.
- Undo/redo, autosave, project management, JSON import/export and saved checkpoints.
- Delete any section, including navigation and hero, or individual cards, fields,
  headings, descriptions, icons, images and button parts. Use the canvas Delete
  control or the Content inspector's element list; Delete/Backspace works in
  Inspect outside text fields. Inner parts retain their saved content for Restore;
  Undo restores whole sections and cards. An empty page can be saved, exported and
  rebuilt with Add a component. Links to deleted sections are repaired together.
- Inspect-mode grips and Move menus for sections, repeated items, and authored
  text, icon, button and hero-image placements. Library grips insert sections,
  replace same-family components, or replace feature/button icons explicitly.
  Compatible plain text Services and Process items can move between collections.
- A Decisions tab with actual returned choices, distributions, token usage and
  measured composition time, plus the applied before/after design changes.
  Reports can be downloaded as JSON.
- ZIP export containing self-contained HTML for every page, project JSON, source
  reference copies and license notices. No CDN assets, external fonts or build tools needed.

## Suggested first request

```text
Brand: "Studio North"
Headline: "Make space for good work."
Tagline: "A small independent studio for thoughtful digital experiences."
Button: "Start a conversation"

An editorial website for a design studio. Warm ivory background, elegant serif
headings, a split hero, a selected-work gallery, services, our process, FAQ and
contact. No pricing. No animation.
```

After the first design, try:

```text
Switch to the sage palette. Keep the typography. Move the gallery before services.
Replace the hero with a centered layout. Remove pricing.
```

Set palette/typography locks in the Design tab when you need a choice to remain
unchanged. Lock an individual section to preserve it across JEV requests.
Manual edits remain available even for locked design settings. Section locks
protect a section from model changes, removals and layout replacement; they are
not an access-control mechanism.

### Arrange content directly

In **Inspect**, click content and use its selection breadcrumb to choose the
section, card or inner part. Drag the grip or open **Move…**. Navigation, Hero and
Footer stay anchored; locked sections stay in their structural slots and their
contents require unlocking before structural moves. Ordinary text, icon and
settings edits remain available. Each completed move is one Undo step.

Select a hero image to move it before/after the text. Hero, split-about, gallery
and uploaded application product images have a corner resize handle in Inspect. **Resize image…** opens keyboard
controls for width (25–100% of its area), height (80–1200 px, or Auto), and image fit.
Choose **Show whole image** to avoid cropping, or **Reset image size** to restore
the component defaults. Unlock the section before resizing. Each completed resize
is one Undo step, and the size persists in saved projects and exports.
**Edit image…** also opens upload, replacement and alternative-text controls.
Centered heroes remain text-only.
Move menus stay inside the preview, including narrow or scaled canvases.

In the library, drag a component's grip onto a compatible canvas position, or use
**Insert or replace…**. An existing section family can change component while
retaining its content. Switching application screen types installs the new screen's
prepared fields; Undo restores the previous screen. Feature and button icon groups offer explicit replacements;
pricing-card button icons can be changed individually. The destination menus are
also usable when the editor shows one panel at a time.

Cross-container transfers currently share a plain text format between Services
and Process only. Items with a price, caption, image or custom icon cannot transfer;
neither can items whose destination is locked, full or already contains that ID.
Numbering follows the destination sequence. Cards are not silently converted
between unrelated component types.

See the current verification results and remaining coverage gaps in
`docs/TEST-REPORT.md`.

### Build an application frontend

Choose **New design** and request, for example, `Make a frontend for a login form`
or `Make a ChatGPT-style chat interface with a sidebar and a dark theme`. Other
examples include an admin dashboard, task board, searchable table, inbox, calendar,
storefront or a custom workspace. These are supported frontend requests.

Use **Interact** to try the local controls: form validation and password visibility,
conversation creation and message entry, search, sorting, tabs, task status, local
item creation, cart contents and document preview. Export includes the same fixed
runtime. Interactive state is local to the open page; it is not a database, live
authentication, payment processor or connected AI model.

JEV can choose screen layout, visible navigation/search/tabs/metrics, field or panel
types, and one to eight saved application items. Item count changes append or trim
from the end. The Content inspector edits labels, placeholders, options and values;
exact quoted replacements also work through JEV. For a new brand, include
`Brand: "Your name"` in the request. Prepared wording remains editable draft copy.

### Redesign an existing site more deeply

Select **Redesign current site**, then describe the audience, the action visitors
should take, the visual direction and what must stay. For example:

```text
For independent architects choosing a design partner. Lead with our selected
work, then explain our approach and invite a conversation. Make this feel like
an editorial studio: dramatic headings, a wide page, generous spacing,
landscape images, quiet service lists and one contrasting contact section.
Keep our copy, images and palette.
```

Lock the palette if it must remain exact. Redesign gives JEV room to reconsider
layouts and presentation together; **Refine current design** remains appropriate
for a small correction. Existing copy, links, images and review flags are retained
on surviving sections; explicit quoted replacements and section additions/removals
still apply. Uploaded hero/about images are protected from layout swaps that would
hide them. JEV receives image-presence metadata, not the images themselves.

Inspect the applied changes in **Decisions**. Select any section to adjust its
presentation manually, or undo the request. Named directions and visitor journeys
are bounded design choices, not generated prose or a visual quality assessment.

See [the research and roadmap](docs/REDESIGN-RESEARCH.md) for the ideas adapted from
json-render, Relume, Puck, GrapesJS, Onlook and Framer, and the next architectural
steps beyond this implementation.

### Content is deliberately separate from design

JEV selects from bounded choices; it does not generate prose, images or source
code. The initial text is **prepared draft copy**, not a claim about your business.
JEV can use the same image sizing and supported movement controls as the editor.
For example: `Make this image 60% wide and 387px tall`, `Move gallery before
services`, `Move the third feature card first`, or `Move this item's description
before its heading`. Select an image or element for “this” references; named
sections and ordinal items also work as request context. Requests support up to
four targeted actions; one resize can set width, height and fit together. Locks,
fixed sections and compatible-transfer rules apply. Images remain local; JEV
receives sizing and placement metadata, not image bytes or image understanding.

Use the Content tab, the exact quoted fields `Brand:`, `Headline:`, `Tagline:`
and `Button:`, or a targeted request such as `Change this item title to "Built for you"`
to supply your own wording. Straight or curly double quotes are accepted. Choose
an item in Inspect for context. The button text catalog also offers prepared labels.
See [internal element editing](docs/ELEMENT-EDITING.md) for supported parts and limits.
Review all sections before publication; the export dialog flags
unreviewed copy and uploaded images without alternative text.

Use the language selector in the header to switch the editor between English,
Spanish, Portuguese, German, Italian, Russian, Polish, Finnish and Swedish. The
first visit follows a supported browser language; an explicit choice is remembered
on this browser. Switching updates editor controls, help, dialogs, catalog labels
and canvas editing tools without changing a project or making a model request.
Portuguese uses European Portuguese wording; regional browser tags such as `pt-BR`
select the same Portuguese interface.

The app title, description and keyword metadata follow the selected interface
language and describe Forma's local editing, JEV design selection and HTML export.
Use the round **?** button in the bottom-left corner for the translated FAQ. It
covers getting started, provider costs, local storage, editing, saving and export.
Open questions with the keyboard and press Escape or Close help to return to work.

Website copy, prepared starter text, prompt examples and saved page titles remain
as authored. The editor language is separate from the **HTML language code** in
Brand settings, which only sets page metadata. It does not translate the website.
Raw provider reports and backend validation diagnostics retain their original
wording. Local demo rules and explicit omission guards are English-oriented;
live model interpretation of other languages has not been benchmarked here.

The abstract visuals are original decorative CSS compositions. Upload your own
images when you need real people, products, work samples or property photographs.
Do not present the placeholders as photographs of an actual business.

### Contact, navigation and interaction

Navigation targets are derived from the sections and visible pages actually present.
Clicking a navigation link in Inspect mode selects and scrolls to its destination;
page links switch the editor to that page. Use **+** in the preview navigation to
add a missing section or create a page. **Add page** above the canvas works even
when the current page has no navigation section.

Use the page selector to move between pages. **Page settings** changes a page's
title, address or navigation visibility, or deletes it with Undo available. Home
keeps `index.html`. Other pages export to their chosen address, such as `blog.html`.
Changing an address keeps existing page links connected. Hidden navigation pages
are still exported and accessible; hiding them is not access control.

Choose an **About**, **Services**, **Portfolio**, **Pricing**, **FAQ** or **Contact**
starter for a prepared section layout, or **Custom page** for a minimal starting
point that you can build with any catalog sections. A template is only a starting
point; you can rename the page, change its design and add or remove sections.

To make a blog, add a **Blog index**, then add **Article** pages. On the blog, select
the gallery and choose an article in each card's **Card link** dropdown. Articles
are hidden from navigation by default but can be shown in Page settings. These
are static, editable pages; there is no dynamic CMS, feed or publishing service.
JEV design requests affect the selected page only. Brand settings and the primary
brand action are shared; content and theme controls are independent. Theme locks
are remembered per page for the current editor session.

FAQs use native
expand/collapse controls. The contact form **prepares a draft in the visitor's email
app**; it does not submit, deliver or store a message. Configure a public email
address in Brand settings to enable it. A visitor needs a configured email app.
External navigation is disabled inside the sandbox preview and works in the
exported website. Use an HTTPS booking/contact link to connect an existing service;
this builder does not implement that service.

## API key and configuration

The easiest option is **Connect JEV** in the app. You can paste either a TypeSafe
API key or an OpenRouter API key (`sk-or-v1-...`). In the local app, the key is held
in the running Node.js server's memory; restarting clears a dialog-entered key.
In hosted mode, it stays in the current tab's memory and travels through the
hosted backend only for that tab's explicit connection or live-design request.
It is never saved in localStorage, IndexedDB, project files or quota records.
Reloading or closing the hosted tab clears it. The hosting operator and provider
necessarily process a supplied key; use an operator you trust and provider spend
limits. A connection test makes a small real API request.
In hosted mode, an operator may fund a limited free allowance. The JEV control
shows remaining calls: up to 10 actual provider calls per IP per UTC day, shared
by visitors using that public IP. A normal design needs two calls, so the full
allowance covers at most five normal designs. Connection tests require and use
your own key. Unstarted reserved calls are returned to the free allowance after
settlement, while started calls count even when they fail. Abandoned reservations
can remain charged; the displayed allowance is not a provider billing meter.
Clearing cookies does not reset the IP
allowance. If free access is unavailable, unfunded or exhausted, use **Connect
JEV** with your own key. An explicitly supplied key always uses that account;
it never silently falls back to the operator's key.

Page load and status checks do not probe or bill the model provider. Free
availability is initially an eligibility check, not proof of the operator key's
current credit or validity; the first explicit request establishes that. Provider
authentication/access/credit or rate-limit failures temporarily disable the affected operator
key and prompt for a personal key. TypeSafe/OpenRouter bills whichever account's
key was used. Free UI components do not make provider usage free to the operator.

For the local app, alternatively copy `.env.example` to `.env` and add:

```dotenv
TYPESAFE_API_KEY=your_own_typesafe_key
OPENROUTER_API_KEY=your_own_openrouter_key
JEV_MODEL=jev-1.13.0
PORT=4318
DATA_DIR=.data
```

Local shell environment variables take precedence. `.env.local` is loaded before `.env`.
A disconnect disables both the in-memory key and the environment key for the
current process; restart to reload an environment key. Never share a real `.env`.

Live requests use the fixed endpoint `https://api.typesafe.ai/v1/systemone` for
TypeSafe keys (default model `jev-1.13.0`) or `https://openrouter.ai/api/v1/systemone`
for OpenRouter keys (default model `~typesafe/jev-latest`, with `typesafe/jev-1.13`
and `typesafe/jev-router` also supported) with `Authorization: Bearer ...`. You may
deliberately change `JEV_MODEL` in `.env` when needed. There are no automatic
billable retries or silent demo fallbacks.

## Saving, checkpoints and export

Local projects are stored under `.data/projects/` in the app folder by default. Automatic
saves are debounced. Save checkpoint keeps an explicitly restorable snapshot;
Ctrl+S is the keyboard equivalent. A completed design also checkpoints the previous
saved version. Up to 10 checkpoints and approximately 20 MB of checkpoint payload
are retained per project; export important versions to keep them indefinitely.

The workspace supports up to 100 projects. Each specification supports at most
eight pages including Home, 12 sections per page (one per section family), and
eight items per section. The complete multi-page specification
is capped at 4 million JSON characters, with a local HTTP body cap of 4.4 MB.
Hosted live compose has a separate 2 MB image-free request cap. Image uploads
are downsampled locally. When space is tight, use fewer/smaller images.

Concurrent edits in another tab are rejected with a revision conflict instead of
silently overwriting that tab. Export your current JSON before reloading the saved
version when a conflict is reported. Project files are replaced atomically.
Run only one local Forma process against a given data directory. Project creation and
revision checks are serialized in that process. Corrupt project files still count
toward the 100-project workspace limit and are preserved for recovery.

Hosted projects and checkpoints live in IndexedDB, scoped to the site's origin
and browser profile. They are shared by tabs in that profile, not by other
visitors or devices. There is no account synchronization or hosted project store.
Clearing site data, changing origin or losing the browser profile can remove
access to them; export important projects as JSON. Hosted demo composition,
preview rendering and ZIP export run in the browser. Live requests strip image
bytes before reaching the backend and restore local images into the validated
result; prompts and textual project context still cross that boundary.

**Project files contain your copy, the original creation brief and uploaded images.**
Checkpoint labels also retain a shortened request. Refine-request transcripts and
full decision reports are not persisted as part of the project. Reports in the
Decisions tab are session-only; download them to keep them. A reopened project does
not pretend to have a fresh JEV report.

The website export includes:

```text
index.html              Home page; CSS, runtime and images are inline
<page-address>.html     Each additional page, with its own inline design
project.json            Reimportable editor specification
source/site.css         Reference CSS, including the current design tokens
source/pages/*.css      Reference CSS for additional pages
source/site.js          Reference copy of the fixed runtime
LICENSE.txt             Original code license
licenses/HYPERUI.txt     HyperUI attribution and MIT license
README.txt              Publication and export notes
```

Open `index.html` directly to inspect it, or place all HTML pages together on a
static website host. Relative page links work in either location.
The files under `source/` are reference copies, not linked assets. Editing those
copies alone does not change the inline version in `index.html`. Keep license
notices when redistributing source; do not upload `project.json` when its content
is private. There is no automatic hosting or deployment integration.

## Privacy and security scope

The local editor binds only to **127.0.0.1**. Its API routes check an application
token and Host/Origin. The hosted edition uses signed guest-session cookies,
exact HTTPS origin checks, session-bound CSRF tokens, a mandatory Cloudflare
origin secret and atomic Redis quotas. Guest cookies identify a browser session;
they are not user accounts or proof that requests came from a human.

Static routes and hosted build assets are explicitly allowlisted. User strings are
escaped, links and image types are restricted, and arbitrary HTML, JavaScript,
remote CSS and package installation are not accepted from the prompt or model.
The sandboxed preview does not have same-origin access to the editor. Its fixed
runtime is authorized by a CSP script hash. Exported sites contain no telemetry.

Only live composition or connection tests contact TypeSafe or OpenRouter. A live design sends
its prompt and relevant design context, including brand name, tagline, section
titles, existing variants, presentation, order and content-shape metadata (counts,
text lengths and whether images/actions exist). Uploaded image bytes and the configured
contact-email field are excluded. Information you type in the prompt is sent,
so avoid confidential personal information there.

Local rate limits and deadlines are safety controls: at most eight design/connection
requests and 240 total API requests per minute, 12 active API requests, one design
or connection operation at a time, a 22-second provider deadline and a 45-second
composition deadline. Provider response bytes are bounded while streaming.
Cancel is best effort; a provider request already sent may still be processed or billed.

Raster imports and uploads must match their declared PNG, JPEG, WebP or AVIF type.
Only still images with bounded container dimensions (8192 pixels per side and
24 million pixels) are accepted. Uploads are checked before browser decoding and
then re-encoded for the project. These checks inspect metadata, not every codec
instruction; use an updated browser. AVIF pixel-stream dimensions can disagree
with container metadata, so the checks are not a complete decoder sandbox.

Local JSON files and browser project storage are not encrypted. They are not
protected against someone with access to the OS account or browser profile.
Do not expose the local server through a public tunnel or change its bind address.
Use the hosted deployment boundary for public access. Hosted limits survive
function restarts; missing quota infrastructure fails closed. Cloudflare/Vercel
configuration and real deployment checks remain necessary before public use.
The operator's `QWEN3_LIMIT` defaults to 10 provider-call units per minute for
each session + transport IP and each personal provider key. A connection test
uses one unit; a live composition reserves two. Optional free access has its own
10-call IP/day limit and an operator-funded deployment budget, defaulting to 500
calls/day. Separate shared and deployment-wide limits also apply; see the
production guide before enabling operator-funded access.

See [production and release operations](docs/PRODUCTION.md) and
[the security policy](SECURITY.md) for supported deployment, data retention,
incident response and source-release boundaries.

## Tests

```sh
npm ci --ignore-scripts
npm test
node scripts/check.mjs
npm run build
```

The supplied Node suite covers schema validation, all component variants, themes,
rendering, composition, locks, explicit exclusions, malformed provider responses,
error redaction, local and hosted API security, persistence, quotas, revision
conflicts and export. Installing the pinned hosted dependency is necessary for
the full suite; local startup remains installation-free. Synthetic tests do
**not** require or spend a TypeSafe API key and do not validate a live deployment.

An optional Playwright browser workflow is in `scripts/browser_smoke.py`.
Python/Playwright are test-only tools, not application dependencies. Start an
isolated app instance first, then run that script in an environment where
Playwright and a Chromium browser are installed. Set `FORMA_TEST_BROWSER` to an
existing browser executable or use a Playwright-managed Chromium installation.
Set `FORMA_TEST_URL` for a non-default server. The workflow creates local test
projects, so use a separate `DATA_DIR`.

Focused redesign/browser checks are in `scripts/redesign-smoke.mjs`. They start an
isolated server without credentials and check actual geometry at desktop/phone
widths. Use an existing Playwright installation; see the test report for invocation.

See `docs/TEST-REPORT.md` for actual verification results and limitations. An earlier
redesign baseline passed 141 Node tests and 100 browser checks on Windows. The live API
contract was tested with synthetic provider fixtures, not a real account. No live
JEV call was made; these checks do not establish the model's actual design quality.

## Troubleshooting

**The window closes / Node is missing:** install Node.js 18.17 or newer, reopen
your terminal and run `node --version`. Run `node server/index.mjs` from the app
folder to see errors.

**Startup prints "Note: Node.js … is older than the reviewed security baseline…":** Forma is
running normally. Your Node.js misses security fixes that later releases in its
line include; update it when convenient.

**Port already used:** run `stop.cmd` for an existing Forma instance, or set another
`PORT` in `.env`. Do not kill unrelated Node.js services.

**API authentication or model error:** test the key in Connect JEV. Check the model
in `.env`, available account access and the connection. Error messages do not expose
the key. There is no fallback to a fabricated live result.

**Browser says token expired:** reload the app after restarting the server.
In hosted mode, reload to establish a fresh guest session, then reconnect your key.

**Hosted service unavailable:** the operator must check the Cloudflare origin
secret, exact public origin and quota-service configuration. The app intentionally
does not bypass these controls when a dependency is unavailable.

**Read-only folder / saving error:** move the extracted app to a writable directory
or set `DATA_DIR` to one. Preserve a Project JSON export before troubleshooting.

**Missing external images:** upload a local raster image. Arbitrary remote URLs and
SVG uploads are intentionally unsupported.

**Unexpected JEV choices:** inspect the Decisions tab, make the requirement explicit,
use locks or correct the design manually. Distribution confidence is not a visual
quality score. The model cannot see your preview.

## Source release

After the test suite and syntax checks pass:

```sh
node scripts/release-check.mjs
node scripts/release-source.mjs
```

The archive in `artifacts/forma-source-*.zip` contains the scanned source and a
SHA-256 manifest. Its allowlist excludes personal projects, environment credentials,
tool metadata, screenshots and raw test logs. Share that archive, not the entire
working directory. The scan cannot prove that arbitrary prose or encoded data
contains no private information; review new content and audit any existing Git
history before publication. `private: true` prevents accidental npm publication
and does not limit the MIT source license. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

The complete source is included. See `docs/ARCHITECTURE.md`, `AGENTS.md` and
`THIRD_PARTY_NOTICES.md`. The original builder code is MIT licensed. TypeSafe/JEV
are third-party services and are not included under this repository's license.
