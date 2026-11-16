# Expanded component and style library

The library contains **132 blocks** (104 website blocks and 28 app screens),
**24 reusable elements**, **12 coordinated styles**, **12 palettes** and **8
editable showcase projects**. The expansion adds 60 authored blocks to the
previous 45, then ten family sections, ten blocks for the thin groups and seven
blocks for the AI application set (two website blocks and five app screens), all
defined as block manifests. Theme variations do not count as additional blocks.

Open **Components** to browse All components, Interactive components, Elements,
Styles or Examples. Search works in English and the selected editor language.
Blocks also have category and reference filters. A Preview opens one sandboxed
frame on demand; its desktop/mobile controls do not change the current project.
Elements attach to the selected unlocked content section (at most four), before
or after its content. Edit their text, options and safe destination in Content.
Media elements use that section's images, or clearly prepared local visuals.
Opening an example saves the current project first and creates a new project.

## New blocks

| Family | Added compositions |
| --- | --- |
| Navigation (6) | Dock, mega menu, fullscreen menu, desktop side rail, shrinking header, section progress |
| Introduction (8) | Full image, split screen, browser frame, phone frame, image collage, poster, product tour, scroll layers |
| Features and story (8) | Product tabs, comparison matrix, alternating media, expandable grid, workflow diagram, chaptered story, service selector, milestones |
| Gallery (8) | Masonry, justified rows, thumbnails, comparison, lightbox, project filters, albums, image accordion |
| Evidence (8) | Featured quote, quote grid, quote navigator, team portraits, team search, logo wall, optional logo motion, statistics |
| Conversion (6) | Period pricing, comparison pricing, lead offer, guided inquiry, contact directory, image invitation |
| Applications (10) | Commands, analytics, files, notifications, activity, onboarding, project detail, product detail, account and billing, help |
| Answers and footers (6) | Searchable answers, grouped answers, indexed answers, sitemap, contact footer, large wordmark |
| Family sections (10) | Hours and location, menu with sections, rooms and stays, amenity checklist, event schedule, speaker lineup, ticket tiers, integration directory, changelog timeline, code showcase |
| Thin groups (10) | Statistic cards, statistics with context, inline statistics, logo grid, quotation wall, quotation spotlight (tabs, also by arrow keys), team profiles, story with values, split invitation, slim banner |
| AI application set (7) | Agent run, chat with artifact, agent inbox, usage and limits, agent setup (screens); prompt box introduction, scripted conversation (website blocks) |

The thin-group blocks bring the groups to 4 statistics, 4 logo, 5 quotation, 4 team,
4 about and 5 call-to-action blocks. They reuse the group's prepared placeholders and
invent no name, quotation, logo or value; the inspector names the item fields they
show (Value and Source for statistics, Quotation and Source for quotations, Role,
Caption and the item link).

## AI application set

Seven blocks show how an AI product can be laid out. Each renders the visible
caption **Prepared demonstration** and says that no model is connected: the content
is authored placeholder text, no form posts anywhere, nothing is fetched, and no usage
number, customer or result is invented. JEV, the text-only model, can select these
designs like any other; it writes and runs none of their content.

| Block | Group | Behavior | What it shows |
| --- | --- | --- | --- |
| `app-agent-run` Agent run | App screen | `agent-run` | Run log of plan steps, tool calls, messages, citations and an approval, filtered by label, with a status region |
| `app-agent-chat` Chat with artifact | App screen | `agent-chat` | Transcript beside a tabbed artifact pane with a read-only text area and a plain-text copy control |
| `app-agent-inbox` Agent inbox | App screen | `agent-inbox` | Requests (messages, approvals, citations, artifacts) with filter, read, dismiss and details controls |
| `app-usage` Usage and limits | App screen | `usage` | Usage meters drawn from your own two numbers, and a sortable, searchable table |
| `app-agent-setup` Agent setup | App screen | `agent-setup` | Steps with back and next controls, ending in a completion message that stays in the view |
| `hero-prompt` Prompt box introduction | Introduction (interactive) | `prompt` | A headline beside a framed prompt box whose sample-prompt chips are tabs over the items; title is the sample prompt, body the authored example answer |
| `features-conversation` Scripted conversation | Features (list) | `conversation` | A transcript of the items, the speaker in the Speaker field |

