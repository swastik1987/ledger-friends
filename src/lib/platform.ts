import { Capacitor } from '@capacitor/core';

/**
 * True inside the Android app (Capacitor shell), false on the web/PWA.
 * Native-only code paths (the local SQLite store, offline auth) branch on this
 * and load their modules with dynamic imports, so the web bundle never pulls
 * them in.
 */
export const isNativeApp = Capacitor.isNativePlatform();
