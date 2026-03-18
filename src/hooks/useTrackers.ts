import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tracker, TrackerWithStats, TrackerMember, Category, Profile } from '@/types';
import { toast } from 'sonner';

export function useTrackers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['trackers', user?.id],
    queryFn: async (): Promise<TrackerWithStats[]> => {
      if (!user) return [];

      const { data, error } = await supabase.rpc('get_tracker_stats', {
        p_user_id: user.id,
      });

      if (error) throw error;
      if (!data?.length) return [];

      return data.map((row: any) => ({
        id: row.tracker_id,
        name: row.tracker_name,
        currency: row.tracker_currency,
        admin_id: row.admin_id,
        created_at: row.tracker_created_at,
        updated_at: row.tracker_updated_at,
        member_count: Number(row.member_count),
        monthly_total: Number(row.total_debit),
        date_range: row.min_date && row.max_date
          ? { min: row.min_date, max: row.max_date }
          : undefined,
      })) as TrackerWithStats[];
    },
    enabled: !!user,
    staleTime: 30_000, // 30 seconds
  });
}

export function useCreateTracker() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, currency = 'INR' }: { name: string; currency?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: tracker, error } = await supabase
        .from('trackers')
        .insert({ name, currency, admin_id: user.id })
        .select()
        .single();

      if (error) throw error;

      const { error: memErr } = await supabase
        .from('tracker_members')
        .insert({ tracker_id: tracker.id, user_id: user.id, role: 'admin' });

      if (memErr) throw memErr;
      return tracker;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers'] });
      toast.success('Tracker created! 🎉');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useTracker(trackerId: string) {
  return useQuery({
    queryKey: ['tracker', trackerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trackers')
        .select('*')
        .eq('id', trackerId)
        .single();
      if (error) throw error;
      return data as Tracker;
    },
    enabled: !!trackerId,
    staleTime: 60_000, // 1 minute — tracker metadata rarely changes
  });
}

export function useTrackerMembers(trackerId: string) {
  return useQuery({
    queryKey: ['tracker-members', trackerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tracker_members')
        .select('*, profile:profiles(*)')
        .eq('tracker_id', trackerId);
      if (error) throw error;
      return (data || []).map(m => ({
        ...m,
        profile: m.profile as unknown as Profile,
      })) as TrackerMember[];
    },
    enabled: !!trackerId,
    staleTime: 2 * 60_000, // 2 minutes — members change infrequently
  });
}

export function useCategories(trackerId?: string) {
  return useQuery({
    queryKey: ['categories', trackerId],
    queryFn: async () => {
      let query = supabase.from('categories').select('*');
      if (trackerId) {
        query = query.or(`is_system.eq.true,tracker_id.eq.${trackerId}`);
      } else {
        query = query.eq('is_system', true);
      }
      const { data, error } = await query.order('name');
      if (error) throw error;
      return data as Category[];
    },
    staleTime: 5 * 60_000, // 5 minutes — categories rarely change
  });
}

