# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

miniPaint is a browser-based HTML5 image editor (canvas, layers, filters, effects). This is a **DataWorks Plus fork** — upstream miniPaint customized to embed inside DataWorks' PMW image-editor plugin. Everything runs client-side; nothing is sent to a server by the base app.

## Commands

```bash
npm run server      # dev server with hot reload (webpack-dev-server, opens browser)
npm run dev         # one-off development build to dist/bundle.js
npm run build       # production build with source maps
npm run deploy      # watch build, output to ../../pmw/assets/plugins/image-editor-v2/js (DataWorks integration target)
npm run go          # build + deploy
npm run pretty      # prettier --write on src/**/*.js
npm run git:merge   # merge spline_draw -> dataworks_dev (project-specific branch flow)
```

There is **no automated test runner or linter** configured. `src/js/tools/dw_extensions/Tests.js` holds ad-hoc, in-app test helpers for the lasso tool, not a CI suite. Formatting is enforced only via `npm run pretty` (Prettier).

## Build & entry

- Webpack entry is `src/js/main.js` → outputs `dist/bundle.js` (loaded by `index.html`).
- jQuery is provided globally via webpack `ProvidePlugin` (`$`, `jQuery`) — do not import it.
- `VERSION` is a global injected from `package.json` via `DefinePlugin`.
- CSS is imported directly into JS (style-loader); see the imports at the top of `main.js`.

## Architecture

### Singleton core, wired in `main.js`
On `window load`, `main.js` instantiates the core classes and registers them on the `app` object (`src/js/app.js`), which is imported everywhere as the service locator: `app.GUI`, `app.Layers`, `app.Tools`, `app.State`, `app.Config`, `app.FileOpen`, `app.FileSave`, `app.Actions`. Some are also exposed on `window` for external/DataWorks access. Most core classes (`Base_layers_class`, `Base_state_class`, `GUI_tools_class`, etc.) implement the **singleton pattern** in their constructor (`if (instance) return instance`), so `new X()` anywhere returns the shared instance.

Core classes in `src/js/core/`:
- `base-layers.js` — layer model + canvas rendering. A layer is a plain object (see the documented key list at the top of the file: `id`, `type`, `x/y/width/height`, `visible`, `opacity`, `filters`, `data`, `render_function`, etc.). Renders to `#canvas_minipaint`.
- `base-tools.js` — base class tools extend; centralizes mouse/touch tracking and `get_mouse_info`.
- `base-state.js` — undo/redo. Maintains `action_history` and `layers_archive`. Also accumulates the DataWorks **audit trail** (`asAuditTrail`).
- `base-selection.js`, `base-gui.js`, `base-search.js`.
- `core/gui/` — one class per UI region (`gui-tools`, `gui-layers`, `gui-menu`, `gui-colors`, `gui-preview`, `gui-details`, `gui-information`).

`config.js` is a mutable global config object (canvas WIDTH/HEIGHT, current layer, color, zoom, fonts, etc.) shared by reference across the app.

### Tools — auto-discovered
`GUI_tools_class.load_plugins()` (`core/gui/gui-tools.js`) uses `require.context('./../../tools/', true, /\.js$/)` to **auto-register every tool in `src/js/tools/`** that has a `default` export class. A tool class exposes `name`, `render`, and mouse/event handlers. To add a tool, drop a file in `tools/` with a default-exported class — no manual registration. `tools/shapes/` holds shape sub-tools; `tools/dw_extensions/` holds DataWorks helper modules.

### Actions — undo/redo command pattern
`src/js/actions/` implements reversible commands (do/undo). `actions/index.js` re-exports all action classes; they're reached via `app.Actions.Xxx_action`. Construct with options and call `.do()` (e.g. `new app.Actions.Insert_layer_action({}).do()`). See `actions/_README.md` and the upstream wiki's Undo-Redo page. `Bundle_action` groups multiple actions into one undo step.

### Menu — data-driven
`config-menu.js` exports a nested `menuDefinition` array. Each leaf has a `target` string like `'file/open.open_file'` meaning "call method `open_file` on module `modules/file/open.js`". Modules live under `src/js/modules/` (`file`, `edit`, `image`, `layer`, `effects`, `view`, `tools`, `help`).

### DataWorks customizations — `dataworks-plus-extensions.js`
This file (~700 lines, the most frequently modified) is the fork's main divergence from upstream. `main.js` calls three exports against the base config/menu **before** the app initializes:
- `tweakConfig(config)` — overrides defaults.
- `tweakMenuDefinition(menuDefinition)` — mutates the menu: removes upstream items (New, Search Images, many effects) and adds DataWorks items ("Save and Return", "Cancel Image Editing", "View Audit Trail", "Undo All Changes", "Restore Original Image").
- `tweakLayout(app)` — post-init DOM/layout adjustments.

It also hijacks `alertify.error/success` to run messages through translation, integrates with DataWorks DOM elements (`#ImageLoaded`, `#PMEditedPhotoEvents`), and exposes the **audit trail** (`app.pushAuditTrail`, seeded from `#PMEditedPhotoEvents`). When changing tool/menu/layout behavior, prefer editing this file over patching upstream core files.

### Lasso / Magic Crop state machine
The lasso tool (`tools/lasso.js`) is a major DataWorks feature built on a custom **state machine** in `tools/dw_extensions/` (`StateMachine.js`, `StateMachineContext.js`, `EventManager.js`, `TouchEventGenerator.js`, plus geometry helpers like `getBoundingBox`, `angleOf`, `removeColinearPoints`, `Smooth`). It maps keyboard/mouse/touch shortcuts to named actions across states (ready → drawing → placing → editing → hover → dragging → done). The full keyboard map and action list are documented in `tools/DW_LASSO.md`.

## Conventions

- ES modules, classes, mostly `var`/`function` upstream style with `var _this = this`. New DataWorks code uses modern ES (arrow functions, `const`).
- Relative imports with explicit `.js` extensions throughout.
- The active development branch is `dataworks_dev`; `master` tracks upstream. PRs typically target `master` but feature work flows through `dataworks_dev` and feature branches (e.g. `spline_draw`, `enhancement_trail`).
