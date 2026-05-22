import { Expense, Category } from '@/types';
import { useSearchParams } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { Receipt, X, MagnifyingGlass, Tag, ArrowsLeftRight, Trash, ArrowsClockwise } from '@phosphor-icons/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDeleteExpense, useBulkUpdateCategory, useBulkDeleteExpenses, useBulkMoveExpenses, useExpenseMonths } from '@/hooks/useExpenses';
import { useTrackers } from '@/hooks/useTrackers';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import CategoryDot from '@/components/CategoryDot';
import FloatingAdd from '@/components/FloatingAdd';
import HeroSummary from './HeroSummary';
import TypeSegment from './TypeSegment';
import TrackerToolBar, { SortOption } from './TrackerToolBar';
import DayHeader from './DayHeader';
import TxnRow from './TxnRow';
import FilterSheet from './FilterSheet';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { formatAmountShort, getCurrency } from '@/lib/currencies';

const CREDIT_CATEGORY_NAMES = ['Salary / Income', 'Refund', 'Reimbursement', 'Cashback / Reward', 'Interest Earned', 'Other Income'];

const SORT_STORAGE_KEY = 'expensesync-sort-pref';

const VALID_SORTS: ReadonlySet<SortOption> = new Set<SortOption>([
  'date-desc', 'date-asc',
  'category-asc', 'category-desc',
  'amount-desc', 'amount-asc',
]);

function readSortPref(trackerId: string): SortOption {
  try {
    const data = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || '{}');
    const val = data[trackerId];
    if (VALID_SORTS.has(val)) return val as SortOption;
    return 'date-desc';
  } catch { return 'date-desc'; }
}

function writeSortPref(trackerId: string, value: SortOption) {
  try {
    const data = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || '{}');
    data[trackerId] = value;
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, d MMM');
}

