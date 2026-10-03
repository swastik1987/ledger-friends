import { Capacitor } from '@capacitor/core';

/**
 * True inside the Android app (Capacitor shell), false on the web/PWA.
 * Native-only code paths (the local SQLite store, offline auth) branch on this
 * and load their modules with dynamic imports, so the web bundle never pulls
 * them in.
 */
export const isNativeApp = Capacitor.isNativePlatform();

export const OFFLINE_MESSAGE = "You're offline. This needs an internet connection.";

/**
 * Android app: fail fast, with a clear message, for features that stay
 * online-only (statement upload, trackers, members, categories, moving
 * transactions). Its mutations run even offline (networkMode 'always'), so
 * without this they'd surface a raw "Failed to fetch". No-op on the web.
 */
export function assertOnline(): void {
  if (isNativeApp && !navigator.onLine) throw new Error(OFFLINE_MESSAGE);
}
