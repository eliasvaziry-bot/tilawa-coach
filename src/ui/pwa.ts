// Service-worker registration with an explicit "Update" button (never reloads under the user mid-recitation).
import { signal } from '@preact/signals';

export const updateReady = signal(false);
export const swStatus = signal<'unsupported' | 'registering' | 'active' | 'error'>('registering');
let doUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export async function initPwa(): Promise<void> {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    swStatus.value = 'unsupported';
    return;
  }
  try {
    const { registerSW } = await import('virtual:pwa-register');
    doUpdate = registerSW({
      immediate: true,
      onNeedRefresh: () => (updateReady.value = true),
      onRegisteredSW: () => (swStatus.value = 'active'),
      onRegisterError: () => (swStatus.value = 'error'),
    });
  } catch {
    swStatus.value = 'error';
  }
}

export function applyUpdate(): void {
  void doUpdate?.(true);
}

/** Ask the browser to keep our data (Safari may evict sites not on the Home Screen). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return navigator.storage?.persist ? await navigator.storage.persist() : null;
  } catch {
    return null;
  }
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
