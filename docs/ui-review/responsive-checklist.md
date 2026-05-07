# Responsive Checklist

Every reviewed page and relevant state must be tested at the breakpoints below unless a project
adapter documents why a state is not relevant.

## Required Breakpoints

| Name             | Size        |
| ---------------- | ----------- |
| Small mobile     | `360x740`   |
| Standard mobile  | `390x844`   |
| Tablet portrait  | `768x1024`  |
| Tablet landscape | `1024x768`  |
| Desktop          | `1440x900`  |
| Large desktop    | `1920x1080` |
| Wide desktop     | `2560x1440` |

## Checks Per Breakpoint

- No document-level horizontal overflow.
- Primary navigation remains reachable.
- Primary action remains visible and clickable.
- Dialogs, drawers, menus, and popovers fit the viewport.
- Submit buttons remain reachable in forms and dialogs.
- Text remains readable and does not clip or overlap.
- Cards, panels, tables, lists, and toolbars do not collapse into unusable widths.
- Sticky and fixed elements do not cover content or focused controls.
- Touch targets on mobile are large enough and not crowded.
- Keyboard focus remains visible.

## Page And State Coverage

Each page/state combination should include:

- Default loaded state.
- Empty state when applicable.
- Loading state when controllable.
- Error state when controllable.
- Modal or drawer open state when available.
- Form validation state when applicable.
- Authenticated and unauthenticated states when relevant.

## Evidence

For every tested breakpoint, the review must record:

- Page URL or route.
- State name.
- Viewport size.
- Screenshot path.
- Passed layout guards.
- Failed layout guards.
- Accessibility violations.
- Recommended fixes.