export function useUpdateTracker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, currency }: { id: string; name?: string; currency?: string }) => {
      const updates: Record<string, string> = {};
      if (name !== undefined) updates.name = name;
      if (currency !== undefined) updates.currency = currency;
      const { error } = await supabase.from('trackers').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tracker', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['trackers'] });
      toast.success('Tracker updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useConvertTrackerCurrency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ trackerId, newCurrency, convertExisting }: { trackerId: string; newCurrency: string; convertExisting: boolean }) => {
      // Update tracker currency
      const { error: tErr } = await supabase.from('trackers').update({ currency: newCurrency }).eq('id', trackerId);
      if (tErr) throw tErr;

      if (convertExisting) {
        // Fetch all expenses for this tracker
        const { data: expenses, error: eErr } = await supabase
          .from('expenses')
          .select('id, amount, currency, date')
          .eq('tracker_id', trackerId);
        if (eErr) throw eErr;
        if (!expenses?.length) return;

        // Find expenses that need conversion (current currency != new currency)
        const toConvert = expenses.filter(e => e.currency !== newCurrency);
        if (!toConvert.length) return;

        // Build conversion requests
        const conversions = toConvert.map(e => ({
          from: e.currency,
          to: newCurrency,
          amount: Number(e.amount),
          date: e.date,
        }));

        // Call edge function for bulk conversion
        const { data, error: fnErr } = await supabase.functions.invoke('convert-currency', {
          body: { conversions },
        });
        if (fnErr) throw fnErr;

        const results = data?.results || [];

        // Update each expense with converted amount
        for (let i = 0; i < toConvert.length; i++) {
          const result = results[i];
          if (result?.error) continue;

          const exp = toConvert[i];
          const { error: uErr } = await supabase
            .from('expenses')
            .update({
              original_amount: Number(exp.amount),
              original_currency: exp.currency,
              amount: result.converted_amount,
              currency: newCurrency,
              conversion_rate: result.rate,
              conversion_note: `Converted from ${getCurrencySymbol(exp.currency)}${Number(exp.amount).toLocaleString()} ${exp.currency} @ ${result.rate}`,
            } as any)
            .eq('id', exp.id);
          if (uErr) console.error('Failed to update expense', exp.id, uErr);
        }
      } else {
        // Just update all expenses to new currency label without converting amounts
        const { error } = await supabase
          .from('expenses')
          .update({ currency: newCurrency } as any)
          .eq('tracker_id', trackerId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tracker', vars.trackerId] });
      queryClient.invalidateQueries({ queryKey: ['trackers'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Currency updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

function getCurrencySymbol(code: string): string {
  const map: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SGD: 'S$', AUD: 'A$', CAD: 'C$', JPY: '¥', SAR: '﷼' };
  return map[code] || '';
}

export function useDeleteTracker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trackers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackers'] });
      toast('🗑️ Tracker deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useInviteMember(trackerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .ilike('email', email.trim())
        .single();

      if (profileErr || !profile) {
        throw new Error('No account found with that email. The user must sign up first.');
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('tracker_members')
        .select('id')
        .eq('tracker_id', trackerId)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) {
        throw new Error(`${profile.full_name} is already a member of this tracker.`);
      }

      const { error: insertErr } = await supabase
        .from('tracker_members')
        .insert({ tracker_id: trackerId, user_id: profile.id, role: 'member' });

      if (insertErr) throw insertErr;
      return profile.full_name;
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['tracker-members', trackerId] });
      queryClient.invalidateQueries({ queryKey: ['trackers'] });
      toast.success(`${name} added to tracker`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddMember(trackerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
      const { error } = await supabase
        .from('tracker_members')
        .insert({ tracker_id: trackerId, user_id: userId, role: 'member' });
      if (error) throw error;
      return name;
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ['tracker-members', trackerId] });
      toast.success(`${name} added to tracker`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveMember(trackerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('tracker_members')
        .delete()
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker-members', trackerId] });
      toast('Member removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateMemberRole(trackerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase
        .from('tracker_members')
        .update({ role })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker-members', trackerId] });
      toast.success('Role updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateCategory(trackerId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ name, icon, color }: { name: string; icon: string; color: string }) => {
      const { error } = await supabase
        .from('categories')
        .insert({ name, icon, color, tracker_id: trackerId, created_by: user?.id, is_system: false });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', trackerId] });
      toast.success('Category created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCategory(trackerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, icon, color }: { id: string; name: string; icon: string; color: string }) => {
      const { error } = await supabase
        .from('categories')
        .update({ name, icon, color })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', trackerId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Category updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCategory(trackerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      deleteTransactions,
      reassignCategoryId,
    }: {
      categoryId: string;
      deleteTransactions?: boolean;
      reassignCategoryId?: string;
    }) => {
      if (deleteTransactions) {
        // Delete all transactions using this category in this tracker
        await supabase
          .from('expenses')
          .delete()
          .eq('category_id', categoryId)
          .eq('tracker_id', trackerId);
      } else if (reassignCategoryId) {
        // Move transactions to the chosen category
        await supabase
          .from('expenses')
          .update({ category_id: reassignCategoryId } as any)
          .eq('category_id', categoryId)
          .eq('tracker_id', trackerId);
      }

      // Remove category_learning references before deleting the category
      await supabase
        .from('category_learning')
        .delete()
        .eq('category_id', categoryId);

      const { error } = await supabase.from('categories').delete().eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', trackerId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-months'] });
      toast.success('Category deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
