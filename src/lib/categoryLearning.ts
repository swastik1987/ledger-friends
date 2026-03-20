import { supabase } from '@/integrations/supabase/client';

/** Normalize a description for matching: lowercase, strip non-alphanumeric (keep spaces) */
export function normalizeDescription(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/** Extract a merchant keyword from a description (first 1-2 meaningful words) */
export function extractMerchantKeyword(desc: string): string | null {
  const normalized = normalizeDescription(desc);
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return null;
  // Return first word as merchant keyword (e.g., "swiggy", "amazon", "zomato")
  return words[0];
}

/**
 * Record a category preference to the category_learning table.
 * Called when:
 * 1. User manually creates a transaction (learn from their category choice)
 * 2. User edits a transaction and changes its category
 * 3. User corrects an AI-suggested category during upload review
 */
export async function recordCategoryLearning(
  description: string,
  categoryId: string,
  merchantName?: string | null,
): Promise<void> {
  const normalized = normalizeDescription(description);
  if (!normalized) return;

  try {
    // Check if an entry already exists for this exact description + category
    const { data: existing } = await supabase
      .from('category_learning')
      .select('id, applied_count')
      .eq('normalized_description', normalized)
      .maybeSingle();

    if (existing) {
      // Update: if same category, increment count; if different, replace with new category
      await supabase
        .from('category_learning')
        .update({
          category_id: categoryId,
          applied_count: existing.applied_count + 1,
          merchant_name: merchantName || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Insert new learning entry
      await supabase.from('category_learning').insert({
        normalized_description: normalized,
        merchant_name: merchantName || extractMerchantKeyword(description) || null,
        category_id: categoryId,
        applied_count: 1,
      });
    }
  } catch {
    // Learning is best-effort — never block the main operation
  }
}

export interface LearnedMapping {
  normalized_description: string;
  merchant_name: string | null;
  category_id: string;
  applied_count: number;
}

/**
 * Fetch all learned category mappings with applied_count >= minCount.
 * Used during upload flow to pre-assign categories before calling AI.
 */
export async function fetchLearnedMappings(minCount = 1): Promise<LearnedMapping[]> {
  const { data, error } = await supabase
    .from('category_learning')
    .select('normalized_description, merchant_name, category_id, applied_count')
    .gte('applied_count', minCount)
    .order('applied_count', { ascending: false });

  if (error || !data) return [];
  return data as LearnedMapping[];
}

/**
 * Try to find a learned category for a transaction description.
 * Strategy:
 * 1. Exact normalized description match
 * 2. Merchant name match (if merchant_name column matches)
 * 3. Merchant keyword match (first word of description matches merchant_name in learning table)
 *
 * Returns the category_id and confidence, or null if no match.
 */
export function findLearnedCategory(
  description: string,
  merchantName: string | null | undefined,
  learnedMappings: LearnedMapping[],
): { categoryId: string; confidence: number } | null {
  const normalized = normalizeDescription(description);
  const merchantKeyword = extractMerchantKeyword(description);

  // Strategy 1: Exact description match
  const exactMatch = learnedMappings.find(
    m => m.normalized_description === normalized
  );
  if (exactMatch) {
    // Higher confidence with more applied_count
    const confidence = Math.min(0.95, 0.8 + exactMatch.applied_count * 0.05);
    return { categoryId: exactMatch.category_id, confidence };
  }

  // Strategy 2: Merchant name match (if provided)
  if (merchantName) {
    const normalizedMerchant = merchantName.toLowerCase().trim();
    const merchantMatch = learnedMappings.find(
      m => m.merchant_name && m.merchant_name.toLowerCase().trim() === normalizedMerchant && m.applied_count >= 2
    );
    if (merchantMatch) {
      return { categoryId: merchantMatch.category_id, confidence: 0.85 };
    }
  }

  // Strategy 3: Merchant keyword match
  if (merchantKeyword) {
    const keywordMatch = learnedMappings.find(
      m => m.merchant_name && m.merchant_name.toLowerCase().trim() === merchantKeyword && m.applied_count >= 2
    );
    if (keywordMatch) {
      return { categoryId: keywordMatch.category_id, confidence: 0.80 };
    }

    // Also check if the first word of the learned description matches
    const descriptionKeywordMatch = learnedMappings.find(m => {
      const learnedWords = m.normalized_description.split(/\s+/);
      return learnedWords[0] === merchantKeyword && m.applied_count >= 2;
    });
    if (descriptionKeywordMatch) {
      return { categoryId: descriptionKeywordMatch.category_id, confidence: 0.75 };
    }
  }

  return null;
}
