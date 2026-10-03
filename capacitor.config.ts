import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Becomes the Play Store package name and can't change after the first
  // release. It's also registered on the Android OAuth client together with
  // each signing key's SHA-1 (docs/android-google-signin.md).
  appId: 'com.expensesync.app',
  appName: 'ExpenseSync',
  // Built with `vite build --mode capacitor` (`bun run build:android`), which
  // skips the PWA service worker and drops `viewport-fit=cover` (vite.config.ts).
  webDir: 'dist',
  plugins: {
    SocialLogin: {
      // Only native Google sign-in is used. The Facebook provider pulls in the
      // Facebook SDK, with advertising-ID, ad-services and install-referrer
      // permissions a finance app shouldn't declare. Disabled providers aren't
      // bundled.
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
    SystemBars: {
      // The app is light-only: dark status/gesture-bar icons on the cream
      // window background, even when the phone is in dark mode.
      style: 'LIGHT',
    },
  },
};

export default config;
