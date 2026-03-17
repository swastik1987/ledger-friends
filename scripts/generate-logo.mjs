/**
 * Generate ExpenseSync logo using Gemini Imagen API
 * Usage: node scripts/generate-logo.mjs <GEMINI_API_KEY>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const API_KEY = process.argv[2];
if (!API_KEY) {
  console.error('Usage: node scripts/generate-logo.mjs <GEMINI_API_KEY>');
  process.exit(1);
}

const PROMPT = `Design a modern, professional app icon logo for "ExpenseSync" — a collaborative expense tracking app.

Style requirements:
- Clean, minimal, modern fintech aesthetic
- Primary color: indigo (#4F46E5) as the dominant color
- Secondary accents: white and light indigo (#EEF2FF)
- Inspired by: circular sync/refresh arrows wrapping around a rising bar chart with a currency symbol
- The icon should work at small sizes (app icon) — no text in the icon itself
- Solid indigo background with white/light design elements
- Rounded square shape (like iOS app icons)
- Professional, trustworthy, modern feel
- No gradients to other colors — stay within the indigo/white palette
- High contrast for visibility at 192px and 512px sizes`;

async function generateWithImagen() {
  console.log('Trying Imagen 4.0...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: PROMPT }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Imagen API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image data in Imagen response');
  return Buffer.from(b64, 'base64');
}

async function generateWithGeminiFlash() {
  console.log('Trying Gemini 2.5 Flash image generation...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini Flash API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) throw new Error('No image in Gemini Flash response');
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

async function main() {
  let imageBuffer;

  // Try Imagen 3 first, fall back to Gemini Flash
  try {
    imageBuffer = await generateWithImagen();
    console.log('Generated with Imagen 3');
  } catch (e) {
    console.log(`Imagen failed: ${e.message}`);
    try {
      imageBuffer = await generateWithGeminiFlash();
      console.log('Generated with Gemini Flash');
    } catch (e2) {
      console.error(`Gemini Flash also failed: ${e2.message}`);
      process.exit(1);
    }
  }

  // Save the full-size logo
  const logoPath = path.join(PUBLIC_DIR, 'logo-512.png');
  fs.writeFileSync(logoPath, imageBuffer);
  console.log(`Saved: ${logoPath} (${imageBuffer.length} bytes)`);

  // Also save as PWA icons (same file for now — browser will resize)
  fs.copyFileSync(logoPath, path.join(PUBLIC_DIR, 'pwa-512x512.png'));
  fs.copyFileSync(logoPath, path.join(PUBLIC_DIR, 'pwa-192x192.png'));
  console.log('Copied to pwa-512x512.png and pwa-192x192.png');

  console.log('\nDone! Logo generated and saved to public/');
}

main();
