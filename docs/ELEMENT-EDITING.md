# Editing elements inside a block

## Why requests previously did nothing

The limitation existed across the whole edit path. Feature icons were selected
solely by array index in the renderer. They had no saved property, schema field,
inspector control or composer question. The composer could change a whole block
variant, but could not choose any of its individual icons. Item wording and many
internal visual details had the same limitation. Improving the prompt alone could
not fix a choice that the renderer and specification could not represent.

The [TypeSafe API](https://docs.typesafe.ai/api) chooses from the criteria provided
for each question. A selection-based builder must therefore expose each editable
detail as a complete path: catalog → allowed slot → stored value → choice question
→ validated application → rendering → actual-change report.

## Implemented fixed slots

| Element | Catalog choices / behavior |
| --- | --- |
| Each feature item's SVG | 24 authored glyphs, original positional default, or no icon; all three feature variants |
| Feature icon treatment | Plain, soft, outlined or solid; small or large size, plus component defaults |
| Repeated-content layout | One to four desktop columns on compatible grids, responsive collapse; start or center alignment |
| Action container | Solid, outline or text button, plus component default |
| Action icon | Arrow, chevron, envelope, external link, check, none or default |
| Action label | Existing custom text or five prepared labels; default, bold or uppercase treatment |
| Action visibility | Supported primary actions and the hero's secondary link |
| Other inner details | Service/process numbering, featured pricing item, decorative labels/bento lines |
| Image sizing | Visible hero/about/gallery owners: 25–100% width, Auto or 80–1200px height choices, cover/contain, reset |
| Section and card movement | Shared anchored/locked section moves, stable-ID item reorder and compatible Services/Process transfers |
| Inner movement | Authored heading/body/action order, hero media position, feature and button icon placement, including named items |
| Individual pricing action icons | Replace one plan's button icon with a local catalog choice |
| Existing text and links | Route up to four exact double-quoted user strings to supported section/item fields |

Catalog entries are local implementations with original MIT provenance. The
existing section library also retains its HyperUI adaptation notices. Adding a
library entry requires an implementation, compatible slot metadata, schema bounds
and rendering tests; declaring an option alone is insufficient. No runtime library
download, arbitrary SVG, generated script, CSS string or third-party package is added.

The inspector exposes the same vocabulary under **Inside this block**. Feature
items have individual icon pickers. In Inspect, clicking a repeated item supplies
its section and index as request context; Interact follows its links. Section
navigation works in both modes. Selecting an item moves New design into Refine;
an explicitly selected Redesign operation remains unchanged.

Example requests in Refine:

- `Change the first feature icon to a shield.`
- `Make all feature icons outlined and large.`
- `Use two columns in the features section and center the card content.`
- `Make the hero button outlined, remove its icon and use an uppercase label.`
- `Change this item title to "Designed around your work".`
- `Change the hero button text to "Book a conversation".`
- `Make this image 60% wide and 387px tall, and show the whole image.`
- `Move gallery before services.`
- `Move the third feature card first.`
- `Move this service to the end of Process.`
- `Move this item's description before its heading.`
- `Use a mail icon on the second pricing plan's button.`

The selected item resolves “this item”; explicit section names override that
context. Selection is not an authorization boundary. Section locks and theme locks
remain enforced independently. Broad redesign does not authorize changing icon
identities or wording. Requests outside the supported vocabulary receive a
limitation or partial-result notice, and a no-op is reported as no change.

## State, privacy and verification

Legacy version-one projects normalize missing `elements` and `item.icon` to
defaults reproducing their former appearance. Manual edits, save/reopen, Undo,
checkpoints, JSON and HTML export use the same validated state. Item selection is
session-only. Preview item markers are omitted from exported HTML.

Provider state contains stable selections, enum values, ordinals, validated image
sizes, application-generated action options and locally calculated title-match
booleans. It does not gain existing item wording, bodies, URLs, image
bytes or sibling-page content. User-supplied quoted replacement text is already
part of the submitted prompt. Actual-change summaries redact wording and URLs;
raw decision questions can contain those user-supplied literals, as expected.

The composer rejects decisions outside supplied criteria and caps each pass at
160 questions and each question at 255 choices. Four targeted action slots choose
existing owners in pass one, then bounded destinations or width/height/fit in pass
two. This replaces the production pairwise section-order matrix and keeps the
new controls within the existing budget. Exact bounded integer heights in the
prompt augment prepared heights; arbitrary model-authored numbers are rejected.
Exact quoted-copy destinations are selected in the second pass, after screen
conversion and item-count choices establish the actual owners. Stable selection
is cleared when its item no longer exists. Composition still uses at most two
evaluations. The cost and adherence of this enlarged vocabulary need live
measurement; offline rules and synthetic responses do not establish JEV quality.
See [TEST-REPORT.md](TEST-REPORT.md) for checks actually run.

## Remaining limits

This is a fixed-slot component system, not a freely nested layout tree. Button
settings apply to supported primary buttons in a section; individual pricing
buttons do not yet have separate styling or label overrides. Individual button
icons and their placements are supported. Marketing item insertion/deletion remains manual;
reordering and compatible transfers are now available to JEV. Up to four targeted
owner/operation pairs can be handled per request; a resize can set width, height
and fit together. Split larger batches into subsequent requests. Locks are
section-wide, not per slot. Movement uses authored slots, not free pixel positions.

Navigation brand marks, functional FAQ chevrons, pricing-list checks, contact form
fields, secondary-link labels and decorative art captions still have authored
semantics. They are not all independently editable through JEV. Generated or
translated prose requires exact replacement wording; there is no open-ended
copy generator. A hero-only page has no secondary-section destination to show.

Stable item IDs and authored slots now support selection, movement, locks and
checkpoints. Additional independent button instances still require typed child
ownership, depth/node budgets and migration without allowing arbitrary code.
The research rationale is recorded
in [REDESIGN-RESEARCH.md](REDESIGN-RESEARCH.md).

## Application interfaces

The primary section can be one of thirteen authored application screens. JEV can
choose a screen, responsive layout, visible navigation/search/tabs/metrics, one to
eight editable items, and the supported type of each item. Counts append or trim
from the end; exact user-provided quotes edit labels, placeholders/options, status
and displayed values. The inspector exposes the same registry. Existing item IDs
survive reordering; switching screen types installs prepared fields and clears
stale item selection. Section locks apply to these operations.

Uploaded product images in storefront, checkout and custom workspace items share
the image sizing controls and JEV resize path. They expose a selectable media part
for editing/resizing, with no unsupported placement destinations. Images remain
excluded from provider state. Local interactions in Interact/export do not mutate
the saved editor specification; edit the Content inspector to persist content.
