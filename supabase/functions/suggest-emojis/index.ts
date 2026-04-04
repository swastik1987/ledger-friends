import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_INSTRUCTION = `You are an emoji suggestion specialist. Given a category name for an expense tracker, suggest exactly 3 emojis that best represent that category.

Rules:
1. Return exactly 3 emojis that are visually distinct from each other.
2. The first emoji should be the most obvious/best match.
3. Choose emojis that are commonly available across all platforms (iOS, Android, Windows).
4. Return ONLY a JSON array of 3 emoji strings. No markdown, no explanation.
5. Example: for "Food & Dining" return ["🍽️","🍕","🍴"]
6. Example: for "Pets" return ["🐾","🐕","🐱"]`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryName } = await req.json();

    if (!categoryName || typeof categoryName !== 'string') {
      return new Response(JSON.stringify({ error: 'categoryName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: `Suggest 3 emojis for this expense category: "${categoryName}"` }] }],
      generationConfig: {
        temperature: 0.3,
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
      return new Response(JSON.stringify({ error: `Gemini API error: ${err}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const cleaned = rawText.replace(/```json|```/gi, '').trim();
    const emojis = JSON.parse(cleaned);

    // Ensure we always return exactly 3 strings
    const result = Array.isArray(emojis) ? emojis.slice(0, 3) : ['🏷️', '📌', '📋'];

    return new Response(JSON.stringify({ emojis: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
