import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface UiReviewPage {
  readonly name: string;
  readonly path: string;
}

export interface UiReviewState {
  readonly name: string;
}

export interface UiReviewViewport {
  readonly height: number;
  readonly name: string;
  readonly width: number;
}

export interface GuardViolation {
  readonly check: string;
  readonly guideline: string;
  readonly message: string;
  readonly recommendation: string;
  readonly selector?: string;
}

export interface ReviewResult {
  readonly accessibilityViolations: readonly GuardViolation[];
  readonly failedChecks: readonly string[];
  readonly layoutGuardViolations: readonly GuardViolation[];
  readonly page: string;
  readonly passedChecks: readonly string[];
  readonly screenshot: string;
  readonly state: string;
  readonly viewport: string;
}

export const requiredViewports: readonly UiReviewViewport[] = [
  { height: 740, name: "small-mobile", width: 360 },
  { height: 844, name: "standard-mobile", width: 390 },
  { height: 1024, name: "tablet-portrait", width: 768 },
  { height: 768, name: "tablet-landscape", width: 1024 },
  { height: 900, name: "desktop", width: 1440 },
  { height: 1080, name: "large-desktop", width: 1920 },
  { height: 1440, name: "wide-desktop", width: 2560 },
];

const passedCheckNames = [
  "document has no unexpected horizontal overflow",
  "visible controls have dimensions",
  "visible controls stay inside viewport",
  "inputs are not covered at center point",
  "visible submit buttons are reachable",
  "open dialogs fit viewport and expose close affordance",
  "interactive controls expose accessible names",
  "page has a non-empty title",
];

export function readReviewPages(): readonly UiReviewPage[] {
  const raw = process.env.UI_REVIEW_PAGES;
  if (!raw?.trim()) {
    return [{ name: "default", path: "/" }];
  }

  if (raw.trim().startsWith("[")) {
    const parsed = JSON.parse(raw) as readonly Partial<UiReviewPage>[];
    return parsed.map((page, index) => ({
      name: page.name?.trim() || `page-${index + 1}`,
      path: page.path?.trim() || "/",
    }));
  }

  return raw
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => ({
      name: path === "/" ? "home" : path.replace(/^\//, ""),
      path,
    }));
}

