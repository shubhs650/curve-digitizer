export type UpdateClientEvent = 'waiting' | 'controlling';

// The subset of workbox-window's Workbox that the update flow uses.
export interface UpdateClient {
  addEventListener(type: UpdateClientEvent, listener: () => void): void;
  removeEventListener(type: UpdateClientEvent, listener: () => void): void;
  register(): Promise<unknown>;
  messageSkipWaiting(): void;
}

export interface RegisterOptions {
  readonly onNeedRefresh: () => void;
  readonly reload: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface UpdateController {
  /** Activates the waiting worker; the page reloads once that worker controls it. */
  applyUpdate(): void;
  dispose(): void;
}

export function registerServiceWorker(client: UpdateClient, options: RegisterOptions): UpdateController {
  const onWaiting = () => {
    options.onNeedRefresh();
  };
  // Only listen for 'controlling' after the user asked for the update; on first install the new worker
  // also takes control (clientsClaim) and that must not reload the page under the user.
  const onControlling = () => {
    options.reload();
  };
  client.addEventListener('waiting', onWaiting);
  client.register().catch((error: unknown) => {
    (options.onError ?? console.warn)(error);
  });

  return {
    applyUpdate() {
      client.addEventListener('controlling', onControlling);
      client.messageSkipWaiting();
    },
    dispose() {
      client.removeEventListener('waiting', onWaiting);
      client.removeEventListener('controlling', onControlling);
    },
  };
}
