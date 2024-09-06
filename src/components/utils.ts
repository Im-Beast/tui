import type { BoundingRectangle } from "@tui/nice";

export function intersects(x: number, y: number, rectangle: BoundingRectangle | null): boolean {
  if (!rectangle) return false;
  return (
    x > rectangle.left && x <= rectangle.left + rectangle.width &&
    y > rectangle.top && y <= rectangle.top + rectangle.height
  );
}