export function readReviewStates(): readonly UiReviewState[] {
  const raw = process.env.UI_REVIEW_STATES;
  if (!raw?.trim()) {
    return [{ name: "default" }];
  }

  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export async function runLayoutGuards(
  page: Page,
): Promise<readonly GuardViolation[]> {
  return page.evaluate(() => {
    const violations: GuardViolation[] = [];
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth <= 430;

    if (isMobile && document.documentElement.scrollWidth > viewportWidth + 1) {
      violations.push({
        check: "mobile horizontal overflow",
        guideline: "docs/ui-review/responsive-checklist.md",
        message: `Document width ${document.documentElement.scrollWidth}px exceeds viewport ${viewportWidth}px.`,
        recommendation:
          "Constrain wide content, drawers, tables, and fixed elements within the viewport.",
      });
    }

    const controls = visibleElements(
      'button, [role="button"], a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    );

    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      const selector = describeElement(element);
      if (rect.width < 1 || rect.height < 1) {
        violations.push({
          check: "visible control has dimensions",
          guideline: "docs/ui-review/ui-guidelines.md#buttons",
          message:
            "A visible interactive control has a zero-size or near-zero-size box.",
          recommendation:
            "Give every visible interactive control stable dimensions.",
          selector,
        });
      }

      if (
        isHorizontallyOutsideViewport(rect) ||
        isFixedOutsideViewport(element, rect)
      ) {
        violations.push({
          check: "control inside viewport",
          guideline: "docs/ui-review/ui-quality-gates.md#critical-failures",
          message:
            "A visible interactive control is outside the usable viewport.",
          recommendation:
            "Reflow or reposition the control for this breakpoint.",
          selector,
        });
      }
    }

    for (const input of visibleElements("input, select, textarea")) {
      const rect = input.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topElement = document.elementFromPoint(centerX, centerY);
      if (topElement && input !== topElement && !input.contains(topElement)) {
        violations.push({
          check: "covered input",
          guideline: "docs/ui-review/ui-quality-gates.md#critical-failures",
          message: "An input is covered at its center point.",
          recommendation:
            "Move overlays, sticky elements, or validation content so the input remains reachable.",
          selector: describeElement(input),
        });
      }
    }

    for (const submit of visibleElements(
      'button[type="submit"], input[type="submit"]',
    )) {
      const rect = submit.getBoundingClientRect();
      if (
        isHorizontallyOutsideViewport(rect) ||
        isFixedOutsideViewport(submit, rect)
      ) {
        violations.push({
          check: "hidden submit button",
          guideline: "docs/ui-review/ui-quality-gates.md#critical-failures",
          message:
            "A visible submit button is clipped or outside the usable viewport.",
          recommendation:
            "Keep submit actions visible or provide a sticky action area that does not cover content.",
          selector: describeElement(submit),
        });
      }
    }

    for (const dialog of visibleElements(
      'dialog, [role="dialog"], [aria-modal="true"]',
    )) {
      const rect = dialog.getBoundingClientRect();
      if (
        rect.left < 0 ||
        rect.top < 0 ||
        rect.right > viewportWidth ||
        rect.bottom > viewportHeight
      ) {
        violations.push({
          check: "dialog inside viewport",
          guideline: "docs/ui-review/ui-guidelines.md#modal-behavior",
          message: "An open dialog extends outside the viewport.",
          recommendation:
            "Constrain dialog dimensions and use internal scrolling for long content.",
          selector: describeElement(dialog),
        });
      }

      const close = dialog.querySelector(
        'button[aria-label*="close" i], button[aria-label*="dismiss" i], button[aria-label*="schli" i], [data-close], form[method="dialog"] button',
      );
      if (!close || !isVisible(close)) {
        violations.push({
          check: "modal close affordance",
          guideline: "docs/ui-review/ui-quality-gates.md#critical-failures",
          message: "An open modal has no visible close control.",
          recommendation:
            "Add a visible, keyboard-reachable close control or document why dismissal is blocked.",
          selector: describeElement(dialog),
        });
      }
    }

    for (const element of controls) {
      if (hasAccessibleName(element)) {
        continue;
      }

      violations.push({
        check: "accessible name",
        guideline: "docs/ui-review/ui-quality-gates.md#accessibility-gates",
        message: "A visible interactive control has no accessible name.",
        recommendation:
          "Add visible text, an associated label, aria-label, aria-labelledby, or descriptive alt text.",
        selector: describeElement(element),
      });
    }

    if (!document.title.trim()) {
      violations.push({
        check: "document title",
        guideline: "docs/ui-review/ui-quality-gates.md#accessibility-gates",
        message: "The document has no title.",
        recommendation:
          "Set a concise page title that identifies the current product and page.",
      });
    }

    return violations;

    function visibleElements(selector: string): HTMLElement[] {
      return Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      ).filter(isVisible);
    }

    function isVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function hasAccessibleName(element: Element): boolean {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      const ariaLabelledBy = element.getAttribute("aria-labelledby")?.trim();
      const title = element.getAttribute("title")?.trim();
      const alt = element.getAttribute("alt")?.trim();
      const text = element.textContent?.trim();
      const id = element.getAttribute("id");
      const label = id
        ? document
            .querySelector(`label[for="${CSS.escape(id)}"]`)
            ?.textContent?.trim()
        : "";
      return Boolean(
        ariaLabel || ariaLabelledBy || title || alt || text || label,
      );
    }

    function isHorizontallyOutsideViewport(rect: DOMRect): boolean {
      return (
        rect.right < 0 ||
        rect.left > viewportWidth ||
        rect.left < 0 ||
        rect.right > viewportWidth
      );
    }

    function isFixedOutsideViewport(element: Element, rect: DOMRect): boolean {
      const position = window.getComputedStyle(element).position;
      return (
        (position === "fixed" || position === "sticky") &&
        (rect.bottom < 0 ||
          rect.top > viewportHeight ||
          rect.top < 0 ||
          rect.bottom > viewportHeight)
      );
    }

    function describeElement(element: Element): string {
      const id = element.getAttribute("id");
      if (id) {
        return `#${id}`;
      }
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return `[data-testid="${testId}"]`;
      }
      const label = element.getAttribute("aria-label");
      if (label) {
        return `${element.tagName.toLowerCase()}[aria-label="${label}"]`;
      }
      const classes = Array.from(element.classList).slice(0, 3).join(".");
      return classes
        ? `${element.tagName.toLowerCase()}.${classes}`
        : element.tagName.toLowerCase();
    }
  });
}

