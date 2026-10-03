import { useSyncExternalStore } from 'react';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { CloudArrowUp, CloudSlash, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const subscribeOnline = (cb: () => void) => onlineManager.subscribe(cb);
const isOnline = () => onlineManager.isOnline();

/**
 * Android app only: a small pill above the bottom nav that says when the app
 * is offline, how many local changes are waiting to sync, and how many the
 * server rejected. Hidden when everything is synced and online.
 */
export default function SyncStatusPill() {
  const { user } = useAuth();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const { data } = useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => (await import('@/lib/local/outbox')).readSyncCounts(),
    enabled: !!user,
    // Local writes and pushes re-run every query, so this stays current; the
    // interval only covers a push finishing while nothing else re-reads.
    refetchInterval: 15_000,
  });

  if (!user) return null;
  const pending = data?.pending ?? 0;
  const failed = data?.failed ?? 0;
  if (online && pending === 0 && failed === 0) return null;

  const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;
  let icon = <CloudArrowUp size={14} weight="bold" />;
  let text = `Syncing ${changes(pending)}…`;
  let tone = 'bg-ink text-white';
  if (failed > 0) {
    icon = <WarningCircle size={14} weight="bold" />;
    text = `${changes(failed)} couldn't sync`;
    tone = 'bg-spend text-white';
  } else if (!online) {
    icon = <CloudSlash size={14} weight="bold" />;
    text = pending > 0 ? `Offline · ${changes(pending)} waiting to sync` : 'Offline · showing saved data';
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (failed > 0) {
          toast.error(`The server rejected ${changes(failed)}${data?.lastError ? `: ${data.lastError}` : ''}. Those transactions are marked on their cards.`);
        }
      }}
      className={`fixed left-4 z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg ${tone}`}
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
      aria-live="polite"
    >
      {icon}
      {text}
    </button>
  );
}
