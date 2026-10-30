// jsdom has no layout: give components the browser APIs they observe layout with, reporting nothing.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {
    // jsdom never resizes.
  }
  unobserve(): void {
    // Nothing observed.
  }
  disconnect(): void {
    // Nothing observed.
  }
}

if (!('ResizeObserver' in globalThis)) globalThis.ResizeObserver = NoopResizeObserver;
