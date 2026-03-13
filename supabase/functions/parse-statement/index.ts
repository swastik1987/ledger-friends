import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_INSTRUCTION = `You are a financial data extraction specialist. Extract ONLY transaction rows from the provided bank or credit card statement text.

Rules:
1. Discard everything that is not a transaction: account details, opening/closing balances, bank headers, footers, interest summaries, promotional content.
2. For each transaction return: date (ISO format YYYY-MM-DD), description (clean payee name), raw_description (the entire original description text exactly as it appears in the statement, preserving all details, codes, and reference info), merchant_name (if identifiable separately), amount (positive number), is_debit (true = money out, false = credit/refund), reference_number (if present).
3. Assign the best category from ONLY this list: Food & Dining, Groceries, Transport, Fuel, Shopping, Entertainment, Travel, Healthcare, Utilities, Rent, Education, Personal Care, Subscriptions, EMI/Loan, Insurance, Investments, Gifts & Donations, Office & Business, Miscellaneous
4. Set confidence (0.0 to 1.0) for your category choice. Only use >0.85 when you are very certain.
5. Return a raw JSON array only. No markdown fences, no explanation. Response must start with [ and end with ].`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { extractedText } = await req.json();
    if (!extractedText || typeof extractedText !== 'string') {
      return new Response(JSON.stringify({ error: 'extractedText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: `Parse this statement:\n\n${extractedText}` }] }],
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
