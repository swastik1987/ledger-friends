import { Expense, Category } from '@/types';
import { format, isToday, isYesterday, subMonths, addMonths, parse } from 'date-fns';
import { Receipt, Plus, Download, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight, Pencil, Trash2, X, Search, Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeleteExpense, useBulkUpdateCategory, useBulkDeleteExpenses } from '@/hooks/useExpenses';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import TransactionTypeFilter from './TransactionTypeFilter';
import NetBalanceBanner from './NetBalanceBanner';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';

const CREDIT_CATEGORY_NAMES = ['Salary / Income', 'Refund', 'Reimbursement', 'Cashback / Reward', 'Interest Earned', 'Other Income'];

function generateMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
  }
  return months;
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, d MMM');
}

function groupByDate(expenses: Expense[]) {
  const groups: Record<string, Expense[]> = {};
  expenses.forEach(e => {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

interface Props {
  trackerId: string;
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

export default function ExpensesTab({ trackerId, expenses, categories, isLoading, month, onMonthChange, onAddExpense, onEditExpense, isAdmin, userId, typeFilter, onTypeFilterChange }: Props) {
  const months = generateMonths();
  const deleteExpense = useDeleteExpense();
  const bulkUpdateCategory = useBulkUpdateCategory();
  const bulkDeleteExpenses = useBulkDeleteExpenses();
  const [showExport, setShowExport] = useState(false);

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

  const monthLabel = months.find(m => m.value === month)?.label || month;

  // Clear selection when month or filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  }, [month, typeFilter]);

  // Filter expenses by type
  const filteredExpenses = typeFilter === 'all' ? expenses
    : typeFilter === 'debit' ? expenses.filter(e => e.is_debit)
    : expenses.filter(e => !e.is_debit);

  const groups = groupByDate(filteredExpenses);

  // Daily summaries use ALL expenses (not filtered)
  const dailySummary = (dateExpenses: Expense[]) => {
    const allForDate = expenses.filter(e => dateExpenses.length > 0 && e.date === dateExpenses[0].date);
    const dayDebits = allForDate.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0);
    const dayCredits = allForDate.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0);
    return { dayDebits, dayCredits };
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

  const handleCardClick = useCallback((expense: Expense, canModify: boolean) => {
    if (longPressTriggeredRef.current) {
      // Long press just happened, don't treat as click
      return;
    }
    if (isSelecting) {
      toggleSelect(expense.id);
    } else if (canModify) {
      onEditExpense(expense.id);
    }
  }, [isSelecting, toggleSelect, onEditExpense]);

  // Bulk category change
  const sortedBulkCategories = (() => {
    const filtered = categories.filter(c =>
      c.name.toLowerCase().includes(bulkCategorySearch.toLowerCase())
    );
    // Check if selected items are mostly credits
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

  const handleExport = () => {
    // Export always uses ALL expenses, not filtered
    const rows = expenses.map(e => ({
      Date: e.date,
      Type: e.is_debit ? 'Debit' : 'Credit',
      Description: e.description,
      Merchant: e.merchant_name || '',
      Category: e.category?.name || '',
      'Amount (₹)': e.amount,
      'Payment Method': e.payment_method || '',
      Notes: e.notes || '',
      Tags: e.tags?.join(', ') || '',
      'Added By': e.created_by_name,
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

  const isBulkPending = bulkUpdateCategory.isPending || bulkDeleteExpenses.isPending;

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
              // Select all visible
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
              const prev = format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
              if (months.some(m => m.value === prev)) onMonthChange(prev);
            }}
            disabled={month === months[months.length - 1]?.value}
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
              const next = format(addMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
              if (months.some(m => m.value === next)) onMonthChange(next);
            }}
            disabled={month === months[0]?.value}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button onClick={() => setShowExport(true)} className="p-2 text-muted-foreground hover:text-foreground">
            <Download className="h-5 w-5" />
          </button>
          <Button size="sm" className="h-10 w-10 p-0" onClick={onAddExpense}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Type filter */}
      {!isSelecting && <TransactionTypeFilter value={typeFilter} onChange={onTypeFilterChange} />}

      {/* Net Balance Banner */}
      {!isSelecting && <NetBalanceBanner expenses={expenses} monthLabel={monthLabel} activeFilter={typeFilter} />}

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
          {typeFilter === 'debit' ? (
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

      {/* Transaction groups */}
      {!isLoading && groups.map(([date, items]) => {
        const { dayDebits, dayCredits } = dailySummary(items);
        return (
          <div key={date}>
            <div className="sticky top-[105px] bg-background py-1 z-[5]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {formatDateHeader(date)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-red-500">↑ ₹{dayDebits.toLocaleString('en-IN')}</span>
                {' '}
                <span className="text-emerald-500">↓ ₹{dayCredits.toLocaleString('en-IN')}</span>
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
                      onClick={() => handleCardClick(expense, canModify)}
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
                          <p className="text-[11px] text-muted-foreground">by {expense.created_by_name?.split(' ')[0] || 'Unknown'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1">
                            {!expense.is_debit && <ArrowDownLeft className="h-3 w-3 text-emerald-500" />}
                            <p className={`font-mono font-semibold text-sm ${expense.is_debit ? 'text-foreground' : 'text-emerald-600'}`}>
                              {expense.is_debit ? '' : '+'} ₹{expense.amount.toLocaleString('en-IN')}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(expense.date + 'T00:00:00'), 'd MMM')}</p>
                        </div>
                      </div>
                      {!isSelecting && (
                        <div className="mt-2 pl-[52px] flex items-start gap-2">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-sm text-foreground text-left">{expense.description}</p>
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
