import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_INSTRUCTION = `You are a financial data extraction specialist. Extract ONLY transaction rows from the provided bank or credit card statement text.

CRITICAL — Identifying Debit vs Credit:
Different banks use different formats to indicate debit (money out) and credit (money in). You MUST correctly identify the transaction direction by recognising ALL of these common patterns:
- Separate columns: "Withdrawal Amount" / "Deposit Amount", or "Debit" / "Credit" columns — amount appears in one column, the other is empty or zero.
- Dr/Cr suffix or column: Amount followed by "Dr" or "DR" = debit (money out). Amount followed by "Cr" or "CR" = credit (money in). A separate "Dr/Cr" column may indicate direction.
- Sign-based: Negative amounts (-) or amounts with a minus sign = debit (money out). Positive amounts (+) = credit (money in). Some banks reverse this — use context clues like column headers.
- Single amount column with type indicator: A "Transaction Type" or "Type" column with values like "Debit"/"Credit", "DR"/"CR", "D"/"C", "Purchase"/"Refund", "Payment"/"Receipt".
- Credit card statements: "Payment" or "Credit" entries are money in (is_debit=false). Purchases and fees are money out (is_debit=true).
- Balance column clues: If a running balance column exists, compare consecutive balances — if balance decreased, the transaction is debit; if increased, it is credit.
If the format includes a hint from the client (e.g. "FORMAT_HINT: ..."), use it to confirm your interpretation.

Rules:
1. Discard everything that is not a transaction: account details, opening/closing balances, bank headers, footers, interest summaries, promotional content.
2. For each transaction return: date (ISO format YYYY-MM-DD), description (clean payee name), raw_description (the entire original description text exactly as it appears in the statement, preserving all details, codes, and reference info), merchant_name (if identifiable separately), amount (always a positive number regardless of direction), is_debit (boolean: true = money out / expense / withdrawal / purchase, false = money in / credit / deposit / refund / salary), reference_number (if present).
3. For DEBIT transactions (is_debit=true), assign the best category from: Food & Dining, Groceries, Transport, Fuel, Shopping, Entertainment, Travel, Healthcare, Utilities, Rent, Education, Personal Care, Subscriptions, EMI/Loan, Insurance, Investments, Gifts & Donations, Office & Business, Miscellaneous
4. For CREDIT transactions (is_debit=false), assign the best category from: Salary / Income, Refund, Reimbursement, Cashback / Reward, Interest Earned, Other Income. If none of these fit, you may use a debit category.
5. Set confidence (0.0 to 1.0) for your category choice. Only use >0.85 when you are very certain.
6. Detect the currency used in the statement. Look for currency symbols (₹, $, €, £, د.إ, S$, A$, C$, ¥, ﷼), ISO codes (INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, SAR), or bank country context. Include a "currency" field (ISO 3-letter code) on each transaction. If you cannot determine the currency, omit the field.
7. Return a raw JSON array only. No markdown fences, no explanation. Response must start with [ and end with ].`;

const EMOJI_INSTRUCTION = `You are an emoji expert. For each category name provided, suggest the single best emoji that visually represents that category. Return a JSON object where each key is the category name and the value is a single emoji character. No markdown, no explanation. Response must start with { and end with }.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode } = body;

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mode: suggest-emojis — returns { categoryName: emoji } mapping
    if (mode === 'suggest-emojis') {
      const { categoryNames } = body;
      if (!Array.isArray(categoryNames) || categoryNames.length === 0) {
        return new Response(JSON.stringify({ emojis: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const geminiBody = {
        system_instruction: { parts: [{ text: EMOJI_INSTRUCTION }] },
        contents: [{ parts: [{ text: `Suggest emojis for these categories:\n${categoryNames.join('\n')}` }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      };

      const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });

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

    // Default mode: parse statement
    const { extractedText, formatHint } = body;
    if (!extractedText || typeof extractedText !== 'string') {
      return new Response(JSON.stringify({ error: 'extractedText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: `${formatHint ? `FORMAT_HINT: ${formatHint}\n\n` : ''}Parse this statement:\n\n${extractedText}` }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return new Response(JSON.stringify({ error: `Gemini API error: ${err}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const cleaned = rawText.replace(/```json|```/gi, '').trim();
    const transactions = JSON.parse(cleaned);

    return new Response(JSON.stringify({ transactions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
