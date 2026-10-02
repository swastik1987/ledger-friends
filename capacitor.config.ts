import type { CapacitorConfig } from '@capacitor/cli';

// appId becomes the Play Store package name and can't change after the first
// release — `com.expensesync.app` is a placeholder until that's decided
// (docs/android-app-plan.md, open decision 2).
const config: CapacitorConfig = {
  appId: 'com.expensesync.app',
  appName: 'ExpenseSync',
  // Built with `vite build --mode capacitor`, which skips the PWA service
  // worker (see vite.config.ts).
  webDir: 'dist',
};

export default config;
