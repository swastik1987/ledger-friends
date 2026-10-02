import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { getMeta, setMeta } from './localDb';
import {
  createExpenseOffline, listLocalExpenses, listOutbox, localCounts, pullExpenses, pushOutbox,
  requeueLastSpikeExpense, type LocalExpense, type OutboxEntry,
} from './syncEngine';
import { expireStoredSession, readStoredSession, type StoredSessionInfo } from './sessionProbe';

// Phase 0 spike (throwaway) — test harness for docs/android-spike-runbook.md.
// Deliberately NOT behind ProtectedRoute: the offline-cold-start test (Q3)
// needs to see what useAuth() reports when the app starts offline with an
// expired token, which a protected route would hide by redirecting to /auth.

interface SpikeTarget {
  trackerId: string;
  trackerName: string;
  currency: string;
  categoryId: string;
}

type TrackerOption = Pick<Tables<'trackers'>, 'id' | 'name' | 'currency'>;

const TARGET_KEY = 'spike_target';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export default function SpikePage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const native = Capacitor.isNativePlatform();

  const [online, setOnline] = useState<boolean | null>(null);
  const [stored, setStored] = useState<StoredSessionInfo | null>(() => readStoredSession());
  const [target, setTarget] = useState<SpikeTarget | null>(null);
  const [trackers, setTrackers] = useState<TrackerOption[]>([]);
  const [counts, setCounts] = useState({ expenses: 0, pending: 0, outbox: 0 });
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [rows, setRows] = useState<LocalExpense[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);
  const lastConnected = useRef<boolean | null>(null);
  const targetRef = useRef<SpikeTarget | null>(null);
  targetRef.current = target;

  const addLog = useCallback((line: string) => {
    setLog(prev => [`${format(new Date(), 'HH:mm:ss')}  ${line}`, ...prev].slice(0, 60));
  }, []);

  const refreshView = useCallback(async () => {
    setStored(readStoredSession());
    if (!native) return;
    try {
      setCounts(await localCounts());
      setOutbox(await listOutbox());
      const t = targetRef.current;
      setRows(t ? await listLocalExpenses(t.trackerId) : []);
    } catch (e) {
      addLog(`refresh failed: ${errMsg(e)}`);
    }
  }, [native, addLog]);

  // Push first so our pending rows are synced before the pull lands; pull runs
  // even if push stopped, so a stuck outbox doesn't hide remote changes.
  const runSync = useCallback(async (reason: string) => {
    if (!native || syncing.current) return;
    syncing.current = true;
    try {
      const push = await pushOutbox();
      addLog(`[${reason}] push: ${push.pushed} drained (${push.recoveredDuplicates} already on server → 23505)${push.error ? ` — stopped: ${push.error}` : ''}`);
      const t = targetRef.current;
      if (t) addLog(`[${reason}] pull: ${await pullExpenses(t.trackerId)} row(s) upserted`);
    } catch (e) {
      addLog(`[${reason}] sync failed: ${errMsg(e)}`);
    } finally {
      syncing.current = false;
      await refreshView();
    }
  }, [native, addLog, refreshView]);

  // Restore the test target saved in SQLite (so it's available offline).
  useEffect(() => {
    if (!native) return;
    getMeta(TARGET_KEY)
      .then(saved => { if (saved) setTarget(JSON.parse(saved) as SpikeTarget); })
      .catch(e => addLog(`SQLite open failed: ${errMsg(e)}`));
  }, [native, addLog]);

  useEffect(() => { void refreshView(); }, [target, refreshView]);

  // Network status + auto-sync on reconnect (the behaviour runbook Q4 tests).
  // @capacitor/network re-fires networkStatusChange with an unchanged status on
  // every connectivity update (~every 3s on the Android 17 emulator), so only an
  // offline → online *transition* counts as a reconnect — otherwise sync would
  // run every few seconds (Phase 3 must do the same).
  useEffect(() => {
    if (!native) return;
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;
    void Network.getStatus().then(s => {
      if (cancelled) return;
      lastConnected.current = s.connected;
      setOnline(s.connected);
    });
    void Network.addListener('networkStatusChange', s => {
      const prev = lastConnected.current;
      lastConnected.current = s.connected;
      if (prev === s.connected) return;
      setOnline(s.connected);
      addLog(`network → ${s.connected ? 'online' : 'offline'} (${s.connectionType})`);
      if (s.connected && prev === false) void runSync('reconnect');
    }).then(h => { if (cancelled) void h.remove(); else handle = h; });
    return () => { cancelled = true; void handle?.remove(); };
  }, [native, addLog, runSync]);

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      addLog(`${label} failed: ${errMsg(e)}`);
    } finally {
      setBusy(false);
      await refreshView();
    }
  };

  const loadTrackers = () => act('load trackers', async () => {
    const { data, error } = await supabase.from('trackers').select('id, name, currency').order('name');
    if (error) throw error;
    setTrackers(data ?? []);
    addLog(`loaded ${data?.length ?? 0} tracker(s)`);
  });

  const chooseTracker = (t: TrackerOption) => act('choose tracker', async () => {
    // System "Miscellaneous" keeps spike rows easy to spot and delete afterwards.
    const { data, error } = await supabase
      .from('categories').select('id').eq('name', 'Miscellaneous').eq('is_system', true).limit(1).single();
    if (error) throw error;
    const next: SpikeTarget = { trackerId: t.id, trackerName: t.name, currency: t.currency, categoryId: data.id };
    await setMeta(TARGET_KEY, JSON.stringify(next));
    setTarget(next);
    setTrackers([]);
    addLog(`target tracker: ${t.name}`);
  });

  const addExpense = () => act('add expense', async () => {
    if (!target) throw new Error('Choose a target tracker first (while online).');
    // Offline-authenticated fallback (plan §7): if useAuth() lost the user
    // because the token expired with no network to refresh it, the stored
    // session still identifies them.
    const fallback = readStoredSession();
    const userId = user?.id ?? fallback?.userId;
    if (!userId) throw new Error('No user — neither useAuth() nor a stored session.');
    const id = await createExpenseOffline({
      tracker_id: target.trackerId,
      category_id: target.categoryId,
      amount: 1,
      currency: target.currency,
      date: format(new Date(), 'yyyy-MM-dd'),
      description: `[spike] offline test ${format(new Date(), 'HH:mm:ss')}`,
      is_debit: true,
      created_by_id: userId,
      created_by_name: profile?.full_name ?? fallback?.email ?? 'Spike tester',
    });
    addLog(`queued ${id.slice(0, 8)}… (local row + outbox entry, one transaction)`);
    if (online) await runSync('after add');
  });

  const resendLast = () => act('re-send', async () => {
    const id = await requeueLastSpikeExpense();
    addLog(id
      ? `re-queued synced row ${id.slice(0, 8)}… — next push should recover via 23505`
      : 'nothing to re-send (add and sync a spike row first)');
  });

  const expireToken = () => {
    addLog(expireStoredSession()
      ? 'stored token backdated — force-stop the app NOW, then go offline and relaunch'
      : 'no stored session found');
    setStored(readStoredSession());
  };

  if (!native) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-3">
        <h1 className="font-display text-xl font-semibold">Offline sync spike</h1>
        <p className="text-sm text-ink-soft">
          This harness uses native SQLite and only runs in the Android build — see docs/android-spike-runbook.md.
        </p>
        <Button variant="outline" onClick={() => navigate('/')}>Back to app</Button>
      </div>
    );
  }

  const tokenExpired = stored?.expiresAt != null && stored.expiresAt * 1000 < Date.now();

  return (
    <div className="min-h-screen bg-background px-4 pb-10 space-y-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">Offline sync spike</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>Back to app</Button>
      </div>

      <section className="rounded-xl border border-border bg-card p-3 text-xs font-mono space-y-1">
        <p>network: {online == null ? 'unknown' : online ? 'ONLINE' : 'OFFLINE'}</p>
        <p>useAuth(): {authLoading ? 'loading…' : user ? `signed in (${user.email})` : 'NO USER'}</p>
        <p>
          stored session: {stored
            ? `${stored.email ?? '?'} · expires ${stored.expiresAt ? format(new Date(stored.expiresAt * 1000), 'HH:mm:ss') : '?'}${tokenExpired ? ' (EXPIRED)' : ''} · refresh token ${stored.hasRefreshToken ? 'yes' : 'NO'}`
            : 'none'}
        </p>
        <p>local: {counts.expenses} expenses ({counts.pending} pending) · outbox: {counts.outbox}</p>
        <p>target: {target ? `${target.trackerName} (${target.currency})` : 'not chosen'}</p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={loadTrackers}>Choose tracker</Button>
        <Button size="sm" disabled={busy} onClick={addExpense}>Add test expense</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act('sync', () => runSync('manual'))}>Sync now</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={resendLast}>Re-send last (23505)</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act('refresh', refreshView)}>Refresh view</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={expireToken}>Expire stored token</Button>
      </section>

      {trackers.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-2 space-y-1">
          <p className="px-1 text-xs text-ink-soft">Pick a dedicated test tracker — spike rows are real inserts.</p>
          {trackers.map(t => (
            <button
              key={t.id}
              onClick={() => chooseTracker(t)}
              className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
            >
              {t.name} <span className="text-ink-faint">· {t.currency}</span>
            </button>
          ))}
        </section>
      )}

      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Outbox ({outbox.length})</h2>
        {outbox.length === 0 && <p className="text-xs text-ink-faint">empty</p>}
        {outbox.map(o => (
          <p key={o.seq} className="text-xs font-mono">
            #{o.seq} {o.op} {o.entity_id.slice(0, 8)}… · attempts {o.attempts}
            {o.last_error && <span className="text-spend"> · {o.last_error}</span>}
          </p>
        ))}
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Local rows for target (latest {rows.length})</h2>
        {rows.length === 0 && <p className="text-xs text-ink-faint">none — choose a tracker, then Sync now to pull</p>}
        {rows.map(r => {
          const parsed = JSON.parse(r.row_json) as Partial<Tables<'expenses'>>;
          return (
            <p key={r.id} className="text-xs font-mono">
              <span className={r.sync_status === 'pending' ? 'text-warn' : 'text-earn'}>{r.sync_status}</span>
              {' '}{r.date} · {parsed.amount} · {parsed.description} · {r.id.slice(0, 8)}…
            </p>
          );
        })}
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Log</h2>
        <pre className="whitespace-pre-wrap rounded-xl border border-border bg-card p-2 text-[11px] leading-relaxed">
          {log.length ? log.join('\n') : 'no events yet'}
        </pre>
      </section>
    </div>
  );
}
