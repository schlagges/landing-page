# Visual Review Rubric

Use this rubric for human review, agent review, and automated summary scoring. Scores are integers:

- `0` = broken
- `1` = poor
- `2` = acceptable
- `3` = good
- `4` = excellent

The final UI quality gate fails when:

- Any critical category is `0`.
- Overall score is below `2.8`.
- Layout safety checks fail.

## Scored Categories

| Category                 | What To Evaluate                                                                          | Critical |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------- |
| Clarity                  | The page purpose, current state, and next action are obvious.                             | Yes      |
| Hierarchy                | Titles, sections, primary content, secondary content, and actions have clear priority.    | Yes      |
| Spacing                  | Related items are grouped, unrelated groups are separated, and density is intentional.    | No       |
| Alignment                | Controls, text, panels, and repeated elements align consistently.                         | No       |
| Visual consistency       | Components, states, color, typography, and iconography follow a coherent system.          | No       |
| Density                  | The amount of information fits the workflow without crowding or wasting space.            | No       |
| Interaction affordance   | Clickable, selected, disabled, destructive, and editable elements are obvious.            | Yes      |
| Responsive quality       | The layout remains usable at required breakpoints with no overflow or clipped controls.   | Yes      |
| Accessibility impression | Names, focus, contrast, keyboard flow, and semantic structure appear usable.              | Yes      |
| Polish                   | The UI feels finished: no awkward wrapping, jitter, accidental overlaps, or rough states. | No       |

## Score Descriptions

### 0 Broken

- The category blocks completion or creates severe ambiguity.
- Critical controls are hidden, clipped, unreadable, inaccessible, or unreachable.
- The screen cannot be trusted as a release candidate.

### 1 Poor

- The UI technically renders but has obvious quality problems.
- Users can likely continue only with effort or prior knowledge.
- Visual hierarchy, spacing, responsiveness, or accessibility is weak enough to need redesign.

### 2 Acceptable

- The UI is usable and mostly understandable.
- Issues are present but localized and fixable without changing the whole structure.
- The screen can pass only if no critical gate fails and the overall score stays at or above `2.8`.

### 3 Good

- The UI is clear, consistent, responsive, and accessible for normal use.
- Minor polish issues may remain but do not block workflows.
- The screen follows the central guidelines.

### 4 Excellent

- The UI is highly clear, resilient, and refined across states and breakpoints.
- Hierarchy, spacing, interactions, and accessibility support repeated real-world use.
- Edge states are handled with the same quality as the default state.

## Review Method

1. Run layout safety and accessibility checks first.
2. Review screenshots for each page, state, and required breakpoint.
3. Score every category from `0` to `4`.
4. Mark any critical category scored `0`.
5. Calculate the average across all categories.
6. Fail the review if any failure condition is met.
7. Record concrete fixes with references to `docs/ui-review/ui-guidelines.md`.
