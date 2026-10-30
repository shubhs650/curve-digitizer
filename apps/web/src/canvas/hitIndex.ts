import Flatbush from 'flatbush';
import type { Vec2 } from './viewTransform';

export interface Hittable {
  /** Image px. */
  readonly px: Vec2;
}

/**
 * Spatial index over overlay items in image px (ARCHITECTURE §2: flatbush), so hover and click hit-testing stay
 * O(log n) with thousands of traced points. Immutable: rebuild it when the items change.
 */
export class HitIndex<T extends Hittable> {
  readonly #items: readonly T[];
  readonly #index: Flatbush | null;

  constructor(items: readonly T[]) {
    this.#items = items;
    if (items.length === 0) {
      this.#index = null;
      return;
    }
    const index = new Flatbush(items.length);
    for (const { px } of items) index.add(px[0], px[1], px[0], px[1]);
    index.finish();
    this.#index = index;
  }

  get size(): number {
    return this.#items.length;
  }

  /** The item closest to `p` no farther than `maxDistance` image px, or null. Ties go to the later item (drawn on top). */
  nearest(p: Vec2, maxDistance: number): T | null {
    if (!this.#index) return null;
    const ids = this.#index.search(
      p[0] - maxDistance,
      p[1] - maxDistance,
      p[0] + maxDistance,
      p[1] + maxDistance,
    );
    let best: T | null = null;
    let bestDistance = Infinity;
    for (const id of ids.sort((a, b) => a - b)) {
      const item = this.#items[id];
      if (!item) continue;
      const distance = Math.hypot(item.px[0] - p[0], item.px[1] - p[1]);
      if (distance <= maxDistance && distance <= bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Items inside the axis-aligned rectangle spanned by two corners, in index order. */
  within(a: Vec2, b: Vec2): T[] {
    if (!this.#index) return [];
    const ids = this.#index.search(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]),
    );
    return ids.sort((x, y) => x - y).flatMap((id) => this.#items[id] ?? []);
  }
}
