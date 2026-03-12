import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Expense, Category, PaymentMethod } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateExpense, useUpdateExpense, useDeleteExpense, useDuplicateCheck } from '@/hooks/useExpenses';
import { format } from 'date-fns';
import { Loader2, X, AlertTriangle, Search, ArrowUpRight, ArrowDownLeft, Upload, PenLine } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Other'];

const CREDIT_CATEGORY_NAMES = ['Salary / Income', 'Refund', 'Reimbursement', 'Cashback / Reward', 'Interest Earned', 'Other Income'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackerId: string;
  categories: Category[];
  editExpenseId: string | null;
  expenses: Expense[];
}

export default function AddExpenseSheet({ open, onOpenChange, trackerId, categories, editExpenseId, expenses }: Props) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const checkDuplicate = useDuplicateCheck(trackerId);

  const editExpense = editExpenseId ? expenses.find(e => e.id === editExpenseId) : null;
  const isEdit = !!editExpense;
  const [showManualForm, setShowManualForm] = useState(false);

  const [amount, setAmount] = useState('');
  const [isDebit, setIsDebit] = useState(true);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [duplicate, setDuplicate] = useState<Expense | null>(null);

  useEffect(() => {
    if (open && editExpense) {
      setAmount(String(editExpense.amount));
      setIsDebit(editExpense.is_debit);
      setDate(editExpense.date);
      setDescription(editExpense.description);
      setCategoryId(editExpense.category_id);
      setMerchantName(editExpense.merchant_name || '');
      setPaymentMethod((editExpense.payment_method as PaymentMethod) || '');
      setNotes(editExpense.notes || '');
      setTags(editExpense.tags || []);
      setReferenceNumber(editExpense.reference_number || '');
    } else if (open && !editExpense) {
      setAmount('');
      setIsDebit(true);
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setDescription('');
      setCategoryId('');
      setMerchantName('');
      setPaymentMethod('');
      setNotes('');
      setTags([]);
      setTagInput('');
      setReferenceNumber('');
      setDuplicate(null);
      setShowManualForm(false);
    }
    if (open && editExpense) {
      setShowManualForm(true);
    }
  }, [open, editExpense]);

  const handleDescriptionBlur = useCallback(async () => {
    if (!isEdit && date && amount && description) {
      const dup = await checkDuplicate(date, parseFloat(amount), description);
      setDuplicate(dup);
    }
  }, [date, amount, description, isEdit, checkDuplicate]);

  const selectedCategory = categories.find(c => c.id === categoryId);

  // Sort categories: credit-specific ones first when credit is selected
  const sortedCategories = (() => {
    const filtered = categories.filter(c =>
      c.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
    if (!isDebit) {
      const creditCats = filtered.filter(c => CREDIT_CATEGORY_NAMES.includes(c.name));
      const otherCats = filtered.filter(c => !CREDIT_CATEGORY_NAMES.includes(c.name));
      return [...creditCats, ...otherCats];
    }
    return filtered;
  })();

  const handleSave = async () => {
    if (!amount || !description || !categoryId || !user || !profile) return;

    const expenseData = {
      tracker_id: trackerId,
      created_by_id: user.id,
      created_by_name: profile.full_name,
      category_id: categoryId,
      amount: parseFloat(amount),
      currency: 'INR',
      date,
      description,
      merchant_name: merchantName || null,
      payment_method: (paymentMethod || null) as PaymentMethod | null,
      notes: notes || null,
      tags: tags.length > 0 ? tags : [],
      reference_number: referenceNumber || null,
      is_debit: isDebit,
      source: 'manual' as const,
    };

    if (isEdit) {
      await updateExpense.mutateAsync({ id: editExpense!.id, ...expenseData });
    } else {
      await createExpense.mutateAsync(expenseData);
    }
    onOpenChange(false);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const isPending = createExpense.isPending || updateExpense.isPending;

  return (
    <>
      <Sheet open={open && !showCategoryPicker} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</SheetTitle>
          </SheetHeader>

          <div className="py-4 space-y-5">
            {/* Entry mode selector (add mode only) */}
            {!isEdit && !showManualForm && (
              <div className="space-y-3">
                <button
                  onClick={() => { onOpenChange(false); navigate(`/tracker/${trackerId}/upload`); }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted transition-colors"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm">Upload Bank Statement</p>
                    <p className="text-xs text-muted-foreground">Import transactions from PDF or CSV</p>
                  </div>
                </button>
                <button
                  onClick={() => setShowManualForm(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted transition-colors"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <PenLine className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm">Add Manually</p>
                    <p className="text-xs text-muted-foreground">Enter transaction details yourself</p>
                  </div>
                </button>
              </div>
            )}

            {/* Manual form */}
            {(isEdit || showManualForm) && <>
            {/* Amount */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1">
                <span className={`font-mono text-3xl ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className={`font-mono text-4xl font-bold text-center bg-transparent border-none outline-none w-48 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}
                  autoFocus={!isEdit}
                />
              </div>
            </div>

            {/* Type toggle - redesigned pills */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsDebit(true)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  isDebit
                    ? 'bg-red-50 border-red-400 text-red-600 dark:bg-red-950/30'
                    : 'bg-card border-border text-muted-foreground'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                Debit (Money Out)
              </button>
              <button
                onClick={() => setIsDebit(false)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  !isDebit
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-600 dark:bg-emerald-950/30'
                    : 'bg-card border-border text-muted-foreground'
                }`}
              >
                <ArrowDownLeft className="h-4 w-4" />
                Credit (Money In)
              </button>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                placeholder={isDebit ? 'What did you spend on?' : 'What is this payment for?'}
                className="h-11"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <button
                onClick={() => setShowCategoryPicker(true)}
                className="w-full h-11 flex items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm"
              >
                {selectedCategory ? (
                  <>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs" style={{ backgroundColor: selectedCategory.color + '20' }}>
                      {selectedCategory.icon}
                    </span>
                    <span>{selectedCategory.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Select category</span>
                )}
              </button>
            </div>

            {/* Merchant */}
            <div className="space-y-1.5">
              <Label>Merchant Name</Label>
              <Input value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="e.g. Swiggy, BPCL" className="h-11" />
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm}
                    onClick={() => setPaymentMethod(paymentMethod === pm ? '' : pm)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${paymentMethod === pm ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" rows={3} />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-xs">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} placeholder="Type and press Space" className="h-11" />
            </div>

            {/* Reference */}
            <div className="space-y-1.5">
              <Label>Reference Number</Label>
              <Input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} placeholder="Transaction ID / Ref No." className="h-11" />
            </div>

            {/* Duplicate warning */}
            {duplicate && (
              <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Similar transaction found</p>
                  <p className="text-xs text-muted-foreground">"{duplicate.description}" on {duplicate.date} for ₹{duplicate.amount.toLocaleString('en-IN')}</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setDuplicate(null)} className="text-xs font-medium text-primary">Add Anyway</button>
                    <button onClick={() => onOpenChange(false)} className="text-xs font-medium text-muted-foreground">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Save */}
            <Button onClick={handleSave} className="w-full h-11" disabled={isPending || !amount || !description || !categoryId}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Update Transaction' : 'Save Transaction')}
            </Button>

            {/* Delete (edit mode) */}
            {isEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full h-11 border-destructive text-destructive hover:bg-destructive/10">
                    Delete Transaction
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete this transaction.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => { deleteExpense.mutate(editExpense!.id); onOpenChange(false); }}
                      className="bg-destructive text-destructive-foreground"
                    >Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            </>}
          </div>
        </SheetContent>
      </Sheet>

      {/* Category Picker */}
      <Sheet open={showCategoryPicker} onOpenChange={setShowCategoryPicker}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Select Category</SheetTitle>
          </SheetHeader>
          <div className="py-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)}
                placeholder="Search categories..."
                className="pl-9 h-11"
              />
            </div>

            {/* Credit-specific header */}
            {!isDebit && !categorySearch && (
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider px-1">Income Categories</p>
            )}

            <div className="space-y-1">
              {sortedCategories.map((cat, idx) => {
                // Show separator between credit and other categories
                const showSeparator = !isDebit && !categorySearch && idx > 0 &&
                  CREDIT_CATEGORY_NAMES.includes(sortedCategories[idx - 1].name) &&
                  !CREDIT_CATEGORY_NAMES.includes(cat.name);

                return (
                  <div key={cat.id}>
                    {showSeparator && (
                      <div className="py-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">All Categories</p>
                      </div>
                    )}
                    <button
                      onClick={() => { setCategoryId(cat.id); setShowCategoryPicker(false); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${categoryId === cat.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm" style={{ backgroundColor: cat.color + '20' }}>
                        {cat.icon}
                      </span>
                      <span className="font-medium text-sm">{cat.name}</span>
                      {!cat.is_system && <span className="text-xs text-muted-foreground ml-auto">Custom</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
