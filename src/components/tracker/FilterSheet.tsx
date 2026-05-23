import { useMemo } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Check } from '@phosphor-icons/react';
import CategoryDot from '@/components/CategoryDot';
import BankBadge from '@/components/BankBadge';
import PaymentBadge from '@/components/PaymentBadge';
import { Category, Expense } from '@/types';

// Sentinel chip id used to filter for rows where a given field is blank.
export const UNSPECIFIED = '__unspecified__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: Expense[];          // before user/category filter — defines available chips
  matchingCount: number;        // after all filters
  categories: Category[];
  selectedUsers: Set<string>;
  selectedBanks: Set<string>;
  selectedPaymentMethods: Set<string>;
  selectedCategories: Set<string>;
  onToggleUser: (id: string) => void;
  onToggleBank: (id: string) => void;
  onTogglePaymentMethod: (id: string) => void;
  onToggleCategory: (id: string) => void;
  onClearAll: () => void;
}

interface ChipProps {
  selected: boolean;
  onToggle: () => void;
  label: string;
  leading?: React.ReactNode;
}

function PlainChip({ selected, onToggle, label, leading }: ChipProps) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors"
      style={{
        background: selected ? 'hsl(var(--ink))' : 'hsl(var(--card))',
        color: selected ? 'hsl(var(--background))' : 'hsl(var(--ink))',
        borderColor: selected ? 'hsl(var(--ink))' : 'hsl(var(--line))',
      }}
    >
      {leading}
      {label}
      {selected && <Check size={12} weight="bold" />}
    </button>
  );
}

export default function FilterSheet({
  open, onOpenChange, expenses, matchingCount, categories,
  selectedUsers, selectedBanks, selectedPaymentMethods, selectedCategories,
  onToggleUser, onToggleBank, onTogglePaymentMethod, onToggleCategory, onClearAll,
}: Props) {
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    expenses.forEach(e => {
      const key = e.created_by_id || `deleted-${e.created_by_name}`;
      const name = e.created_by_profile?.full_name || e.created_by_name || 'Deleted User';
      if (key && !map.has(key)) map.set(key, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [expenses]);

  // Banks: deduped non-empty bank_name values + an "Unspecified" sentinel when
  // at least one row in the current view has no bank assigned.
  const bankOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    expenses.forEach(e => {
      const v = e.bank_name?.trim();
      if (v) set.add(v); else hasBlank = true;
    });
    const out = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (hasBlank) out.push(UNSPECIFIED);
    return out;
  }, [expenses]);

  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    let hasBlank = false;
    expenses.forEach(e => {
      const v = e.payment_method?.trim();
      if (v) set.add(v); else hasBlank = true;
    });
    const out = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (hasBlank) out.push(UNSPECIFIED);
    return out;
  }, [expenses]);

  const usedCategories = useMemo(() => {
    const ids = new Set(expenses.map(e => e.category_id));
    return categories.filter(c => ids.has(c.id));
  }, [expenses, categories]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl border-0 max-h-[88vh] flex flex-col"
        style={{ background: 'hsl(var(--background))' }}
      >
        <div className="mx-auto w-9 h-1 rounded-full bg-line mt-2 mb-3.5 shrink-0" />

        <div className="px-5 pb-3 flex items-center justify-between shrink-0">
          <h2 className="font-display font-semibold text-[19px] text-ink" style={{ letterSpacing: '-0.02em' }}>Filter</h2>
          <button
            onClick={onClearAll}
            className="text-[12px] font-semibold text-ember"
          >
            Clear all
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* People */}
          {uniqueUsers.length > 0 && (
            <>
              <div className="px-5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">People</div>
              <div className="px-5 pb-3.5 pt-1.5 flex flex-wrap gap-2">
                {uniqueUsers.map(u => {
                  const selected = selectedUsers.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => onToggleUser(u.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors"
                      style={{
                        background: selected ? 'hsl(var(--ink))' : 'hsl(var(--card))',
                        color: selected ? 'hsl(var(--background))' : 'hsl(var(--ink))',
                        borderColor: selected ? 'hsl(var(--ink))' : 'hsl(var(--line))',
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[11px] font-bold"
                        style={{
                          width: 22, height: 22,
                          background: selected ? 'rgba(255,255,255,0.20)' : 'hsl(var(--ember) / 0.15)',
                          color: selected ? '#fff' : 'hsl(var(--ember))',
                        }}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </span>
                      {u.name.split(' ')[0]}
                      {selected && <Check size={12} weight="bold" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Banks */}
          {bankOptions.length > 0 && (
            <>
              <div className="px-5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Banks</div>
              <div className="px-5 pb-3.5 pt-1.5 flex flex-wrap gap-2">
                {bankOptions.map(b => (
                  <PlainChip
                    key={b}
                    selected={selectedBanks.has(b)}
                    onToggle={() => onToggleBank(b)}
                    label={b === UNSPECIFIED ? 'Unspecified' : b}
                    leading={<BankBadge name={b === UNSPECIFIED ? null : b} unspecified={b === UNSPECIFIED} size={18} />}
                  />
                ))}
              </div>
            </>
          )}

          {/* Payment methods */}
          {paymentOptions.length > 0 && (
            <>
              <div className="px-5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Payment Modes</div>
              <div className="px-5 pb-3.5 pt-1.5 flex flex-wrap gap-2">
                {paymentOptions.map(p => (
                  <PlainChip
                    key={p}
                    selected={selectedPaymentMethods.has(p)}
                    onToggle={() => onTogglePaymentMethod(p)}
                    label={p === UNSPECIFIED ? 'Unspecified' : p}
                    leading={<PaymentBadge method={p === UNSPECIFIED ? null : p} unspecified={p === UNSPECIFIED} size={18} />}
                  />
                ))}
              </div>
            </>
          )}

          {/* Categories */}
          <div className="px-5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Categories</div>
          <div className="px-5 pb-3.5 pt-1.5 flex flex-wrap gap-2">
            {usedCategories.length === 0 && (
              <p className="text-sm text-ink-faint">No categories in current view</p>
            )}
            {usedCategories.map(c => {
              const selected = selectedCategories.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => onToggleCategory(c.id)}
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full text-[12.5px] font-semibold border transition-colors"
                  style={{
                    background: selected ? c.color + '1F' : 'hsl(var(--card))',
                    color: selected ? c.color : 'hsl(var(--ink))',
                    borderColor: selected ? c.color : 'hsl(var(--line))',
                  }}
                >
                  <CategoryDot icon={c.icon} color={c.color} size={22} soft={!selected} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pt-3 pb-7 safe-bottom shrink-0">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-[14px]"
            style={{
              background: 'hsl(var(--ember))',
              boxShadow: '0 6px 18px hsl(var(--ember) / 0.40)',
            }}
          >
            Show {matchingCount} matching transaction{matchingCount !== 1 ? 's' : ''}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
