import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const quickJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

async function fetchGemini(body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Pull Gemini's suggested wait out of a 429 response: either the `Retry-After`
// header or the RetryInfo.retryDelay ("21s") embedded in the error body. Capped
// at 30s so a single backoff can never blow the function's overall deadline.
// Returns 0 when nothing usable is present (caller falls back to exponential backoff).
function parseRetryDelayMs(res: Response, bodyText: string): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const secs = Number(header);
    if (!Number.isNaN(secs) && secs > 0) return Math.min(secs * 1000, 30_000);
  }
  const m = bodyText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (m) return Math.min(Math.ceil(Number(m[1]) * 1000), 30_000);
  return 0;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Default category enums (fall back when the client does not supply tracker-scoped lists) ──
const DEFAULT_DEBIT_CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Entertainment',
  'Travel', 'Healthcare', 'Utilities', 'Rent', 'Education', 'Personal Care',
  'Subscriptions', 'EMI / Loan', 'Insurance', 'Investments', 'Gifts & Donations',
  'Office & Business', 'Miscellaneous',
];

const DEFAULT_CREDIT_CATEGORIES = [
  'Salary / Income', 'Refund', 'Reimbursement', 'Cashback / Reward',
  'Interest Earned', 'Other Income',
];

// ── Few-shot examples covering the edge cases that trip up bank format detection ──
const FEW_SHOT_EXAMPLES = `
WORKED EXAMPLES (use these to disambiguate similar formats):

Example 1 — HDFC credit card, "C" as currency marker:
Row: "15/03  AMAZON RETAIL IND PVT  C 1,499.00"
→ { date: "2026-03-15", description: "Amazon Retail", merchant_name: "Amazon", amount: 1499, is_debit: true, category: "Shopping" }
Reason: No "+" prefix, "C" is the rupee marker → purchase = debit.

Example 2 — HDFC credit card, bill payment (the "+" sign is the only credit indicator):
Row: "22/03  PAYMENT RECEIVED THANK YOU  + C 12,500.00"
→ { date: "2026-03-22", description: "Bill payment", merchant_name: "HDFC CC", amount: 12500, is_debit: false, category: "Other Income", is_likely_transfer: true }
Reason: "+" prefix → credit. CC bill payments take the issuing bank as merchant_name; description is the generic action.

Example 3 — SBI passbook with Dr/Cr suffix:
Row: "05/04/2026  UPI/SWIGGY/FOOD  225.00 Dr  4,512.00"
→ { date: "2026-04-05", description: "Swiggy", merchant_name: "Swiggy", amount: 225, is_debit: true, category: "Food & Dining", payment_mode: "UPI", balance: 4512 }
Reason: "Dr" suffix → debit. Running balance is 4512 after this transaction.

Example 4 — ICICI Withdrawal/Deposit columns:
Row: "10-Apr-26  NEFT INWARD SALARY ACME CORP  -  85000.00  2,15,000.00"
(columns: Date | Description | Withdrawal | Deposit | Balance)
→ { date: "2026-04-10", description: "NEFT Salary - Acme Corp", merchant_name: "Acme Corp", amount: 85000, is_debit: false, category: "Salary / Income", balance: 215000 }
Reason: Amount appears in the Deposit column, Withdrawal is empty/dash → credit.

Example 5 — Axis bank with signed amounts (no merchant):
Row: "12/04/26  ATM WDL  CASH WITHDRAWAL  -2000.00  18,450.00"
→ { date: "2026-04-12", description: "Cash withdrawal", amount: 2000, is_debit: true, category: "Miscellaneous", payment_mode: "Cash", balance: 18450 }
Reason: Leading "-" sign → debit. No counterparty exists, so merchant_name is omitted; description is the generic action label.

Example 6 — Refund / reversal on a savings account:
Row: "14/04/26  REFUND FLIPKART ORDER  +1,299.00  19,749.00"
→ { date: "2026-04-14", description: "Flipkart Refund", merchant_name: "Flipkart", amount: 1299, is_debit: false, category: "Refund", balance: 19749 }
Reason: "+" sign and "REFUND" keyword → credit. Category "Refund" applies.
`;

