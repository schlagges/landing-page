# UI Quality Gates

This file defines failures for the final UI quality gate. The rules are generic and apply to every
reviewed web UI unless a project-specific adapter explicitly narrows the tested state.

## Pipeline Failure Policy

The UI review fails when any of the following is true:

- A critical failure is detected.
- A required breakpoint has a layout safety violation.
- The visual review rubric has any critical category scored `0`.
- The overall rubric score is below `2.8`.
- Required pages or states cannot be reached.
- The review summary cannot be generated.

## Critical Failures

- Important button not clickable.
- Button outside viewport.
- Dialog outside viewport.
- Mobile horizontal overflow.
- Covered input.
- Hidden submit button.
- Unreadable text contrast.
- Inaccessible modal close.
- Missing accessible name.
- Broken focus trap.
- Layout broken at required breakpoint.

## Layout Safety Gates

- `document.documentElement.scrollWidth` must not exceed viewport width on mobile breakpoints.
- Visible dialogs must fit inside the viewport or provide internal scrolling.
- Visible buttons, links, inputs, selects, textareas, and controls must not have zero-size boxes.
- Visible controls must not be fully outside the viewport.
- Primary actions and submit buttons must not be hidden behind fixed overlays.
- Inputs must not be covered at their center point.
- Fixed or sticky elements must not cover focused controls.

## Accessibility Gates

- Every visible interactive control must have an accessible name.
- Every visible input must have an accessible label, `aria-label`, `aria-labelledby`, or associated
  label.
- Open modals must have `role="dialog"` or native `dialog` semantics and an accessible name.
- Open modals must expose a visible close control unless the modal is intentionally blocking.
- Keyboard focus must be visible and must not move to hidden content.
- The page must have a non-empty document title.

## Visual Consistency Gates

- Text must be readable against its background.
- UI hierarchy must be clear enough to identify page title, primary content, and primary action.
- Repeated components must use consistent spacing, alignment, typography, and states.
- Loading, empty, and error states must preserve layout quality.
- Motion must not obscure controls or make text difficult to read.

## Required Evidence

Every UI review run must produce `/layout-review-summary.md` with:

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
