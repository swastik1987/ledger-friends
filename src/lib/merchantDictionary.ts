/**
 * Curated merchant → category dictionary for well-known merchants.
 *
 * Applied client-side before sending statements to the AI. For every transaction
 * whose description or merchant_name matches a key here, the AI's category
 * suggestion is overridden in favour of the curated mapping. This dramatically
 * improves cold-start accuracy for new trackers that have no category-learning
 * history yet.
 *
 * Keys are matched as case-insensitive substrings against the description and
 * merchant_name. Use the most distinctive token (e.g. "swiggy", not just "food").
 */

export interface MerchantRule {
  /** Lower-case substring to search for in description/merchant_name */
  match: string;
  /** Exact category name (must be a valid system category) */
  category: string;
  /** Confidence to use when this rule fires (0-1) */
  confidence?: number;
}

// Curated against the system category list. When the user has a custom category
// that better fits, category-learning will adopt that user preference and
// outrank this dictionary on subsequent runs.
const RULES: MerchantRule[] = [
  // ── Food & Dining ──
  { match: 'swiggy', category: 'Food & Dining', confidence: 0.95 },
  { match: 'zomato', category: 'Food & Dining', confidence: 0.95 },
  { match: 'dunzo', category: 'Food & Dining', confidence: 0.9 },
  { match: 'eatfit', category: 'Food & Dining', confidence: 0.9 },
  { match: 'eatsure', category: 'Food & Dining', confidence: 0.9 },
  { match: 'doordash', category: 'Food & Dining', confidence: 0.95 },
  { match: 'ubereats', category: 'Food & Dining', confidence: 0.95 },
  { match: 'uber eats', category: 'Food & Dining', confidence: 0.95 },
  { match: 'mcdonald', category: 'Food & Dining', confidence: 0.95 },
  { match: 'starbucks', category: 'Food & Dining', confidence: 0.95 },
  { match: 'dominos', category: 'Food & Dining', confidence: 0.95 },
  { match: 'pizza hut', category: 'Food & Dining', confidence: 0.95 },
  { match: 'kfc', category: 'Food & Dining', confidence: 0.9 },
  { match: 'subway', category: 'Food & Dining', confidence: 0.85 },
  { match: 'chai point', category: 'Food & Dining', confidence: 0.9 },
  { match: 'third wave coffee', category: 'Food & Dining', confidence: 0.95 },
  { match: 'blue tokai', category: 'Food & Dining', confidence: 0.95 },

  // ── Groceries ──
  { match: 'bigbasket', category: 'Groceries', confidence: 0.95 },
  { match: 'blinkit', category: 'Groceries', confidence: 0.95 },
  { match: 'zepto', category: 'Groceries', confidence: 0.95 },
  { match: 'instamart', category: 'Groceries', confidence: 0.95 },
  { match: 'dmart', category: 'Groceries', confidence: 0.9 },
  { match: 'd-mart', category: 'Groceries', confidence: 0.9 },
  { match: 'reliance fresh', category: 'Groceries', confidence: 0.9 },
  { match: 'reliance smart', category: 'Groceries', confidence: 0.9 },
  { match: 'jiomart', category: 'Groceries', confidence: 0.9 },
  { match: 'natures basket', category: 'Groceries', confidence: 0.9 },
  { match: "nature's basket", category: 'Groceries', confidence: 0.9 },
  { match: 'spencer', category: 'Groceries', confidence: 0.85 },
  { match: 'more retail', category: 'Groceries', confidence: 0.85 },

  // ── Transport ──
  { match: 'uber', category: 'Transport', confidence: 0.9 }, // before "uber eats" handled above
  { match: 'ola cabs', category: 'Transport', confidence: 0.95 },
  { match: 'rapido', category: 'Transport', confidence: 0.95 },
  { match: 'meru', category: 'Transport', confidence: 0.85 },
  { match: 'lyft', category: 'Transport', confidence: 0.95 },
  { match: 'metro card', category: 'Transport', confidence: 0.9 },
  { match: 'irctc', category: 'Transport', confidence: 0.9 },
  { match: 'redbus', category: 'Transport', confidence: 0.95 },
  { match: 'abhibus', category: 'Transport', confidence: 0.9 },

  // ── Fuel ──
  { match: 'indian oil', category: 'Fuel', confidence: 0.9 },
  { match: 'iocl', category: 'Fuel', confidence: 0.9 },
  { match: 'bharat petroleum', category: 'Fuel', confidence: 0.9 },
  { match: 'bpcl', category: 'Fuel', confidence: 0.9 },
  { match: 'hpcl', category: 'Fuel', confidence: 0.9 },
  { match: 'hindustan petrol', category: 'Fuel', confidence: 0.9 },
  { match: 'shell ', category: 'Fuel', confidence: 0.85 },
  { match: 'petrol pump', category: 'Fuel', confidence: 0.9 },
  { match: 'gas station', category: 'Fuel', confidence: 0.9 },

  // ── Shopping ──
  { match: 'amazon', category: 'Shopping', confidence: 0.85 },
  { match: 'amzn', category: 'Shopping', confidence: 0.85 },
  { match: 'flipkart', category: 'Shopping', confidence: 0.9 },
  { match: 'myntra', category: 'Shopping', confidence: 0.95 },
  { match: 'ajio', category: 'Shopping', confidence: 0.95 },
  { match: 'meesho', category: 'Shopping', confidence: 0.9 },
  { match: 'tata cliq', category: 'Shopping', confidence: 0.9 },
  { match: 'nykaa', category: 'Shopping', confidence: 0.9 },
  { match: 'ebay', category: 'Shopping', confidence: 0.9 },
  { match: 'aliexpress', category: 'Shopping', confidence: 0.9 },
  { match: 'snapdeal', category: 'Shopping', confidence: 0.9 },
  { match: 'shoppers stop', category: 'Shopping', confidence: 0.9 },
  { match: 'lifestyle stores', category: 'Shopping', confidence: 0.85 },
  { match: 'westside', category: 'Shopping', confidence: 0.85 },

  // ── Entertainment ──
  { match: 'bookmyshow', category: 'Entertainment', confidence: 0.95 },
  { match: 'pvr cinemas', category: 'Entertainment', confidence: 0.95 },
  { match: 'inox', category: 'Entertainment', confidence: 0.9 },
  { match: 'cinepolis', category: 'Entertainment', confidence: 0.9 },
  { match: 'steam', category: 'Entertainment', confidence: 0.7 },
  { match: 'playstation', category: 'Entertainment', confidence: 0.9 },

  // ── Subscriptions ──
  { match: 'netflix', category: 'Subscriptions', confidence: 0.98 },
  { match: 'amazon prime', category: 'Subscriptions', confidence: 0.95 },
  { match: 'prime video', category: 'Subscriptions', confidence: 0.95 },
  { match: 'hotstar', category: 'Subscriptions', confidence: 0.95 },
  { match: 'disney+', category: 'Subscriptions', confidence: 0.95 },
  { match: 'jiocinema', category: 'Subscriptions', confidence: 0.9 },
  { match: 'sonyliv', category: 'Subscriptions', confidence: 0.95 },
  { match: 'zee5', category: 'Subscriptions', confidence: 0.95 },
  { match: 'spotify', category: 'Subscriptions', confidence: 0.98 },
  { match: 'apple music', category: 'Subscriptions', confidence: 0.95 },
  { match: 'apple.com/bill', category: 'Subscriptions', confidence: 0.9 },
  { match: 'google one', category: 'Subscriptions', confidence: 0.9 },
  { match: 'youtube premium', category: 'Subscriptions', confidence: 0.95 },
  { match: 'icloud', category: 'Subscriptions', confidence: 0.9 },
  { match: 'dropbox', category: 'Subscriptions', confidence: 0.95 },
  { match: 'adobe', category: 'Subscriptions', confidence: 0.85 },
  { match: 'github', category: 'Subscriptions', confidence: 0.85 },
  { match: 'chatgpt', category: 'Subscriptions', confidence: 0.95 },
  { match: 'openai', category: 'Subscriptions', confidence: 0.9 },
  { match: 'anthropic', category: 'Subscriptions', confidence: 0.9 },
  { match: 'cursor', category: 'Subscriptions', confidence: 0.85 },
  { match: 'notion', category: 'Subscriptions', confidence: 0.85 },
  { match: 'figma', category: 'Subscriptions', confidence: 0.85 },

  // ── Travel ──
  { match: 'makemytrip', category: 'Travel', confidence: 0.95 },
  { match: 'goibibo', category: 'Travel', confidence: 0.95 },
  { match: 'ixigo', category: 'Travel', confidence: 0.95 },
  { match: 'cleartrip', category: 'Travel', confidence: 0.95 },
  { match: 'easemytrip', category: 'Travel', confidence: 0.95 },
  { match: 'oyo', category: 'Travel', confidence: 0.9 },
  { match: 'airbnb', category: 'Travel', confidence: 0.95 },
  { match: 'booking.com', category: 'Travel', confidence: 0.95 },
  { match: 'agoda', category: 'Travel', confidence: 0.95 },
  { match: 'indigo', category: 'Travel', confidence: 0.85 }, // airline
  { match: 'vistara', category: 'Travel', confidence: 0.9 },
  { match: 'air india', category: 'Travel', confidence: 0.9 },

  // ── Utilities ──
  { match: 'electricity', category: 'Utilities', confidence: 0.85 },
  { match: 'bescom', category: 'Utilities', confidence: 0.95 },
  { match: 'msedcl', category: 'Utilities', confidence: 0.95 },
  { match: 'mahadiscom', category: 'Utilities', confidence: 0.95 },
  { match: 'bsnl', category: 'Utilities', confidence: 0.85 },
  { match: 'airtel', category: 'Utilities', confidence: 0.8 },
  { match: 'jio recharge', category: 'Utilities', confidence: 0.9 },
  { match: 'vi recharge', category: 'Utilities', confidence: 0.9 },
  { match: 'vodafone idea', category: 'Utilities', confidence: 0.85 },
  { match: 'act fibernet', category: 'Utilities', confidence: 0.9 },
  { match: 'water bill', category: 'Utilities', confidence: 0.95 },
  { match: 'gas bill', category: 'Utilities', confidence: 0.9 },

  // ── Healthcare ──
  { match: '1mg', category: 'Healthcare', confidence: 0.95 },
  { match: 'pharmeasy', category: 'Healthcare', confidence: 0.95 },
  { match: 'apollo pharmacy', category: 'Healthcare', confidence: 0.95 },
  { match: 'apollo hospitals', category: 'Healthcare', confidence: 0.95 },
  { match: 'practo', category: 'Healthcare', confidence: 0.95 },
  { match: 'medplus', category: 'Healthcare', confidence: 0.95 },
  { match: 'netmeds', category: 'Healthcare', confidence: 0.95 },
  { match: 'fortis', category: 'Healthcare', confidence: 0.9 },
  { match: 'manipal hospital', category: 'Healthcare', confidence: 0.9 },

  // ── Investments ──
  { match: 'zerodha', category: 'Investments', confidence: 0.95 },
  { match: 'groww', category: 'Investments', confidence: 0.95 },
  { match: 'upstox', category: 'Investments', confidence: 0.95 },
  { match: 'kuvera', category: 'Investments', confidence: 0.95 },
  { match: 'coin.zerodha', category: 'Investments', confidence: 0.95 },
  { match: 'sip ', category: 'Investments', confidence: 0.85 }, // mutual fund SIPs
  { match: 'mutual fund', category: 'Investments', confidence: 0.9 },

  // ── Personal Care ──
  { match: 'salon', category: 'Personal Care', confidence: 0.85 },
  { match: 'urbanclap', category: 'Personal Care', confidence: 0.85 },
  { match: 'urban company', category: 'Personal Care', confidence: 0.85 },

  // ── Insurance ──
  { match: 'lic ', category: 'Insurance', confidence: 0.9 },
  { match: 'hdfc life', category: 'Insurance', confidence: 0.9 },
  { match: 'icici prudential', category: 'Insurance', confidence: 0.9 },
  { match: 'bajaj allianz', category: 'Insurance', confidence: 0.9 },
  { match: 'tata aig', category: 'Insurance', confidence: 0.9 },
  { match: 'star health', category: 'Insurance', confidence: 0.9 },

  // ── Credit categories (use sparingly — only when very unambiguous) ──
  { match: 'salary credit', category: 'Salary / Income', confidence: 0.95 },
  { match: 'salary cr', category: 'Salary / Income', confidence: 0.9 },
  { match: 'sal credit', category: 'Salary / Income', confidence: 0.85 },
  { match: 'interest credit', category: 'Interest Earned', confidence: 0.95 },
  { match: 'interest paid', category: 'Interest Earned', confidence: 0.85 },
  { match: 'fd interest', category: 'Interest Earned', confidence: 0.95 },
  { match: 'cashback', category: 'Cashback / Reward', confidence: 0.85 },
];

/**
 * Look up the best matching merchant rule for a given description + merchant_name pair.
 * Returns null if no match.
 */
export function findMerchantCategory(
  description: string,
  merchantName?: string | null,
): MerchantRule | null {
  const haystack = `${description || ''} ${merchantName || ''}`.toLowerCase();
  if (!haystack.trim()) return null;

  // Walk rules in declared order — earlier entries are higher priority.
  for (const rule of RULES) {
    if (haystack.includes(rule.match)) {
      // Tighten "uber" so it doesn't catch "uber eats" (which appears earlier in the list)
      if (rule.match === 'uber' && /uber\s*eats?/i.test(haystack)) continue;
      return rule;
    }
  }
  return null;
}

/** For diagnostics/tests — exported as readonly. */
export const MERCHANT_RULES: ReadonlyArray<MerchantRule> = RULES;
