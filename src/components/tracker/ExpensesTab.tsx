import { Expense, Category } from '@/types';
import { useSearchParams } from 'react-router-dom';
import { format, isToday, isYesterday, parse } from 'date-fns';
import { Receipt, Download, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight, Pencil, Trash2, X, Search, Loader2, Tag, SlidersHorizontal, Check, ArrowUpDown, MoveRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDeleteExpense, useBulkUpdateCategory, useBulkDeleteExpenses, useBulkMoveExpenses, useExpenseMonths } from '@/hooks/useExpenses';
import { useTrackers, useCategories } from '@/hooks/useTrackers';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import TransactionTypeFilter from './TransactionTypeFilter';
import NetBalanceBanner from './NetBalanceBanner';
import Nudge from '@/components/Nudge';
import { useNudge } from '@/hooks/useNudge';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { getCurrency, formatAmountShort } from '@/lib/currencies';

const CREDIT_CATEGORY_NAMES = ['Salary / Income', 'Refund', 'Reimbursement', 'Cashback / Reward', 'Interest Earned', 'Other Income'];

type SortOption = 'date-desc' | 'date-asc' | 'category-asc' | 'category-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Date (Newest first)' },
  { value: 'date-asc', label: 'Date (Oldest first)' },
  { value: 'category-asc', label: 'Category (A → Z)' },
  { value: 'category-desc', label: 'Category (Z → A)' },
];

const SORT_STORAGE_KEY = 'expensesync-sort-pref';

function readSortPref(trackerId: string): SortOption {
  try {
    const data = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || '{}');
    const val = data[trackerId];
    // Migrate old amount-* prefs to default
    if (val === 'amount-desc' || val === 'amount-asc') return 'date-desc';
    if (val === 'date-desc' || val === 'date-asc' || val === 'category-asc' || val === 'category-desc') return val;
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

// generateMonths removed — now using useExpenseMonths hook

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
  // Sort groups by date key; within each group, amount descending
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
  // Sort groups by category name; within each group, amount descending
  return Object.entries(groups)
    .sort(([a], [b]) => ascending ? a.localeCompare(b) : b.localeCompare(a))
    .map(([key, items]) => [key, [...items].sort((a, b) => b.amount - a.amount)] as [string, Expense[]]);
}

function NudgeFilterSort() {
  const { show, dismiss } = useNudge('expenses-filter-sort');
  return <Nudge show={show} onDismiss={dismiss} message="Sort by date or category, and filter by user or category to find transactions quickly." position="bottom" />;
}

function NudgeLongPress() {
  const { show, dismiss } = useNudge('expenses-long-press', 3000);
  return (
    <div className="relative w-fit mx-auto">
      <Nudge show={show} onDismiss={dismiss} message="Long-press any transaction to select multiple — then bulk edit category, move, or delete." position="bottom" />
    </div>
  );
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
}

