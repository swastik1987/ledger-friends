import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PRIMARY_API = 'https://{DATE}.currency-api.pages.dev/v1/currencies/{FROM}.json';
const FALLBACK_API = 'https://api.frankfurter.app/{DATE}?from={FROM}&to={TO}';

// Currencies NOT supported by Frankfurter (ECB-based)
const FRANKFURTER_MISSING = ['aed', 'sar'];

interface ConvertRequest {
  from: string;       // e.g. "USD"
  to: string;         // e.g. "INR"
  amount: number;     // original amount
  date: string;       // YYYY-MM-DD
}

interface ConvertResponse {
  converted_amount: number;
  rate: number;
  rate_date: string;
  source: string;
}

interface BulkConvertRequest {
  conversions: ConvertRequest[];
}

/**
 * Fetch rate from primary API (currency-api.pages.dev)
 * Supports all currencies, historical from ~2024-03-10
 */
async function fetchPrimaryRate(from: string, to: string, date: string): Promise<number | null> {
  const url = PRIMARY_API
    .replace('{DATE}', date)
    .replace('{FROM}', from.toLowerCase());

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const toKey = to.toLowerCase();
    const rate = data?.[from.toLowerCase()]?.[toKey];
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Fetch rate from Frankfurter API (fallback)
 * Based on ECB data, supports most major currencies but NOT AED, SAR
 * Historical data from 1999
 */
async function fetchFallbackRate(from: string, to: string, date: string): Promise<number | null> {
  // Frankfurter doesn't support AED/SAR — skip entirely
  if (FRANKFURTER_MISSING.includes(from.toLowerCase()) || FRANKFURTER_MISSING.includes(to.toLowerCase())) {
    return null;
  }

  const url = FALLBACK_API
    .replace('{DATE}', date)
    .replace('{FROM}', from.toUpperCase())
    .replace('{TO}', to.toUpperCase());

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[to.toUpperCase()];
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Try nearby dates if the exact date has no data (weekends/holidays).
 * Checks up to 5 days back from the requested date.
 */
async function fetchRateWithRetry(
  from: string,
  to: string,
  date: string
): Promise<{ rate: number; rate_date: string; source: string } | null> {
  const d = new Date(date + 'T00:00:00Z');

  for (let offset = 0; offset <= 5; offset++) {
    const tryDate = new Date(d);
    tryDate.setUTCDate(tryDate.getUTCDate() - offset);
    const dateStr = tryDate.toISOString().split('T')[0];

    // Try primary API first
    const primaryRate = await fetchPrimaryRate(from, to, dateStr);
    if (primaryRate !== null) {
      return { rate: primaryRate, rate_date: dateStr, source: 'currency-api' };
    }

    // Try fallback
    const fallbackRate = await fetchFallbackRate(from, to, dateStr);
    if (fallbackRate !== null) {
      return { rate: fallbackRate, rate_date: dateStr, source: 'frankfurter' };
    }
  }

  // Last resort: try primary API with "latest" (current rates)
  const latestUrl = `https://latest.currency-api.pages.dev/v1/currencies/${from.toLowerCase()}.json`;
  try {
    const res = await fetch(latestUrl);
    if (res.ok) {
      const data = await res.json();
      const rate = data?.[from.toLowerCase()]?.[to.toLowerCase()];
      if (typeof rate === 'number') {
        return { rate, rate_date: 'latest', source: 'currency-api-latest' };
      }
    }
  } catch { /* fall through */ }

  return null;
}

/**
 * Convert a single amount
 */
async function convertSingle(req: ConvertRequest): Promise<ConvertResponse> {
  const { from, to, amount, date } = req;

  // Same currency — no conversion needed
  if (from.toUpperCase() === to.toUpperCase()) {
    return {
      converted_amount: amount,
      rate: 1,
      rate_date: date,
      source: 'identity',
    };
  }

  const result = await fetchRateWithRetry(from, to, date);

  if (!result) {
    throw new Error(`Could not fetch exchange rate for ${from}→${to} on ${date}`);
  }

  const converted = Math.round(amount * result.rate * 100) / 100;

  return {
    converted_amount: converted,
    rate: result.rate,
    rate_date: result.rate_date,
    source: result.source,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Bulk mode: convert multiple transactions at once
    if (body.conversions && Array.isArray(body.conversions)) {
      const { conversions } = body as BulkConvertRequest;
      const results: (ConvertResponse | { error: string })[] = [];

      // Cache rates by "from-to-date" to avoid redundant API calls
      const rateCache = new Map<string, ConvertResponse>();

      for (const conv of conversions) {
        const cacheKey = `${conv.from}-${conv.to}-${conv.date}`;
        const cached = rateCache.get(cacheKey);

        if (cached) {
          // Reuse cached rate, just recompute the amount
          const converted = Math.round(conv.amount * cached.rate * 100) / 100;
          results.push({
            converted_amount: converted,
            rate: cached.rate,
            rate_date: cached.rate_date,
            source: cached.source,
          });
          continue;
        }

        try {
          const result = await convertSingle(conv);
          rateCache.set(cacheKey, result);
          results.push(result);
        } catch (err) {
          results.push({ error: String(err) });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single conversion mode
    const { from, to, amount, date } = body as ConvertRequest;

    if (!from || !to || amount == null || !date) {
      return new Response(
        JSON.stringify({ error: 'Required fields: from, to, amount, date' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await convertSingle({ from, to, amount, date });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