function groupByDate(expenses: Expense[], ascending: boolean) {
  const groups: Record<string, Expense[]> = {};
  expenses.forEach(e => {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => ascending ? a.localeCompare(b) : b.localeCompare(a))
    .map(([key, items]) => [key, [...items].sort((a, b) => b.amount - a.amount)] as [string, Expense[]]);
}

function groupByCategory(expenses: Expense[], categories: Category[], ascending: boolean) {
  const groups: Record<string, Expense[]> = {};
  expenses.forEach(e => {
    const catName = categories.find(c => c.id === e.category_id)?.name || 'Unknown';
    if (!groups[catName]) groups[catName] = [];
    groups[catName].push(e);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => ascending ? a.localeCompare(b) : b.localeCompare(a))
    .map(([key, items]) => [key, [...items].sort((a, b) => b.amount - a.amount)] as [string, Expense[]]);
}

// Amount sort renders as a single flat group — no per-day headers, but each row
// surfaces its own date stamp via `showDate` on TxnRow.
function sortByAmount(expenses: Expense[], ascending: boolean): [string, Expense[]][] {
  const sorted = [...expenses].sort((a, b) => ascending ? a.amount - b.amount : b.amount - a.amount);
  return [['__amount__', sorted]];
}

interface Props {
  trackerId: string;
  trackerCurrency: string;
  expenses: Expense[];
  categories: Category[];
  isLoading: boolean;
  month: string;
  onMonthChange: (m: string) => void;
  onAddExpense: () => void;
  onEditExpense: (id: string) => void;
  isAdmin: boolean;
  userId: string;
  typeFilter: TransactionFilter;
  onTypeFilterChange: (v: TransactionFilter) => void;
  suspectedTransferCount: number;
  onOpenTransferReview: () => void;
}

export default function ExpensesTab({
  trackerId, trackerCurrency, expenses, categories, isLoading,
  month, onMonthChange, onAddExpense, onEditExpense, isAdmin, userId,
  typeFilter, onTypeFilterChange, suspectedTransferCount, onOpenTransferReview,
}: Props) {
  const { data: months = [{ value: 'all', label: 'All Months' }] } = useExpenseMonths(trackerId);
  const deleteExpense = useDeleteExpense();
  const bulkUpdateCategory = useBulkUpdateCategory();
  const bulkDeleteExpenses = useBulkDeleteExpenses();
  const bulkMoveExpenses = useBulkMoveExpenses();
  const { data: allTrackers } = useTrackers();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

  const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false);
  const [bulkCategorySearch, setBulkCategorySearch] = useState('');
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showMoveTrackerPicker, setShowMoveTrackerPicker] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>(() => readSortPref(trackerId));
  const handleSortChange = (value: SortOption) => {
    setSortBy(value);
    writeSortPref(trackerId, value);
  };

  const [filterUsers, setFilterUsers] = useState<Set<string>>(new Set());
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  const filterAppliedRef = useRef(false);
  useEffect(() => {
    if (filterAppliedRef.current) return;
    const urlFilterCat = searchParams.get('filterCategory');
    if (urlFilterCat) {
      setFilterCategories(new Set([urlFilterCat]));
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        params.delete('filterCategory');
        return params;
      }, { replace: true });
      filterAppliedRef.current = true;
    }
  }, [searchParams, setSearchParams]);

  const monthLabel = months.find(m => m.value === month)?.label || month;
  const activeFilterCount = filterUsers.size + filterCategories.size;

  useEffect(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  }, [month, typeFilter]);

  // Hero shows unfiltered (by user/cat) but type-filtered totals from the month
  // Hero totals are filter-aware: 'credit' filter zeroes spend, 'debit' filter zeroes earn.
  const monthSpend = useMemo(
    () => typeFilter === 'credit'
      ? 0
      : expenses.filter(e => e.is_debit && !e.is_transfer).reduce((s, e) => s + e.amount, 0),
    [expenses, typeFilter]
  );
  const monthEarn = useMemo(
    () => typeFilter === 'debit'
      ? 0
      : expenses.filter(e => !e.is_debit && !e.is_transfer).reduce((s, e) => s + e.amount, 0),
    [expenses, typeFilter]
  );

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (typeFilter === 'debit') result = result.filter(e => e.is_debit);
    else if (typeFilter === 'credit') result = result.filter(e => !e.is_debit);
    if (filterUsers.size > 0) {
      result = result.filter(e => {
        const key = e.created_by_id || `deleted-${e.created_by_name}`;
        return filterUsers.has(key);
      });
    }
    if (filterCategories.size > 0) {
      result = result.filter(e => filterCategories.has(e.category_id));
    }
    return result;
  }, [expenses, typeFilter, filterUsers, filterCategories]);

  const isCategorySort = sortBy === 'category-asc' || sortBy === 'category-desc';
  const isAmountSort = sortBy === 'amount-asc' || sortBy === 'amount-desc';
  const isAscending = sortBy === 'date-asc' || sortBy === 'category-asc' || sortBy === 'amount-asc';

  const groups = useMemo(() => {
    if (isAmountSort) return sortByAmount(filteredExpenses, isAscending);
    if (isCategorySort) return groupByCategory(filteredExpenses, categories, isAscending);
    return groupByDate(filteredExpenses, isAscending);
  }, [filteredExpenses, sortBy, categories, isCategorySort, isAmountSort, isAscending]);

  const toggleFilterUser = (uid: string) => {
    setFilterUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };
  const toggleFilterCategory = (catId: string) => {
    setFilterCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };
  const clearAllFilters = () => {
    setFilterUsers(new Set());
    setFilterCategories(new Set());
  };

  // TxnRow owns the long-press gesture timer internally; parent just reacts.
  const handleEnterSelectMode = useCallback((expenseId: string) => {
    setIsSelecting(true);
    setSelectedIds(new Set([expenseId]));
  }, []);

  const toggleSelect = useCallback((expenseId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
        if (next.size === 0) setIsSelecting(false);
      } else {
        next.add(expenseId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  }, []);

  const sortedBulkCategories = (() => {
    const filtered = categories.filter(c => c.name.toLowerCase().includes(bulkCategorySearch.toLowerCase()));
    const selectedExpenses = filteredExpenses.filter(e => selectedIds.has(e.id));
    const mostlyCredits = selectedExpenses.filter(e => !e.is_debit).length > selectedExpenses.length / 2;
    if (mostlyCredits) {
      const creditCats = filtered.filter(c => CREDIT_CATEGORY_NAMES.includes(c.name));
      const otherCats = filtered.filter(c => !CREDIT_CATEGORY_NAMES.includes(c.name));
      return [...creditCats, ...otherCats];
    }
    return filtered;
  })();

  const handleBulkCategoryChange = async (categoryId: string) => {
    const ids = Array.from(selectedIds);
    setShowBulkCategoryPicker(false);
    await bulkUpdateCategory.mutateAsync({ ids, categoryId });
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setShowBulkDeleteConfirm(false);
    await bulkDeleteExpenses.mutateAsync(ids);
    clearSelection();
  };

  const handleBulkMove = async (targetTrackerId: string) => {
    const ids = Array.from(selectedIds);
    setShowMoveTrackerPicker(false);
    const { data: targetCats } = await (await import('@/integrations/supabase/client')).supabase
      .from('categories')
      .select('*')
      .or(`is_system.eq.true,tracker_id.eq.${targetTrackerId}`);
    await bulkMoveExpenses.mutateAsync({
      ids, targetTrackerId, expenses,
      sourceCategories: categories,
      targetCategories: (targetCats || []) as Category[],
    });
    clearSelection();
  };

  const otherTrackers = (allTrackers || []).filter(t => t.id !== trackerId);
  const isBulkPending = bulkUpdateCategory.isPending || bulkDeleteExpenses.isPending || bulkMoveExpenses.isPending;
  const symbol = getCurrency(trackerCurrency).symbol;

  return (
    <div className="pb-4">
      {/* Selection header */}
      {isSelecting && (
        <div className="mx-4 mt-1 mb-3 px-3 py-2.5 rounded-2xl flex items-center gap-3" style={{ background: 'hsl(var(--ink))', color: 'hsl(var(--background))' }}>
          <button onClick={clearSelection} className="p-0">
            <X size={18} color="currentColor" />
          </button>
          <div className="flex-1 font-semibold text-[14px]">{selectedIds.size} selected</div>
          <button
            onClick={() => setSelectedIds(new Set(filteredExpenses.map(e => e.id)))}
            className="text-[12px] font-semibold opacity-90"
          >
            Select all
          </button>
        </div>
      )}

      {!isSelecting && (
        <>
          <HeroSummary
            monthLabel={monthLabel}
            spend={monthSpend}
            earn={monthEarn}
            currencyCode={trackerCurrency}
          />

          <TrackerToolBar
            monthLabel={monthLabel}
            months={months}
            currentMonth={month}
            onMonthChange={onMonthChange}
            sort={sortBy}
            onSortChange={handleSortChange}
            filterCount={activeFilterCount}
            onOpenFilter={() => setFilterOpen(true)}
            transferCount={suspectedTransferCount}
            onOpenTransferReview={onOpenTransferReview}
          />

          <TypeSegment value={typeFilter} onChange={onTypeFilterChange} />
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2 mx-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-2xl bg-card border border-line-soft p-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-32 mb-1" />
                  <div className="h-3 bg-muted rounded w-20" />
                </div>
                <div className="h-5 bg-muted rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filteredExpenses.length === 0 && (
        <div className="text-center py-16 px-4">
          <Receipt size={64} color="hsl(var(--ink-faint) / 0.45)" className="mx-auto mb-4" />
          {activeFilterCount > 0 ? (
            <>
              <p className="font-display font-semibold text-lg text-ink">No matching transactions</p>
              <p className="text-sm text-ink-soft mb-4">Try adjusting your filters</p>
              <Button variant="outline" onClick={clearAllFilters} className="h-11">Clear Filters</Button>
            </>
          ) : (
            <>
              <p className="font-display font-semibold text-lg text-ink">No transactions in {monthLabel}</p>
              <p className="text-sm text-ink-soft mb-4">Add your first transaction</p>
              <Button onClick={onAddExpense} className="h-11 bg-ember hover:bg-ember/90 text-white">Add Transaction</Button>
            </>
          )}
        </div>
      )}

      {/* Transaction groups */}
      {!isLoading && groups.map(([groupKey, items]) => {
        const groupDebits = items.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0);
        const groupCredits = items.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0);
        const net = groupCredits - groupDebits;
        const netClass: 'pos' | 'neg' | 'neutral' = net > 0 ? 'pos' : net < 0 ? 'neg' : 'neutral';
        const netLabel = net === 0
          ? '—'
          : (net > 0 ? `+${symbol}${Math.round(Math.abs(net)).toLocaleString('en-IN')}` : `−${symbol}${Math.round(Math.abs(net)).toLocaleString('en-IN')}`);
        const groupCategory = isCategorySort ? categories.find(c => c.name === groupKey) || null : null;
        const label = isAmountSort
          ? `${items.length} txn${items.length !== 1 ? 's' : ''} · ${isAscending ? 'Lowest first' : 'Highest first'}`
          : isCategorySort ? groupKey : formatDateHeader(groupKey);

        return (
          <div key={groupKey}>
            <DayHeader label={label} netLabel={netLabel} netClass={netClass} category={groupCategory} />
            {items.map(expense => {
              const canModify = expense.created_by_id === userId || isAdmin;
              return (
                <TxnRow
                  key={expense.id}
                  expense={expense}
                  trackerCurrency={trackerCurrency}
                  selectMode={isSelecting}
                  selected={selectedIds.has(expense.id)}
                  canModify={canModify}
                  showDate={isAmountSort}
                  onSelect={toggleSelect}
                  onEdit={onEditExpense}
                  onDelete={(id) => deleteExpense.mutate(id)}
                  onLongPressStart={handleEnterSelectMode}
                  onLongPressCancel={() => { /* TxnRow handles cancellation internally */ }}
                />
              );
            })}
          </div>
        );
      })}

      {/* Floating Add */}
      {!isSelecting && <FloatingAdd onClick={onAddExpense} label="Add transaction" />}

      {/* Multi-select action bar */}
      {isSelecting && selectedIds.size > 0 && (
        <div className="fixed left-0 right-0 z-50 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}>
          <div className="max-w-lg mx-auto bg-card border border-line rounded-2xl shadow-lg p-2.5 flex items-center gap-2">
            <div className="flex-1 text-[12.5px] font-semibold text-ink-soft pl-1">{selectedIds.size} selected</div>
            <button
              onClick={() => { setBulkCategorySearch(''); setShowBulkCategoryPicker(true); }}
              disabled={isBulkPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line text-[12px] font-semibold text-ink"
            >
              <Tag size={14} /> Category
            </button>
            {otherTrackers.length > 0 && (
              <button
                onClick={() => setShowMoveTrackerPicker(true)}
                disabled={isBulkPending}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line text-[12px] font-semibold text-ink"
              >
                {bulkMoveExpenses.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowsClockwise size={14} />}
                Move
              </button>
            )}
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={isBulkPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-spend text-[12px] font-semibold text-spend"
            >
              {bulkDeleteExpenses.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash size={14} />}
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Filter sheet */}
      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        expenses={expenses}
        matchingCount={filteredExpenses.length}
        categories={categories}
        selectedUsers={filterUsers}
        selectedCategories={filterCategories}
        onToggleUser={toggleFilterUser}
        onToggleCategory={toggleFilterCategory}
        onClearAll={clearAllFilters}
      />

      {/* Bulk Category Picker */}
      <Sheet open={showBulkCategoryPicker} onOpenChange={setShowBulkCategoryPicker}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[70dvh]">
          <SheetHeader>
            <SheetTitle>Change Category ({selectedIds.size} transactions)</SheetTitle>
          </SheetHeader>
          <div className="py-3 space-y-3">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2" size={16} color="hsl(var(--ink-faint))" />
              <Input
                value={bulkCategorySearch}
                onChange={e => setBulkCategorySearch(e.target.value)}
                placeholder="Search categories..."
                className="pl-9 h-11"
              />
            </div>
            <div className="space-y-1">
              {sortedBulkCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleBulkCategoryChange(cat.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-muted"
                  disabled={isBulkPending}
                >
                  <CategoryDot icon={cat.icon} color={cat.color} size={32} />
                  <span className="font-medium text-sm">{cat.name}</span>
                  {!cat.is_system && <span className="text-xs text-ink-faint ml-auto">Custom</span>}
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} selected transaction{selectedIds.size > 1 ? 's' : ''}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-spend text-white hover:bg-spend/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move sheet */}
      <Sheet open={showMoveTrackerPicker} onOpenChange={setShowMoveTrackerPicker}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Move {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''} to...</SheetTitle>
          </SheetHeader>
          <div className="py-3 space-y-1">
            {otherTrackers.map(t => (
              <button
                key={t.id}
                onClick={() => handleBulkMove(t.id)}
                disabled={isBulkPending}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-muted"
              >
                <div className="w-1 h-8 rounded-full bg-ember shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-ink-faint">{t.member_count} member{t.member_count !== 1 ? 's' : ''}</p>
                </div>
                <ArrowsLeftRight size={14} color="hsl(var(--ink-faint))" />
              </button>
            ))}
            {otherTrackers.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-4">No other trackers available</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
