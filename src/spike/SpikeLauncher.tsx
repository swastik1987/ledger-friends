import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

// Phase 0 spike (throwaway): the native app has no address bar, so this pill is
// the way to reach /spike. Renders in native builds only; sits bottom-left,
// above BottomNav and clear of the FloatingAdd FAB.
export default function SpikeLauncher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!Capacitor.isNativePlatform() || pathname === '/spike') return null;
  return (
    <button
      onClick={() => navigate('/spike')}
      className="fixed left-3 z-[100] rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-background shadow-lg"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
    >
      Spike
    </button>
  );
}
