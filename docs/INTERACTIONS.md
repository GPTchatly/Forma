# Native interaction components

Forma has 105 catalog variants: 82 website components and 23 application
screens, plus 24 reusable elements, 12 styles, 12 palettes and 8 prepared showcases.
The initial eight interaction additions below target generated websites and apps. They are local
adaptations of source patterns, with native HTML, CSS and JavaScript. They do not
install React, Tailwind, Motion, GSAP or Three.js, or fetch runtime components.

| Addition | Saved choice | Behavior and fallback |
| --- | --- | --- |
| Link/button effects | `elements.actionMotion`: arrow, underline | Hover and keyboard focus; labels and destinations preserved |
| Spotlight cards | `features-spotlight`, `elements.cardInteraction` | Theme-colored pointer light; no tracking on touch, Inspect or reduced motion |
| Revealing services | `services-reveal` | Native details/summary; natural text height, prices and links; open in Inspect |
| Swipeable gallery | `gallery-carousel` | Native scrolling and snap, keyboard and previous/next buttons; no autoplay |
| Fanned gallery | `gallery-stack` | Saved image collection, captions, links and buttons; sequential on small screens, Inspect, no motion and reduced motion |
| Stacked process | `process-stacked` | Sticky cards with natural height; sequential when content is tall, on small screens, Inspect, no motion and reduced motion |
| Sliding tabs | `interface.tabStyle`: sliding | Existing accessible tabs change real local panels; arrow/Home/End keyboard navigation |
| Section entrances | `elements.entrance`: fade, rise | One-time viewport entrance; content visible without JavaScript or observers |

In Design, **Subtle hover only** enables link, pointer and tab transitions.
**Interaction and scroll motion** explicitly enables fanning, stacking and entrance
effects. **No animation** and the visitor's reduced-motion preference suppress
decorative motion while preserving disclosure, scrolling, buttons and tab behavior.
Insertions preserve the current theme; choose the motion setting explicitly to
enable its decorative effects. Live JEV can select these finite choices. The
offline demo recognizes explicit requests without claiming model generation.

Create includes **Explore interactive components**. The Components tab lists
the five new blocks first under **Interactive components**; its matching filter
shows just that collection. **All components** restores the full catalog. Search
works within either view. The library also explains where to enable page motion,
button effects and sliding tabs. Browsing and filtering do not change the project.

The Library has static structural thumbnails for every section and a Preview
component action. It creates one sandboxed frame on demand, with prepared sample
content and desktop/mobile widths. It makes no provider request, does not change
the current project, and clears the frame and pending request when closed. The
main editor accepts messages only from its own current preview frame.

Inspect opens service details, displays every gallery item and disables temporary
pointer, stack and entrance effects. It exposes both sliding-tab panels for
editing. Returning to Interact restores the disclosure state and selected tab;
gallery position, spotlight coordinates and tab measurements remain temporary
browser state. They are never saved in projects or sent to JEV.

All new blocks use the existing content, item identity, removal, placement, image,
lock, history and page contracts. Gallery image resizing and alternative text
remain authored project data. Data still passes the same allowlisted schema and
escaped renderer. There is no generated script or new endpoint. Runtime assets
are concatenated and normalized identically in local preview, hosted preview and
every export; the fixed CSP hash covers all three runtime sources.

Existing version-1 project files load with defaults for missing interaction fields.
New files use schema version 2, including repeatable body sections and element slots.
Version 1 projects migrate through shared validation without losing copy, links,
images, locks or identities. Readers
from older Forma releases may reject new fields, motion values or block IDs;
backward import into those older releases is not promised.

Every standalone HTML document embeds the complete bundled MIT notices. ZIPs
also include the notices as separate license files, including Feather's icon
notice. Both local and hosted exports use `shared/export.mjs`. This avoids a
license or runtime divergence between the two paths.

Source references and hashes are in [INTERACTION-SOURCES.json](INTERACTION-SOURCES.json).
Repository revisions pin the reviewed licenses. Where the component was only
available through a published registry, the component snapshot has its own SHA-256;
that registry URL can change, and the repository revision does not prove its
contents. The native adaptations in this repository are the shipped implementation.
Fancy's stacking reference credits Khoa Phan; that attribution is preserved here.
The remaining researched libraries can inform future native additions; no full
external component library is imported or represented as installed.