// ── Main system instruction (rules + edge cases) ──
function buildSystemInstruction(debitCats: string[], creditCats: string[], metadata?: StatementMetadata): string {
  const metaHint = metadata
    ? `\nSTATEMENT METADATA (already determined by an earlier extraction pass — trust these):
- statement_type: ${metadata.statement_type}
- bank_name: ${metadata.bank_name || 'unknown'}
- base_currency: ${metadata.base_currency || 'unknown'}
- debit_credit_rule: ${metadata.debit_credit_rule || 'derive from columns'}
- column_semantics: ${metadata.column_semantics || 'derive from data'}
`
    : '';

  return `You are a financial data extraction specialist. Extract ONLY transaction rows from the provided bank or credit card statement text.
${metaHint}
CRITICAL — Identifying Debit vs Credit:
Different banks use different formats to indicate debit (money out) and credit (money in). You MUST correctly identify the transaction direction by recognising ALL of these common patterns:
- Separate columns: "Withdrawal Amount" / "Deposit Amount", or "Debit" / "Credit" columns — amount appears in one column, the other is empty or zero.
- Dr/Cr suffix or column: Amount followed by "Dr" or "DR" = debit (money out). Amount followed by "Cr" or "CR" = credit (money in). A separate "Dr/Cr" column may indicate direction.
- Sign-based: Negative amounts (-) or amounts with a minus sign = debit (money out). Positive amounts (+) = credit (money in). Some banks reverse this — use context clues like column headers.
- Single amount column with type indicator: A "Transaction Type" or "Type" column with values like "Debit"/"Credit", "DR"/"CR", "D"/"C", "Purchase"/"Refund", "Payment"/"Receipt".
- Credit card statements: ALL purchases, fees, charges, and EMIs are DEBIT (is_debit=true). Only entries explicitly marked as "Payment", "Refund", "Reversal", "Cashback", "AUTOPAY", or prefixed with "+" are CREDIT (is_debit=false). On HDFC and similar Indian bank credit card statements, "C" before an amount is a CURRENCY MARKER (like ₹), NOT a credit indicator. "C 3,130.00" = purchase (debit). "+ C 299.00" = refund/credit. The "+" sign is the ONLY reliable credit indicator.
- Balance column clues: If a running balance column exists, compare consecutive balances — if balance decreased, the transaction is debit; if increased, it is credit. Always include the balance in the output when visible.
- REWARDS column: Some credit card statements have a REWARDS/POINTS column with +/- numbers. These are reward points, NOT amounts. Do NOT use the rewards column to determine debit/credit direction. Only use the AMOUNT column.
- Strong credit keywords: "REFUND", "REVERSAL", "CASHBACK", "PAYMENT RECEIVED", "INTEREST CREDIT", "DIVIDEND", "SALARY", "REIMBURSEMENT" — when any of these appear, the transaction is almost always credit (is_debit=false), even on a credit card statement.
If the format includes a hint from the client (e.g. "FORMAT_HINT: ..."), use it to confirm your interpretation.

${FEW_SHOT_EXAMPLES}

Rules:
1. Discard everything that is not a transaction: account details, opening/closing balances, bank headers, footers, interest summaries, promotional content.
2. For each transaction return these text fields with the following STRICT meanings:
   • raw_description — the entire original narration cell, verbatim, preserving codes, reference numbers, channel prefixes (UPI-, POS-, NEFT-, IMPS-, REF-, etc.) and all details. Do NOT clean or trim it.
   • merchant_name — the BRAND or counterparty. REQUIRED whenever a brand or counterparty is identifiable. Proper-cased, max 40 chars. Strip channel prefixes, UPI handles (e.g. user@bank), order/reference IDs, and corporate suffixes (Pvt, Ltd, Limited, Inc, Corp, Co.). Examples: "Swiggy", "Amazon", "Blue Tokai", "Uber", "Acme Corp", "Airtel". For credit card BILL PAYMENTS use the issuing-bank name as the merchant — e.g. "HDFC CC", "ICICI Card". Only omit merchant_name when truly no counterparty exists (e.g. bank interest credit, ATM cash withdrawal, generic charge).
   • description — a short HUMAN-READABLE PHRASE describing WHAT the transaction is, NOT a copy of the merchant. Max 60 chars. Use the narration's purpose/context if present ("Pour-over + croissant", "May payroll", "Indiranagar → office", "Returned headphones", "May internet bill"). If nothing distinct exists beyond the merchant, set description to a short type label appropriate to the payment_mode: "UPI payment", "Card purchase", "POS purchase", "NEFT transfer", "IMPS transfer", "Auto-debit", "Cash withdrawal", "Refund", "Salary credit", "Interest credit", "Bill payment". NEVER duplicate the merchant_name verbatim into description.
3. Also return: date (ISO format YYYY-MM-DD), raw_amount_text (the amount cell text exactly as it appeared, INCLUDING any sign, currency marker, or Dr/Cr suffix — used for client-side validation), amount (always a positive number regardless of direction), is_debit (boolean: true = money out / expense / withdrawal / purchase, false = money in / credit / deposit / refund / salary), reference_number (if present), balance (the running balance after this transaction, if visible in the source — number only, omit if not visible).
4. CONSISTENCY: when the same merchant appears in MULTIPLE rows of this chunk, use the IDENTICAL merchant_name string for every row (same casing, same spelling). Don't return "Swiggy" on one row and "SWIGGY" or "Swiggy Limited" on the next.
5. For DEBIT transactions (is_debit=true), assign the best category from this allowed list ONLY: ${debitCats.join(', ')}.
6. For CREDIT transactions (is_debit=false), assign the best category from this allowed list ONLY: ${creditCats.join(', ')}. NEVER use a debit category for a credit transaction — if no credit category fits, use "Other Income".
7. Set confidence (0.0 to 1.0) for your category choice. Use >0.85 only when the merchant clearly matches the category. For ambiguous/unknown merchants, set confidence ≤ 0.6 so the user reviews it.
8. Detect the currency used in this specific transaction. Look for currency symbols (₹, $, €, £, د.إ, S$, A$, C$, ¥, ﷼), ISO codes (INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, SAR), or context. Include a "currency" field (ISO 3-letter code) on each transaction. If you cannot determine the currency, omit the field.
9. Suggest internal-transfer candidates: set "is_likely_transfer" to true for transactions that look like money moving between the user's own accounts. This is a SUGGESTION ONLY — the user will review it. Examples: NEFT/IMPS/UPI transfers to/from self, credit card bill payments (AUTOPAY, CC BILL PAY), fixed/recurring deposit transfers, wallet top-ups (Paytm, PhonePe, Amazon Pay), loan EMI debits, mutual fund SIP purchases, and payment-received entries on credit card statements. When unsure, set to false.
10. Detect payment mode for each transaction. Set "payment_mode" to one of: "UPI", "Credit Card", "Debit Card", "Online", "Cash", "Other". Detection rules: UPI keywords (UPI, PhonePe, GPay, Google Pay, Paytm, BHIM) → "UPI". NEFT, RTGS, IMPS, net banking, ECS, NACH, wire transfer → "Online". POS, swipe, tap, contactless on a savings/current account statement → "Debit Card". Any transaction on a credit card statement → "Credit Card". ATM withdrawal, cash → "Cash". If unsure, omit the field.
11. Detect the bank or financial institution name that issued this statement. Look for it in headers, footers, account details, or logos. Return it as "bank_name" on each transaction. Use a short, recognizable name (e.g. "HDFC Bank" not "HDFC Bank Limited"). If you cannot determine the bank, omit the field.
12. If the response_schema is supplied, conform to it strictly. Otherwise, return a raw JSON array only.`;
}

