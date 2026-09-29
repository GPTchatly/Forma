# Deeper JEV redesign: research and implementation

Reviewed September 26, 2026. Sources below are primary project documentation and
repositories. Product descriptions establish advertised capabilities, not a
comparative quality benchmark. No paid product account or live JEV call was used
for this research.

## Diagnosis

The original composer had a deliberately small action space: five global theme
settings, section membership, 27 component variants and pairwise ordering. During
refinement it instructed every choice to stay unchanged unless specifically
requested. Consequently, a request such as “make this feel like an ambitious
editorial studio” had little room to change the page. Better wording alone cannot
make a renderer express layouts and hierarchy it does not support.

Depth should mean that the visitor's goal, reading order, visual hierarchy,
content shape and individual section treatments work together. It should also
mean that a small correction remains small. A redesign that discards edited copy
or hides uploaded work is not an improvement.

## What comparable tools contribute

| Project | Evidence | Idea adapted for Forma |
| --- | --- | --- |
| **json-render**, open source | Its [experimental JEV composer](https://json-render.dev/docs/jev) selects configured component candidates, supports structural edits and uses bounded evaluations. Candidate values must already exist. | Give JEV concrete, meaningful choices and relevant content metadata. Separate model selection from deterministic application and validate the final spec. Keep copy and assets independent of visual choices. No package adoption is needed. |
| **Relume**, commercial | The [published workflow](https://resources.relume.io/resources/publish/doc/getting-started-with-relume-publish) separates brief, sitemap, wireframe and design; the brief includes goals and audience. | Ask for the audience and desired action, then select a page direction and reading journey before section details. Bring the useful distinction into the existing two-pass flow rather than adding four network stages. |
| **Puck**, open-source editor with an AI service | [AI overview](https://puckeditor.com/docs/ai/overview) distinguishes existing-component assembly from component creation; [business context](https://puckeditor.com/docs/ai/business-context) informs both. [Permissions](https://puckeditor.com/docs/api-reference/permissions) distinguish edit, move and delete behavior. | Use assembly within the existing catalog, explicit operation scope and independently enforced locks. Context and scope should influence composition. Component generation would require a different execution boundary. |
| **GrapesJS**, open source | Its [Style Manager](https://grapesjs.com/docs/modules/Style-manager.html) supports restricted styling properties and predefined design-token options; [Traits](https://grapesjs.com/docs/modules/Traits.html) expose component properties. | Expose the same bounded presentation grammar to JEV and the manual inspector. Avoid a prompt-only feature that the user cannot adjust. |
| **Onlook**, open-source repository and evolving product | The [repository](https://github.com/onlook-dev/onlook) describes its original visual editor; the [product FAQ](https://beta.onlook.com/faq) describes design-system constraints and pointing at elements to supply context. These are distinct evidence surfaces. | Keep model changes within approved design tokens and component identities. Selected-section/item requests now use server-validated identity and context rather than model-invented selectors. |
| **Framer**, commercial | Its [AI design workflow](https://www.framer.com/design/) describes editable results, exploring directions, responsive refinement and direct canvas control. | Preserve the editability of every new design decision, undo and checkpoints. Test actual browser geometry at desktop and phone widths; a valid schema is not evidence of a usable layout. |

TypeSafe's [JEV 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
are especially relevant: literal instructions, indirection, large irrelevant state,
numeric reasoning and generation are identified weaknesses. This argues for
concrete semantic criteria, measured content-shape metadata and application-owned
invariants. It does not support asking JEV to invent CSS, inspect photographs or
rate unseen screenshots.

## Implemented design

### Separate refinement from redesign

The operation selector now distinguishes a new design, a targeted refinement and
a redesign of the current site. Refinement remains conservative. Redesign permits
the unlocked visual system, section layouts and reading order to be reconsidered
together. Existing section data is retained, including draft copy, uploaded images,
IDs, destinations and review status, unless the request explicitly replaces text
or adds/removes a section. Locks retain priority.

This explicit operation is preferable to making “change the button” and “rethink
the entire page” depend on one hidden, uncertain interpretation of change scope.

### Plan the whole before selecting the parts

The first pass chooses a named direction: editorial, product clarity,
understated, expressive, or organic. These are descriptions of hierarchy,
surfaces and pacing, not whole-page templates. The second pass receives that
direction alongside the selected theme and actual content shape.

A visitor journey provides a meaningful initial reading order: value overview,
work-first showcase, offer-led explanation, or story-first introduction. Code
filters that order to the sections present and preserves locked positions.
Explicit ordering requests retain the pairwise decision mechanism. The ordinary
new-design path no longer needs quadratic pairwise choices just to establish a
sensible default order.

### Expand the visual language

Two global axes supplement palette, fonts, spacing, corners and motion:

- **Heading scale:** quiet, balanced, dramatic.
- **Content width:** focused, standard, wide.

Sections gain applicable choices for background tone, local spacing, heading
alignment, card surfaces and image proportions. Each choice maps to local CSS and
the allowlisted renderer. Navigation/footer use only the relevant subset; image
choices do not claim to understand the image. A media-preservation guard prevents
automatic variant changes from hiding existing uploaded hero/about images.

The key is the interaction between decisions. A work-first editorial direction
can combine a prominent gallery, broad content, dramatic headings, quieter lists,
landscape imagery and selective contrast. A product-oriented request can choose
structured benefits, a clear workflow, balanced hierarchy and filled surfaces.
Changing only the palette can still leave all section geometry alone.

No new UI component library, runtime dependency, remote font, arbitrary style
string, generated markup or script execution is introduced. Existing version-one
projects normalize absent fields to the original visual defaults.

### Make results inspectable

The Decisions tab now includes the selected direction and journey plus an actual
before/after design difference list. The difference list is calculated from the
validated input and output, after constraints, instead of equating every returned
model choice with a change. Wording changes receive generic notices; the list
omits raw copy and uploaded assets. Detailed model
distributions remain available; their concentration is not a visual quality score.

Every new visual field also has a manual inspector control. The ordinary undo,
project persistence, checkpoint and export mechanisms carry those validated values.
Reports remain session-only, as before.

## Next architectural steps, in priority order

### Follow-up: choices smaller than a section

The internal-element investigation exposed the same ceiling at a smaller scale:
feature glyphs were hardcoded, so no prompt could change them. The implemented
extension adds a shared control registry, individual icon choices and independent
button component/icon/label/text-style slots. The same values feed inspector,
composition, validation, rendering and actual-change reporting. It also routes
exact quoted user copy to existing fields. See [ELEMENT-EDITING.md](ELEMENT-EDITING.md).

Three related architecture patterns informed this extension:

- [GrapesJS traits](https://grapesjs.com/docs/modules/Traits.html) derive editable
  properties from component definitions. [Puck AI configuration](https://puckeditor.com/docs/ai/ai-configuration)
  adds field instructions, schemas and exclusions. Forma shares bounded control
  metadata between its manual editor and JEV questions.
- [Puck slots](https://puckeditor.com/docs/api-reference/fields/slot) place nested
  component data in named slots with allowed component types. Forma's initial
  implementation uses fixed slots, such as action icon and label, with local catalogs.
- [Craft.js nodes](https://craft.js.org/docs/api/node/) have identities, parents,
  selection state and named linked nodes. This is the useful direction for the
  next stage: stable item/slot identities instead of relying on positional indexes.

Independent pages and selected section/item context have also been implemented
since the initial redesign pass. Context resolves references; it is not a hard
mutation lock. More granular scope and instance identity remain separate work.

### Further work

These are recommendations, not claims about features delivered in this change.

1. **Evaluate real redesign intent.** Build a consented live benchmark before
   multiplying choices further. Cover 20–30 representative briefs, long copy,
   sparse content, all-lock and partial-lock cases, literal text changes,
   contradictory requests and multilingual prompts. Measure request adherence,
   preservation, usable geometry and cost separately. Human preference should be
   assessed on blinded before/after pairs; never derive quality from confidence.
2. **Add semantic content slots and repeated sections.** The current one-section-
   per-family model remains the next major ceiling. Introduce bounded section
   instances with stable IDs and named slots such as introduction, evidence,
   detail and action. Initially constrain depth to two, total nodes to a small
   documented limit, and allowed parent/child relationships in code. Migrate
   schema, internal links, selection, locks, reorder and checkpoints together.
   This enables two distinct work stories or alternating image/text compositions
   without granting arbitrary layout-tree generation.
3. **Persist an explicit project brief.** Store user-confirmed audience, primary
   visitor action, brand constraints and avoid-list separately from the latest
   prompt. Display what will be sent to the provider. A narrow follow-up should
   not erase the business goal, while an old goal must not silently overrule a
   new user instruction. Resolve conflicts visibly and bound total context.
4. **Add hard slot-level scope and locks.** Section/item context now reaches JEV,
   but independently locking an icon or a label needs stable slot identities and
   application-enforced allowed edits. Useful natural-language context is a
   convenience; it should not be mistaken for a mutation boundary.
5. **Compare a small number of alternatives.** Let the user request two or three
   directions explicitly, see a diff and choose which to apply. Keep the original
   checkpoint until selection. Expose the provider-call budget before the action;
   never run hidden paid tournament or critique loops. Distinguish an authored
   local variation from a model-selected result.
6. **Add measured layout feedback.** Browser checks can calculate overflow,
   clipped actions, unexpectedly tall image frames, empty sections and contrast
   from actual rendered values. Convert those findings to bounded repair choices.
   Deterministic measurements can reject broken layouts; they cannot determine
   whether an editorial composition is beautiful. A future vision evaluator
   would be a separate provider and privacy decision.
7. **Support references as data.** Begin with curated, local reference profiles
   described in design terms. URL or screenshot ingestion is a distinct feature:
   it needs acquisition controls, provenance, extraction and possibly a vision
   model. Never imply that text-only JEV sees or copies a reference image.

## Acceptance and limits

The implemented flow must preserve existing project imports, exact manual content,
locked settings, locked sections, same preview/export rendering, fixed CSP/runtime,
server token/origin checks and failed-request immutability. Live composition stays
within the existing two-call and wall-time budget, with no automatic retries or
silent switch to demo. All new imported/model-influenced values cross the shared
schema and are drawn from enumerated options.

Structural tests and browser observations are recorded in
[TEST-REPORT.md](TEST-REPORT.md). Synthetic fixtures exercise model contracts;
offline demonstrations exercise prepared local rules. Neither establishes real
JEV design quality. This remains a text-only, catalog-driven builder. The editor
supports up to eight related independent pages and compositions affect the selected
page. Free-form generated copy and rearrangeable nested layout trees remain outside
the implemented scope; authored internal slots now have their own editable choices.
