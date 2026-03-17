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
      
      const { data: memberships, error: memErr } = await supabase
        .from('tracker_members')
        .select('tracker_id')
        .eq('user_id', user.id);

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const trackerIds = memberships.map(m => m.tracker_id);
      const { data: trackers, error } = await supabase
        .from('trackers')
        .select('*')
        .in('id', trackerIds);

      if (error) throw error;

      const results: TrackerWithStats[] = [];
      for (const tracker of trackers || []) {
        const { count: memberCount } = await supabase
          .from('tracker_members')
          .select('*', { count: 'exact', head: true })
          .eq('tracker_id', tracker.id);

        // Sum ALL debit expenses across all months
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount')
          .eq('tracker_id', tracker.id)
          .eq('is_debit', true);

        const monthlyTotal = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;

        // Get earliest and latest expense dates
        const { data: minRow } = await supabase
          .from('expenses')
          .select('date')
          .eq('tracker_id', tracker.id)
          .order('date', { ascending: true })
          .limit(1)
          .single();
        const { data: maxRow } = await supabase
          .from('expenses')
          .select('date')
          .eq('tracker_id', tracker.id)
          .order('date', { ascending: false })
          .limit(1)
          .single();

        results.push({
          ...tracker,
          member_count: memberCount ?? 0,
          monthly_total: monthlyTotal,
          date_range: minRow && maxRow ? { min: minRow.date, max: maxRow.date } : undefined,
        } as TrackerWithStats);
      }
      return results;
    },
    enabled: !!user,
  });
}

export function useCreateTracker() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: tracker, error } = await supabase
        .from('trackers')
        .insert({ name, admin_id: user.id })
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
  });
}

export function useUpdateTracker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('trackers').update({ name }).eq('id', id);
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
