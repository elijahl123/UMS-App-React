import { Capacitor } from '@capacitor/core';

interface ServiceWorkerRegistrationOptions {
  isProduction?: boolean;
  isNativePlatform?: boolean;
  currentNavigator?: Navigator;
  currentWindow?: Pick<Window, 'addEventListener'>;
}

export function shouldRegisterServiceWorker(options: ServiceWorkerRegistrationOptions = {}) {
  const isProduction = options.isProduction ?? import.meta.env.PROD;
  const isNativePlatform = options.isNativePlatform ?? Capacitor.isNativePlatform();
  const currentNavigator = options.currentNavigator ?? navigator;

  return isProduction && !isNativePlatform && 'serviceWorker' in currentNavigator;
}

export function registerServiceWorker(options: ServiceWorkerRegistrationOptions = {}) {
  if (!shouldRegisterServiceWorker(options)) {
    return;
  }

  const currentNavigator = options.currentNavigator ?? navigator;
  const currentWindow = options.currentWindow ?? window;

  currentWindow.addEventListener('load', () => {
    currentNavigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[PWA] Service worker registration failed:', error);
    });
  });
}
