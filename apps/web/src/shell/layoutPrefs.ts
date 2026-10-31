// Panel sizes the user chose, remembered in this origin's localStorage (never sent anywhere). Storage may be
// unavailable (private windows, blocked storage); the layout then starts from the defaults every time.

const DOCK_KEY = 'curve-digitizer:dock';

/** Smallest dock body the splitter allows, CSS px: the tab row plus two table rows. */
export const DOCK_MIN = 120;
/** Default dock body height, CSS px. */
export const DOCK_DEFAULT = 220;
/** Below this window height the dock starts collapsed, so a laptop opens with the canvas at full height. */
export const DOCK_OPEN_MIN_WINDOW = 800;
/** Below this window width the project sidebar starts hidden, leaving the canvas at least half the width. */
export const SIDEBAR_OPEN_MIN_WINDOW = 1200;
/** The canvas keeps at least this much height when the dock is dragged up, CSS px. */
export const CANVAS_MIN_HEIGHT = 200;

export interface DockPrefs {
  readonly open: boolean;
  readonly height: number;
}

/** Dock state at startup: what the user left last time, else open on tall windows only. */
export function initialDock(windowHeight: number, stored: string | null): DockPrefs {
  const fallback: DockPrefs = { open: windowHeight >= DOCK_OPEN_MIN_WINDOW, height: DOCK_DEFAULT };
  if (stored === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const { open, height } = parsed as { open?: unknown; height?: unknown };
    return {
      open: typeof open === 'boolean' ? open : fallback.open,
      height:
        typeof height === 'number' && Number.isFinite(height) ? Math.max(DOCK_MIN, height) : DOCK_DEFAULT,
    };
  } catch {
    return fallback;
  }
}

/** Clamps a dock height so the canvas above it keeps {@link CANVAS_MIN_HEIGHT}. */
export function clampDockHeight(height: number, columnHeight: number, headerHeight: number): number {
  const max = Math.max(DOCK_MIN, columnHeight - headerHeight - CANVAS_MIN_HEIGHT);
  return Math.round(Math.min(max, Math.max(DOCK_MIN, height)));
}

export function initialSidebarOpen(windowWidth: number): boolean {
  return windowWidth >= SIDEBAR_OPEN_MIN_WINDOW;
}

export const dockPreference = {
  load(windowHeight: number): DockPrefs {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DOCK_KEY);
    } catch {
      // No storage: defaults.
    }
    return initialDock(windowHeight, stored);
  },
  save(prefs: DockPrefs): void {
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify(prefs));
    } catch {
      // Without storage the dock simply starts from the defaults next time.
    }
  },
};
