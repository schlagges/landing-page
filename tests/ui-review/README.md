# Generic UI Review

This directory contains a reusable UI review agent for any web UI. Generic rules live in
`tests/ui-review/core` and use the central guidelines in `docs/ui-review`.

The review is intentionally strict. Product-specific setup belongs under
`tests/ui-review/projects/<project-name>/` and must not leak into generic checks.

## Run

Against an already running target:

```bash
UI_REVIEW_BASE_URL=http://localhost:3000 npm exec -- playwright test -c tests/ui-review/playwright.config.ts
```

Optional inputs:

```bash
UI_REVIEW_PAGES="/,/settings,/checkout"
UI_REVIEW_STATES="default,modal-open,error"
UI_REVIEW_OUTPUT=layout-review-summary.md
```

`UI_REVIEW_PAGES` accepts either a comma-separated list or JSON:

```json
[
  { "name": "Home", "path": "/" },
  { "name": "Settings", "path": "/settings" }
]
```

`UI_REVIEW_STATES` is generic metadata for summary grouping. Project adapters may add setup logic
inside `tests/ui-review/projects/<project-name>/`.

## Project Adapters

Project adapters build and start a target app, wait until it is reachable, set `UI_REVIEW_BASE_URL`,
run the generic review, and stop the server again.

```bash
npm run ui-review
```

Landing Page defaults to `http://127.0.0.1:4174`.

Pixel-baseline screenshot assertions are opt-in because generic targets do not always have committed
baselines on the first run:

```bash
UI_REVIEW_PIXEL_BASELINE=true npm run ui-review
```

Without `UI_REVIEW_PIXEL_BASELINE=true`, the review still captures screenshots, runs layout guards,
checks accessibility basics, and fails on quality-gate violations.

## Output

The review writes `/layout-review-summary.md` by default. It includes:

- Tested pages.
- Tested states.
- Tested viewports.
- Passed checks.
- Failed checks.
- Screenshots.
- Accessibility violations.
- Layout guard violations.
- Guideline references.
- Concrete fix recommendations.

## Generic Scope

The generic agent verifies:

- Layout quality.
- Responsiveness.
- Accessibility.
- Visual consistency.
- Interaction safety.
- Reachable and visible controls.
- No broken overlays.
- No clipped dialogs.
- No mobile overflow.
- No hidden or blocked buttons.
- No unreadable text.
- No unclear hierarchy.

## Project Scope

Landing-Page-specific setup may live in:

```text
tests/ui-review/projects/landing-page/
```

Generic checks must stay reusable in:

```text
docs/ui-review/
tests/ui-review/core/
```
