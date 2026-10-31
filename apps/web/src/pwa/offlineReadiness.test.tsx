import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBadge } from './OfflineBadge';
import { type OfflineProbe, offlineReadiness, RECHECK_MS, useOfflineReadiness } from './offlineReadiness';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const probe = (controlled: boolean, urls: readonly string[]): OfflineProbe => ({
  controlled: () => controlled,
  pdfiumCached: () => Promise.resolve(urls),
});

const PDFIUM = ['https://x/assets/pdfium-a.js', 'https://x/assets/pdfium-b.wasm'];

describe('offlineReadiness', () => {
  it('is none until a service worker controls the page', async () => {
    expect(await offlineReadiness(probe(false, PDFIUM))).toBe('none');
  });

  it('is images until both PDFium files are cached, then full', async () => {
    expect(await offlineReadiness(probe(true, []))).toBe('images');
    expect(await offlineReadiness(probe(true, PDFIUM.slice(0, 1)))).toBe('images');
    expect(await offlineReadiness(probe(true, PDFIUM))).toBe('full');
  });
});

describe('useOfflineReadiness', () => {
  it('looks again until PDFium has been cached', async () => {
    vi.useFakeTimers();
    let urls: readonly string[] = [];
    const live: OfflineProbe = { controlled: () => true, pdfiumCached: () => Promise.resolve(urls) };
    const { result } = renderHook(() => useOfflineReadiness(live));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe('images');
    urls = PDFIUM;
    await act(() => vi.advanceTimersByTimeAsync(RECHECK_MS));
    expect(result.current).toBe('full');
  });
});

describe('OfflineBadge', () => {
  it('says how much of the app works offline', () => {
    const { rerender } = render(<OfflineBadge readiness="none" />);
    expect(screen.queryByTestId('offline-status')).toBeNull();
    rerender(<OfflineBadge readiness="images" />);
    expect(screen.getByTestId('offline-status').textContent).toBe('Ready offline for images');
    rerender(<OfflineBadge readiness="full" />);
    expect(screen.getByTestId('offline-status').textContent).toBe('Ready offline');
  });
});