// ── Metadata-extraction prompt (cheap first pass) ──
const METADATA_INSTRUCTION = `You are a bank statement classifier. Read the supplied text (which is the first 1-2 pages of a statement) and output ONLY the following JSON object — no transactions, no markdown:

{
  "statement_type": "credit_card" | "bank" | "wallet" | "unknown",
  "bank_name": "<short bank/issuer name, or null>",
  "base_currency": "<ISO 3-letter code, or null>",
  "debit_credit_rule": "<one short sentence describing how to tell debits from credits in this statement format>",
  "column_semantics": "<one short sentence describing column meanings if recognisable>"
}

Look at headers, account-detail lines, column names, and the first few rows. Output strict JSON conforming to the schema. If unknown, use null (not omitted).`;

// ── Emoji-suggestion prompt (existing mode, unchanged behaviour) ──
const EMOJI_INSTRUCTION = `You are an emoji expert. For each category name provided, suggest the single best emoji that visually represents that category. Return a JSON object where each key is the category name and the value is a single emoji character. No markdown, no explanation. Response must start with { and end with }.`;

// ── Type-safe metadata shape ──
interface StatementMetadata {
  statement_type: 'credit_card' | 'bank' | 'wallet' | 'unknown';
  bank_name: string | null;
  base_currency: string | null;
  debit_credit_rule: string | null;
  column_semantics: string | null;
}

