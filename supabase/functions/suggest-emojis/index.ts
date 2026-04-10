import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Curated Phosphor icon names the model must choose from
const VALID_ICONS = [
  'ForkKnife','Coffee','Wine','BeerStein','IceCream','Cookie','Cake','BowlFood',
  'Car','Airplane','Train','Bus','Bicycle','Boat',
  'ShoppingCart','ShoppingBag','Package','Tag','Storefront',
  'House','Wrench','Lamp','Bed','Door','Armchair',
  'FirstAidKit','Pill','Heartbeat','Hospital','Stethoscope','Tooth',
  'GameController','FilmSlate','MusicNote','Television','Ticket','Books','Confetti',
  'CreditCard','Bank','Wallet','Coins','PiggyBank','ChartLine','Receipt','HandCoins','Money',
  'GraduationCap','BookOpen','PencilSimple',
  'Barbell','PersonSimpleRun',
  'Drop','Scissors','Leaf','Sparkle','Shower',
  'PawPrint','Dog','Cat','Bird',
  'MapPin','Compass','Suitcase','Globe','Camera',
  'Lightning','Phone','WifiHigh','Laptop','Desktop','DeviceMobile',
  'Baby',
  'Gift','Heart','Star',
  'Briefcase','Clipboard','Printer',
  'TShirt','Sneaker','Watch',
  'Bell','Repeat','Play',
  'TrendUp','ArrowsClockwise',
  'Gear','Hammer','Sun','Moon','Umbrella','Flame','ChartBar','Robot','Flask',
];

const SYSTEM_INSTRUCTION = `You are a category icon suggestion specialist for an expense tracker app.
Given a category name, suggest exactly 3 icon names that best represent that category.

You MUST only choose from this list of valid icon names:
${VALID_ICONS.join(', ')}

Rules:
1. Return exactly 3 icon names from the list above, ordered from best to least match.
2. All 3 must be different.
3. Return ONLY a JSON array of 3 strings. No markdown, no explanation.
4. Example for "Food & Dining": ["ForkKnife","Coffee","BowlFood"]
5. Example for "Pets & Animals": ["PawPrint","Dog","Cat"]
6. Example for "Salary / Income": ["HandCoins","TrendUp","Wallet"]`;

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
      contents: [{ parts: [{ text: `Suggest 3 icons for this expense category: "${categoryName}"` }] }],
      generationConfig: {
        temperature: 0.2,
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
      console.error('Gemini API error:', geminiRes.status, err);
      // Return safe defaults instead of failing the client
      const defaults = ['Tag', 'Wallet', 'Star'];
      return new Response(JSON.stringify({ icons: defaults, emojis: defaults, fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const cleaned = rawText.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate — ensure all returned values are actually in our list
    const icons: string[] = Array.isArray(parsed)
      ? parsed.filter((v: unknown) => typeof v === 'string' && VALID_ICONS.includes(v)).slice(0, 3)
      : [];

    // Fill with safe defaults if needed
    const defaults = ['Tag', 'Wallet', 'Star'];
    for (const d of defaults) {
      if (icons.length >= 3) break;
      if (!icons.includes(d)) icons.push(d);
    }

    // Return as { icons } — also kept as { emojis } for older client compat
    return new Response(JSON.stringify({ icons, emojis: icons }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
