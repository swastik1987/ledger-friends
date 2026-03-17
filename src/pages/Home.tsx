import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackers, useCreateTracker, useInviteMember } from '@/hooks/useTrackers';
import { useApp } from '@/contexts/AppContext';
import { format, parseISO } from 'date-fns';
import { ChevronRight, FolderOpen, LogOut, Loader2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';
import { CURRENCIES, getCurrency, formatAmountShort } from '@/lib/currencies';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { profile, signOut } = useAuth();
  const { data: trackers, isLoading } = useTrackers();
  const { setActiveTrackerId } = useApp();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState('INR');
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState('');
  const createTracker = useCreateTracker();

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

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
    <div className="flex flex-col min-h-screen bg-background pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <img src="/logo-512.png" alt="ExpenseSync" className="h-8 w-8 rounded-lg" />
            <span className="font-semibold text-sm">ExpenseSync</span>
          </div>
          <div className="text-center flex-1">
            <p className="text-sm font-medium">{getGreeting()}, {firstName} 👋</p>
          </div>
          <Sheet open={showProfile} onOpenChange={setShowProfile}>
            <SheetTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                {firstName[0]?.toUpperCase()}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Profile</SheetTitle>
              </SheetHeader>
              <div className="py-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    {firstName[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">{profile?.full_name}</p>
                    <p className="text-sm text-muted-foreground">Member since {profile?.created_at ? format(new Date(profile.created_at), 'MMM yyyy') : ''}</p>
                  </div>
                </div>
                <Button variant="destructive" className="w-full h-11" onClick={() => { signOut(); navigate('/auth'); }}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-4 space-y-3">
        {/* Onboarding banner for new users */}
        {!isLoading && (!trackers || trackers.length === 0) && (
          <div className="rounded-2xl bg-primary-light border border-primary/20 p-5 space-y-3">
            <p className="text-lg font-semibold">👋 Welcome to ExpenseSync!</p>
            <p className="text-sm text-muted-foreground">Start by creating your first tracker. You can invite collaborators after creating it.</p>
            <Button onClick={() => setShowCreate(true)} className="h-11">Create My First Tracker</Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl bg-card border border-border p-4 animate-pulse">
                <div className="h-5 bg-muted rounded w-40 mb-2" />
                <div className="h-4 bg-muted rounded w-24 mb-1" />
                <div className="h-3 bg-muted rounded w-32" />
              </div>
            ))}
          </div>
        )}

        {trackers?.map(tracker => (
          <button
            key={tracker.id}
            onClick={() => handleTrackerClick(tracker.id)}
            className="w-full text-left rounded-2xl bg-card border border-border p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3"
          >
            <div className="w-1 h-12 rounded-full bg-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg truncate">{tracker.name}</p>
              <p className="font-mono text-lg font-medium">{formatAmountShort(tracker.monthly_total, tracker.currency)}</p>
              <p className="text-xs text-muted-foreground">
                {tracker.member_count} member{tracker.member_count !== 1 ? 's' : ''} · Total spent
                {tracker.date_range ? ` between ${format(parseISO(tracker.date_range.min), 'MMM yyyy')}${tracker.date_range.min.slice(0, 7) !== tracker.date_range.max.slice(0, 7) ? ` – ${format(parseISO(tracker.date_range.max), 'MMM yyyy')}` : ''}` : ''}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </button>
        ))}

        {!isLoading && trackers && trackers.length === 0 && (
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
              {createTracker.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Tracker'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
}
