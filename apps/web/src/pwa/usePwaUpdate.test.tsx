import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeUpdateClient } from './fakeUpdateClient';
import { usePwaUpdate } from './usePwaUpdate';

describe('usePwaUpdate', () => {
  it('does nothing when no service worker client is available (dev server, jsdom, old browsers)', () => {
    const { result } = renderHook(() => usePwaUpdate(() => null));
    expect(result.current.needRefresh).toBe(false);
    act(() => {
      result.current.reload();
    });
    expect(result.current.needRefresh).toBe(false);
  });

  it('flags a waiting update, and can dismiss it', () => {
    const client = new FakeUpdateClient();
    const { result } = renderHook(() => usePwaUpdate(() => client));
    expect(client.registered).toBe(1);
    act(() => {
      client.emit('waiting');
    });
    expect(result.current.needRefresh).toBe(true);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.needRefresh).toBe(false);
  });

  it('reload activates the waiting worker and reloads the page when it takes control', () => {
    const client = new FakeUpdateClient();
    const reloadPage = vi.fn();
    const { result } = renderHook(() => usePwaUpdate(() => client, reloadPage));
    act(() => {
      client.emit('waiting');
    });
    act(() => {
      result.current.reload();
    });
    expect(client.skipWaitingMessages).toBe(1);
    client.emit('controlling');
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('detaches from the client on unmount', () => {
    const client = new FakeUpdateClient();
    const { unmount } = renderHook(() => usePwaUpdate(() => client));
    unmount();
    expect(client.listenerCount()).toBe(0);
  });
});
