import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTrackers, useDeleteTracker, useRemoveMember, useTrackerMembers } from '@/hooks/useTrackers';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, LogOut, Trash2, Download, Shield, Users, Crown,
  Loader2, AlertTriangle, ChevronRight, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import BottomNav from '@/components/BottomNav';

// ─── Delete Countdown Button ────────────────────────────────────
function DeleteCountdownButton({ onConfirm, label, seconds = 5 }: { onConfirm: () => void; label: string; seconds?: number }) {
  const [countdown, setCountdown] = useState(seconds);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (countdown <= 0) { setEnabled(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <Button
      variant="destructive"
      className="w-full h-11"
      disabled={!enabled}
      onClick={onConfirm}
    >
      {enabled ? label : `${label} (${countdown})`}
    </Button>
  );
}

// ─── Main Profile Page ──────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { setActiveTrackerId } = useApp();
  const { data: trackers, isLoading: trackersLoading } = useTrackers();
  const deleteTracker = useDeleteTracker();

  // Tracker deletion state
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<Set<string>>(new Set());
  const [showDeleteTrackersDialog, setShowDeleteTrackersDialog] = useState(false);
  const [deletingTrackers, setDeletingTrackers] = useState(false);

  // Account deletion state
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] || 'User';

  // ─── Tracker analysis helpers ──────────────────────
  const myAdminTrackers = trackers?.filter(t => t.admin_id === user?.id) ?? [];
  const myMemberTrackers = trackers?.filter(t => t.admin_id !== user?.id) ?? [];

  // Shared trackers where this user is the sole admin (blocks account deletion)
  const [sharedSoleAdminTrackers, setSharedSoleAdminTrackers] = useState<string[]>([]);
  const [checkingBlockers, setCheckingBlockers] = useState(false);

  const checkAccountDeletionBlockers = useCallback(async () => {
    if (!user || !trackers) return [];
    setCheckingBlockers(true);
    const blockers: string[] = [];

    for (const tracker of myAdminTrackers) {
      if (tracker.member_count > 1) {
        // Check if there's another admin
        const { data: members } = await supabase
          .from('tracker_members')
          .select('user_id, role')
          .eq('tracker_id', tracker.id)
          .eq('role', 'admin');

        const otherAdmins = (members ?? []).filter(m => m.user_id !== user.id);
        if (otherAdmins.length === 0) {
          blockers.push(tracker.name);
        }
      }
    }

    setSharedSoleAdminTrackers(blockers);
    setCheckingBlockers(false);
    return blockers;
  }, [user, trackers, myAdminTrackers]);

  // ─── Export all data ───────────────────────────────
  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Fetch all expenses across all trackers
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*, category:categories(name, icon), tracker:trackers(name, currency)')
        .eq('created_by_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;

      if (!expenses || expenses.length === 0) {
        toast.error('No transaction data to export');
        setExporting(false);
        return;
      }

      const rows = expenses.map((e: any) => ({
        'Tracker': e.tracker?.name ?? 'Unknown',
        'Date': format(new Date(e.date), 'dd MMM yyyy'),
        'Type': e.is_debit ? 'Debit' : 'Credit',
        'Description': e.description,
        'Merchant': e.merchant_name ?? '',
        'Category': e.category?.name ?? 'Unknown',
        'Amount': Number(e.amount),
        'Currency': e.currency,
        'Payment Method': e.payment_method ?? '',
        'Notes': e.notes ?? '',
        'Tags': e.tags?.join(', ') ?? '',
        'Reference No.': e.reference_number ?? '',
        'Source': e.source,
        'Created At': format(new Date(e.created_at), 'dd MMM yyyy HH:mm'),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 30 }, { wch: 20 },
        { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 25 },
        { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'My Transactions');
      XLSX.writeFile(wb, `ExpenseSync_MyData_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Data exported successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // ─── Delete selected trackers ──────────────────────
  const toggleTrackerSelection = (id: string) => {
    setSelectedTrackerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDeleteSelectedTrackers = async () => {
    setDeletingTrackers(true);
    try {
      for (const trackerId of selectedTrackerIds) {
        const tracker = trackers?.find(t => t.id === trackerId);
        if (!tracker) continue;

        if (tracker.admin_id === user?.id) {
          // Admin: delete the tracker (CASCADE deletes all data)
          await supabase.from('trackers').delete().eq('id', trackerId);
        } else {
          // Member: leave the tracker (delete membership)
          const { data: membership } = await supabase
            .from('tracker_members')
            .select('id')
            .eq('tracker_id', trackerId)
            .eq('user_id', user!.id)
            .single();
          if (membership) {
            await supabase.from('tracker_members').delete().eq('id', membership.id);
          }
        }
      }

      setActiveTrackerId(null);
      setSelectedTrackerIds(new Set());
      setShowDeleteTrackersDialog(false);
      toast.success(`${selectedTrackerIds.size} tracker(s) removed`);

      // Refresh the page data
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete trackers');
    } finally {
      setDeletingTrackers(false);
    }
  };

  // ─── Prepare delete trackers summary ───────────────
  const selectedAdminTrackers = [...selectedTrackerIds].filter(id => {
    const t = trackers?.find(tr => tr.id === id);
    return t && t.admin_id === user?.id;
  });
  const selectedMemberTrackers = [...selectedTrackerIds].filter(id => {
    const t = trackers?.find(tr => tr.id === id);
    return t && t.admin_id !== user?.id;
  });

  // Check which selected admin trackers are shared
  const selectedSharedAdminTrackers = selectedAdminTrackers.filter(id => {
    const t = trackers?.find(tr => tr.id === id);
    return t && t.member_count > 1;
  });

  // ─── Delete account ────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      // Call edge function to handle account deletion server-side
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { userId: user.id },
      });
      if (error) throw error;

      // Sign out locally
      await signOut();
      navigate('/auth');
      toast.success('Your account has been permanently deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account. Please contact support.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={() => navigate('/')} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base">My Account</h1>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-6">

        {/* ─── Section 1: Profile Info ─────────────────── */}
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xl">
              {firstName[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg">{profile?.full_name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">
                Member since {profile?.created_at ? format(new Date(profile.created_at), 'MMMM yyyy') : ''}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={handleExportData} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Export My Data
            </Button>
            <Button variant="outline" className="h-10" onClick={() => { signOut(); navigate('/auth'); }}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        {/* ─── Section 2: My Trackers ──────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">My Trackers</h2>
            {selectedTrackerIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowDeleteTrackersDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove {selectedTrackerIds.size} selected
              </Button>
            )}
          </div>

          {trackersLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="rounded-xl bg-card border border-border p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-32 mb-2" />
                  <div className="h-3 bg-muted rounded w-20" />
                </div>
              ))}
            </div>
          )}

          {!trackersLoading && (!trackers || trackers.length === 0) && (
            <div className="rounded-xl bg-card border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No trackers yet</p>
            </div>
          )}

          {trackers?.map(tracker => {
            const isAdmin = tracker.admin_id === user?.id;
            const isSelected = selectedTrackerIds.has(tracker.id);

            return (
              <div
                key={tracker.id}
                className={`rounded-xl bg-card border p-4 flex items-center gap-3 transition-colors ${isSelected ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleTrackerSelection(tracker.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{tracker.name}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${isAdmin ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {isAdmin ? <><Crown className="h-2.5 w-2.5" /> Admin</> : <><Users className="h-2.5 w-2.5" /> Member</>}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tracker.member_count} member{tracker.member_count !== 1 ? 's' : ''}
                    {' · '}{tracker.currency}
                  </p>
                </div>
                <button
                  onClick={() => { setActiveTrackerId(tracker.id); navigate(`/tracker/${tracker.id}`); }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground px-1">
            Select trackers you own to delete them (including all transactions). Select trackers you're a member of to leave them.
          </p>
        </div>

        {/* ─── Section 3: Danger Zone ──────────────────── */}
        <div className="rounded-2xl border-2 border-destructive/30 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="font-semibold text-base text-destructive">Danger Zone</h2>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Delete My Account</p>
            <p className="text-xs text-muted-foreground">
              This will permanently delete your profile, all trackers you own (along with their transactions),
              and remove you from all shared trackers. This action cannot be undone.
            </p>
          </div>

          <Button
            variant="destructive"
            className="w-full h-11"
            onClick={async () => {
              const blockers = await checkAccountDeletionBlockers();
              if (blockers.length > 0) {
                toast.error(`Transfer admin role first in: ${blockers.join(', ')}`);
                return;
              }
              setShowDeleteAccountDialog(true);
            }}
            disabled={checkingBlockers}
          >
            {checkingBlockers ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking...</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-2" /> Delete My Account</>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Delete Trackers Confirmation Dialog ───────── */}
      <AlertDialog open={showDeleteTrackersDialog} onOpenChange={setShowDeleteTrackersDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedTrackerIds.size} tracker(s)?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {selectedAdminTrackers.length > 0 && (
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm">
                    <p className="font-medium text-destructive mb-1">
                      Deleting {selectedAdminTrackers.length} tracker(s) you own:
                    </p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      {selectedAdminTrackers.map(id => {
                        const t = trackers?.find(tr => tr.id === id);
                        return <li key={id}>{t?.name} — all transactions will be permanently deleted</li>;
                      })}
                    </ul>
                    {selectedSharedAdminTrackers.length > 0 && (
                      <p className="mt-2 text-xs font-medium text-destructive">
                        {selectedSharedAdminTrackers.length} of these are shared with other members. Their data will also be deleted.
                      </p>
                    )}
                  </div>
                )}
                {selectedMemberTrackers.length > 0 && (
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <p className="font-medium mb-1">
                      Leaving {selectedMemberTrackers.length} tracker(s):
                    </p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      {selectedMemberTrackers.map(id => {
                        const t = trackers?.find(tr => tr.id === id);
                        return <li key={id}>{t?.name} — your membership will be removed</li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTrackers}>Cancel</AlertDialogCancel>
            <DeleteCountdownButton
              seconds={3}
              label={deletingTrackers ? 'Removing...' : 'Confirm Removal'}
              onConfirm={handleDeleteSelectedTrackers}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Account Confirmation Dialog ────────── */}
      <AlertDialog open={showDeleteAccountDialog} onOpenChange={(open) => { if (!open) { setDeleteConfirmText(''); } setShowDeleteAccountDialog(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm">This action is <strong>permanent and irreversible</strong>. The following will be deleted:</p>
                <ul className="text-xs space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Trash2 className="h-3.5 w-3.5 mt-0.5 text-destructive flex-shrink-0" />
                    Your profile and authentication data
                  </li>
                  {myAdminTrackers.length > 0 && (
                    <li className="flex items-start gap-2">
                      <Trash2 className="h-3.5 w-3.5 mt-0.5 text-destructive flex-shrink-0" />
                      {myAdminTrackers.length} tracker(s) you own and all their transactions
                    </li>
                  )}
                  {myMemberTrackers.length > 0 && (
                    <li className="flex items-start gap-2">
                      <Trash2 className="h-3.5 w-3.5 mt-0.5 text-destructive flex-shrink-0" />
                      Your membership in {myMemberTrackers.length} shared tracker(s)
                    </li>
                  )}
                </ul>
                <div className="pt-2">
                  <p className="text-xs font-medium mb-1.5">Type <strong>DELETE</strong> to confirm:</p>
                  <Input
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="font-mono text-sm"
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
            {deleteConfirmText === 'DELETE' ? (
              <DeleteCountdownButton
                seconds={5}
                label={deletingAccount ? 'Deleting...' : 'Delete Forever'}
                onConfirm={handleDeleteAccount}
              />
            ) : (
              <Button variant="destructive" disabled className="w-full h-11 opacity-50">
                Delete Forever
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
}
