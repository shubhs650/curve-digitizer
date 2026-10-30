import type { UpdateClient, UpdateClientEvent } from './register';

// In-memory stand-in for workbox-window's Workbox: jsdom has no service workers, and the tests drive the
// 'waiting' / 'controlling' lifecycle by hand.
export class FakeUpdateClient implements UpdateClient {
  readonly listeners = new Map<UpdateClientEvent, Set<() => void>>();
  registered = 0;
  skipWaitingMessages = 0;

  addEventListener(type: UpdateClientEvent, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: UpdateClientEvent, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  register(): Promise<undefined> {
    this.registered += 1;
    return Promise.resolve(undefined);
  }

  messageSkipWaiting(): void {
    this.skipWaitingMessages += 1;
  }

  emit(type: UpdateClientEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}
