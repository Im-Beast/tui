import type { BoundingRectangle } from "@tui/nice";
import { charWidth } from "@tui/strings/char_width";

export function intersects(x: number, y: number, rectangle: BoundingRectangle | null): boolean {
  if (!rectangle) return false;
  return (
    x > rectangle.left && x <= rectangle.left + rectangle.width &&
    y > rectangle.top && y <= rectangle.top + rectangle.height
  );
}

/**
 * Creates a stripe of specified width or height of given character
 */
export function stripe(char: string, size: number, orientation: "horizontal" | "vertical") {
  if (size <= 0) return "";

  let text: string;
  if (orientation === "horizontal") {
    const chWidth = charWidth(char);
    text = char.repeat(size / chWidth);
  } else {
    text = `${char}\n`.repeat(size - 1) + char;
  }
  return text;
}