The five screens are application manifests: they carry an `interface` declaration
(offered item types and a default) and a `content()` function instead of the website
fields `pattern`, `fit` and `fields`, so they have no fit data and the inspector
treats them as application screens. Their ids start with `app-` and their group is
`hero`; `shared/blocks.mjs` tells the two kinds of manifest apart by the `interface`
field. A screen draws each item by its type and falls back to its default type
(`plan` for run and setup, `message` for chat and inbox, `meter` for usage). The
two website blocks have fit data like other website manifests and use no application
class. Prompt box introduction is fitted to the product direction and the
software-as-a-service family; Scripted conversation to the editorial and expressive directions and the
studio and portfolio families. Their editable item fields are Sample prompt and
Example answer, and Speaker.

Seven new item types join the existing application item types:

| Type | Markup |
| --- | --- |
| `message` | A transcript turn: speaker or title, label and text |
| `toolcall` | A native disclosure whose summary holds the title; the body opens below it |
| `citation` | A quoted excerpt with its source title and label |
| `plan` | A plan step: heading, label and text |
| `approval` | A request with one local Approve control (`confirm`) |
| `artifact` | The body as escaped preformatted text |
| `meter` | A native meter from two numbers in the price field (such as "40 / 100"), or an empty meter and its label |

`app-workspace` offers the types; `app-dashboard` and `app-editor` draw a stored item
of such a type the same way. The parts each type shows (heading, body, meta, icon,
price, control) are defined once as `AGENT_ITEM_PARTS` and used by every host.

Shared item markup carries no interaction root and no status region. Only `approval`
has a runtime control, and a control needs a root and a status region, so each host
supplies them. An agent screen provides its one wrapper root and one status region.
`app-workspace` and the other screens drawn through the module renderer have no root:
each agent item there is wrapped in a root of its own, named `agent-item`, and an
approval also gets its own status region, so two approvals never share one.
`agent-item` is only that wrapper name; no block has this behavior. The fixed runtime
is unchanged.

## Reusable elements

| Category | Elements |
| --- | --- |
| Actions | Split action, copy confirmation, confirmation action, segmented selector |
| Navigation | Command palette, dropdown, breadcrumbs, pagination |
| Panels | Dialog, drawer, popover, collapsible panel |
| Inputs | Searchable choice, range, multistep form, bounded tags |
| Feedback | Status feedback, inline alert, progress stepper, actionable empty state |
| Media and data | Image comparison, lightbox, searchable sortable records, category filters |

Each element has authored markup and a finite kind. Temporary visitor state
(search, tabs, form values, notification dismissal, quantity, task progress and
tags) remains inside the frame. It never changes saved project data or JEV state.
Account and order interfaces demonstrate frontend behavior; they do not provide
authentication, billing or payment processing. Guided inquiry prepares an email
draft using the validated public brand address.

## Styles and examples

Swiss Editorial, Warm Paper, Quiet Luxury, Botanical, Industrial, Neo-Brutalist,
Soft Product, Dark Studio, Frosted Glass, Playful Pastel, Technical Mono and Gallery
Minimal coordinate local colors, typography, spacing, shapes and control surfaces.
Styles respect locked design settings; manual controls can override preset values.
Frosted Glass has an opaque fallback. No remote fonts or runtime packages load.
The generated-site system is recorded in [generated-ui/DESIGN.md](generated-ui/DESIGN.md),
separately from the editor's existing Drawing Office design system.

