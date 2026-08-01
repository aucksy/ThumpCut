/**
 * Measuring a rendered screen.
 *
 * Every rule here is one that has shipped broken in a real app:
 *
 *   · A button 38px tall that nobody noticed because it looked fine.
 *   · A row that overflows a 360dp phone and clips its last control off the right edge.
 *   · A counter that vanishes at font scale 1.6 because its container had a fixed height.
 *   · Secondary text at 30% opacity that is unreadable in daylight.
 *
 * None of these fail a compile, and none of them fail a snapshot test either. They only show
 * up when something measures the real box.
 */

const MIN_TAP_TARGET = 44;
/** How far past the screen edge counts as overflow rather than a rounding artefact. */
const OVERFLOW_SLACK = 1;
const MIN_CONTRAST_RATIO = 4.5;
/** Below this a text node is considered clipped rather than deliberately hidden. */
const MIN_TEXT_HEIGHT = 6;

export interface Viewport {
  width: number;
  height: number;
}

function isInteractive(element: Element): boolean {
  const role = element.getAttribute("role");
  if (role === "button" || role === "link" || role === "checkbox" || role === "slider") return true;
  if (element.tagName === "BUTTON" || element.tagName === "A") return true;
  return element.hasAttribute("data-testid") && element.getAttribute("tabindex") !== null;
}

/** True when some ancestor scrolls horizontally, so content wider than the screen is legal. */
function insideHorizontalScroller(element: Element, frame: Element): boolean {
  let node: Element | null = element.parentElement;
  while (node && node !== frame) {
    const overflowX = getComputedStyle(node).overflowX;
    if (overflowX === "auto" || overflowX === "scroll") return true;
    node = node.parentElement;
  }
  return false;
}

function describe(element: Element): string {
  const testId = element.getAttribute("data-testid");
  if (testId) return `[${testId}]`;
  const label = element.getAttribute("aria-label");
  if (label) return `"${label.slice(0, 40)}"`;
  const text = (element.textContent ?? "").trim().slice(0, 40);
  return text ? `"${text}"` : `<${element.tagName.toLowerCase()}>`;
}

function parseColor(value: string): [number, number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] ?? 1];
}

function relativeLuminance([r, g, b]: [number, number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(
  foreground: [number, number, number, number],
  background: [number, number, number, number],
): number {
  // Composite the foreground's alpha over the background before comparing.
  const alpha = foreground[3];
  const blended: [number, number, number, number] = [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ];
  const light = Math.max(relativeLuminance(blended), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(blended), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function effectiveBackground(element: Element): [number, number, number, number] {
  let node: Element | null = element;
  while (node) {
    const colour = parseColor(getComputedStyle(node).backgroundColor);
    if (colour && colour[3] > 0.6) return colour;
    node = node.parentElement;
  }
  return [23, 24, 26, 1];
}

export function measure(frame: HTMLElement, viewport: Viewport): { problems: string[] } {
  const problems: string[] = [];
  const frameRect = frame.getBoundingClientRect();
  const seen = new Set<string>();

  const add = (problem: string) => {
    if (seen.has(problem)) return;
    seen.add(problem);
    problems.push(problem);
  };

  const elements = Array.from(frame.querySelectorAll("*"));

  for (const element of elements) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    // 1. Tap targets. 44pt is the floor the design brief sets, and it is not negotiable.
    if (isInteractive(element)) {
      const tooSmall = rect.height < MIN_TAP_TARGET - 0.5 || rect.width < MIN_TAP_TARGET - 0.5;
      if (tooSmall) {
        add(
          `tap target ${describe(element)} is ${Math.round(rect.width)}x${Math.round(rect.height)}, under ${MIN_TAP_TARGET}pt`,
        );
      }
    }

    // 2. Horizontal overflow. A phone screen is 393pt wide and nothing may hang off it —
    // except inside something the user can scroll sideways, where content wider than the
    // screen is the entire point.
    if (rect.width > 0 && !insideHorizontalScroller(element, frame)) {
      if (rect.left < frameRect.left - OVERFLOW_SLACK) {
        add(`${describe(element)} starts ${Math.round(frameRect.left - rect.left)}pt off the left edge`);
      }
      if (rect.right > frameRect.right + OVERFLOW_SLACK) {
        add(`${describe(element)} runs ${Math.round(rect.right - frameRect.right)}pt past the right edge`);
      }
    }
  }

  // 3. Text. Clipped, zero-height, or too faint to read.
  const textNodes = elements.filter(
    (element) =>
      element.childElementCount === 0 && (element.textContent ?? "").trim().length > 0,
  );

  for (const node of textNodes) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    if (rect.height > 0 && rect.height < MIN_TEXT_HEIGHT) {
      add(`text ${describe(node)} is only ${rect.height.toFixed(1)}pt tall, so it is clipped`);
    }

    // scrollHeight over clientHeight with hidden overflow is text that has been cut off.
    const element = node as HTMLElement;
    if (
      style.overflow === "hidden" &&
      element.scrollHeight > element.clientHeight + 2 &&
      style.textOverflow !== "ellipsis" &&
      Number.parseInt(style.webkitLineClamp || "0", 10) === 0
    ) {
      add(
        `text ${describe(node)} is cut off: ${element.scrollHeight}pt of text in a ${element.clientHeight}pt box`,
      );
    }

    // WCAG 1.4.3 exempts an inactive control, and rightly: a disabled button that reads at
    // full contrast looks enabled, which is a worse problem than a faint one.
    const disabled = node.closest('[aria-disabled="true"], [disabled]') !== null;

    const foreground = parseColor(style.color);
    if (!disabled && foreground && foreground[3] > 0.05) {
      const ratio = contrastRatio(foreground, effectiveBackground(node));
      if (ratio < MIN_CONTRAST_RATIO) {
        add(
          `text ${describe(node)} has a contrast ratio of ${ratio.toFixed(2)}, under ${MIN_CONTRAST_RATIO}`,
        );
      }
    }
  }

  // 4. The frame itself must not scroll sideways.
  if (frame.scrollWidth > viewport.width + OVERFLOW_SLACK) {
    add(`the screen scrolls sideways: ${frame.scrollWidth}pt of content in ${viewport.width}pt`);
  }

  return { problems };
}
