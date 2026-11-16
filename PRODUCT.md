# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent studio owners, freelancers, and small businesses building, refining, and exporting real static websites and application frontends locally—as well as evaluators testing local-first site creation without cloud lock-in, mandatory accounts, or build toolchains.

## Product Purpose

Forma — JEV Site Studio (`jev-site-studio`) is a runnable, local-first website builder. A user describes a website or edits an existing page; the system composes a complete, multi-page static website from curated, editable components and design settings, lets the user refine layout, copy, and imagery directly on a responsive canvas, and exports a self-contained HTML/CSS ZIP ready to host anywhere.

## Positioning

Unlike generative AI site builders that invent arbitrary HTML, CSS, or unverified marketing prose, Forma separates design selection from authored content:

- **Bounded JEV composition:** Live mode uses a two-pass TypeSafe or OpenRouter JEV workflow solely to select from bounded design directions, visitor journeys, theme tokens, 132 allowlisted blocks across 16 section families (104 website blocks and 28 app screens), 24 reusable elements, 12 coordinated styles, section presentation controls, internal element slots, stable section identities and section ordering. Body families may repeat within the twelve-section page limit; navigation, hero/application and footer remain single anchors.
- **Zero-dependency local execution:** Runs entirely on Node.js (`>=22.23.3 <23` or `>=24.21.0 <25`) and native browser ES modules on `127.0.0.1:4318`, with no third-party runtime packages, build step, CDN dependencies, or remote fonts.
- **Explicit offline demo vs. live API:** Offline demo mode uses deterministic local keyword rules and is always labeled as a demonstration; live JEV requests never silently fall back to demo mode or fabricate model confidence/token metrics.

## Operating Context

- **Local studio workspace:** Launched locally (`start.cmd`, `start.sh`, or `node server/index.mjs --open`) on loopback (`http://127.0.0.1:4318`). Projects, checkpoints, and undo history persist locally.
- **Dual composition and direct manipulation:** Users alternate between natural-language JEV design requests (`New design`, `Refine current design`, `Redesign current site`) and direct canvas/inspector manipulation (`Inspect` and `Interact` modes, drag/move grips, section and theme locks, inline copy/item editing, local image upload and resizing, and multi-page management up to 8 pages).
- **Multilingual editor shell:** The editor interface supports 9 languages (`en`, `es`, `pt`, `de`, `it`, `ru`, `pl`, `fi`, `sv`) via bundled ES-module locale catalogs (`public/i18n.mjs` and `public/locales/*.mjs`), independent of the authored website copy and the exported site's HTML `lang` metadata.
- **Self-contained handoff:** Exports a standalone ZIP archive containing static HTML for all pages, shared `site.css` and `site-runtime.js`, `project.json`, source reference copies, and license notices.

## Capabilities and Constraints

- **Component catalog:** 132 allowlisted blocks across 16 section families (including quotations, team, logos and statistics, and an AI application set of five screens and two website blocks that are prepared demonstrations with no model connected), 24 reusable elements, 12 coordinated styles, 12 palettes (`sand`, `forest`, `slate`, `cobalt`, `ink`, `lavender`, `porcelain`, `midnight`, `sage`, `ocean`, `clay`, `mono`), 3 locally available typography presets (`modern`, `editorial`, `technical`), heading scale, page width, density, surface treatment, and motion controls.
- **Editable examples and migration:** Eight prepared example projects use the ordinary catalog and demonstrate all 12 styles and 24 reusable elements. Opening an example saves the previous project first and creates a separate project. Version 1 files normalize to version 2 without losing authored content; new element collections default empty. Visitor interaction state remains temporary and never changes saved project data.
- **Composition breadth:** Ten page recipes, optional section backdrops and heading layouts, wider column and image-placement controls, three prepared copy voices and code-proposed reusable elements widen what JEV can select. They are existing designs and wording written in advance; the model generates no copy or markup. Layout rhythm rules run in code and are reported as layout rules, not model choices. Default-only projects stay readable by the previous version, newer vocabulary is forward only and refused whole (never deleted) by earlier code, and `scripts/compat-check.mjs` proves this against an earlier commit.
- **Hard invariants enforced outside the model:** Theme locks, section locks, project revision checks, checkpoint bounds, and failed-request immutability are enforced in deterministic application code (`shared/schema.mjs`, `server/composer.mjs`, `shared/structure.mjs`).
- **Strict security and privacy boundaries:**
  - Loopback-only server binding (`127.0.0.1`), same-origin/`Host` checks, and per-process application token validation.
  - Allowlisted HTML renderer (`shared/render.mjs`) with escaped text, restricted URL schemes, fixed runtime SHA-256 CSP hashing, and sandboxed preview `srcdoc` iframes with verified `postMessage` source/channel checks.
  - A tested API key is saved in the user's browser until Remove key and restored to server memory on load (or set in local `.env`); keys are never logged, stored in project JSON, or exported.
  - Uploaded images are resized locally in the browser, embedded in the project, and excluded from JEV request state.
- **Truthfulness boundaries:** Prepared starter copy, prepared SVG placeholder scenes (four landscape plates coloured from the site palette), local demo rules, and manual edits are never presented as JEV-generated content. Unreviewed draft copy and uploaded images missing alt text are flagged prior to export.

## Brand Commitments

- **Product name:** Forma — JEV Site Studio.
- **Voice:** Clear, direct, honest about system boundaries (distinguishing live model decisions, local demo rules, and prepared draft copy without hype or fabricated claims).
- **Licensing:** MIT License for original code, preserving upstream MIT attribution for adapted HyperUI, Fancy, Watermelon, uselayouts, Cult and Velora patterns and Feather icons (`THIRD_PARTY_NOTICES.md`). The 60 expansion blocks and 24 reusable elements are authored Forma code; library references do not claim copied source.

## Evidence on Hand

- **Editor shell and styles:** `public/index.html`, `public/app.css`, `public/app.mjs`, `public/structure-controls.mjs`, `public/library-drag.mjs`, `public/i18n.mjs`, `public/locales/*.mjs`.
- **Rendered website system:** `shared/catalog.mjs`, `shared/design.mjs`, `shared/render.mjs`, `shared/expansion-render.mjs`, `shared/widgets.mjs`, `shared/styles.mjs`, `shared/showcases.mjs`, `public/site.css`, `public/site-runtime.js`, `public/interaction-runtime.js`.
- **Sample projects and verification artifacts:** `examples/studio-north.project.json`, `artifacts/`, `docs/ARCHITECTURE.md`, `docs/ELEMENT-EDITING.md`, `docs/TEST-REPORT.md`.
- **Explicit absences:** The native runtime remains local; the existing hosted BYOK adapter is separately documented in docs/ARCHITECTURE.md. No dynamic CMS or server-side form backend (contact forms open a mailto draft in the visitor's email client), no runtime third-party fonts or stock photography.

## Product Principles

1. **Deterministic safety over unconstrained generation:** Model choices select from a validated, allowlisted design vocabulary; user content, locks, and layout rules remain under strict programmatic control.
2. **Zero-dependency longevity:** Every part of the editor and exported website must run locally with standard Node.js and browser platform primitives—no build steps, external CDNs, or fragile dependency trees.
3. **Transparent provenance:** Always make clear what came from live JEV distributions, what came from offline demo rules, and what is prepared draft copy awaiting the user's real business facts.
4. **Fluid hybrid authoring:** High-level design direction and granular manual control (drag-and-drop ordering, slot placement, image sizing, and per-section locks) reinforce each other without conflict.
