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

// A laptop-sized window (jsdom defaults to 1024 × 768), so the shell starts with the sidebar and dock open.
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
