import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Expense, Category, Profile } from '@/types';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { format, parse } from 'date-fns';

/**
 * Fetches the distinct months that have transactions for a tracker.
 * Returns sorted array of { value: 'yyyy-MM', label: 'MMMM yyyy' } with 'all' at top.
 */
export function useExpenseMonths(trackerId: string) {
  return useQuery({
    queryKey: ['expense-months', trackerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('date')
        .eq('tracker_id', trackerId);

      if (error) throw error;

      // Extract unique yyyy-MM values
      const monthSet = new Set<string>();
      (data || []).forEach(e => {
        if (e.date) monthSet.add(e.date.slice(0, 7)); // 'yyyy-MM'
      });

      // Sort descending (newest first)
      const sorted = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

      const months: { value: string; label: string }[] = [
        { value: 'all', label: 'All Months' },
      ];
      for (const m of sorted) {
        const d = parse(m, 'yyyy-MM', new Date());
        months.push({ value: m, label: format(d, 'MMMM yyyy') });
      }

      // If no transactions exist, add current month as fallback
      if (sorted.length === 0) {
        const now = new Date();
        months.push({ value: format(now, 'yyyy-MM'), label: format(now, 'MMMM yyyy') });
      }

      return months;
    },
    enabled: !!trackerId,
  });
}

export function useExpenses(trackerId: string, month: string) {
  return useQuery({
    queryKey: ['expenses', trackerId, month],
    queryFn: async () => {
      let query = supabase
        .from('expenses')
        .select('*, category:categories(*), created_by_profile:profiles!created_by_id(*)')
        .eq('tracker_id', trackerId);

      // If month is 'all', skip date filters — fetch everything for this tracker
      if (month && month !== 'all') {
        const [year, mon] = month.split('-').map(Number);
        const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
        const lastDay = new Date(year, mon, 0).getDate();
        const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        query = query.gte('date', startDate).lte('date', endDate);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(e => ({
        ...e,
        amount: Number(e.amount),
        category: e.category as unknown as Category,
        created_by_profile: e.created_by_profile as unknown as Profile,
      })) as Expense[];
    },
    enabled: !!trackerId && !!month,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expense: Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'category'>) => {
      const { error } = await supabase.from('expenses').insert(expense as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast.success('Transaction saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { category, ...rest } = updates;
      const { error } = await supabase.from('expenses').update(rest as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast.success('Transaction updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast('🗑️ Transaction deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBulkCreateExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expenses: any[]) => {
      const { error } = await supabase.from('expenses').insert(expenses);
      if (error) throw error;
      return expenses.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast.success(`✅ ${count} transactions imported successfully!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBulkUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, categoryId }: { ids: string[]; categoryId: string }) => {
      const { error } = await supabase
        .from('expenses')
        .update({ category_id: categoryId } as any)
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast.success(`${count} transactions updated`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBulkDeleteExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast.success(`🗑️ ${count} transactions deleted`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBulkMoveExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      targetTrackerId,
      expenses,
      sourceCategories,
      targetCategories,
    }: {
      ids: string[];
      targetTrackerId: string;
      expenses: Expense[];
      sourceCategories: Category[];
      targetCategories: Category[];
    }) => {
      const selected = expenses.filter(e => ids.includes(e.id));

      // Build map of category IDs that need to be created in target tracker
      const categoryMap = new Map<string, string>(); // old category_id -> new category_id

      for (const exp of selected) {
        if (categoryMap.has(exp.category_id)) continue;

        const sourceCat = sourceCategories.find(c => c.id === exp.category_id);
        if (!sourceCat) continue;

        // System categories are shared — no need to create
        if (sourceCat.is_system) {
          categoryMap.set(exp.category_id, exp.category_id);
          continue;
        }

        // Check if a custom category with the same name exists in target
        const existingInTarget = targetCategories.find(
          c => c.name.toLowerCase() === sourceCat.name.toLowerCase() && (c.is_system || c.tracker_id === targetTrackerId)
        );

        if (existingInTarget) {
          categoryMap.set(exp.category_id, existingInTarget.id);
        } else {
          // Create the category in the target tracker
          const { data: newCat, error: catErr } = await supabase
            .from('categories')
            .insert({
              name: sourceCat.name,
              icon: sourceCat.icon,
              color: sourceCat.color,
              tracker_id: targetTrackerId,
              is_system: false,
            })
            .select()
            .single();

          if (catErr) throw catErr;
          categoryMap.set(exp.category_id, newCat.id);
        }
      }

      // Update each expense: change tracker_id and category_id
      for (const exp of selected) {
        const newCatId = categoryMap.get(exp.category_id) || exp.category_id;
        const { error } = await supabase
          .from('expenses')
          .update({ tracker_id: targetTrackerId, category_id: newCatId } as any)
          .eq('id', exp.id);
        if (error) throw error;
      }

      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      queryClient.invalidateQueries({ queryKey: ['trackers'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(`${count} transactions moved`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useExpenseRealtime(trackerId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!trackerId) return;

    const channel = supabase
      .channel(`expenses-${trackerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `tracker_id=eq.${trackerId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['expenses', trackerId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackerId, queryClient]);
}

export function useDuplicateCheck(trackerId: string) {
  return async (date: string, amount: number, description: string): Promise<Expense | null> => {
    const { data } = await supabase
      .from('expenses')
      .select('*, category:categories(*), created_by_profile:profiles!created_by_id(*)')
      .eq('tracker_id', trackerId)
      .eq('date', date)
      .eq('amount', amount)
      .limit(5);

    if (!data?.length) return null;

    const normalizedDesc = description.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const expense of data) {
      const expDesc = expense.description.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedDesc.includes(expDesc) || expDesc.includes(normalizedDesc) || 
          similarity(normalizedDesc, expDesc) > 0.8) {
        return { ...expense, amount: Number(expense.amount), category: expense.category as unknown as Category, created_by_profile: expense.created_by_profile as unknown as Profile } as Expense;
      }
    }
    return null;
  };
}

function similarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1;
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) { costs[j] = j; }
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1])
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}
