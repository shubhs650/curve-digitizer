import { describe, expect, it, vi } from 'vitest';
import { FakeUpdateClient } from './fakeUpdateClient';
import { registerServiceWorker } from './register';

function setup() {
  const client = new FakeUpdateClient();
  const onNeedRefresh = vi.fn();
  const reload = vi.fn();
  const controller = registerServiceWorker(client, { onNeedRefresh, reload });
  return { client, onNeedRefresh, reload, controller };
}

describe('registerServiceWorker', () => {
  it('registers the service worker once', () => {
    const { client } = setup();
    expect(client.registered).toBe(1);
  });

  it('reports a new version when an updated worker is waiting', () => {
    const { client, onNeedRefresh } = setup();
    expect(onNeedRefresh).not.toHaveBeenCalled();
    client.emit('waiting');
    expect(onNeedRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not reload on its own: the first install taking control must not interrupt the user', () => {
    const { client, reload } = setup();
    client.emit('controlling');
    expect(reload).not.toHaveBeenCalled();
  });

  it('applies an update by activating the waiting worker, then reloads once it controls the page', () => {
    const { client, reload, controller } = setup();
    client.emit('waiting');
    controller.applyUpdate();
    expect(client.skipWaitingMessages).toBe(1);
    expect(reload).not.toHaveBeenCalled();
    client.emit('controlling');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners when disposed', () => {
    const { client, onNeedRefresh, controller } = setup();
    controller.applyUpdate();
    controller.dispose();
    expect(client.listenerCount()).toBe(0);
    client.emit('waiting');
    expect(onNeedRefresh).not.toHaveBeenCalled();
  });

  it('reports a failed registration without throwing, so the app still runs online', async () => {
    const client = new FakeUpdateClient();
    const error = new Error('blocked');
    client.register = () => Promise.reject(error);
    const onError = vi.fn();
    registerServiceWorker(client, { onNeedRefresh: vi.fn(), reload: vi.fn(), onError });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
  });
});