Architecture studio, software product, photography portfolio, boutique stay,
creative agency, product storefront, analytics workspace and project management
examples use ordinary editable catalog entries. Their additional pages demonstrate
all 12 styles; together their primary pages contain all 24 reusable elements.
Example names, quotes, people, logos and statistics remain prepared draft content.
Replace examples and verify claims before publishing.

## Persistence and composition

Schema version 2 allows multiple body sections of one family. Section IDs remain
unique; navigation, hero/application and footer remain single anchored families.
The limits remain eight pages, twelve sections per page and eight items per section.
Schema version 1 inputs normalize into version 2 with empty element collections
and the individual-settings style. Migration is in memory until the next save;
existing copy, links, images, locks, placements and IDs are preserved.

The two JEV passes select finite catalog IDs, styles and prepared element kinds.
Questions address repeated sections by identity. On dense pages, canvas choices
retain section-level owners and prioritize details in the selected section. Larger pages use coordinated
presentation recipes for nonselected sections when detailed choices would exceed
160 questions. Each question remains limited to 255 choices. Exact quoted text
has explicit identity-bound targets; the model does not supply markup or code.
One quoted string is offered at most 254 destinations. On a page with more, they
are listed in this order until the limit: the fields of the selected item, the rest
of the selected section, the section-level fields of every other section, items
named by their own or their section's title in the request, then the remaining
items in page order; the question then says that some items are missing. On such a
page, select the item or section before quoting the replacement.
No provider request is needed for browsing, examples, manual editing or export.

Block choice uses fit data (`shared/fit.mjs`). On create and redesign, hero, features
and gallery first get a layout-pattern question; a section with more than eight
compatible blocks is then offered six ranked blocks plus at most four pinned ones,
each described with its fit in words. Edits offer every compatible block. The report
lists up to two runner-up layouts per section, which the inspector offers and applies
through its component change, only while that keeps the section's content.

Sections have two optional presentation settings beside the five existing ones:
**Section backdrop** (plain, grid lines, dots, soft color mesh, fine grain) and
**Heading layout** (original, heading beside description, ruled heading). They are
saved only when set to something other than the default. Column count reaches the
quotation, team, logo and statistics blocks, and **Image placement** reaches the
about group and the image invitation; for those blocks the default option names the
side the block always used (image first), while introductions keep content first.
Ten page recipes (software launch, developer tool, AI product, studio and services,
portfolio, restaurant or cafe, rooms and stays, conference, workshop, wellness
practice) order the sections and suggest existing blocks when a new page is created
or redesigned. Prepared draft copy comes in three voices (plain, warm, bold) for
seven site categories; JEV only selects a voice, and the wording was written in
advance, never generated. After composition, code avoids three grid layouts in a row
and more than one contrast background, and lists each change as a layout rule, not a
model choice. Code may also propose a lightbox, stepper or copy action for up to two
sections; they are added only when the section has room. The "A little inspiration"
cards hold thirteen presets: eight websites and the five agent screens. The AI
product preset's prompt is the request box placeholder for a new design, and each
card's prompt also works in the offline demo. The sample canvas the editor opens with
keeps the Studio North brand, copy and blocks, and presents them with display
headings, a wide measure, a colour wash behind the introduction, split headings, a
three-up gallery, and soft and contrast bands. Files and projects that use none of
this are unchanged, and files that use it need this version or a later one
(see ARCHITECTURE.md, "Compatibility with earlier versions").

## Reference assessment and licenses

The 87 new blocks, 24 elements, styles and examples are **Forma original · MIT**.
Reference labels identify interaction/design references, not copied source or a
claim that an entire upstream library is installed. The previous five adaptations
retain pinned source provenance in `INTERACTION-SOURCES.json` and their MIT notices.

