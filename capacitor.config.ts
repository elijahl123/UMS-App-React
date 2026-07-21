/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.untitledmanagementsoftware.app',
  appName: 'Untitled Management Software',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
  },
  plugins: {
    LocalNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
};

export default config;