export async function captureReviewScreenshot(
  page: Page,
  testInfo: TestInfo,
  pageName: string,
  stateName: string,
  viewport: UiReviewViewport,
): Promise<string> {
  const filename = `${slug(pageName)}-${slug(stateName)}-${viewport.width}x${viewport.height}.png`;
  const path = testInfo.outputPath(filename);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(filename, { contentType: "image/png", path });
  return path;
}

export function toReviewResult(input: {
  readonly accessibilityViolations?: readonly GuardViolation[];
  readonly layoutGuardViolations: readonly GuardViolation[];
  readonly page: UiReviewPage;
  readonly screenshot: string;
  readonly state: UiReviewState;
  readonly viewport: UiReviewViewport;
}): ReviewResult {
  const violations = [
    ...input.layoutGuardViolations,
    ...(input.accessibilityViolations ?? []),
  ];
  return {
    accessibilityViolations: input.accessibilityViolations ?? [],
    failedChecks: [...new Set(violations.map((violation) => violation.check))],
    layoutGuardViolations: input.layoutGuardViolations,
    page: input.page.name,
    passedChecks: violations.length === 0 ? passedCheckNames : [],
    screenshot: input.screenshot,
    state: input.state.name,
    viewport: `${input.viewport.width}x${input.viewport.height}`,
  };
}

export async function appendReviewSummary(
  results: readonly ReviewResult[],
): Promise<void> {
  const output = resolve(
    process.cwd(),
    process.env.UI_REVIEW_OUTPUT ?? "layout-review-summary.md",
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderSummary(results), "utf8");
}

export async function expectNoGuardViolations(
  violations: readonly GuardViolation[],
): Promise<void> {
  expect(violations, formatViolations(violations)).toEqual([]);
}

function renderSummary(results: readonly ReviewResult[]): string {
  const failed = results.flatMap((result) =>
    [...result.layoutGuardViolations, ...result.accessibilityViolations].map(
      (violation) => ({
        result,
        violation,
      }),
    ),
  );
  return `# Layout Review Summary

Generated by the generic UI review agent.

## Tested Pages

${unique(results.map((result) => result.page))}

## Tested States

${unique(results.map((result) => result.state))}

## Tested Viewports

${unique(results.map((result) => result.viewport))}

## Passed Checks

${unique(results.flatMap((result) => result.passedChecks))}

## Failed Checks

${failed.length === 0 ? "- None" : failed.map(({ violation }) => `- ${violation.check}: ${violation.message}`).join("\n")}

## Screenshots

${results.map((result) => `- ${result.page} / ${result.state} / ${result.viewport}: ${result.screenshot}`).join("\n")}

## Accessibility Violations

${renderViolationList(results.flatMap((result) => result.accessibilityViolations))}

## Layout Guard Violations

${renderViolationList(results.flatMap((result) => result.layoutGuardViolations))}

## Guideline References

${unique(failed.map(({ violation }) => violation.guideline))}

## Concrete Fix Recommendations

${failed.length === 0 ? "- No fixes required by automated guards." : failed.map(({ result, violation }) => `- ${result.page} / ${result.state} / ${result.viewport}: ${violation.recommendation}`).join("\n")}
`;
}

function renderViolationList(violations: readonly GuardViolation[]): string {
  if (violations.length === 0) {
    return "- None";
  }
  return violations
    .map(
      (violation) =>
        `- ${violation.check}${violation.selector ? ` (${violation.selector})` : ""}: ${violation.message}`,
    )
    .join("\n");
}

function unique(values: readonly string[]): string {
  const entries = [...new Set(values.filter(Boolean))];
  return entries.length === 0
    ? "- None"
    : entries.map((value) => `- ${value}`).join("\n");
}

function formatViolations(violations: readonly GuardViolation[]): string {
  return violations
    .map(
      (violation) =>
        `${violation.check}: ${violation.message} ${violation.selector ?? ""}`,
    )
    .join("\n");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
