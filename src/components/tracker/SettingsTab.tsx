import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tracker, TrackerMember, Category } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useUpdateTracker, useDeleteTracker, useRemoveMember, useUpdateMemberRole, useInviteMember, useCreateCategory, useUpdateCategory, useDeleteCategory, useConvertTrackerCurrency } from '@/hooks/useTrackers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { House, Pencil, Check, X, Trash, DotsThree, Plus, Sparkle, CaretDown, MagnifyingGlass, Tag, DownloadSimple, Bell, FunnelSimple, Money, CaretRight, CircleNotch } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { CURRENCIES, getCurrency } from '@/lib/currencies';
import { useExpenses } from '@/hooks/useExpenses';
import * as XLSX from 'xlsx';
import { CATEGORY_ICON_MAP, ICON_GROUPS, ICON_LABELS, getSuggestedIcons } from '@/lib/phosphorIcons';
import CategoryIcon from '@/components/CategoryIcon';
import CategoryDot from '@/components/CategoryDot';
import { format, parseISO } from 'date-fns';

const PRESET_COLORS = ['#E66B47', '#5E8C5D', '#3B7C9A', '#B45D9E', '#C7943B', '#7A5BA8', '#D44C7A', '#4C95A8', '#2F7D5F', '#7A8F2E', '#9B948A', '#1F1B16'];

const STORAGE_KEY = 'expensesync-type-filter';

interface Props {
  trackerId: string;
  tracker: Tracker;
  members: TrackerMember[];
  categories: Category[];
  isAdmin: boolean;
  userId: string;
}

