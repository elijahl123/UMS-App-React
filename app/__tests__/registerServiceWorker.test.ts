import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, shouldRegisterServiceWorker } from '@/app/lib/registerServiceWorker';

function createNavigatorWithServiceWorker(register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration))) {
  return { serviceWorker: { register } } as unknown as Navigator;
}

describe('registerServiceWorker', () => {
  it('registers in production browser builds with service worker support', () => {
    expect(
      shouldRegisterServiceWorker({
        isProduction: true,
        isNativePlatform: false,
        currentNavigator: createNavigatorWithServiceWorker(),
      })
    ).toBe(true);
  });

  it('skips registration inside native Capacitor builds', () => {
    expect(
      shouldRegisterServiceWorker({
        isProduction: true,
        isNativePlatform: true,
        currentNavigator: createNavigatorWithServiceWorker(),
      })
    ).toBe(false);
  });

  it('does not register before production or without service worker support', () => {
    expect(
      shouldRegisterServiceWorker({
        isProduction: false,
        isNativePlatform: false,
        currentNavigator: createNavigatorWithServiceWorker(),
      })
    ).toBe(false);

    expect(
      shouldRegisterServiceWorker({
        isProduction: true,
        isNativePlatform: false,
        currentNavigator: {} as Navigator,
      })
    ).toBe(false);
  });

  it('registers /sw.js on window load for production browser builds', async () => {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    const addEventListener = vi.fn();

    registerServiceWorker({
      isProduction: true,
      isNativePlatform: false,
      currentNavigator: createNavigatorWithServiceWorker(register),
      currentWindow: { addEventListener } as unknown as Pick<Window, 'addEventListener'>,
    });

    expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function));

    const loadListener = addEventListener.mock.calls[0][1] as () => void;
    loadListener();
    await Promise.resolve();

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('does not attach a load listener for native Capacitor builds', () => {
    const addEventListener = vi.fn();

    registerServiceWorker({
      isProduction: true,
      isNativePlatform: true,
      currentNavigator: createNavigatorWithServiceWorker(),
      currentWindow: { addEventListener } as unknown as Pick<Window, 'addEventListener'>,
    });

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
