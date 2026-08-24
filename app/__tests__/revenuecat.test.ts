import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadRevenueCat(
  capacitor: { isNativePlatform?: boolean; platform?: 'android' | 'ios' | 'web' } = {},
  apiKey = 'appl_test'
) {
  vi.resetModules();
  vi.stubEnv('VITE_REVENUECAT_IOS_API_KEY', apiKey);
  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      isNativePlatform: () => capacitor.isNativePlatform ?? false,
      getPlatform: () => capacitor.platform ?? 'web',
    },
  }));
  const configure = vi.fn().mockResolvedValue(undefined);
  const logOut = vi.fn().mockResolvedValue(undefined);
  vi.doMock('@revenuecat/purchases-capacitor', () => ({
    Purchases: { configure, logOut },
  }));
  const mod = await import('@/app/lib/billing/revenuecat');
  return { ...mod, configureMock: configure, logOutMock: logOut };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('isIOSNativeApp', () => {
  it('is true only for native iOS', async () => {
    const { isIOSNativeApp } = await loadRevenueCat({ isNativePlatform: true, platform: 'ios' });
    expect(isIOSNativeApp()).toBe(true);
  });

  it('is false on web', async () => {
    const { isIOSNativeApp } = await loadRevenueCat();
    expect(isIOSNativeApp()).toBe(false);
  });

  it('is false on native Android', async () => {
    const { isIOSNativeApp } = await loadRevenueCat({ isNativePlatform: true, platform: 'android' });
    expect(isIOSNativeApp()).toBe(false);
  });
});

describe('configureRevenueCat', () => {
  it('is a no-op off iOS', async () => {
    const { configureRevenueCat, configureMock } = await loadRevenueCat();
    await configureRevenueCat('user-1');
    expect(configureMock).not.toHaveBeenCalled();
  });

  it('is a no-op when no API key is set', async () => {
    const { configureRevenueCat, configureMock } = await loadRevenueCat({ isNativePlatform: true, platform: 'ios' }, '');
    await configureRevenueCat('user-1');
    expect(configureMock).not.toHaveBeenCalled();
  });

  it('configures the SDK with the app user id on iOS', async () => {
    const { configureRevenueCat, configureMock } = await loadRevenueCat({ isNativePlatform: true, platform: 'ios' });
    await configureRevenueCat('user-1');
    expect(configureMock).toHaveBeenCalledWith({ apiKey: 'appl_test', appUserID: 'user-1' });
  });
});

describe('logOutRevenueCat', () => {
  it('is a no-op when never configured', async () => {
    const { logOutRevenueCat, logOutMock } = await loadRevenueCat({ isNativePlatform: true, platform: 'ios' });
    await logOutRevenueCat();
    expect(logOutMock).not.toHaveBeenCalled();
  });

  it('logs out after a successful configure', async () => {
    const { configureRevenueCat, logOutRevenueCat, logOutMock } = await loadRevenueCat({ isNativePlatform: true, platform: 'ios' });
    await configureRevenueCat('user-1');
    await logOutRevenueCat();
    expect(logOutMock).toHaveBeenCalled();
  });
});