// ── Gemini structured-output schema for transactions ──
function buildTransactionSchema(debitCats: string[], creditCats: string[]) {
  const allCategories = [...new Set([...debitCats, ...creditCats])];
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        description: { type: 'string' },
        raw_description: { type: 'string', nullable: true },
        raw_amount_text: { type: 'string', nullable: true },
        merchant_name: { type: 'string', nullable: true },
        amount: { type: 'number' },
        is_debit: { type: 'boolean' },
        category: { type: 'string', enum: allCategories },
        confidence: { type: 'number' },
        currency: { type: 'string', nullable: true },
        is_likely_transfer: { type: 'boolean' },
        payment_mode: {
          type: 'string',
          nullable: true,
          enum: ['UPI', 'Credit Card', 'Debit Card', 'Online', 'Cash', 'Other'],
        },
        bank_name: { type: 'string', nullable: true },
        reference_number: { type: 'string', nullable: true },
        balance: { type: 'number', nullable: true },
      },
      required: ['date', 'description', 'amount', 'is_debit', 'category', 'confidence'],
    },
  };
}

const METADATA_SCHEMA = {
  type: 'object',
  properties: {
    statement_type: { type: 'string', enum: ['credit_card', 'bank', 'wallet', 'unknown'] },
    bank_name: { type: 'string', nullable: true },
    base_currency: { type: 'string', nullable: true },
    debit_credit_rule: { type: 'string', nullable: true },
    column_semantics: { type: 'string', nullable: true },
  },
  required: ['statement_type'],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth check: only allow authenticated users to invoke Gemini ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supa.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }


  try {
    const body = await req.json();
    const { mode } = body;

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Mode: emoji suggestions (existing) ──
    if (mode === 'suggest-emojis') {
      const { categoryNames } = body;
      if (!Array.isArray(categoryNames) || categoryNames.length === 0) {
        return new Response(JSON.stringify({ emojis: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const geminiBody = {
        system_instruction: { parts: [{ text: EMOJI_INSTRUCTION }] },
        contents: [{ parts: [{ text: `Suggest emojis for these categories:\n${categoryNames.join('\n')}` }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };

      const geminiRes = await fetchGemini(geminiBody, 20_000);

      if (!geminiRes.ok) {
        const err = await geminiRes.text();
        return new Response(JSON.stringify({ error: `Gemini API error: ${err}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const cleaned = rawText.replace(/```json|```/gi, '').trim();
      const emojis = JSON.parse(cleaned);

      return new Response(JSON.stringify({ emojis }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Mode: metadata extraction (cheap first pass) ──
    if (mode === 'metadata') {
      const { extractedText } = body;
      if (!extractedText || typeof extractedText !== 'string') {
        return new Response(JSON.stringify({ error: 'extractedText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const geminiBody = {
        system_instruction: { parts: [{ text: METADATA_INSTRUCTION }] },
        contents: [{ parts: [{ text: `Classify this statement excerpt:\n\n${extractedText.slice(0, 8000)}` }] }],
        generationConfig: {
          temperature: 0.0,
          responseMimeType: 'application/json',
          responseSchema: METADATA_SCHEMA,
          maxOutputTokens: 1024,
          // Disable Gemini 2.5 Flash "thinking" tokens — they silently eat the
          // output budget and often leave structured-output workflows with
          // zero tokens to emit the actual JSON.
          thinkingConfig: { thinkingBudget: 0 },
        },
      };

      let geminiRes: Response;
      try {
        geminiRes = await fetchGemini(geminiBody, 20_000);
      } catch (e) {
        console.error('Metadata extraction timed out:', e);
        return quickJson({ metadata: { statement_type: 'unknown', bank_name: null, base_currency: null, debit_credit_rule: null, column_semantics: null } });
      }

      if (!geminiRes.ok) {
        // Metadata is an optional priming pass — never hard-fail the upload over it.
        // On rate-limit (429) or any Gemini error, degrade to "unknown" so the parse
        // pass still runs (and the client doesn't see a scary 502 for an optional call).
        const err = await geminiRes.text();
        console.warn(`Metadata Gemini call failed (HTTP ${geminiRes.status}): ${err.slice(0, 150)}`);
        return quickJson({ metadata: { statement_type: 'unknown', bank_name: null, base_currency: null, debit_credit_rule: null, column_semantics: null } });
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const cleaned = rawText.replace(/```json|```/gi, '').trim();
      const metadata: StatementMetadata = JSON.parse(cleaned);

      return new Response(JSON.stringify({ metadata }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Default mode: parse statement transactions ──
    const { extractedText, formatHint, learnedMappings, allowedDebitCategories, allowedCreditCategories, statementMetadata } = body;
    if (!extractedText || typeof extractedText !== 'string') {
      return new Response(JSON.stringify({ error: 'extractedText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build category enums: use client-provided lists if available, else defaults
    const debitCats = Array.isArray(allowedDebitCategories) && allowedDebitCategories.length > 0
      ? allowedDebitCategories
      : DEFAULT_DEBIT_CATEGORIES;
    const creditCats = Array.isArray(allowedCreditCategories) && allowedCreditCategories.length > 0
      ? allowedCreditCategories
      : DEFAULT_CREDIT_CATEGORIES;

    // Build learned context hint for Gemini if mappings are provided
    let learnedHint = '';
    if (Array.isArray(learnedMappings) && learnedMappings.length > 0) {
      const examples = learnedMappings
        .slice(0, 50)
        .map((m: { description: string; category: string; count: number }) =>
          `"${m.description}" → ${m.category} (used ${m.count}x)`
        )
        .join('\n');
      learnedHint = `\n\nUSER CATEGORY PREFERENCES (from past corrections — prioritise these over your own judgement when the description matches or is very similar):\n${examples}\n`;
    }

    const systemInstruction = buildSystemInstruction(debitCats, creditCats, statementMetadata);
    const transactionSchema = buildTransactionSchema(debitCats, creditCats);

    // ── Chunk extractedText to avoid the 150s edge-function idle timeout ──
    // Gemini 2.5 Flash has a huge context window, so we keep chunks LARGE: a
    // typical statement (a few pages) then fits in a SINGLE Gemini call, which
    // matters most on the free tier where requests-per-minute is the binding
    // limit. Only genuinely long statements split, and even then chunks run
    // SERIALLY (concurrency 1) so we never burst past the free-tier RPM cap.
    // Adjacent chunks overlap by ~200 chars so any transaction landing on a seam
    // appears in both; a server-side dedupe pass drops the duplicate.
    const CHUNK_CHAR_LIMIT = 25_000;
    const CHUNK_OVERLAP = 200;
    const PER_CALL_TIMEOUT_MS = 45_000;
    const CONCURRENCY = 1;
    const MAX_CHUNK_ATTEMPTS = 4;
    const RESPONSE_DEADLINE_MS = 125_000;
    const START_DEADLINE_MS = RESPONSE_DEADLINE_MS - PER_CALL_TIMEOUT_MS - 5_000;
    const startedAt = Date.now();
    const chunkControllers = new Set<AbortController>();

    function chunkByLines(text: string, limit: number, overlap: number): string[] {
      const lines = text.split('\n');
      const base: string[] = [];
      let current = '';
      for (const line of lines) {
        if (current.length + line.length + 1 > limit && current.length > 0) {
          base.push(current);
          current = '';
        }
        current += (current ? '\n' : '') + line;
      }
      if (current) base.push(current);
      if (base.length === 0) return [text];
      if (overlap <= 0 || base.length === 1) return base;

      // Prepend the trailing `overlap` chars of chunk i-1 (snapped to line boundary) to chunk i.
      const withOverlap: string[] = [base[0]];
      for (let i = 1; i < base.length; i++) {
        const prev = base[i - 1];
        const tail = prev.length > overlap ? prev.slice(prev.length - overlap) : prev;
        // Snap to line boundary so we don't ship a half line as context.
        const nlIdx = tail.indexOf('\n');
        const snapped = nlIdx === -1 ? tail : tail.slice(nlIdx + 1);
        withOverlap.push((snapped ? snapped + '\n' : '') + base[i]);
      }
      return withOverlap;
    }

    const chunks = extractedText.length > CHUNK_CHAR_LIMIT
      ? chunkByLines(extractedText, CHUNK_CHAR_LIMIT, CHUNK_OVERLAP)
      : [extractedText];

    const allowedSet = new Set([...debitCats, ...creditCats]);
    const fallbackDebit = debitCats.includes('Miscellaneous') ? 'Miscellaneous' : debitCats[debitCats.length - 1];
    const fallbackCredit = creditCats.includes('Other Income') ? 'Other Income' : creditCats[creditCats.length - 1];

    type ChunkResult = { index: number; ok: true; transactions: any[] } | { index: number; ok: false; error: string };

    async function processChunk(chunkText: string, i: number, n: number): Promise<ChunkResult> {
      const chunkLabel = n > 1 ? `CHUNK ${i + 1} of ${n} — extract transactions in this slice only.\n\n` : '';
      const userPrompt = [
        formatHint ? `FORMAT_HINT: ${formatHint}\n` : '',
        learnedHint,
        `${chunkLabel}Parse this statement:\n\n${chunkText}`,
      ].filter(Boolean).join('\n');

      const geminiBody = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: transactionSchema,
          // 32k output tokens easily covers 100+ structured transactions
          // (~120 tokens each) with headroom for the verbose schema.
          maxOutputTokens: 32_768,
          // Disable Gemini 2.5 Flash "thinking" tokens. With thinking on, the
          // model spends most of its output budget on invisible reasoning and
          // often returns empty or truncated JSON for moderately sized inputs.
          // Disabling makes structured output reliable AND faster.
          thinkingConfig: { thinkingBudget: 0 },
        },
      };

      // Each chunk owns its own retry/backoff loop so a transient Gemini hiccup
      // (free-tier 429, 5xx, malformed JSON) self-heals without the caller firing
      // a second full request. On 429 we honour Gemini's suggested retryDelay.
      let lastError = `Gemini request failed on chunk ${i + 1}/${n}`;

      for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
        if (Date.now() - startedAt > START_DEADLINE_MS) {
          return { index: i, ok: false, error: `Chunk ${i + 1}/${n} skipped: response deadline reached` };
        }

        const t0 = Date.now();
        let geminiRes: Response;
        const controller = new AbortController();
        chunkControllers.add(controller);
        const timeoutId = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
        try {
          geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody),
            signal: controller.signal,
          });
        } catch (e) {
          console.error(`Gemini fetch failed on chunk ${i + 1}/${n} after ${Date.now() - t0}ms (attempt ${attempt}):`, e);
          lastError = `Gemini request timed out on chunk ${i + 1}/${n}`;
          if (attempt < MAX_CHUNK_ATTEMPTS) { await sleep(1_000 * attempt); continue; }
          return { index: i, ok: false, error: lastError };
        } finally {
          clearTimeout(timeoutId);
          chunkControllers.delete(controller);
        }

        // ── Rate limited (free-tier RPM): wait the suggested delay and retry ──
        if (geminiRes.status === 429) {
          const errText = await geminiRes.text();
          const suggested = parseRetryDelayMs(geminiRes, errText);
          const wait = suggested || Math.min(2_000 * 2 ** (attempt - 1), 20_000); // 2s,4s,8s,16s
          const budgetLeft = START_DEADLINE_MS - (Date.now() - startedAt);
          console.warn(`Chunk ${i + 1}/${n}: HTTP 429 (attempt ${attempt}); backing off ${wait}ms`);
          if (attempt < MAX_CHUNK_ATTEMPTS && wait + 2_000 < budgetLeft) {
            await sleep(wait);
            continue;
          }
          return { index: i, ok: false, error: `RATE_LIMITED: Gemini free-tier rate limit hit on chunk ${i + 1}/${n}` };
        }

        if (!geminiRes.ok) {
          const err = await geminiRes.text();
          console.error(`Gemini API error on chunk ${i + 1}/${n}: HTTP ${geminiRes.status} ${err.slice(0, 200)}`);
          lastError = `Gemini API error on chunk ${i + 1}/${n}: HTTP ${geminiRes.status}`;
          // Retry transient server errors (5xx); client errors (4xx) are terminal.
          if (geminiRes.status >= 500 && attempt < MAX_CHUNK_ATTEMPTS) { await sleep(1_500 * attempt); continue; }
          return { index: i, ok: false, error: lastError };
        }

        const geminiData = await geminiRes.json();
        const finishReason = geminiData.candidates?.[0]?.finishReason;
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const cleaned = rawText.replace(/```json|```/gi, '').trim();

        // If Gemini hit a stop condition that aborted output (token budget, safety,
        // recitation, etc.), retry once more if we still have budget.
        if (!cleaned && finishReason && finishReason !== 'STOP') {
          console.error(`Chunk ${i + 1}/${n}: Gemini stopped with finishReason=${finishReason}, no text returned (attempt ${attempt})`);
          lastError = `Gemini stopped early on chunk ${i + 1}/${n} (${finishReason})`;
          if (attempt < MAX_CHUNK_ATTEMPTS) { await sleep(1_000); continue; }
          return { index: i, ok: false, error: lastError };
        }

        let transactions: any[];
        try {
          transactions = JSON.parse(cleaned || '[]');
        } catch (parseErr) {
          const match = cleaned.match(/\[[\s\S]*\]/);
          try {
            transactions = match ? JSON.parse(match[0]) : [];
          } catch {
            console.error(`Chunk ${i + 1}/${n}: JSON.parse failed (finishReason=${finishReason}, len=${cleaned.length}, head=${cleaned.slice(0, 120)})`, parseErr);
            lastError = `Gemini returned malformed JSON on chunk ${i + 1}/${n}`;
            if (attempt < MAX_CHUNK_ATTEMPTS) { await sleep(1_000); continue; }
            return { index: i, ok: false, error: lastError };
          }
        }

        transactions = transactions.map((t: any) => {
          if (typeof t?.category !== 'string' || !allowedSet.has(t.category)) {
            t.category = t?.is_debit ? fallbackDebit : fallbackCredit;
            t.confidence = Math.min(t?.confidence ?? 0.5, 0.5);
          }
          return t;
        });
        console.log(`Chunk ${i + 1}/${n}: ${transactions.length} txns in ${Date.now() - t0}ms (attempt ${attempt})`);
        return { index: i, ok: true, transactions };
      }

      return { index: i, ok: false, error: lastError };
    }

    // ── Bounded-concurrency runner: at most CONCURRENCY chunks in flight. ──
    async function runWithConcurrency(items: string[], limit: number): Promise<ChunkResult[]> {
      const results: ChunkResult[] = new Array(items.length);
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          if (Date.now() - startedAt > START_DEADLINE_MS) {
            results[idx] = { index: idx, ok: false, error: `Chunk ${idx + 1}/${items.length} skipped: response deadline reached` };
            continue;
          }
          // processChunk owns its own retry/backoff (incl. 429 handling), so the
          // pool dispatches each chunk exactly once.
          results[idx] = await processChunk(items[idx], idx, items.length);
        }
      };
      const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
      let deadlineTimer: number | undefined;
      const deadline = new Promise<void>((resolve) => {
        deadlineTimer = setTimeout(() => {
          for (const controller of chunkControllers) controller.abort();
          resolve();
        }, RESPONSE_DEADLINE_MS);
      });
      await Promise.race([Promise.all(workers), deadline]);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      return results.map((result, idx) => result ?? {
        index: idx,
        ok: false,
        error: `Chunk ${idx + 1}/${items.length} skipped: response deadline reached`,
      });
    }

    const chunkResults = await runWithConcurrency(chunks, CONCURRENCY);

    // ── Merge in chunk order, collect warnings for failed chunks. ──
    const merged: any[] = [];
    const warnings: string[] = [];
    let successCount = 0;
    for (const r of chunkResults) {
      if (r.ok) {
        merged.push(...r.transactions);
        successCount++;
      } else {
        warnings.push(r.error);
      }
    }

    // If every chunk failed, decide how to surface it. A rate-limit needs a clear,
    // actionable message — but supabase-js only exposes the response BODY on a 2xx
    // status (non-2xx collapses to a generic "non-2xx" error). So for the rate-limit
    // case we return 200 with a `rateLimited` flag the client can read and act on.
    if (chunks.length > 0 && successCount === 0) {
      const rateLimited = warnings.some((w) => w.startsWith('RATE_LIMITED:'));
      if (rateLimited) {
        return quickJson({
          transactions: [],
          rateLimited: true,
          error: 'Gemini free-tier rate limit reached. Please wait about a minute and try again.',
          warnings,
        });
      }
      return new Response(
        JSON.stringify({ error: warnings[0] || 'All chunks failed to parse.', warnings }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Server-side dedupe: drop exact duplicates surfaced by chunk overlap. ──
    const seen = new Set<string>();
    const deduped: any[] = [];
    let droppedDupes = 0;
    for (const t of merged) {
      const dedupeKey = [
        t?.date ?? '',
        String(t?.amount ?? ''),
        String(t?.is_debit ?? ''),
        String(t?.raw_description ?? t?.description ?? '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim(),
      ].join('|');
      if (seen.has(dedupeKey)) {
        droppedDupes++;
        continue;
      }
      seen.add(dedupeKey);
      deduped.push(t);
    }
    if (droppedDupes > 0) {
      console.log(`Deduped ${droppedDupes} cross-chunk duplicate transactions`);
    }

    const responseBody: { transactions: any[]; warnings?: string[] } = { transactions: deduped };
    if (warnings.length > 0) responseBody.warnings = warnings;

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
