# UI Review Guidelines

These guidelines are the source of truth for automated and manual UI review. They are generic and
must not encode product-specific assumptions.

## Layout Hierarchy

- Every screen must have a clear primary task and visible hierarchy.
- Primary content must be distinguishable from navigation, secondary panels, metadata, and utility
  controls.
- Group related controls spatially and visually. Avoid mixing unrelated actions in the same visual
  group.
- The most important action on a page must be reachable without guessing and must not compete with
  destructive or secondary actions.
- Empty, loading, and error states must preserve the page structure so the UI does not jump or
  collapse unexpectedly.

## Spacing

- Use consistent spacing steps within a screen. Nearby related items should be closer than unrelated
  groups.
- Components must not touch viewport edges unless the layout intentionally uses a full-bleed surface.
- Interactive controls need enough surrounding space to avoid accidental activation.
- Dialogs, drawers, popovers, menus, and tooltips must have viewport-aware spacing and must not clip
  important content.
- Dense operational UIs may be compact, but density must not make labels, controls, or state changes
  hard to scan.

## Typography

- Text size must match the container and task. Use large display type only for true page-level
  hierarchy.
- Body text, labels, helper text, and errors must remain readable at every required breakpoint.
- Text must not overlap, clip, wrap into illegible fragments, or overflow its container.
- Avoid negative letter spacing and viewport-scaled font sizes.
- Use consistent heading levels and visible hierarchy. A page must not rely on color alone to imply
  heading importance.

## Color Usage

- Color must communicate state consistently: success, warning, error, selected, disabled, and focus
  states need distinct treatment.
- Avoid one-note palettes where every surface and control is a near-variant of one hue.
- Do not rely only on color to communicate meaning. Pair color with text, iconography, shape, or
  placement.
- Disabled controls must remain legible while clearly disabled.
- Destructive actions must be visually distinct from primary positive actions.

## Glassmorphism Rules

- Glass effects are allowed only when readability remains strong over the actual background.
- A glass surface must have enough opacity, border, shadow, or blur contrast to separate it from
  content behind it.
- Do not place dense forms, long text, data tables, or critical controls on low-contrast translucent
  surfaces.
- Glass surfaces must not stack in a way that makes hierarchy ambiguous.
- Animation and blur must not degrade performance or text clarity on mobile.

## Contrast

- Text and icon contrast must meet WCAG AA expectations for normal and large text.
- Focus indicators must be visible against both the component and the surrounding page.
- Placeholder text may be lower emphasis but must remain readable.
- Error messages and validation states must be readable without relying on color alone.
- Text over images, gradients, video, or translucent surfaces must have a stable contrast treatment.

## Responsive Behavior

- Layouts must work at all required review breakpoints.
- Mobile screens must not have horizontal document overflow.
- Navigation, filters, sidebars, and action bars must adapt without hiding critical actions.
- Reflow must preserve reading order and keyboard order.
- Content must remain usable with browser zoom and dynamic text expansion.

## Modal Behavior

- Dialogs must fit within the viewport and scroll internally when content is taller than available
  space.
- Every modal must have an accessible name and a visible, keyboard-reachable close control unless the
  flow intentionally blocks dismissal.
- Focus must move into the modal when it opens and return to the trigger when it closes.
- Focus must not escape behind an open modal.
- Backdrops must not block the modal itself or cover critical controls.

## Sidebars

- Sidebars must have clear width constraints and must not compress primary content into unusable
  space.
- Collapsed sidebars must preserve access to navigation and core actions.
- Sidebar content must scroll independently when needed.
- Active items, section labels, and nested navigation must be visually distinct.
- Sidebars on mobile should become drawers, tabs, or top-level navigation instead of forcing overflow.

## Drawers

- Drawers must not exceed the viewport width on mobile.
- Drawer close controls must be visible and keyboard reachable.
- Drawer content must scroll without losing the header or primary action when possible.
- Opening a drawer must not shift unrelated layout unexpectedly.
- Drawers must not hide required submit, cancel, or confirmation controls.

## Buttons

- Buttons must have accessible names, visible labels or well-known icons, and clear states.
- Important buttons must be visible, clickable, and inside the viewport at required breakpoints.
- Buttons must not be covered by overlays, fixed headers, cookie banners, or invisible elements.
- Primary, secondary, tertiary, destructive, and disabled states must be visually distinct.
- Icon-only buttons need accessible names and visible focus indicators.

## Forms

- Every input must have an accessible label or equivalent name.
- Submit buttons must remain visible and reachable, especially in dialogs and on mobile keyboards.
- Inputs must not be covered by sticky footers, overlays, or validation messages.
- Validation errors must identify the affected field and be announced or discoverable.
- Required, optional, disabled, and readonly states must be clear.

## Focus States

- Every interactive element must have a visible keyboard focus state.
- Focus order must follow the visual and task order.
- Focus must not land on hidden, disabled, or off-screen controls.
- Keyboard users must be able to reach, operate, and exit menus, modals, drawers, tabs, and popovers.
- Skip links or equivalent shortcuts should exist for complex pages.

## Mobile Touch Targets

- Touch targets should be at least 44 by 44 CSS pixels unless a platform-specific compact pattern is
  justified.
- Adjacent touch targets need enough spacing to avoid accidental taps.
- Fixed bars must not cover page content or controls.
- Controls near viewport edges must remain tappable.
- Hover-only interactions must have touch alternatives.

## Empty States

- Empty states must explain what is missing and provide the next useful action when one exists.
- Empty states must not look like errors unless the state is actually an error.
- Empty pages must preserve navigation and page context.
- Empty state illustrations or decoration must not dominate operational workflows.

## Loading States

- Loading states must indicate progress without causing major layout shift.
- Skeletons, spinners, and disabled controls must clearly indicate whether user action is possible.
- Critical actions must not silently disappear during loading.
- Long loading states need status text or retry paths.

## Error States

- Errors must be visible near the affected area and must include concrete recovery guidance.
- Page-level errors must not hide navigation or safe escape routes.
- Error states must be readable, accessible, and not rely only on red color.
- Retrying must not duplicate destructive operations.

## Accessibility

- Pages must have a meaningful title, language, landmarks, and accessible names for controls.
- Images that communicate meaning need alternative text. Decorative images must be ignored by assistive
  technology.
- Interactive components must expose correct roles, names, values, and states.
- Keyboard navigation must support all core workflows.
- Motion-sensitive interactions must respect reduced-motion preferences.

## Animation Restraint

- Animation must clarify state changes, not distract from the task.
- Avoid continuous motion around reading or form-entry areas.
- Transitions must be short and must not delay input.
- Essential information must not depend on animation.
- Respect `prefers-reduced-motion`.
