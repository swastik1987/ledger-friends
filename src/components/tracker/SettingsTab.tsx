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
import { Pencil, Check, X, Trash2, Users, Loader2, Sparkles, ChevronDown, Search, Tag, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { CURRENCIES, getCurrency } from '@/lib/currencies';
import { useExpenses } from '@/hooks/useExpenses';
import * as XLSX from 'xlsx';
import Nudge from '@/components/Nudge';
import { useNudge } from '@/hooks/useNudge';
import { CATEGORY_ICON_MAP, ICON_GROUPS, ICON_LABELS, getSuggestedIcons } from '@/lib/phosphorIcons';
import CategoryIcon from '@/components/CategoryIcon';

const PRESET_COLORS = ['#FF6B6B', '#51CF66', '#339AF0', '#FF922B', '#CC5DE8', '#F06595', '#20C997', '#74C0FC', '#FFD43B', '#748FFC', '#A9E34B', '#FFA94D'];

const STORAGE_KEY = 'expensesync-type-filter';

function NudgeInviteMember() {
  const { show, dismiss } = useNudge('settings-invite-member');
  return <Nudge show={show} onDismiss={dismiss} message="Add people by email to collaborate on this tracker. They'll see all transactions and can add their own." position="bottom" />;
}

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
  const { profile } = useAuth();
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [defaultView, setDefaultView] = useState<TransactionFilter>('all');

  // Currency change state
  const [showCurrencyChange, setShowCurrencyChange] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState(tracker.currency);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  // Category sheet state
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null); // null = creating new
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('Tag');
  const [catColor, setCatColor] = useState('#FF6B6B');
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

  // Load default view preference
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
  };

  // ─── AI Icon Suggestions ───
  const fetchAiIcons = useCallback(async (name: string) => {
    if (!name.trim() || name.trim().length < 2) {
      setAiIcons([]);
      return;
    }

    // Step 1: Instantly show client-side keyword suggestions
    const clientSuggestions = getSuggestedIcons(name);
    setAiIcons(clientSuggestions);
    setCatIcon(clientSuggestions[0]);

    // Step 2: Upgrade with Gemini suggestions
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-emojis', {
        body: { categoryName: name.trim() },
      });
      if (error) throw error;
      const icons = data?.icons ?? data?.emojis; // support both key names
      if (Array.isArray(icons) && icons.length >= 1) {
        // Only keep valid Phosphor icon names
        const valid = icons.filter((v: unknown) => typeof v === 'string' && v in CATEGORY_ICON_MAP).slice(0, 3);
        if (valid.length > 0) {
          setAiIcons(valid);
          setCatIcon(valid[0]);
        }
      }
    } catch {
      // Edge function unavailable — keep client-side suggestions
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleCatNameChange = (value: string) => {
    setCatName(value);
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    aiDebounceRef.current = setTimeout(() => fetchAiIcons(value), 600);
  };

  // ─── Bulk regenerate icons for all custom categories ───
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

  // ─── Open sheet for Create ───
  const openCreateSheet = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('Tag');
    setCatColor('#FF6B6B');
    setAiIcons([]);
    setShowIconGrid(false);
    setIconSearch('');
    setShowCategorySheet(true);
  };

  // ─── Open sheet for Edit ───
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

  // ─── Save Category (create or update) ───
  const handleSaveCategory = async () => {
    if (!catName.trim()) return;

    if (editingCategory) {
      if (editingCategory.is_system) {
        // System category: create a tracker-scoped custom copy with the new values
        await createCategory.mutateAsync({ name: catName.trim(), icon: catIcon, color: catColor });
        toast.success('Custom version created for this tracker');
      } else {
        // Custom category: update in place
        await updateCategory.mutateAsync({ id: editingCategory.id, name: catName.trim(), icon: catIcon, color: catColor });
      }
    } else {
      // New category
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
    await deleteCategory.mutateAsync({
      categoryId: deletingCategory.id,
      deleteTransactions: true,
    });
    setDeletingCategory(null);
  };

  const handleDeleteCategoryReassign = async () => {
    if (!deletingCategory || !reassignCategoryId) return;
    await deleteCategory.mutateAsync({
      categoryId: deletingCategory.id,
      reassignCategoryId,
    });
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

  return (
    <div className="px-4 py-3 space-y-6">
      {/* Tracker Info */}
      {isAdmin && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm">Tracker Info</h3>
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <Input value={nameValue} onChange={e => setNameValue(e.target.value)} className="h-10 flex-1" onKeyDown={e => e.key === 'Enter' && handleSaveName()} autoFocus />
                <button onClick={handleSaveName} className="p-2 text-accent"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingName(false); setNameValue(tracker.name); }} className="p-2 text-muted-foreground"><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <p className="font-semibold flex-1">{tracker.name}</p>
                <button onClick={() => setEditingName(true)} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <Select
              value={tracker.currency}
              onValueChange={(val) => {
                if (val !== tracker.currency) {
                  setPendingCurrency(val);
                  setShowConvertDialog(true);
                }
              }}
            >
              <SelectTrigger className="h-10">
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
        </div>
      )}

      {/* My Preferences */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">My Preferences</h3>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Default Transaction View</p>
          <p className="text-xs text-muted-foreground mb-3">Shows which transactions you see first when opening this tracker.</p>
          <div className="space-y-2">
            {([
              { value: 'all' as TransactionFilter, label: 'All Transactions' },
              { value: 'debit' as TransactionFilter, label: 'Debits only (Expenses)' },
              { value: 'credit' as TransactionFilter, label: 'Credits only (Income)' },
            ]).map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="defaultView"
                  checked={defaultView === opt.value}
                  onChange={() => handleDefaultViewChange(opt.value)}
                  className="h-4 w-4 text-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Export Transactions */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Export Transactions</h3>
        <p className="text-sm text-muted-foreground">
          Download all transactions across all months as an Excel file.
        </p>
        <Button
          variant="outline"
          onClick={handleExportAll}
          disabled={exporting || isExportLoading || allExpenses.length === 0}
          className="w-full h-10 gap-2"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExportLoading ? 'Loading transactions...' : exporting ? 'Exporting...' : `Export ${allExpenses.length} Transaction${allExpenses.length !== 1 ? 's' : ''}`}
        </Button>
      </div>

      {/* Members */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Members</h3>
        <div className="space-y-2">
          {members.map(member => (
            <div key={member.id} className="flex items-center gap-3 p-2 rounded-xl">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                {(member.profile?.full_name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{member.profile?.full_name || 'Unknown'}{member.user_id === userId ? ' (You)' : ''}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {member.role === 'admin' ? 'Admin' : 'Member'}
              </span>
              {isAdmin && member.user_id !== userId && (
                <div className="flex gap-1">
                  <button
                    onClick={() => updateRole.mutate({ memberId: member.id, role: member.role === 'admin' ? 'member' : 'admin' })}
                    className="text-xs text-primary px-1"
                  >
                    {member.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="text-xs text-destructive px-1">Remove</button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>Remove {member.profile?.full_name} from this tracker?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeMember.mutate(member.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="relative">
            <div className="flex gap-2 pt-2 border-t border-border">
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email address" className="h-10 flex-1" onKeyDown={e => e.key === 'Enter' && handleInvite()} />
              <Button size="sm" className="h-10" onClick={handleInvite} disabled={inviteMember.isPending || !inviteEmail.trim()}>
                {inviteMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
            <NudgeInviteMember />
          </div>
        )}

        {members.length === 1 && (
          <div className="text-center py-4">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">You're the only member</p>
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Categories</h3>

        {/* Custom categories */}
        {customCategories.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Custom</p>
              <button
                onClick={handleBulkRegenerateIcons}
                disabled={bulkRegenerating}
                className="flex items-center gap-1 text-[11px] text-primary font-medium hover:underline disabled:opacity-50"
              >
                {bulkRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Auto-assign Icons
              </button>
            </div>
            {customCategories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 py-1.5">
                <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                  <CategoryIcon icon={cat.icon} color={cat.color} size={18} />
                </div>
                <span className="flex-1 text-sm truncate">{cat.name}</span>
                <button onClick={() => openEditSheet(cat)} className="p-1 text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => openDeleteCategoryFlow(cat)} className="p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* System categories — collapsible */}
        <div className="space-y-1">
          <button
            onClick={() => setShowSystemCats(!showSystemCats)}
            className="flex items-center gap-1.5 w-full group"
          >
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">System ({systemCategories.length})</p>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${showSystemCats ? 'rotate-180' : ''}`} />
          </button>
          {showSystemCats && systemCategories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 py-1.5">
              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                <CategoryIcon icon={cat.icon} color={cat.color} size={18} />
              </div>
              <span className="flex-1 text-sm truncate">{cat.name}</span>
              <button onClick={() => openEditSheet(cat)} className="p-1 text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={openCreateSheet} className="w-full h-10">Add Category</Button>
      </div>

      {/* Danger Zone */}
      {isAdmin ? (
        <div className="rounded-2xl border-2 border-destructive/20 p-4 space-y-3">
          <h3 className="font-semibold text-sm text-destructive">Danger Zone</h3>
          <AlertDialog onOpenChange={(open) => { if (open) setDeleteCountdown(3); }}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full h-11 border-destructive text-destructive hover:bg-destructive/10">Delete Tracker</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{tracker.name}"?</AlertDialogTitle>
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
        <div className="rounded-2xl border border-border p-4">
          <Button variant="outline" className="w-full h-11 border-destructive text-destructive hover:bg-destructive/10" onClick={handleLeave}>
            Leave Tracker
          </Button>
        </div>
      )}

      {/* ─── Delete Category Flow ─── */}
      <Sheet open={!!deletingCategory} onOpenChange={(open) => { if (!open) setDeletingCategory(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80dvh]">
          <SheetHeader>
            <SheetTitle>Delete "{deletingCategory?.name}"</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {deleteCatTxnCount === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">No transactions use this category. It can be safely deleted.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeletingCategory(null)}>Cancel</Button>
                  <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteCategoryNoTxns} disabled={deleteCategory.isPending}>
                    {deleteCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Category'}
                  </Button>
                </div>
              </>
            ) : deleteCatStep === 'choose' ? (
              <>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-sm text-amber-800 font-medium">{deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''} use this category</p>
                  <p className="text-xs text-amber-700 mt-1">Choose what to do with these transactions before deleting the category.</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-12 justify-start gap-3"
                  onClick={() => setDeleteCatStep('pick-category')}
                >
                  <Tag className="h-4 w-4 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Keep transactions</p>
                    <p className="text-xs text-muted-foreground">Move them to another category</p>
                  </div>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-12 justify-start gap-3 border-destructive/30 text-destructive hover:bg-destructive/5"
                    >
                      <Trash2 className="h-4 w-4" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Delete transactions too</p>
                        <p className="text-xs opacity-70">Permanently delete all {deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''}</p>
                      </div>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {deleteCatTxnCount} transactions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the "{deletingCategory?.name}" category and all {deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''} using it. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteCategoryWithTransactions} className="bg-destructive text-destructive-foreground">
                        {deleteCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete All'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" className="w-full" onClick={() => setDeletingCategory(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Move {deleteCatTxnCount} transaction{deleteCatTxnCount > 1 ? 's' : ''} to:
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={reassignSearch}
                    onChange={e => setReassignSearch(e.target.value)}
                    placeholder="Search categories..."
                    className="pl-9 h-10"
                  />
                </div>
                <div className="max-h-[40vh] overflow-y-auto space-y-1">
                  {reassignableCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setReassignCategoryId(cat.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-sm transition-colors ${
                        reassignCategoryId === cat.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted'
                      }`}
                    >
                      <span className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                        <CategoryIcon icon={cat.icon} color={cat.color} size={15} />
                      </span>
                      <span className="flex-1 text-left truncate">{cat.name}</span>
                      {!cat.is_system && <span className="text-[10px] text-muted-foreground">Custom</span>}
                      {reassignCategoryId === cat.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteCatStep('choose')}>Back</Button>
                  <Button
                    className="flex-1"
                    disabled={!reassignCategoryId || deleteCategory.isPending}
                    onClick={handleDeleteCategoryReassign}
                  >
                    {deleteCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Move & Delete'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Currency Change Dialog ─── */}
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
              onClick={async () => {
                setShowConvertDialog(false);
                await convertCurrency.mutateAsync({ trackerId, newCurrency: pendingCurrency, convertExisting: true });
              }}
              disabled={convertCurrency.isPending}
              className="w-full"
            >
              {convertCurrency.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, convert amounts
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                setShowConvertDialog(false);
                await convertCurrency.mutateAsync({ trackerId, newCurrency: pendingCurrency, convertExisting: false });
              }}
              disabled={convertCurrency.isPending}
              className="w-full"
            >
              No, just change the label
            </Button>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Add / Edit Category Sheet ─── */}
      <Sheet open={showCategorySheet} onOpenChange={setShowCategorySheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh]">
          <SheetHeader>
            <SheetTitle>
              {editingCategory ? (editingCategory.is_system ? 'Customise System Category' : 'Edit Category') : 'Add Category'}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {/* Info banner for system categories */}
            {editingCategory?.is_system && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                Editing a system category creates a custom version for this tracker. The original system category stays unchanged.
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={catName}
                onChange={e => handleCatNameChange(e.target.value)}
                placeholder="Category name"
                className="h-11"
                autoFocus
              />
            </div>

            {/* AI Icon Suggestions */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Suggested Icons
                {aiLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </Label>
              {aiIcons.length > 0 ? (
                <div className="flex gap-2">
                  {aiIcons.map((iconName) => (
                    <button
                      key={iconName}
                      onClick={() => setCatIcon(iconName)}
                      className={`h-14 w-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                        catIcon === iconName
                          ? 'bg-primary/10 ring-2 ring-primary scale-105'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      <CategoryIcon icon={iconName} color={catColor} size={24} />
                      <span className="text-[9px] text-muted-foreground leading-none truncate w-full text-center px-0.5">{iconName}</span>
                    </button>
                  ))}
                </div>
              ) : catName.trim().length >= 2 ? (
                <p className="text-xs text-muted-foreground py-2">Generating suggestions...</p>
              ) : (
                <p className="text-xs text-muted-foreground py-2">Type a name to get icon suggestions</p>
              )}
            </div>

            {/* Browse all icons (collapsible, searchable) */}
            <div className="space-y-1.5">
              <button
                onClick={() => setShowIconGrid(!showIconGrid)}
                className="text-xs text-primary font-medium flex items-center gap-1"
              >
                {showIconGrid ? 'Hide' : 'Browse'} all icons
                <span className="text-[10px]">{showIconGrid ? '▲' : '▼'}</span>
              </button>
              {showIconGrid && (
                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={iconSearch}
                      onChange={e => setIconSearch(e.target.value)}
                      placeholder="Search icons..."
                      className="pl-8 h-9 text-sm"
                    />
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
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.label}</p>
                        <div className="grid grid-cols-6 gap-1.5">
                          {group.icons.map(iconName => (
                            <button
                              key={iconName}
                              onClick={() => setCatIcon(iconName)}
                              title={iconName}
                              className={`h-10 w-full rounded-lg flex items-center justify-center transition-all ${
                                catIcon === iconName ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted hover:bg-muted/80'
                              }`}
                            >
                              <CategoryIcon icon={iconName} color={catIcon === iconName ? catColor : '#94a3b8'} size={20} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Selected icon preview */}
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: catColor + '20' }}>
                <CategoryIcon icon={catIcon} color={catColor} size={22} />
              </div>
              <div>
                <p className="text-sm font-medium">{catName || 'Category Name'}</p>
                <p className="text-xs text-muted-foreground">Preview</p>
              </div>
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setCatColor(c)} className={`h-8 w-8 rounded-full ${catColor === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            {/* Save button */}
            <Button onClick={handleSaveCategory} className="w-full h-11" disabled={!catName.trim() || isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingCategory ? (
                editingCategory.is_system ? 'Create Custom Version' : 'Save Changes'
              ) : (
                'Add Category'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
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
    <AlertDialogAction
      onClick={onDelete}
      disabled={count > 0}
      className="bg-destructive text-destructive-foreground"
    >
      {count > 0 ? `Delete Forever (${count})` : 'Delete Forever'}
    </AlertDialogAction>
  );
}
