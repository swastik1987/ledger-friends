import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
- Credit card statements: ALL purchases, fees, charges, and EMIs are DEBIT (is_debit=true, money spent). Only entries explicitly marked as "Payment", "Refund", "Reversal", "Cashback", "AUTOPAY", or prefixed with "+" are CREDIT (is_debit=false, money returned/paid to card). On HDFC and similar Indian bank credit card statements, "C" before an amount is a CURRENCY MARKER (like ₹), NOT a credit indicator. "C 3,130.00" = purchase (debit). "+ C 299.00" = refund/credit. The "+" sign is the ONLY reliable credit indicator.
- Balance column clues: If a running balance column exists, compare consecutive balances — if balance decreased, the transaction is debit; if increased, it is credit.
- REWARDS column: Some credit card statements have a REWARDS/POINTS column with +/- numbers. These are reward points, NOT amounts. Do NOT use the rewards column to determine debit/credit direction. Only use the AMOUNT column.
If the format includes a hint from the client (e.g. "FORMAT_HINT: ..."), use it to confirm your interpretation.

Rules:
1. Discard everything that is not a transaction: account details, opening/closing balances, bank headers, footers, interest summaries, promotional content.
2. For each transaction return: date (ISO format YYYY-MM-DD), description (clean payee name), raw_description (the entire original description text exactly as it appears in the statement, preserving all details, codes, and reference info), merchant_name (if identifiable separately), amount (always a positive number regardless of direction), is_debit (boolean: true = money out / expense / withdrawal / purchase, false = money in / credit / deposit / refund / salary), reference_number (if present).
3. For DEBIT transactions (is_debit=true), assign the best category from: Food & Dining, Groceries, Transport, Fuel, Shopping, Entertainment, Travel, Healthcare, Utilities, Rent, Education, Personal Care, Subscriptions, EMI/Loan, Insurance, Investments, Gifts & Donations, Office & Business, Miscellaneous
4. For CREDIT transactions (is_debit=false), assign the best category from: Salary / Income, Refund, Reimbursement, Cashback / Reward, Interest Earned, Other Income. If none of these fit, you may use a debit category.
5. Set confidence (0.0 to 1.0) for your category choice. Only use >0.85 when you are very certain.
6. Detect the currency used in the statement. Look for currency symbols (₹, $, €, £, د.إ, S$, A$, C$, ¥, ﷼), ISO codes (INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, SAR), or bank country context. Include a "currency" field (ISO 3-letter code) on each transaction. If you cannot determine the currency, omit the field.
7. Flag internal transfers: set "is_likely_transfer" to true for transactions that appear to be internal money movements between the user's own accounts. This includes: NEFT/IMPS/UPI transfers to/from self, credit card bill payments (AUTOPAY, CC BILL PAY), fixed/recurring deposit transfers, wallet top-ups (Paytm, PhonePe, Amazon Pay), loan EMI debits, mutual fund SIP purchases, and payment-received entries on credit card statements. When unsure, set to false.
8. Return a raw JSON array only. No markdown fences, no explanation. Response must start with [ and end with ].`;

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
    const { extractedText, formatHint, learnedMappings } = body;
    if (!extractedText || typeof extractedText !== 'string') {
      return new Response(JSON.stringify({ error: 'extractedText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build learned context hint for Gemini if mappings are provided
    let learnedHint = '';
    if (Array.isArray(learnedMappings) && learnedMappings.length > 0) {
      const examples = learnedMappings
        .slice(0, 50) // Limit to top 50 to avoid token bloat
        .map((m: { description: string; category: string; count: number }) =>
          `"${m.description}" → ${m.category} (used ${m.count}x)`
        )
        .join('\n');
      learnedHint = `\n\nUSER CATEGORY PREFERENCES (from past corrections — prioritise these over your own judgement when the description matches or is very similar):\n${examples}\n`;
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: `${formatHint ? `FORMAT_HINT: ${formatHint}\n\n` : ''}${learnedHint}Parse this statement:\n\n${extractedText}` }] }],
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
