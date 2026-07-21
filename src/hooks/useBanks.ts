import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Bank } from '@/types';
import { findBankMatch } from '@/lib/bankResolver';
import { guessDomain, bankHashColor } from '@/lib/bankBrand';

/**
 * All registered banks, ordered by canonical name. Small, rarely-changing
 * table — safe to subscribe to from many components (BankBadge, filters,
 * autocomplete) since React Query dedupes concurrent callers into one fetch.
 */
export function useBanks() {
  return useQuery({
    queryKey: ['banks'],
    queryFn: async (): Promise<Bank[]> => {
      const { data, error } = await supabase.from('banks').select('*').order('canonical_name');
      if (error) {
        // Table not migrated yet on this project — degrade to "no registry"
        // rather than breaking bank badges/filters/upload.
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data || []) as Bank[];
    },
    staleTime: 5 * 60_000,
  });
}

function useCreateBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Bank> => {
      const trimmed = name.trim();
      const { data, error } = await supabase
        .from('banks')
        .insert({ canonical_name: trimmed, domain: guessDomain(trimmed), brand_color: bankHashColor(trimmed) })
        .select()
        .single();
      if (error) {
        // Unique-violation: another tab/request registered this exact name
        // first (e.g. two uploads finishing around the same time) — reuse it
        // instead of failing the save.
        if (error.code === '23505') {
          const { data: existing, error: fetchErr } = await supabase
            .from('banks').select('*').eq('canonical_name', trimmed).single();
          if (!fetchErr && existing) return existing as Bank;
        }
        throw error;
      }
      return data as Bank;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['banks'] }),
  });
}

/**
 * Resolves free-text bank input (typed by a user or guessed by the AI) to a
 * canonical `banks` row, creating a new one only when no existing canonical
 * name / alias / close fuzzy match exists. Returns a stable async function so
 * callers (upload review save, manual-entry save) can resolve many rows
 * without duplicate-inserting the same new bank twice.
 */
export function useResolveBankName() {
  const { data: banks } = useBanks();
  const queryClient = useQueryClient();
  const createBank = useCreateBank();

  return useCallback(async (raw: string | null | undefined): Promise<{ id: string; canonical_name: string } | null> => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const currentBanks = queryClient.getQueryData<Bank[]>(['banks']) ?? banks ?? [];
    const match = findBankMatch(trimmed, currentBanks);
    if (match) return { id: match.id, canonical_name: match.canonical_name };
    const created = await createBank.mutateAsync(trimmed);
    return { id: created.id, canonical_name: created.canonical_name };
  }, [banks, queryClient, createBank]);
}
