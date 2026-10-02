import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTracker, useTrackerMembers, useCategories } from '@/hooks/useTrackers';
import { useExpenses, useExpenseRealtime, useExpenseMonths, useSuspectedTransfers } from '@/hooks/useExpenses';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTransactionTypeFilter } from '@/hooks/useTransactionTypeFilter';
import BottomNav from '@/components/BottomNav';
import ExpensesTab from '@/components/tracker/ExpensesTab';
import LoadError, { type LoadErrorState } from '@/components/LoadError';
import DashboardTab from '@/components/tracker/DashboardTab';
import SettingsTab from '@/components/tracker/SettingsTab';
import AddExpenseSheet from '@/components/tracker/AddExpenseSheet';
import TransferReviewModal from '@/components/tracker/TransferReviewModal';
import TransferReviewSheet from '@/components/tracker/TransferReviewSheet';
import TrackerTopBar from '@/components/tracker/TrackerTopBar';
import TrackerTabBar from '@/components/tracker/TrackerTabBar';
import { format } from 'date-fns';
import { toast } from 'sonner';

const dismissKey = (trackerId: string) => `transfer-review-dismissed-${trackerId}`;

export default function TrackerDetail() {
  const { trackerId } = useParams<{ trackerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveTrackerId } = useApp();

  const tab = (searchParams.get('tab') || 'expenses') as 'expenses' | 'dashboard' | 'settings';

  const {
    data: tracker, isError: trackerError, error: trackerErrorObj,
    isFetching: trackerFetching, isPaused: trackerPaused, refetch: refetchTracker,
  } = useTracker(trackerId!);
  // Only a genuinely missing tracker is "not found": .single() with no visible
  // row (deleted, or RLS hides it from non-members) → PGRST116; a malformed id →
  // 22P02. Anything else (offline, 5xx) is a load failure — offer a retry
  // instead of bouncing the user home with a misleading "Tracker not found".
  const trackerErrorCode = (trackerErrorObj as { code?: string } | null)?.code;
  const trackerMissing = trackerError && (trackerErrorCode === 'PGRST116' || trackerErrorCode === '22P02');
  // Paused = React Query is holding the request until the device is back online.
  const trackerOffline = trackerPaused && !tracker;
  const trackerLoadFailed = (trackerError && !trackerMissing && !tracker) || trackerOffline;
  const { data: members, isFetched: membersFetched } = useTrackerMembers(trackerId!);
  const { data: categories } = useCategories(trackerId);
  const { data: availableMonths } = useExpenseMonths(trackerId!);

  const latestMonth = availableMonths?.find(m => m.value !== 'all')?.value || format(new Date(), 'yyyy-MM');
  const month = searchParams.get('month') || latestMonth;

  const {
    data: expenses, isLoading: expensesLoading, isError: expensesError,
    isFetching: expensesFetching, isPaused: expensesPaused, refetch: refetchExpenses,
  } = useExpenses(trackerId!, month);
  // Failed (or offline-paused) load with nothing cached: the tabs show that
  // state, not "No transactions".
  const expensesOffline = expensesPaused && !expenses?.length;
  const expensesLoadError: LoadErrorState | null = (expensesError && !expenses?.length) || expensesOffline
    ? { onRetry: () => void refetchExpenses(), retrying: expensesFetching, offline: expensesOffline }
    : null;
  const [typeFilter, setTypeFilter] = useTransactionTypeFilter(trackerId!);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const { data: suspectedData } = useSuspectedTransfers(trackerId!);
  const suspectedTransfers = suspectedData?.all;
  const pairedTransferIds = suspectedData?.pairedIds ?? new Set<string>();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransferSheet, setShowTransferSheet] = useState(false);

  useEffect(() => {
    if (!trackerId || !suspectedTransfers || suspectedTransfers.length === 0) return;
    const dismissed = typeof window !== 'undefined'
      ? sessionStorage.getItem(dismissKey(trackerId)) === '1'
      : false;
    if (!dismissed && !showTransferSheet) {
      setShowTransferModal(true);
    }
  }, [trackerId, suspectedTransfers, showTransferSheet]);

  const handleDismissTransfers = () => {
    if (trackerId && typeof window !== 'undefined') {
      sessionStorage.setItem(dismissKey(trackerId), '1');
    }
    setShowTransferModal(false);
  };

  const handleReviewTransfers = () => {
    setShowTransferModal(false);
    setShowTransferSheet(true);
  };

  useExpenseRealtime(trackerId!);

  useEffect(() => {
    if (trackerId) setActiveTrackerId(trackerId);
  }, [trackerId, setActiveTrackerId]);

  useEffect(() => {
    const handler = () => setShowAddExpense(true);
    window.addEventListener('open-add-expense', handler);
    return () => window.removeEventListener('open-add-expense', handler);
  }, []);

  const isAdmin = members?.some(m => m.user_id === user?.id && m.role === 'admin') ?? false;

  const setTab = (t: 'expenses' | 'dashboard' | 'settings') => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', t);
    setSearchParams(params);
  };

  const setMonth = (m: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('month', m);
    setSearchParams(params);
  };

  useEffect(() => {
    if (trackerMissing) {
      toast.error('Tracker not found');
      navigate('/');
    } else if (membersFetched && members && user && !members.some(m => m.user_id === user.id)) {
      toast.error("You don't have access to this tracker");
      navigate('/');
    }
  }, [trackerMissing, membersFetched, members, user, navigate]);

  if (!tracker) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {trackerLoadFailed ? (
        <LoadError
          what="this tracker"
          onRetry={() => void refetchTracker()}
          retrying={trackerFetching}
          offline={trackerOffline}
          secondaryAction={{ label: 'Back to Home', onClick: () => navigate('/') }}
        />
      ) : (
        <div className="animate-pulse text-ink-soft">Loading...</div>
      )}
    </div>
  );

  const memberCount = members?.length || 0;
  const transferCount = suspectedTransfers?.length || 0;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <TrackerTopBar trackerId={trackerId!} trackerName={tracker.name} memberCount={memberCount} />

      <div className="max-w-lg mx-auto w-full flex-1">
        <TrackerTabBar active={tab} onChange={setTab} />

        {tab === 'expenses' && (
          <ExpensesTab
            trackerId={trackerId!}
            trackerCurrency={tracker.currency || 'INR'}
            expenses={expenses || []}
            categories={categories || []}
            isLoading={expensesLoading}
            loadError={expensesLoadError}
            month={month}
            onMonthChange={setMonth}
            onAddExpense={() => setShowAddExpense(true)}
            onEditExpense={(id) => { setEditingExpenseId(id); setShowAddExpense(true); }}
            isAdmin={isAdmin}
            userId={user?.id || ''}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            suspectedTransferCount={transferCount}
            onOpenTransferReview={() => setShowTransferSheet(true)}
          />
        )}

        {tab === 'dashboard' && (
          <DashboardTab
            trackerId={trackerId!}
            trackerCurrency={tracker.currency || 'INR'}
            expenses={expenses || []}
            categories={categories || []}
            month={month}
            onMonthChange={setMonth}
            isLoading={expensesLoading}
            loadError={expensesLoadError}
          />
        )}

        {tab === 'settings' && (
          <SettingsTab
            trackerId={trackerId!}
            tracker={tracker}
            members={members || []}
            categories={categories || []}
            isAdmin={isAdmin}
            userId={user?.id || ''}
          />
        )}
      </div>

      <AddExpenseSheet
        open={showAddExpense}
        onOpenChange={(open) => { setShowAddExpense(open); if (!open) setEditingExpenseId(null); }}
        trackerId={trackerId!}
        trackerCurrency={tracker.currency || 'INR'}
        categories={categories || []}
        editExpenseId={editingExpenseId}
        expenses={expenses || []}
      />

      <TransferReviewModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        count={transferCount}
        onReview={handleReviewTransfers}
        onDismiss={handleDismissTransfers}
      />

      <TransferReviewSheet
        open={showTransferSheet}
        onOpenChange={setShowTransferSheet}
        trackerId={trackerId!}
        trackerCurrency={tracker.currency || 'INR'}
        suspectedExpenses={suspectedTransfers || []}
        pairedIds={pairedTransferIds}
      />

      <BottomNav />
    </div>
  );
}