| Reference | Native use or assessment | License boundary |
| --- | --- | --- |
| [Fancy Components](https://www.fancycomponents.dev/) | Expressive transitions, fullscreen navigation and layered imagery | Previous adaptations retain MIT notices |
| [Watermelon UI](https://ui.watermelon.sh/free/animated-react-components) | Stateful product tours, selectors and pricing | Previous adaptations retain MIT notices |
| [useLayouts](https://uselayouts.com/) | Galleries, albums and focused collection navigation | Previous adaptations retain MIT notices |
| [Cult UI](https://www.cult-ui.com/) | Disclosures and locally drawn device frames | Previous adaptations retain MIT notices |
| [Velora UI](https://github.com/ColorlibHQ/velora-ui) | Navigation, comparisons and motion with static fallbacks | Previous adaptations retain MIT notices |
| [Motion Primitives](https://github.com/itsjwill/motion-primitives-website) | Motion vocabulary and activity layouts; implemented locally | No source copied; README license claims alone do not authorize future extraction |
| [Animate UI](https://animate-ui.com/) | Accessible practical panels and disclosures | No source copied; verify exact component notice before future extraction |
| [Spectrum UI](https://github.com/arihantcodes/spectrum-ui) | Structured comparison patterns | Repository uses Apache-2.0; do not relabel upstream code MIT |
| [PioneerUI](https://www.pioneerui.com/) | Presentation and connected process patterns | No source copied; verify exact component license before extraction |
| [UI Components](https://www.uicomponents.dev/) | Community gallery/viewer patterns | No source copied; verify each contributed component before extraction |
| shadcn-html | Reference label of the event schedule, integration directory and code showcase; implemented locally | No upstream source read or copied; verify the licence before any extraction |
| Tailark | Reference label of the ten thin-group blocks (statistics, logos, quotations, team, story and invitations); implemented locally | No upstream source read or copied; verify the licence before any extraction |
| GradientDeck | Design reference only for the AI application set; markup and CSS are original to this repository | No licence published; nothing copied or adapted |
| Basecoat | Design reference only | No upstream source read or copied; verify the licence before any extraction |
| Untitled UI | Design reference only | No upstream source read or copied; verify the licence before any extraction |
| assistant-ui | Design reference only | No upstream source read or copied; verify the licence before any extraction |
| AI Elements | Design reference only | No upstream source read or copied; verify the licence before any extraction |
| ReUI | Design reference only | No upstream source read or copied; verify the licence before any extraction |

## Extension contract

Add a block as one manifest in `shared/blocks-site.mjs` (the AI application set is
in `shared/blocks-agent.mjs`), registered by `shared/blocks.mjs`: metadata, pattern and fit, parts, media, element controls,
`fields.item` (every `meta`, `price` and `href` the block shows, with the labels the
inspector uses; it decides which item fields the inspector and quoted copy offer),
prepared content, markup through the renderer's kit, CSS scoped to its wrapper
class and render expectations, plus translations and tests. The catalog registries
read the manifest first; the 105 base blocks keep their definitions in
`expansion.mjs`/`catalog.mjs`. An application screen manifest declares `interface`
and `content()` and has no `pattern`, `fit` or `fields`; a website manifest never has
an id starting with `app-`. `tests/blocks.test.mjs` checks every catalog block
for translations, fit data and rendering under its section class, and every
manifest for its shape, labels, scope and expectations. Each page inlines only the
CSS it can use (`shared/page-css.mjs`): a rule is left out when every selector of it
needs a block class or an application class absent from the page. Add an element through `widgets.mjs`, shared and
hosted validation, the renderer, bounded runtime behavior and tests. Keep runtime
state separate from saved values. Never add dependencies, remote component fetches,
arbitrary markup, dynamic script evaluation or a weaker preview CSP.

All authored content remains readable without JavaScript. Inspect reveals hidden
panels and disclosures for editing. Interactive state returns when switching back
to Interact. Reduced motion suppresses decorative motion while leaving functional
tabs, filters, sliders, dialogs and form steps usable.
