import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackers, useTrackerHomeStats, useCreateTracker } from '@/hooks/useTrackers';
import { useApp } from '@/contexts/AppContext';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { FolderOpen, CircleNotch, UserPlus, X, PushPin } from '@phosphor-icons/react';
import { usePinnedTrackers } from '@/hooks/usePinnedTrackers';
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

/** Human label for a tracker's most recent transaction date. */
function lastActivityLabel(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  const days = differenceInCalendarDays(new Date(), d);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return format(d, 'EEE');
  if (d.getFullYear() === new Date().getFullYear()) return format(d, 'd MMM');
  return format(d, "MMM ''yy");
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
  const { pinnedIds, togglePin } = usePinnedTrackers();

  const trackerList = trackers || [];

  // Bento tiles: pinned trackers in pin order — first pin is the hero tile.
  const pinnedTrackers = pinnedIds
    .map(id => trackerList.find(t => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const heroTracker = pinnedTrackers[0];
  const sidekicks = pinnedTrackers.slice(1);

  // List: every tracker, most recent transaction first (no activity → last).
  const sortedTrackers = [...trackerList].sort((a, b) => {
    const am = a.date_range?.max || '';
    const bm = b.date_range?.max || '';
    return bm.localeCompare(am);
  });

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

        {/* Bento tiles — pinned trackers. 1 pin = full-width hero; 2–3 pins =
            hero (first pin) + compact sidekicks stacked on the right. */}
        {!isLoading && trackerList.length > 0 && pinnedTrackers.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-line p-5 text-center animate-fade-in-up">
            <PushPin size={20} color="hsl(var(--ink-faint))" className="mx-auto mb-1.5" />
            <p className="text-[13px] text-ink-soft font-medium">
              Pin up to 3 trackers for a quick view — tap the pin on any tracker below
            </p>
          </div>
        )}

        {!isLoading && heroTracker && (() => {
          const heroColor = trackerColor(heroTracker.id);
          const heroStats = homeStats?.[heroTracker.id];
          const heroNet = heroStats ? heroStats.netExpense : heroTracker.monthly_total;
          const heroTile = (
            <button
              onClick={() => handleTrackerClick(heroTracker.id)}
              className="w-full h-full text-left rounded-2xl p-4 animate-fade-in-up"
              style={{ background: `${heroColor}1F` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-semibold text-[15px] truncate" style={{ color: heroColor, letterSpacing: '-0.01em' }}>
                  {heroTracker.name}
                </p>
                <PushPin size={13} color={heroColor} className="shrink-0 mt-0.5" />
              </div>
              <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint mt-2">Net expense</p>
              <p className="font-mono text-[22px] font-semibold text-ink leading-tight">
                {formatAmountShort(heroNet, heroTracker.currency)}
              </p>
              {heroStats && heroStats.trend.length >= 2 && (
                <div className="mt-2">
                  <MiniSparkline values={heroStats.trend.map(p => p.value)} color={heroColor} width={sidekicks.length > 0 ? 120 : 200} height={32} />
                </div>
              )}
              <p className="text-[11px] text-ink-soft font-medium mt-2">
                {heroTracker.member_count} member{heroTracker.member_count !== 1 ? 's' : ''}
                {heroTracker.date_range && <> · since {format(parseISO(heroTracker.date_range.min), "MMM ''yy")}</>}
              </p>
            </button>
          );

          if (sidekicks.length === 0) return heroTile;

          return (
            <div className="grid gap-2" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
              {heroTile}
              <div className="flex flex-col gap-2">
                {sidekicks.map(t => {
                  const c = trackerColor(t.id);
                  const s = homeStats?.[t.id];
                  const net = s ? s.netExpense : t.monthly_total;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleTrackerClick(t.id)}
                      className="flex-1 text-left rounded-2xl p-3 animate-fade-in-up"
                      style={{ background: `${c}1F` }}
                    >
                      <p className="font-display font-semibold text-[12.5px] truncate" style={{ color: c }}>{t.name}</p>
                      <p className="font-mono text-[15px] font-semibold text-ink mt-1">
                        {formatAmountShort(net, t.currency)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Section header */}
        {!isLoading && trackerList.length > 0 && (
          <div className="flex items-baseline justify-between px-1 pt-1">
            <h2 className="font-display font-semibold text-[15px] text-ink" style={{ letterSpacing: '-0.01em' }}>Your trackers</h2>
            <span className="text-[12px] text-ink-faint font-medium">by last activity</span>
          </div>
        )}

        {sortedTrackers.map((tracker, i) => {
          const s = homeStats?.[tracker.id];
          const color = trackerColor(tracker.id);
          const net = s ? s.netExpense : tracker.monthly_total;
          const isPinned = pinnedIds.includes(tracker.id);
          const activity = lastActivityLabel(tracker.date_range?.max);
          return (
            <div
              key={tracker.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTrackerClick(tracker.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTrackerClick(tracker.id); } }}
              className="rounded-2xl bg-card border border-line-soft p-3 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-3 cursor-pointer animate-stagger"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-semibold text-[14px] shrink-0"
                style={{ background: `${color}22`, color }}
              >
                {initials(tracker.name)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-[15px] truncate text-ink" style={{ letterSpacing: '-0.01em' }}>{tracker.name}</p>
                <p className="text-[11.5px] text-ink-soft font-medium mt-0.5">
                  <span className="font-mono font-semibold text-ink">{formatAmountShort(net, tracker.currency)}</span>
                  {' · '}{tracker.member_count} member{tracker.member_count !== 1 ? 's' : ''}
                </p>
              </div>

              {activity && (
                <span className="text-[11px] text-ink-faint font-medium shrink-0">{activity}</span>
              )}

              <button
                onClick={e => { e.stopPropagation(); togglePin(tracker.id); }}
                aria-label={isPinned ? `Unpin ${tracker.name}` : `Pin ${tracker.name} to quick view`}
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-xl transition-colors"
                style={isPinned
                  ? { background: 'hsl(var(--ember) / 0.12)', color: 'hsl(var(--ember))' }
                  : { color: 'hsl(var(--ink-faint))' }}
              >
                <PushPin size={16} weight={isPinned ? 'fill' : 'regular'} />
              </button>
            </div>
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
