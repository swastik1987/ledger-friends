import { App } from '@capacitor/app';
import { hasOpenOverlay } from '@/hooks/useOverlayBack';

// Android-only wiring for the Capacitor shell. Loaded through a dynamic import
// from main.tsx when running natively, so the web bundle never pulls it in.

/**
 * Route the Android back button through browser history, the same path the
 * web's back gesture takes. Without a listener Android finishes the activity,
 * so BACK with a sheet open used to leave the app.
 *
 * - An open overlay (sheet, dialog, popover) closes: useOverlayBack pushed a
 *   history entry for it and closes it on popstate.
 * - On "/" (Home, or Landing when signed out), BACK backgrounds the app like
 *   any Android root screen, rather than stepping back into history left over
 *   from sign-in.
 * - Elsewhere it navigates back, or backgrounds the app when there's no
 *   history (e.g. a cold start that redirected straight to /auth).
 */
function handleBackButton({ canGoBack }: { canGoBack: boolean }) {
  if (hasOpenOverlay()) {
    window.history.back();
  } else if (window.location.pathname === '/' || !canGoBack) {
    void App.minimizeApp();
  } else {
    window.history.back();
  }
}

export function initNativeShell() {
  void App.addListener('backButton', handleBackButton);
}
