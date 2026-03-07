import { Expense, Category } from '@/types';
import { format, isToday, isYesterday, subMonths, parse } from 'date-fns';
import { Receipt, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeleteExpense } from '@/hooks/useExpenses';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState } from 'react';
import * as XLSX from 'xlsx';

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
}

export default function ExpensesTab({ trackerId, expenses, categories, isLoading, month, onMonthChange, onAddExpense, onEditExpense, isAdmin, userId }: Props) {
  const months = generateMonths();
  const deleteExpense = useDeleteExpense();
  const [showExport, setShowExport] = useState(false);

  const totalSpent = expenses.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0);
  const groups = groupByDate(expenses);
  const monthLabel = months.find(m => m.value === month)?.label || month;

  const handleExport = () => {
    const rows = expenses.map(e => ({
      Date: e.date,
      Description: e.description,
      Merchant: e.merchant_name || '',
      Category: e.category?.name || '',
      'Amount (₹)': e.amount,
      Type: e.is_debit ? 'Debit' : 'Credit',
      'Payment Method': e.payment_method || '',
      Notes: e.notes || '',
      Tags: e.tags?.join(', ') || '',
      'Added By': e.created_by_name,
      'Reference No.': e.reference_number || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 12 },
      { wch: 8 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    const safeName = trackerId.slice(0, 8);
    XLSX.writeFile(wb, `ExpenseSync_${safeName}_${month}.xlsx`);
    setShowExport(false);
  };

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Month selector */}
      <div className="flex items-center gap-2">
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
        <button onClick={() => setShowExport(true)} className="p-2 text-muted-foreground hover:text-foreground">
          <Download className="h-5 w-5" />
        </button>
        <Button size="sm" className="h-10 w-10 p-0" onClick={onAddExpense}>
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Summary */}
      <div className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-4">
        <p className="text-sm opacity-80">Total Spent</p>
        <p className="font-mono text-2xl font-bold">₹{totalSpent.toLocaleString('en-IN')}</p>
        <p className="text-xs opacity-70">{expenses.length} transaction{expenses.length !== 1 ? 's' : ''} in {monthLabel}</p>
      </div>

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

      {/* Empty */}
      {!isLoading && expenses.length === 0 && (
        <div className="text-center py-16">
          <Receipt className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-lg">No expenses in {monthLabel}</p>
          <p className="text-sm text-muted-foreground mb-4">Add your first expense</p>
          <Button onClick={onAddExpense} className="h-11">Add Expense</Button>
        </div>
      )}

      {/* Expense groups */}
      {!isLoading && groups.map(([date, items]) => (
        <div key={date}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 sticky top-[105px] bg-background py-1 z-[5]">
            {formatDateHeader(date)}
          </p>
          <div className="space-y-2">
            {items.map(expense => {
              const canModify = expense.created_by_id === userId || isAdmin;
              return (
                <div
                  key={expense.id}
                  className="rounded-2xl bg-card border border-border p-3 shadow-sm"
                >
                  <button
                    onClick={() => canModify && onEditExpense(expense.id)}
                    className="w-full text-left flex items-center gap-3"
                  >
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: expense.category?.color + '20' }}
                    >
                      {expense.category?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{expense.description}</p>
                      {expense.merchant_name && <p className="text-xs text-muted-foreground truncate">{expense.merchant_name}</p>}
                      <p className="text-xs text-muted-foreground">{expense.category?.name}{expense.payment_method ? ` · ${expense.payment_method}` : ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-mono font-semibold text-sm ${expense.is_debit ? 'text-foreground' : 'text-accent'}`}>
                        {expense.is_debit ? '' : '+'} ₹{expense.amount.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </button>
                  {canModify && (
                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-border">
                      <button onClick={() => onEditExpense(expense.id)} className="text-xs text-primary font-medium px-2 py-1">Edit</button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="text-xs text-destructive font-medium px-2 py-1">Delete</button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete "{expense.description}".</AlertDialogDescription>
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
              );
            })}
          </div>
        </div>
      ))}

      {/* Export Sheet */}
      <Sheet open={showExport} onOpenChange={setShowExport}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Export Expenses</SheetTitle>
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