export default function SettingsTab({ trackerId, tracker, members, categories, isAdmin, userId }: Props) {
  const navigate = useNavigate();
  const { setActiveTrackerId } = useApp();
  const updateTracker = useUpdateTracker();
  const deleteTracker = useDeleteTracker();
  const removeMember = useRemoveMember(trackerId);
  const updateRole = useUpdateMemberRole(trackerId);
  const inviteMember = useInviteMember(trackerId);
  const createCategory = useCreateCategory(trackerId);
  const updateCategory = useUpdateCategory(trackerId);
  const deleteCategory = useDeleteCategory(trackerId);

  const convertCurrency = useConvertTrackerCurrency();
  const { data: allExpenses = [], isLoading: isExportLoading } = useExpenses(trackerId, 'all');
  const [exporting, setExporting] = useState(false);

  const handleExportAll = () => {
    if (allExpenses.length === 0) {
      toast.error('No transactions to export');
      return;
    }
    setExporting(true);
    try {
      const currencySymbol = getCurrency(tracker.currency).symbol;
      const rows = allExpenses.map(e => ({
        Date: e.date,
        Type: e.is_transfer ? 'Transfer' : e.is_debit ? 'Debit' : 'Credit',
        Description: e.description,
        Merchant: e.merchant_name || '',
        Category: e.category?.name || '',
        [`Amount (${currencySymbol})`]: e.amount,
        'Payment Method': e.payment_method || '',
        'Bank': e.bank_name || '',
        Notes: e.notes || '',
        Tags: e.tags?.join(', ') || '',
        'Added By': e.created_by_profile?.full_name || e.created_by_name || 'Deleted User',
        'Reference No.': e.reference_number || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 12 },
        { wch: 15 }, { wch: 16 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
      const safeName = tracker.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      XLSX.writeFile(wb, `ExpenseSync_${safeName}_All.xlsx`);
      toast.success(`Exported ${allExpenses.length} transactions`);
    } catch {
      toast.error('Failed to export');
    } finally {
      setExporting(false);
    }
  };

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(tracker.name);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [defaultView, setDefaultView] = useState<TransactionFilter>('all');
  const [showPrefSheet, setShowPrefSheet] = useState<null | 'view' | 'currency' | 'notifications' | 'export'>(null);

  const [showCurrencyChange, setShowCurrencyChange] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState(tracker.currency);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  // Category sheet state
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('Tag');
  const [catColor, setCatColor] = useState(PRESET_COLORS[0]);
  const [aiIcons, setAiIcons] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showIconGrid, setShowIconGrid] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [showSystemCats, setShowSystemCats] = useState(false);
  const [bulkRegenerating, setBulkRegenerating] = useState(false);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Category delete flow state
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteCatTxnCount, setDeleteCatTxnCount] = useState(0);
  const [deleteCatStep, setDeleteCatStep] = useState<'choose' | 'pick-category'>('choose');
  const [reassignCategoryId, setReassignCategoryId] = useState<string>('');
  const [reassignSearch, setReassignSearch] = useState('');

  const customCategories = categories.filter(c => !c.is_system && c.tracker_id === trackerId);
  const systemCategories = categories.filter(c => c.is_system);
  const adminCount = members.filter(m => m.role === 'admin').length;

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      setDefaultView(data[trackerId] || 'all');
    } catch { /* ignore */ }
  }, [trackerId]);

  const handleDefaultViewChange = (value: TransactionFilter) => {
    setDefaultView(value);
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      data[trackerId] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  };

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue !== tracker.name) {
      await updateTracker.mutateAsync({ id: trackerId, name: nameValue.trim() });
    }
    setEditingName(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    await inviteMember.mutateAsync(inviteEmail.trim());
    setInviteEmail('');
    setShowInvite(false);
  };

  const fetchAiIcons = useCallback(async (name: string) => {
    if (!name.trim() || name.trim().length < 2) {
      setAiIcons([]);
      return;
    }
    const clientSuggestions = getSuggestedIcons(name);
    setAiIcons(clientSuggestions);
    setCatIcon(clientSuggestions[0]);

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-emojis', {
        body: { categoryName: name.trim() },
      });
      if (error) throw error;
      const icons = data?.icons ?? data?.emojis;
      if (Array.isArray(icons) && icons.length >= 1) {
        const valid = icons.filter((v: unknown) => typeof v === 'string' && v in CATEGORY_ICON_MAP).slice(0, 3);
        if (valid.length > 0) {
          setAiIcons(valid);
          setCatIcon(valid[0]);
        }
      }
    } catch {
      /* keep client suggestions */
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleCatNameChange = (value: string) => {
    setCatName(value);
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    aiDebounceRef.current = setTimeout(() => fetchAiIcons(value), 600);
  };

  const handleBulkRegenerateIcons = async () => {
    if (customCategories.length === 0) {
      toast.error('No custom categories to update');
      return;
    }
    setBulkRegenerating(true);
    try {
      let updated = 0;
      for (const cat of customCategories) {
        const best = getSuggestedIcons(cat.name)[0];
        if (best && best !== cat.icon) {
          await updateCategory.mutateAsync({ id: cat.id, name: cat.name, icon: best, color: cat.color });
          updated++;
        }
      }
      toast.success(updated > 0 ? `Updated ${updated} category icon${updated !== 1 ? 's' : ''}` : 'All icons are already up to date');
    } catch {
      toast.error('Failed to regenerate icons');
    } finally {
      setBulkRegenerating(false);
    }
  };

  const openCreateSheet = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('Tag');
    setCatColor(PRESET_COLORS[0]);
    setAiIcons([]);
    setShowIconGrid(false);
    setIconSearch('');
    setShowCategorySheet(true);
  };

  const openEditSheet = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatIcon(cat.icon);
    setCatColor(cat.color);
    setAiIcons([]);
    setShowIconGrid(false);
    setIconSearch('');
    setShowCategorySheet(true);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) return;
    if (editingCategory) {
      if (editingCategory.is_system) {
        await createCategory.mutateAsync({ name: catName.trim(), icon: catIcon, color: catColor });
        toast.success('Custom version created for this tracker');
      } else {
        await updateCategory.mutateAsync({ id: editingCategory.id, name: catName.trim(), icon: catIcon, color: catColor });
      }
    } else {
      await createCategory.mutateAsync({ name: catName.trim(), icon: catIcon, color: catColor });
    }
    setShowCategorySheet(false);
    setCatName('');
    setAiIcons([]);
  };

  const handleDeleteTracker = async () => {
    await deleteTracker.mutateAsync(trackerId);
    setActiveTrackerId(null);
    navigate('/');
  };

  const handleLeave = async () => {
    if (isAdmin && adminCount <= 1) {
      toast.error('Transfer admin role to another member before leaving.');
      return;
    }
    const myMembership = members.find(m => m.user_id === userId);
    if (myMembership) {
      await removeMember.mutateAsync(myMembership.id);
      setActiveTrackerId(null);
      navigate('/');
    }
  };

  const openDeleteCategoryFlow = async (cat: Category) => {
    const { count } = await supabase
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', cat.id)
      .eq('tracker_id', trackerId);
    setDeletingCategory(cat);
    setDeleteCatTxnCount(count ?? 0);
    setDeleteCatStep('choose');
    setReassignCategoryId('');
    setReassignSearch('');
  };

  const handleDeleteCategoryWithTransactions = async () => {
    if (!deletingCategory) return;
    await deleteCategory.mutateAsync({ categoryId: deletingCategory.id, deleteTransactions: true });
    setDeletingCategory(null);
  };
  const handleDeleteCategoryReassign = async () => {
    if (!deletingCategory || !reassignCategoryId) return;
    await deleteCategory.mutateAsync({ categoryId: deletingCategory.id, reassignCategoryId });
    setDeletingCategory(null);
  };
  const handleDeleteCategoryNoTxns = async () => {
    if (!deletingCategory) return;
    await deleteCategory.mutateAsync({ categoryId: deletingCategory.id });
    setDeletingCategory(null);
  };

  const reassignableCategories = categories
    .filter(c => c.id !== deletingCategory?.id)
    .filter(c => c.name.toLowerCase().includes(reassignSearch.toLowerCase()));

  const isSaving = createCategory.isPending || updateCategory.isPending;
  const sinceLabel = tracker.created_at ? format(parseISO(tracker.created_at), 'MMM yyyy') : '';
  const memberInitialColors = ['#5E8C5D', '#B45D9E', '#3B7C9A', '#C7943B', '#D44C7A', '#7A5BA8'];

  const viewLabel = defaultView === 'all' ? 'All' : defaultView === 'debit' ? 'Debits' : 'Credits';

  return (
    <div className="pb-6 space-y-1">
      {/* Tracker header card */}
      <div className="mx-4 mb-1 mt-1 px-4 py-4 rounded-3xl bg-card border border-line-soft flex items-center gap-3.5">
        <div
          className="inline-flex items-center justify-center rounded-2xl shrink-0"
          style={{ width: 52, height: 52, background: 'hsl(var(--ember) / 0.12)', color: 'hsl(var(--ember))' }}
        >
          <House size={26} weight="regular" />
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input value={nameValue} onChange={e => setNameValue(e.target.value)} className="h-9 flex-1" onKeyDown={e => e.key === 'Enter' && handleSaveName()} autoFocus />
              <button onClick={handleSaveName} className="p-1.5 text-earn"><Check size={16} weight="bold" /></button>
              <button onClick={() => { setEditingName(false); setNameValue(tracker.name); }} className="p-1.5 text-ink-faint"><X size={16} /></button>
            </div>
          ) : (
            <>
              <p className="font-display font-semibold text-lg truncate text-ink" style={{ letterSpacing: '-0.02em' }}>{tracker.name}</p>
              <p className="text-xs text-ink-soft mt-0.5">
                {getCurrency(tracker.currency).symbol} {tracker.currency} · {members.length} member{members.length !== 1 ? 's' : ''}
                {sinceLabel && ` · since ${sinceLabel}`}
              </p>
            </>
          )}
        </div>
        {isAdmin && !editingName && (
          <button
            onClick={() => setEditingName(true)}
            className="inline-flex items-center justify-center rounded-xl border border-line"
            style={{ width: 34, height: 34 }}
            aria-label="Edit name"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>

      {/* Members */}
      <SectionHeader label="Members" />
      <div className="mx-4 rounded-2xl bg-card border border-line-soft overflow-hidden">
        {members.map((member, idx) => {
          const initial = (member.profile?.full_name || 'U')[0].toUpperCase();
          const color = memberInitialColors[idx % memberInitialColors.length];
          return (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3.5 py-2.5"
              style={{ borderBottom: idx === members.length - 1 ? 'none' : '1px solid hsl(var(--line-soft))' }}
            >
              <span
                className="inline-flex items-center justify-center rounded-full font-display font-bold text-[13px]"
                style={{ width: 34, height: 34, background: color + '22', color }}
              >
                {initial}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-ink truncate">
                  {member.profile?.full_name || 'Unknown'}{member.user_id === userId ? ' (You)' : ''}
                </p>
                <p className="text-[11px] text-ink-faint">{member.role === 'admin' ? 'Admin' : 'Member'}</p>
              </div>
              {isAdmin && member.user_id !== userId && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-ink-faint p-1.5 inline-flex items-center justify-center" aria-label="Member actions">
                      <DotsThree size={18} weight="bold" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={4} className="w-44 p-1">
                    <button
                      onClick={() => updateRole.mutate({ memberId: member.id, role: member.role === 'admin' ? 'member' : 'admin' })}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted"
                    >
                      {member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-spend/10 text-spend">
                          Remove from tracker
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove member?</AlertDialogTitle>
                          <AlertDialogDescription>Remove {member.profile?.full_name} from this tracker?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeMember.mutate(member.id)} className="bg-spend text-white hover:bg-spend/90">Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          );
        })}
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="w-full px-3.5 py-3 bg-surface-alt border-t border-line-soft text-left flex items-center gap-2 text-ember font-semibold text-[13px]"
          >
            <Plus size={16} weight="bold" /> Invite by email
          </button>
        )}
      </div>

      {/* Categories */}
      <SectionHeader label="Categories" />
      <div className="mx-4 rounded-2xl bg-card border border-line-soft px-3.5 py-3">
        <div className="flex flex-wrap gap-2">
          {customCategories.map(c => (
            <CategoryChip key={c.id} cat={c} onClick={() => openEditSheet(c)} />
          ))}
          {customCategories.length === 0 && (
            <p className="text-[12.5px] text-ink-faint pl-1 py-1">No custom categories yet</p>
          )}
          <button
            onClick={openCreateSheet}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-ember"
            style={{ border: '1px dashed hsl(var(--ember))' }}
          >
            <Plus size={13} weight="bold" /> Add
          </button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setShowSystemCats(!showSystemCats)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft"
          >
            System ({systemCategories.length})
            <CaretDown size={11} weight="bold" style={{ transform: showSystemCats ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
          </button>
          <button
            onClick={handleBulkRegenerateIcons}
            disabled={bulkRegenerating}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft disabled:opacity-50"
          >
            {bulkRegenerating ? <CircleNotch className="h-3 w-3 animate-spin" /> : <Sparkle size={13} />} Auto-assign icons
          </button>
        </div>
        {showSystemCats && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line-soft">
            {systemCategories.map(c => (
              <CategoryChip key={c.id} cat={c} onClick={() => openEditSheet(c)} />
            ))}
          </div>
        )}
      </div>

      {/* Preferences */}
      <SectionHeader label="Preferences" />
      <div className="mx-4 rounded-2xl bg-card border border-line-soft overflow-hidden">
        <PrefRow icon={<FunnelSimple size={15} />} label="Default view" value={viewLabel} onClick={() => setShowPrefSheet('view')} />
        <PrefRow icon={<Money size={15} />} label="Currency" value={`${getCurrency(tracker.currency).symbol} ${tracker.currency}`} onClick={() => isAdmin && setShowPrefSheet('currency')} disabled={!isAdmin} />
        <PrefRow
          icon={<DownloadSimple size={15} />}
          label="Export transactions"
          value={isExportLoading ? 'Loading...' : `${allExpenses.length} txn${allExpenses.length !== 1 ? 's' : ''}`}
          onClick={handleExportAll}
          disabled={exporting || isExportLoading || allExpenses.length === 0}
        />
        <PrefRow icon={<Bell size={15} />} label="Notifications" value="Off" onClick={() => toast.info('Notifications are not yet wired up')} last />
      </div>

      {/* Danger Zone */}
      <SectionHeader label="Danger zone" />
      {isAdmin ? (
        <div className="mx-4 rounded-2xl bg-card border overflow-hidden" style={{ borderColor: 'hsl(var(--spend) / 0.30)' }}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left">
                <span
                  className="inline-flex items-center justify-center rounded-lg"
                  style={{ width: 28, height: 28, background: 'hsl(var(--spend) / 0.10)', color: 'hsl(var(--spend))' }}
                >
                  <Trash size={15} />
                </span>
                <span className="flex-1 text-[14px] font-medium text-spend">Delete tracker</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{tracker.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete all transactions and tracker data. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <DeleteCountdownButton onDelete={handleDeleteTracker} />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <div className="mx-4 rounded-2xl bg-card border border-line-soft overflow-hidden">
          <button onClick={handleLeave} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left">
            <span className="inline-flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: 'hsl(var(--spend) / 0.10)', color: 'hsl(var(--spend))' }}>
              <X size={15} />
            </span>
            <span className="flex-1 text-[14px] font-medium text-spend">Leave tracker</span>
          </button>
        </div>
      )}

      <div className="h-6" />

      {/* Invite-by-email sheet */}
      <Sheet open={showInvite} onOpenChange={setShowInvite}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Invite Member</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-3">
            <Input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="h-11"
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              autoFocus
            />
            <Button onClick={handleInvite} disabled={inviteMember.isPending || !inviteEmail.trim()} className="w-full h-11 bg-ember hover:bg-ember/90 text-white">
              {inviteMember.isPending ? <CircleNotch className="h-4 w-4 animate-spin" /> : 'Add to tracker'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Default view picker sheet */}
      <Sheet open={showPrefSheet === 'view'} onOpenChange={(open) => !open && setShowPrefSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Default Transaction View</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-1">
            <p className="text-xs text-ink-soft pb-2">Shows which transactions you see first when opening this tracker.</p>
            {([
              { value: 'all' as TransactionFilter, label: 'All Transactions' },
              { value: 'debit' as TransactionFilter, label: 'Debits only (Expenses)' },
              { value: 'credit' as TransactionFilter, label: 'Credits only (Income)' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => { handleDefaultViewChange(opt.value); setShowPrefSheet(null); }}
                className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-muted text-left"
              >
                <span className="text-sm font-medium">{opt.label}</span>
                {defaultView === opt.value && <Check size={16} weight="bold" color="hsl(var(--ember))" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Currency picker sheet */}
      <Sheet open={showPrefSheet === 'currency'} onOpenChange={(open) => !open && setShowPrefSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Tracker Currency</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <Select
              value={tracker.currency}
              onValueChange={(val) => {
                if (val !== tracker.currency) {
                  setPendingCurrency(val);
                  setShowConvertDialog(true);
                  setShowPrefSheet(null);
                }
              }}
            >
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete category flow */}
      <Sheet open={!!deletingCategory} onOpenChange={(open) => { if (!open) setDeletingCategory(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80dvh]">
          <SheetHeader>
            <SheetTitle>Delete &quot;{deletingCategory?.name}&quot;</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {deleteCatTxnCount === 0 ? (
              <>
                <p className="text-sm text-ink-soft">No transactions use this category. It can be safely deleted.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeletingCategory(null)}>Cancel</Button>
                  <Button className="flex-1 bg-spend text-white hover:bg-spend/90" onClick={handleDeleteCategoryNoTxns} disabled={deleteCategory.isPending}>
                    {deleteCategory.isPending ? <CircleNotch className="h-4 w-4 animate-spin" /> : 'Delete Category'}
                  </Button>
                </div>
              </>
            ) : deleteCatStep === 'choose' ? (
              <>
                <div className="rounded-xl bg-warn/10 border border-warn/30 p-3">
                  <p className="text-sm text-warn font-medium">{deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''} use this category</p>
                  <p className="text-xs text-warn/80 mt-1">Choose what to do with these transactions.</p>
                </div>
                <Button variant="outline" className="w-full h-12 justify-start gap-3" onClick={() => setDeleteCatStep('pick-category')}>
                  <Tag size={16} color="hsl(var(--ember))" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Keep transactions</p>
                    <p className="text-xs text-ink-soft">Move them to another category</p>
                  </div>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full h-12 justify-start gap-3 border-spend/30 text-spend hover:bg-spend/5">
                      <Trash size={16} />
                      <div className="text-left">
                        <p className="text-sm font-medium">Delete transactions too</p>
                        <p className="text-xs opacity-70">Permanently delete all {deleteCatTxnCount}</p>
                      </div>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {deleteCatTxnCount} transactions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the &quot;{deletingCategory?.name}&quot; category and all {deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''} using it. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteCategoryWithTransactions} className="bg-spend text-white hover:bg-spend/90">
                        {deleteCategory.isPending ? <CircleNotch className="h-4 w-4 animate-spin" /> : 'Delete All'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" className="w-full" onClick={() => setDeletingCategory(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">
                  Move {deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''} to:
                </p>
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2" size={16} color="hsl(var(--ink-faint))" />
                  <Input value={reassignSearch} onChange={e => setReassignSearch(e.target.value)} placeholder="Search categories..." className="pl-9 h-10" />
                </div>
                <div className="max-h-[40vh] overflow-y-auto space-y-1">
                  {reassignableCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setReassignCategoryId(cat.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl text-sm transition-colors"
                      style={reassignCategoryId === cat.id
                        ? { background: 'hsl(var(--ember) / 0.10)', boxShadow: 'inset 0 0 0 1px hsl(var(--ember))' }
                        : undefined}
                    >
                      <CategoryDot icon={cat.icon} color={cat.color} size={28} />
                      <span className="flex-1 text-left truncate">{cat.name}</span>
                      {!cat.is_system && <span className="text-[10px] text-ink-faint">Custom</span>}
                      {reassignCategoryId === cat.id && <Check size={16} weight="bold" color="hsl(var(--ember))" />}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteCatStep('choose')}>Back</Button>
                  <Button className="flex-1 bg-ember hover:bg-ember/90 text-white" disabled={!reassignCategoryId || deleteCategory.isPending} onClick={handleDeleteCategoryReassign}>
                    {deleteCategory.isPending ? <CircleNotch className="h-4 w-4 animate-spin" /> : 'Move & Delete'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Currency convert dialog */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change currency to {getCurrency(pendingCurrency).symbol} {pendingCurrency}?</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to convert all existing transaction amounts from {getCurrency(tracker.currency).symbol} {tracker.currency} to {getCurrency(pendingCurrency).symbol} {pendingCurrency} using historical exchange rates?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={async () => { setShowConvertDialog(false); await convertCurrency.mutateAsync({ trackerId, newCurrency: pendingCurrency, convertExisting: true }); }}
              disabled={convertCurrency.isPending}
              className="w-full bg-ember hover:bg-ember/90 text-white"
            >
              {convertCurrency.isPending ? <CircleNotch className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, convert amounts
            </Button>
            <Button
              variant="outline"
              onClick={async () => { setShowConvertDialog(false); await convertCurrency.mutateAsync({ trackerId, newCurrency: pendingCurrency, convertExisting: false }); }}
              disabled={convertCurrency.isPending}
              className="w-full"
            >
              No, just change the label
            </Button>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit category sheet */}
      <Sheet open={showCategorySheet} onOpenChange={setShowCategorySheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh]">
          <SheetHeader>
            <SheetTitle>
              {editingCategory ? (editingCategory.is_system ? 'Customise System Category' : 'Edit Category') : 'Add Category'}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {editingCategory?.is_system && (
              <div className="rounded-xl bg-ember/10 border border-ember/30 p-3 text-xs text-ember">
                Editing a system category creates a custom version for this tracker. The original stays unchanged.
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={catName} onChange={e => handleCatNameChange(e.target.value)} placeholder="Category name" className="h-11" autoFocus />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Sparkle size={13} color="hsl(var(--ember))" />
                Suggested Icons
                {aiLoading && <CircleNotch className="h-3 w-3 animate-spin text-ink-faint" />}
              </Label>
              {aiIcons.length > 0 ? (
                <div className="flex gap-2">
                  {aiIcons.map((iconName) => (
                    <button
                      key={iconName}
                      onClick={() => setCatIcon(iconName)}
                      className="h-14 w-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"
                      style={catIcon === iconName
                        ? { background: 'hsl(var(--ember) / 0.10)', boxShadow: 'inset 0 0 0 2px hsl(var(--ember))', transform: 'scale(1.05)' }
                        : { background: 'hsl(var(--muted))' }}
                    >
                      <CategoryIcon icon={iconName} color={catColor} size={24} />
                      <span className="text-[9px] text-ink-soft leading-none truncate w-full text-center px-0.5">{iconName}</span>
                    </button>
                  ))}
                </div>
              ) : catName.trim().length >= 2 ? (
                <p className="text-xs text-ink-faint py-2">Generating suggestions...</p>
              ) : (
                <p className="text-xs text-ink-faint py-2">Type a name to get icon suggestions</p>
              )}
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => setShowIconGrid(!showIconGrid)}
                className="text-xs text-ember font-semibold flex items-center gap-1"
              >
                {showIconGrid ? 'Hide' : 'Browse'} all icons
                <CaretDown size={10} weight="bold" style={{ transform: showIconGrid ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
              </button>
              {showIconGrid && (
                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2" size={14} color="hsl(var(--ink-faint))" />
                    <Input value={iconSearch} onChange={e => setIconSearch(e.target.value)} placeholder="Search icons..." className="pl-8 h-9 text-sm" />
                  </div>
                  {(() => {
                    const q = iconSearch.toLowerCase().trim();
                    const groups = q
                      ? [{ label: 'Results', icons: Object.keys(CATEGORY_ICON_MAP).filter(name =>
                          name.toLowerCase().includes(q) || (ICON_LABELS[name] || '').toLowerCase().includes(q)
                        )}]
                      : ICON_GROUPS;
                    return groups.map(group => group.icons.length === 0 ? null : (
                      <div key={group.label}>
                        <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider mb-1.5">{group.label}</p>
                        <div className="grid grid-cols-6 gap-1.5">
                          {group.icons.map(iconName => (
                            <button
                              key={iconName}
                              onClick={() => setCatIcon(iconName)}
                              title={iconName}
                              className="h-10 w-full rounded-lg flex items-center justify-center transition-all"
                              style={catIcon === iconName
                                ? { background: 'hsl(var(--ember) / 0.10)', boxShadow: 'inset 0 0 0 2px hsl(var(--ember))' }
                                : { background: 'hsl(var(--muted))' }}
                            >
                              <CategoryIcon icon={iconName} color={catIcon === iconName ? catColor : 'hsl(var(--ink-soft))'} size={20} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-surface-alt p-3">
              <CategoryDot icon={catIcon} color={catColor} size={40} />
              <div>
                <p className="text-sm font-medium">{catName || 'Category Name'}</p>
                <p className="text-xs text-ink-soft">Preview</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setCatColor(c)}
                    className="h-8 w-8 rounded-full"
                    style={{
                      background: c,
                      boxShadow: catColor === c ? '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ember))' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            <Button onClick={handleSaveCategory} className="w-full h-11 bg-ember hover:bg-ember/90 text-white" disabled={!catName.trim() || isSaving}>
              {isSaving ? (
                <CircleNotch className="h-4 w-4 animate-spin" />
              ) : editingCategory ? (
                editingCategory.is_system ? 'Create Custom Version' : 'Save Changes'
              ) : (
                'Add Category'
              )}
            </Button>
            {editingCategory && !editingCategory.is_system && (
              <Button
                variant="outline"
                onClick={() => { openDeleteCategoryFlow(editingCategory); setShowCategorySheet(false); }}
                className="w-full h-10 border-spend/30 text-spend hover:bg-spend/10"
              >
                Delete Category
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mx-4 mt-5 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
      {label}
    </div>
  );
}

function CategoryChip({ cat, onClick }: { cat: Category; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-surface-alt border border-line-soft"
    >
      <CategoryDot icon={cat.icon} color={cat.color} size={22} />
      <span className="text-[12.5px] font-semibold text-ink">{cat.name}</span>
    </button>
  );
}

function PrefRow({
  icon, label, value, onClick, disabled, last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3.5 px-4 py-3 text-left disabled:opacity-50"
      style={{ borderBottom: last ? 'none' : '1px solid hsl(var(--line-soft))' }}
    >
      <span
        className="inline-flex items-center justify-center rounded-lg shrink-0"
        style={{ width: 28, height: 28, background: 'hsl(var(--ember) / 0.10)', color: 'hsl(var(--ember))' }}
      >
        {icon}
      </span>
      <span className="flex-1 text-[14px] font-medium text-ink">{label}</span>
      <span className="inline-flex items-center gap-1 text-[13px] text-ink-soft font-medium">
        {value}
        <CaretRight size={13} color="hsl(var(--ink-faint))" />
      </span>
    </button>
  );
}

function DeleteCountdownButton({ onDelete }: { onDelete: () => void }) {
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);
  return (
    <AlertDialogAction onClick={onDelete} disabled={count > 0} className="bg-spend text-white hover:bg-spend/90">
      {count > 0 ? `Delete Forever (${count})` : 'Delete Forever'}
    </AlertDialogAction>
  );
}