export default function ExpensesTab({ trackerId, trackerCurrency, expenses, categories, isLoading, month, onMonthChange, onAddExpense, onEditExpense, isAdmin, userId, typeFilter, onTypeFilterChange }: Props) {
  const { data: months = [{ value: 'all', label: 'All Months' }] } = useExpenseMonths(trackerId);
  const deleteExpense = useDeleteExpense();
  const bulkUpdateCategory = useBulkUpdateCategory();
  const bulkDeleteExpenses = useBulkDeleteExpenses();
  const bulkMoveExpenses = useBulkMoveExpenses();
  const { data: allTrackers } = useTrackers();
  const [showExport, setShowExport] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Bulk category change
  const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false);
  const [bulkCategorySearch, setBulkCategorySearch] = useState('');

  // Bulk delete confirmation
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Bulk move to another tracker
  const [showMoveTrackerPicker, setShowMoveTrackerPicker] = useState(false);

  // Sort state — persists in localStorage
  const [sortBy, setSortBy] = useState<SortOption>(() => readSortPref(trackerId));
  const [sortOpen, setSortOpen] = useState(false);

  const handleSortChange = (value: SortOption) => {
    setSortBy(value);
    writeSortPref(trackerId, value);
    setSortOpen(false);
  };

  // Filter state — persists across month changes, resets on page exit (component unmount)
  const [filterUsers, setFilterUsers] = useState<Set<string>>(new Set());
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Auto-apply filters from URL params (e.g. from dashboard category click)
  const filterAppliedRef = useRef(false);
  useEffect(() => {
    if (filterAppliedRef.current) return;
    const urlFilterCat = searchParams.get('filterCategory');
    const urlFilterType = searchParams.get('type');
    if (urlFilterCat) {
      setFilterCategories(new Set([urlFilterCat]));
      // Clean up the URL param after applying
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        params.delete('filterCategory');
        return params;
      }, { replace: true });
      filterAppliedRef.current = true;
    }
  }, [searchParams, setSearchParams]);

  const monthLabel = months.find(m => m.value === month)?.label || month;

  // Extract unique users from current expenses
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>(); // id -> name
    expenses.forEach(e => {
      if (e.created_by_id && e.created_by_profile?.full_name) {
        map.set(e.created_by_id, e.created_by_profile.full_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [expenses]);

  // Extract categories used in current expenses
  const usedCategories = useMemo(() => {
    const ids = new Set(expenses.map(e => e.category_id));
    return categories.filter(c => ids.has(c.id));
  }, [expenses, categories]);

  const activeFilterCount = filterUsers.size + filterCategories.size;

  // Clear selection when month or type filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  }, [month, typeFilter]);

  // Apply all filters: type + user + category
  const filteredExpenses = useMemo(() => {
    let result = expenses;

    // Type filter
    if (typeFilter === 'debit') result = result.filter(e => e.is_debit);
    else if (typeFilter === 'credit') result = result.filter(e => !e.is_debit);

    // User filter
    if (filterUsers.size > 0) {
      result = result.filter(e => filterUsers.has(e.created_by_id));
    }

    // Category filter
    if (filterCategories.size > 0) {
      result = result.filter(e => filterCategories.has(e.category_id));
    }

    return result;
  }, [expenses, typeFilter, filterUsers, filterCategories]);

  const isCategorySort = sortBy === 'category-asc' || sortBy === 'category-desc';
  const isAscending = sortBy === 'date-asc' || sortBy === 'category-asc';

  const groups = useMemo(() => {
    if (isCategorySort) {
      return groupByCategory(filteredExpenses, categories, isAscending);
    }
    return groupByDate(filteredExpenses, isAscending);
  }, [filteredExpenses, sortBy, categories, isCategorySort, isAscending]);

  // Toggle helpers for filter multi-select
  const toggleFilterUser = (uid: string) => {
    setFilterUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleFilterCategory = (catId: string) => {
    setFilterCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const clearAllFilters = () => {
    setFilterUsers(new Set());
    setFilterCategories(new Set());
  };

  // Long press handlers
  const handlePointerDown = useCallback((expenseId: string) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsSelecting(true);
      setSelectedIds(new Set([expenseId]));
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const toggleSelect = useCallback((expenseId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
        if (next.size === 0) {
          setIsSelecting(false);
        }
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

  const handleCardClick = useCallback((expense: Expense) => {
    if (longPressTriggeredRef.current) {
      return;
    }
    if (isSelecting) {
      toggleSelect(expense.id);
    }
  }, [isSelecting, toggleSelect]);

  // Bulk category change
  const sortedBulkCategories = (() => {
    const filtered = categories.filter(c =>
      c.name.toLowerCase().includes(bulkCategorySearch.toLowerCase())
    );
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

    // Fetch target tracker's categories
    const { data: targetCats } = await (await import('@/integrations/supabase/client')).supabase
      .from('categories')
      .select('*')
      .or(`is_system.eq.true,tracker_id.eq.${targetTrackerId}`);

    await bulkMoveExpenses.mutateAsync({
      ids,
      targetTrackerId,
      expenses,
      sourceCategories: categories,
      targetCategories: (targetCats || []) as Category[],
    });
    clearSelection();
  };

  const otherTrackers = (allTrackers || []).filter(t => t.id !== trackerId);

  const handleExport = () => {
    const rows = expenses.map(e => ({
      Date: e.date,
      Type: e.is_debit ? 'Debit' : 'Credit',
      Description: e.description,
      Merchant: e.merchant_name || '',
      Category: e.category?.name || '',
      [`Amount (${getCurrency(trackerCurrency).symbol})`]: e.amount,
      'Payment Method': e.payment_method || '',
      Notes: e.notes || '',
      Tags: e.tags?.join(', ') || '',
      'Added By': e.created_by_profile?.full_name || 'Unknown',
      'Reference No.': e.reference_number || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 12 },
      { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    const safeName = trackerId.slice(0, 8);
    XLSX.writeFile(wb, `ExpenseSync_${safeName}_${month}.xlsx`);
    setShowExport(false);
  };

  const isBulkPending = bulkUpdateCategory.isPending || bulkDeleteExpenses.isPending || bulkMoveExpenses.isPending;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Selection header bar */}
      {isSelecting && (
        <div className="flex items-center justify-between bg-primary/10 rounded-xl px-3 py-2 -mx-1">
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="p-1 rounded-full hover:bg-primary/20 transition-colors">
              <X className="h-5 w-5 text-primary" />
            </button>
            <span className="text-sm font-semibold text-primary">{selectedIds.size} selected</span>
          </div>
          <button
            onClick={() => {
              const allIds = new Set(filteredExpenses.map(e => e.id));
              setSelectedIds(allIds);
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Select All
          </button>
        </div>
      )}

      {/* Month selector */}
      {!isSelecting && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (month === 'all') return;
              const idx = months.findIndex(m => m.value === month);
              if (idx >= 0 && idx < months.length - 1) onMonthChange(months[idx + 1].value);
            }}
            disabled={month === 'all' || month === months[months.length - 1]?.value}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Select value={month} onValueChange={onMonthChange}>
            <SelectTrigger className="flex-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => {
              if (month === 'all') return;
              const idx = months.findIndex(m => m.value === month);
              // idx 0 is 'all', idx 1 is current month — go to previous index (more recent)
              if (idx > 1) onMonthChange(months[idx - 1].value);
            }}
            disabled={month === 'all' || month === months[1]?.value}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button onClick={() => setShowExport(true)} className="p-2 text-muted-foreground hover:text-foreground">
            <Download className="h-5 w-5" />
          </button>
          {/* Sort button */}
          <Popover open={sortOpen} onOpenChange={setSortOpen}>
            <PopoverTrigger asChild>
              <button className={`relative p-2 transition-colors ${sortBy !== 'date-desc' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                <ArrowUpDown className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1" sideOffset={8}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    sortBy === opt.value ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <span className="flex-1 text-left">{opt.label}</span>
                  {sortBy === opt.value && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          {/* Filter button */}
          <div className="relative">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
                <SlidersHorizontal className="h-5 w-5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
              <div className="p-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold">Filters</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs text-primary font-medium hover:underline">
                    Clear all
                  </button>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {/* Users section */}
                {uniqueUsers.length > 1 && (
                  <div className="p-3 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">By User</p>
                    <div className="space-y-0.5">
                      {uniqueUsers.map(u => {
                        const isActive = filterUsers.has(u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() => toggleFilterUser(u.id)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                              isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'
                            }`}
                          >
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                              isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}>
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="flex-1 text-left truncate">{u.name}</span>
                            {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Categories section */}
                <div className="p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Category</p>
                  <div className="space-y-0.5">
                    {usedCategories.map(cat => {
                      const isActive = filterCategories.has(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleFilterCategory(cat.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                            isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          <span
                            className="h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0"
                            style={{ backgroundColor: cat.color + '20' }}
                          >
                            {cat.icon}
                          </span>
                          <span className="flex-1 text-left truncate">{cat.name}</span>
                          {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                    {usedCategories.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No categories in this month</p>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <NudgeFilterSort />
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {!isSelecting && activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(filterUsers).map(uid => {
            const user = uniqueUsers.find(u => u.id === uid);
            return user ? (
              <span key={uid} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                {user.name.split(' ')[0]}
                <button onClick={() => toggleFilterUser(uid)} className="hover:text-primary/70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null;
          })}
          {Array.from(filterCategories).map(catId => {
            const cat = categories.find(c => c.id === catId);
            return cat ? (
              <span key={catId} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                {cat.icon} {cat.name}
                <button onClick={() => toggleFilterCategory(catId)} className="hover:text-primary/70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null;
          })}
          <button onClick={clearAllFilters} className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
            Clear all
          </button>
        </div>
      )}

      {/* Type filter */}
      {!isSelecting && <TransactionTypeFilter value={typeFilter} onChange={onTypeFilterChange} />}

      {/* Net Balance Banner — uses filtered expenses */}
      {!isSelecting && <NetBalanceBanner expenses={filteredExpenses} monthLabel={monthLabel} activeFilter={typeFilter} currencyCode={trackerCurrency} />}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-2xl bg-card border border-border p-3 animate-pulse">
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

      {/* Empty states */}
      {!isLoading && filteredExpenses.length === 0 && (
        <div className="text-center py-16">
          {activeFilterCount > 0 ? (
            <>
              <SlidersHorizontal className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="font-semibold text-lg">No matching transactions</p>
              <p className="text-sm text-muted-foreground mb-4">Try adjusting your filters</p>
              <Button variant="outline" onClick={clearAllFilters} className="h-11">Clear Filters</Button>
            </>
          ) : typeFilter === 'debit' ? (
            <>
              <ArrowUpRight className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="font-semibold text-lg">No debit transactions in {monthLabel}</p>
              <p className="text-sm text-muted-foreground mb-4">All your transactions this month are credits</p>
            </>
          ) : typeFilter === 'credit' ? (
            <>
              <ArrowDownLeft className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="font-semibold text-lg">No credit transactions in {monthLabel}</p>
              <p className="text-sm text-muted-foreground mb-4">Switch to Debit or All to see your transactions</p>
            </>
          ) : (
            <>
              <Receipt className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="font-semibold text-lg">No transactions in {monthLabel}</p>
              <p className="text-sm text-muted-foreground mb-4">Add your first transaction</p>
              <Button onClick={onAddExpense} className="h-11">Add Transaction</Button>
            </>
          )}
        </div>
      )}

      {/* Long-press nudge — show once above the list */}
      {!isLoading && groups.length > 0 && !isSelecting && <NudgeLongPress />}

      {/* Transaction groups */}
      {!isLoading && groups.map(([groupKey, items]) => {
        const groupDebits = items.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0);
        const groupCredits = items.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0);

        // For category sort, find the category to show icon+color in header
        const groupCategory = isCategorySort ? categories.find(c => c.name === groupKey) : null;

        return (
          <div key={groupKey}>
            <div className="sticky top-[105px] bg-background py-1 z-[5]">
              {isCategorySort ? (
                <div className="flex items-center gap-2">
                  {groupCategory && (
                    <span
                      className="h-5 w-5 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: (groupCategory.color || '#ccc') + '20' }}
                    >
                      {groupCategory.icon}
                    </span>
                  )}
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {groupKey}
                  </p>
                </div>
              ) : (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {formatDateHeader(groupKey)}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                <span className="text-red-500">↑ {formatAmountShort(groupDebits, trackerCurrency)}</span>
                {' '}
                <span className="text-emerald-500">↓ {formatAmountShort(groupCredits, trackerCurrency)}</span>
                {' · '}
                <span>{items.length} txn{items.length !== 1 ? 's' : ''}</span>
              </p>
            </div>
            <div className="space-y-2">
              {items.map(expense => {
                const canModify = expense.created_by_id === userId || isAdmin;
                const isSelected = selectedIds.has(expense.id);
                return (
                  <div
                    key={expense.id}
                    className={`rounded-2xl bg-card border p-3 shadow-sm transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onPointerDown={() => handlePointerDown(expense.id)}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerLeave}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <button
                      onClick={() => handleCardClick(expense)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox in selection mode */}
                        {isSelecting && (
                          <div
                            className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground/40 bg-card'
                            }`}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(expense.id); }}
                          >
                            {isSelected && (
                              <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: expense.category?.color + '20' }}
                        >
                          {expense.category?.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{expense.category?.name}{expense.payment_method ? ` · ${expense.payment_method}` : ''}</p>
                          <p className="text-[11px] text-muted-foreground">by {expense.created_by_profile?.full_name?.split(' ')[0] || 'Unknown'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1">
                            {!expense.is_debit && <ArrowDownLeft className="h-3 w-3 text-emerald-500" />}
                            <p className={`font-mono font-semibold text-sm ${expense.is_debit ? 'text-foreground' : 'text-emerald-600'}`}>
                              {expense.is_debit ? '' : '+'}{formatAmountShort(expense.amount, trackerCurrency)}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(expense.date + 'T00:00:00'), 'd MMM')}</p>
                        </div>
                      </div>
                      {!isSelecting && (
                        <div className="mt-2 pl-[52px] flex items-start gap-2">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-sm text-foreground text-left">{expense.description}</p>
                            {expense.conversion_note && (
                              <p className="text-[11px] text-muted-foreground text-left italic">{expense.conversion_note}</p>
                            )}
                            {expense.notes && (
                              <p className="text-xs text-muted-foreground text-left line-clamp-2">{expense.notes}</p>
                            )}
                          </div>
                          {canModify && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); onEditExpense(expense.id); }}
                                className="p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently delete &quot;{expense.description}&quot;.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteExpense.mutate(expense.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Sticky bottom action bar for multi-select */}
      {isSelecting && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pb-2">
          <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-lg p-3 flex items-center gap-2">
            <div className="flex-1 text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              onClick={() => { setBulkCategorySearch(''); setShowBulkCategoryPicker(true); }}
              disabled={isBulkPending}
            >
              <Tag className="h-4 w-4" />
              Category
            </Button>
            {otherTrackers.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => setShowMoveTrackerPicker(true)}
                disabled={isBulkPending}
              >
                {bulkMoveExpenses.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveRight className="h-4 w-4" />}
                Move
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={isBulkPending}
            >
              {bulkDeleteExpenses.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Category Picker Sheet */}
      <Sheet open={showBulkCategoryPicker} onOpenChange={setShowBulkCategoryPicker}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[70vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Change Category ({selectedIds.size} transactions)</SheetTitle>
          </SheetHeader>
          <div className="py-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm" style={{ backgroundColor: cat.color + '20' }}>
                    {cat.icon}
                  </span>
                  <span className="font-medium text-sm">{cat.name}</span>
                  {!cat.is_system && <span className="text-xs text-muted-foreground ml-auto">Custom</span>}
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bulk Delete Confirmation */}
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
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to Tracker Sheet */}
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
                <div className="w-1 h-8 rounded-full bg-primary shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.member_count} member{t.member_count !== 1 ? 's' : ''}</p>
                </div>
                <MoveRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            {otherTrackers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No other trackers available</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Export Sheet */}
      <Sheet open={showExport} onOpenChange={setShowExport}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Export Transactions</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">Period: {monthLabel}</p>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked readOnly className="rounded" /> Include all columns</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked readOnly className="rounded" /> Include member names</label>
            </div>
            <Button onClick={handleExport} className="w-full h-11">Download Excel File</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
