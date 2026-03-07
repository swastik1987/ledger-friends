import { Expense, Category } from '@/types';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { subMonths, format } from 'date-fns';
import { BarChart2 } from 'lucide-react';
import { useState, useMemo } from 'react';

function generateMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
  }
  return months;
}

interface Props {
  expenses: Expense[];
  categories: Category[];
  month: string;
  onMonthChange: (m: string) => void;
  isLoading: boolean;
}

export default function DashboardTab({ expenses, categories, month, onMonthChange, isLoading }: Props) {
  const months = generateMonths();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const debitExpenses = useMemo(() => expenses.filter(e => e.is_debit), [expenses]);
  const totalSpent = debitExpenses.reduce((s, e) => s + e.amount, 0);

  const categoryData = useMemo(() => {
    const map: Record<string, { category: Category; total: number; count: number }> = {};
    debitExpenses.forEach(e => {
      if (!map[e.category_id]) {
        map[e.category_id] = { category: e.category || categories.find(c => c.id === e.category_id)!, total: 0, count: 0 };
      }
      map[e.category_id].total += e.amount;
      map[e.category_id].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [debitExpenses, categories]);

  const topCategory = categoryData[0];
  const largestExpense = debitExpenses.sort((a, b) => b.amount - a.amount)[0];
  const top5 = [...debitExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);

  if (isLoading) {
    return (
      <div className="px-4 py-3 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-card border border-border p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="px-4 py-3">
        <Select value={month} onValueChange={onMonthChange}>
          <SelectTrigger className="h-10 mb-4">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-center py-16">
          <BarChart2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-lg">No data for this month</p>
          <p className="text-sm text-muted-foreground">Add expenses to see your dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      <Select value={month} onValueChange={onMonthChange}>
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Summary Cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {[
          { label: 'Total Spent', value: `₹${totalSpent.toLocaleString('en-IN')}` },
          { label: 'Transactions', value: String(debitExpenses.length) },
          { label: 'Largest', value: largestExpense ? `₹${largestExpense.amount.toLocaleString('en-IN')}` : '-' },
          { label: 'Top Category', value: topCategory ? `${topCategory.category?.icon} ${topCategory.category?.name}` : '-' },
        ].map((card, i) => (
          <div key={i} className="min-w-[140px] rounded-2xl bg-card border border-border p-3 shadow-sm flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className={`font-semibold text-sm ${i === 0 ? 'font-mono' : ''}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Pie Chart */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={categoryData.map(d => ({
                name: d.category?.name,
                value: d.total,
                color: d.category?.color,
                icon: d.category?.icon,
                id: d.category?.id,
              }))}
              cx="50%"
              cy="50%"
              outerRadius={130}
              innerRadius={75}
              dataKey="value"
              onClick={(d) => setSelectedCategoryId(d.id === selectedCategoryId ? null : d.id)}
            >
              {categoryData.map((d, i) => (
                <Cell key={i} fill={d.category?.color || '#ccc'} stroke="none" />
              ))}
              <Label
                content={() => (
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                    <tspan x="50%" dy="-8" className="fill-foreground font-mono text-lg font-bold">
                      ₹{totalSpent.toLocaleString('en-IN')}
                    </tspan>
                    <tspan x="50%" dy="20" className="fill-muted-foreground text-xs">
                      Total
                    </tspan>
                  </text>
                )}
              />
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const pct = ((d.value / totalSpent) * 100).toFixed(1);
                return (
                  <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-xs">
                    <p className="font-semibold">{d.icon} {d.name}</p>
                    <p className="font-mono">₹{d.value.toLocaleString('en-IN')} ({pct}%)</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="space-y-1 mt-2">
          {categoryData.map(d => {
            const pct = ((d.total / totalSpent) * 100).toFixed(1);
            return (
              <div key={d.category?.id} className="flex items-center gap-2 text-sm">
                <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.category?.color }} />
                <span className="text-xs">{d.category?.icon}</span>
                <span className="flex-1 truncate text-xs">{d.category?.name}</span>
                <span className="font-mono text-xs">₹{d.total.toLocaleString('en-IN')}</span>
                <span className="text-xs text-muted-foreground">({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Category Breakdown</h3>
        {categoryData.map(d => {
          const pct = (d.total / totalSpent) * 100;
          return (
            <div key={d.category?.id}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: d.category?.color + '20' }}>
                  {d.category?.icon}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{d.category?.name}</p>
                  <p className="text-xs text-muted-foreground">{d.count} transaction{d.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold">₹{d.total.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
                </div>
              </div>
              <div className="h-1 bg-muted rounded-full mt-2">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.category?.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Top 5 */}
      {top5.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm">Biggest Spends This Month</h3>
          {top5.map(e => (
            <div key={e.id} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: (e.category?.color || '#ccc') + '20' }}>
                {e.category?.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">{e.date} · {e.category?.name}</p>
              </div>
              <p className="font-mono text-sm font-semibold">₹{e.amount.toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
