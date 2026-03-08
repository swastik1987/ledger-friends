import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTracker, useTrackerMembers, useCategories } from '@/hooks/useTrackers';
import { useExpenses, useExpenseRealtime } from '@/hooks/useExpenses';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTransactionTypeFilter } from '@/hooks/useTransactionTypeFilter';
import { ArrowLeft, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BottomNav from '@/components/BottomNav';
import ExpensesTab from '@/components/tracker/ExpensesTab';
import DashboardTab from '@/components/tracker/DashboardTab';
import SettingsTab from '@/components/tracker/SettingsTab';
import AddExpenseSheet from '@/components/tracker/AddExpenseSheet';
import { format } from 'date-fns';

export default function TrackerDetail() {
  const { trackerId } = useParams<{ trackerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActiveTrackerId } = useApp();

  const tab = searchParams.get('tab') || 'expenses';
  const month = searchParams.get('month') || format(new Date(), 'yyyy-MM');

  const { data: tracker } = useTracker(trackerId!);
  const { data: members } = useTrackerMembers(trackerId!);
  const { data: categories } = useCategories(trackerId);
  const { data: expenses, isLoading: expensesLoading } = useExpenses(trackerId!, month);
  const [typeFilter, setTypeFilter] = useTransactionTypeFilter(trackerId!);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

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

  const setTab = (t: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', t);
    setSearchParams(params);
  };

  const setMonth = (m: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('month', m);
    setSearchParams(params);
  };

  if (!tracker) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={() => navigate('/')} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base truncate flex-1 text-center mx-2">{tracker.name}</h1>
          <button onClick={() => navigate(`/tracker/${trackerId}/upload`)} className="p-1 text-muted-foreground hover:text-foreground">
            <Upload className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-lg mx-auto w-full flex-1">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 sticky top-[57px] z-10 bg-background rounded-none border-b border-border">
            <TabsTrigger value="expenses">Transactions</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="mt-0">
            <ExpensesTab
              trackerId={trackerId!}
              expenses={expenses || []}
              categories={categories || []}
              isLoading={expensesLoading}
              month={month}
              onMonthChange={setMonth}
              onAddExpense={() => setShowAddExpense(true)}
              onEditExpense={(id) => { setEditingExpenseId(id); setShowAddExpense(true); }}
              isAdmin={isAdmin}
              userId={user?.id || ''}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-0">
            <DashboardTab
              expenses={expenses || []}
              categories={categories || []}
              month={month}
              onMonthChange={setMonth}
              isLoading={expensesLoading}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsTab
              trackerId={trackerId!}
              tracker={tracker}
              members={members || []}
              categories={categories || []}
              isAdmin={isAdmin}
              userId={user?.id || ''}
            />
          </TabsContent>
        </Tabs>
      </div>

      <AddExpenseSheet
        open={showAddExpense}
        onOpenChange={(open) => { setShowAddExpense(open); if (!open) setEditingExpenseId(null); }}
        trackerId={trackerId!}
        categories={categories || []}
        editExpenseId={editingExpenseId}
        expenses={expenses || []}
      />

      <BottomNav />
    </div>
  );
}
