import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackers, useTrackerHomeStats, useCreateTracker } from '@/hooks/useTrackers';
import { useApp } from '@/contexts/AppContext';
import { format, parseISO } from 'date-fns';
import { CaretRight, FolderOpen, CircleNotch, UserPlus, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';
import FloatingAdd from '@/components/FloatingAdd';
import { CURRENCIES, formatAmountShort } from '@/lib/currencies';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Stable per-tracker accent: hash the id into a warm palette so each tracker
// reads as a distinct tile rather than an identical ember bar.
const TRACKER_PALETTE = ['#E66B47', '#2F7D5F', '#D89A2C', '#4A6FA5', '#9B5DE5', '#C24A37', '#3A8FB7', '#7A8450'];
function trackerColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TRACKER_PALETTE[h % TRACKER_PALETTE.length];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()) || '?';
}

/** Tiny non-interactive trend line for the tracker cards. */
function MiniSparkline({ values, color, width = 64, height = 24 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * w, pad + (1 - (v - min) / range) * h] as [number, number]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}

export default function HomePage() {
  const { profile } = useAuth();
  const { data: trackers, isLoading } = useTrackers();
  const { data: homeStats } = useTrackerHomeStats();
  const { setActiveTrackerId } = useApp();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState('INR');
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState('');
  const createTracker = useCreateTracker();

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  // Summary-hero aggregates. Net expense is summed per currency (mixing
  // currencies into one figure would be meaningless); the dominant currency
  // leads, the rest surface as small chips.
  const trackerList = trackers || [];
  const totalsByCurrency = new Map<string, number>();
  let totalTxns = 0;
  for (const t of trackerList) {
    const s = homeStats?.[t.id];
    if (!s) continue;
    totalsByCurrency.set(t.currency, (totalsByCurrency.get(t.currency) || 0) + s.netExpense);
    totalTxns += s.txnCount;
  }
  const currencyTotals = [...totalsByCurrency.entries()].sort((a, b) => b[1] - a[1]);
  const primaryTotal = currencyTotals[0];

  // Listen for the bottom nav's "New Tracker" button event
  const openCreateSheet = useCallback(() => setShowCreate(true), []);
  useEffect(() => {
    window.addEventListener('open-create-tracker', openCreateSheet);
    return () => window.removeEventListener('open-create-tracker', openCreateSheet);
  }, [openCreateSheet]);

  const addInviteEmail = () => {
    const email = inviteInput.trim().toLowerCase();
    if (email && !inviteEmails.includes(email)) {
      setInviteEmails([...inviteEmails, email]);
    }
    setInviteInput('');
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const tracker = await createTracker.mutateAsync({ name: newName.trim(), currency: newCurrency });
    if (tracker) {
      // Invite members after creation
      for (const email of inviteEmails) {
        try {
          const { data: prof } = await (await import('@/integrations/supabase/client')).supabase
            .from('profiles')
            .select('id, full_name')
            .ilike('email', email)
            .single();
          if (prof) {
            await (await import('@/integrations/supabase/client')).supabase
              .from('tracker_members')
              .insert({ tracker_id: tracker.id, user_id: prof.id, role: 'member' });
            toast.success(`${prof.full_name} added to tracker`);
          } else {
            toast.error(`No account found for ${email}`);
          }
        } catch {
          toast.error(`Failed to invite ${email}`);
        }
      }
      setShowCreate(false);
      setNewName('');
      setNewCurrency('INR');
      setInviteEmails([]);
      setActiveTrackerId(tracker.id);
      navigate(`/tracker/${tracker.id}`);
    }
  };

  const handleTrackerClick = (id: string) => {
    setActiveTrackerId(id);
    navigate(`/tracker/${id}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-page-gradient pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 glass-nav border-b border-line-soft px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <img src="/logo-512.png" alt="ExpenseSync" className="h-8 w-8 rounded-lg" />
            <span className="font-display font-semibold text-sm">ExpenseSync</span>
          </div>
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-ink-soft">{getGreeting()}, {firstName}</p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ember text-white font-semibold text-sm"
          >
            {firstName[0]?.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-3">
        {/* Onboarding banner for new users */}
        {!isLoading && trackerList.length === 0 && (
          <div className="rounded-2xl bg-surface-alt border border-line-soft p-5 space-y-3 shadow-sm animate-fade-in-up">
            <p className="font-display text-lg font-semibold">Welcome to ExpenseSync</p>
            <p className="text-sm text-ink-soft">Start by creating your first tracker. You can invite collaborators after creating it.</p>
            <Button onClick={() => setShowCreate(true)} className="h-11 bg-ember hover:bg-ember/90 text-white">Create My First Tracker</Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <div className="rounded-3xl bg-card border border-line-soft p-5 animate-pulse h-28" />
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl bg-card border border-border p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-40 mb-2" />
                    <div className="h-5 bg-muted rounded w-24 mb-1" />
                    <div className="h-3 bg-muted rounded w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary hero — combined net expense across all trackers */}
        {!isLoading && trackerList.length > 0 && (
          <div className="rounded-3xl hero-card p-5 relative overflow-hidden animate-fade-in-up">
            <div
              className="absolute pointer-events-none"
              style={{ right: -36, top: -36, width: 128, height: 128, borderRadius: 999, background: 'hsl(var(--ember))', opacity: 0.18 }}
            />
            <p className="relative text-[11px] font-semibold uppercase tracking-wider opacity-65">Net expense · all trackers</p>
            <div
              className="relative font-display tabular-nums mt-1"
              style={{ fontSize: 40, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.05 }}
            >
              {primaryTotal ? formatAmountShort(primaryTotal[1], primaryTotal[0]) : '—'}
            </div>
            {currencyTotals.length > 1 && (
              <div className="relative flex flex-wrap gap-1.5 mt-2">
                {currencyTotals.slice(1).map(([cur, val]) => (
                  <span key={cur} className="font-mono text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }}>
                    {formatAmountShort(val, cur)}
                  </span>
                ))}
              </div>
            )}
            <div className="relative mt-3 flex items-center gap-4 text-[12px] font-medium opacity-80">
              <span>{trackerList.length} tracker{trackerList.length !== 1 ? 's' : ''}</span>
              <span className="opacity-50">·</span>
              <span>{totalTxns.toLocaleString('en-IN')} transaction{totalTxns !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Section header */}
        {!isLoading && trackerList.length > 0 && (
          <div className="flex items-baseline justify-between px-1 pt-1">
            <h2 className="font-display font-semibold text-[15px] text-ink" style={{ letterSpacing: '-0.01em' }}>Your trackers</h2>
            <span className="text-[12px] text-ink-faint font-medium">{trackerList.length}</span>
          </div>
        )}

        {trackerList.map((tracker, i) => {
          const s = homeStats?.[tracker.id];
          const color = trackerColor(tracker.id);
          const net = s ? s.netExpense : tracker.monthly_total;
          const names = s?.memberNames || [];
          const dateRange = tracker.date_range
            ? `${format(parseISO(tracker.date_range.min), "MMM ''yy")}${tracker.date_range.min.slice(0, 7) !== tracker.date_range.max.slice(0, 7) ? ` – ${format(parseISO(tracker.date_range.max), "MMM ''yy")}` : ''}`
            : null;
          return (
            <button
              key={tracker.id}
              onClick={() => handleTrackerClick(tracker.id)}
              className="w-full text-left rounded-2xl bg-card border border-line-soft p-4 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-3 animate-stagger"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              {/* Colored initial tile — per-tracker identity */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-semibold text-[16px] shrink-0"
                style={{ background: `${color}22`, color }}
              >
                {initials(tracker.name)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display font-semibold text-[16px] truncate text-ink" style={{ letterSpacing: '-0.01em' }}>{tracker.name}</p>
                  {s && s.trend.length >= 2 && <MiniSparkline values={s.trend.map(p => p.value)} color={color} />}
                </div>

                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint mt-1.5">Net expense</p>
                <p className="font-mono text-[19px] font-semibold text-ink leading-none">{formatAmountShort(net, tracker.currency)}</p>

                <div className="flex items-center gap-2 mt-2 min-w-0">
                  {names.length > 0 ? (
                    <div className="flex -space-x-1.5 shrink-0">
                      {names.slice(0, 3).map((n, idx) => (
                        <span
                          key={idx}
                          className="w-5 h-5 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: trackerColor(tracker.id + n) }}
                        >
                          {initials(n)}
                        </span>
                      ))}
                      {names.length > 3 && (
                        <span className="w-5 h-5 rounded-full border-2 border-card bg-chip flex items-center justify-center text-[8px] font-bold text-ink-soft">
                          +{names.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11.5px] text-ink-soft">{tracker.member_count} member{tracker.member_count !== 1 ? 's' : ''}</span>
                  )}
                  {dateRange && (
                    <span className="text-[11px] text-ink-faint font-medium truncate">{dateRange}</span>
                  )}
                </div>
              </div>

              <CaretRight className="h-5 w-5 text-ink-faint flex-shrink-0" />
            </button>
          );
        })}

        {!isLoading && trackerList.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <p className="font-semibold text-lg">No trackers yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first shared tracker to get started</p>
            <Button onClick={() => setShowCreate(true)} className="h-11">Create Tracker</Button>
          </div>
        )}
      </div>

      {/* Create Tracker Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Create Tracker</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Tracker Name</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Home Expenses, Goa Trip"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={newCurrency} onValueChange={setNewCurrency}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Invite Members (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={inviteInput}
                  onChange={e => setInviteInput(e.target.value)}
                  placeholder="Email address"
                  className="flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInviteEmail(); } }}
                />
                <Button type="button" size="sm" variant="outline" className="h-10 px-3" onClick={addInviteEmail} disabled={!inviteInput.trim()}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
              {inviteEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {inviteEmails.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                      {email}
                      <button onClick={() => setInviteEmails(inviteEmails.filter(e => e !== email))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleCreate} className="w-full h-11" disabled={createTracker.isPending || !newName.trim()}>
              {createTracker.isPending ? <CircleNotch className="h-4 w-4 animate-spin" /> : 'Create Tracker'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <FloatingAdd onClick={() => setShowCreate(true)} label="New tracker" />
      <BottomNav />
    </div>
  );
}
