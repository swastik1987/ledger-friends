import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload as UploadIcon, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories, useTracker } from '@/hooks/useTrackers';
import { useBulkCreateExpenses } from '@/hooks/useExpenses';
import { supabase } from '@/integrations/supabase/client';
import { DraftExpense, Category } from '@/types';
import { getCurrency, formatAmountShort } from '@/lib/currencies';
import Nudge from '@/components/Nudge';
import { useNudge } from '@/hooks/useNudge';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';

// ──────────────────────────────────────────────────────────────────────
// Fuzzy string similarity (Levenshtein-based, 0..1)
// ──────────────────────────────────────────────────────────────────────
function editDistance(a: string, b: string): number {
  const m: number[][] = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
  return m[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.length === 0) return 1;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

// ──────────────────────────────────────────────────────────────────────
// Bulk Excel column header detection
// ──────────────────────────────────────────────────────────────────────
const DATE_PATTERNS = /^(date|transaction[_ ]?date|txn[_ ]?date|value[_ ]?date|posting[_ ]?date)$/i;
const CATEGORY_PATTERNS = /^(category|category[_ ]?name|expense[_ ]?category|type[_ ]?category)$/i;
const DESCRIPTION_PATTERNS = /^(description|narration|details|particulars|remarks|memo)$/i;
const TYPE_PATTERNS = /^(type|transaction[_ ]?type|txn[_ ]?type|debit[/_]credit|dr[/_]cr|direction)$/i;
const AMOUNT_PATTERNS = /^(amount|total|value|sum|transaction[_ ]?amount)$/i;
const NOTES_PATTERNS = /^(notes|comments|remark|additional[_ ]?info|memo|note)$/i;
const MERCHANT_PATTERNS = /^(merchant|merchant[_ ]?name|payee|vendor|store)$/i;

interface BulkColumnMap {
  date: string;
  category: string;
  description: string;
  type: string;
  amount: string;
  notes?: string;
  merchant?: string;
}

function detectBulkUploadColumns(headers: string[]): BulkColumnMap | null {
  const map: Partial<BulkColumnMap> = {};
  for (const h of headers) {
    const trimmed = h.trim();
    if (DATE_PATTERNS.test(trimmed)) map.date = h;
    else if (CATEGORY_PATTERNS.test(trimmed)) map.category = h;
    else if (DESCRIPTION_PATTERNS.test(trimmed)) map.description = h;
    else if (TYPE_PATTERNS.test(trimmed)) map.type = h;
    else if (AMOUNT_PATTERNS.test(trimmed)) map.amount = h;
    else if (NOTES_PATTERNS.test(trimmed)) map.notes = h;
    else if (MERCHANT_PATTERNS.test(trimmed)) map.merchant = h;
  }
  // Must have at least date, category, description, type, amount
  if (map.date && map.category && map.description && map.type && map.amount) {
    return map as BulkColumnMap;
  }
  return null;
}

function parseTypeValue(val: string): boolean | null {
  const v = (val || '').toLowerCase().trim();
  if (['debit', 'dr', 'd', 'expense', 'withdrawal', 'out', 'purchase'].includes(v)) return true;
  if (['credit', 'cr', 'c', 'income', 'deposit', 'in', 'refund', 'receipt'].includes(v)) return false;
  return null; // unknown — needs review
}

function parseDateValue(val: string): string {
  if (!val) return new Date().toISOString().split('T')[0];
  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = val.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  // Try MM/DD/YYYY
  const mdyMatch = val.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mdyMatch) {
    const m = parseInt(mdyMatch[1]);
    if (m > 12) return `${mdyMatch[3]}-${mdyMatch[2].padStart(2, '0')}-${mdyMatch[1].padStart(2, '0')}`;
    return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, '0')}-${mdyMatch[2].padStart(2, '0')}`;
  }
  // Try Excel serial number
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  // Fallback: try native Date parse
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

// Pick a random preset color for new categories
const PRESET_COLORS = ['#FF6B6B', '#51CF66', '#339AF0', '#FF922B', '#CC5DE8', '#F06595', '#20C997', '#74C0FC', '#FFD43B', '#748FFC', '#A9E34B', '#FFA94D'];

/**
 * Find the best matching system/tracker category by name.
 * threshold defaults to 0.95 (95% similarity) for bulk Excel uploads.
 * Returns the matched Category or null.
 */
function findBestCategoryMatch(name: string, categories: Category[], threshold = 0.95): Category | null {
  if (!name) return null;
  let best: Category | null = null;
  let bestScore = 0;
  for (const cat of categories) {
    const score = similarity(name, cat.name);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return bestScore >= threshold ? best : null;
}

// ──────────────────────────────────────────────────────────────────────
// Bank statement format detection (existing)
// ──────────────────────────────────────────────────────────────────────
function detectFormatHint(csvText: string): string | null {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  const headerLine = lines[0].toLowerCase();
  const hints: string[] = [];

  if (/withdrawal/.test(headerLine) && /deposit/.test(headerLine)) {
    hints.push('This statement has separate "Withdrawal" and "Deposit" columns. Withdrawal = debit (money out), Deposit = credit (money in). A transaction has amount in one column and the other is empty or zero.');
  }
  if ((/debit[_ ]?(amount|amt)?/.test(headerLine) && /credit[_ ]?(amount|amt)?/.test(headerLine)) ||
      (/dr[_ ]?(amount|amt)/.test(headerLine) && /cr[_ ]?(amount|amt)/.test(headerLine))) {
    hints.push('This statement has separate "Debit Amount" and "Credit Amount" columns (may also appear as "Dr Amount"/"Cr Amount"). Amount in the Debit/Dr column = money out, amount in the Credit/Cr column = money in.');
  }
  if (/\b(dr\.?\/cr\.?|type|txn[ _]?type|transaction[ _]?type)\b/.test(headerLine)) {
    hints.push('This statement has a transaction type column. Values like "Dr", "DR", "D", "Debit", "Purchase" = debit (money out). Values like "Cr", "CR", "C", "Credit", "Refund", "Receipt" = credit (money in).');
  }
  const dataRows = lines.slice(1, Math.min(6, lines.length));
  const hasNegativeAmounts = dataRows.some(row => /,-\d|,"-?\d/.test(row));
  const hasPositiveSignAmounts = dataRows.some(row => /,\+\d/.test(row));
  if (hasNegativeAmounts || hasPositiveSignAmounts) {
    hints.push('This statement uses signed amounts. Negative (-) values = debit (money out). Positive (+) values = credit (money in).');
  }
  if (/balance|closing|running/.test(headerLine)) {
    hints.push('A running/closing balance column is present. Use it to verify: if balance decreased from previous row, the transaction is debit; if balance increased, it is credit.');
  }

  return hints.length > 0 ? hints.join(' ') : null;
}

const PROCESSING_MESSAGES = [
  '🔓 Unlocking your file securely...',
  '📄 Extracting transactions...',
  '🧠 AI is categorising your transactions...',
  '🔍 Checking for duplicates...',
  '🗑️ Destroying document from memory...',
  '✅ Almost done...',
];

const BULK_PROCESSING_MESSAGES = [
  '📊 Reading your spreadsheet...',
  '🔍 Matching categories...',
  '🧠 AI is generating icons for new categories...',
  '✅ Almost done...',
];

function NudgeUploadModes() {
  const { show, dismiss } = useNudge('upload-two-modes');
  return <Nudge show={show} onDismiss={dismiss} message="Bank statements are parsed by AI. Structured Excel files (with Date, Category, Type, Amount columns) are imported directly — no AI needed." position="bottom" />;
}

export default function UploadStatement() {
  const { trackerId } = useParams<{ trackerId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: categories } = useCategories(trackerId);
  const { data: tracker } = useTracker(trackerId!);
  const trackerCurrency = tracker?.currency || 'INR';
  const bulkCreate = useBulkCreateExpenses();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [processing, setProcessing] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [drafts, setDrafts] = useState<DraftExpense[]>([]);
  // Track newly created categories during bulk import so the review screen can use them
  const newCategoriesRef = useRef<Category[]>([]);

  // Combined categories: existing + newly created
  const allCategories = [...(categories || []), ...newCategoriesRef.current];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB'); return; }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'csv', 'xlsx', 'xls'].includes(ext || '')) { toast.error('Unsupported file type'); return; }
    setFile(f);
  };

  const handleContinue = async () => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();

    // For CSV/XLSX, check if it's a structured bulk upload
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      const isBulk = await detectAndProcessBulk();
      if (isBulk) return; // Handled as bulk import
    }

    if (ext === 'pdf') { setStep(2); } else { processFile(); }
  };

  // ──────────────────────────────────────────────────────────────────
  // Bulk Excel import — client-side parsing, no AI for transactions
  // ──────────────────────────────────────────────────────────────────
  const detectAndProcessBulk = async (): Promise<boolean> => {
    if (!file || !trackerId || !categories) return false;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    if (ext === 'csv') {
      const text = new TextDecoder().decode(arrayBuffer);
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      rows = result.data as Record<string, string>[];
      headers = result.meta.fields || [];
    } else {
      const wb = XLSX.read(arrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
      if (jsonData.length < 2) return false;
      headers = jsonData[0].map(h => String(h || '').trim());
      rows = jsonData.slice(1).filter(r => r.some(c => c)).map(r => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(r[i] || ''); });
        return obj;
      });
    }

    const columnMap = detectBulkUploadColumns(headers);
    if (!columnMap) return false; // Not a bulk upload — fall through to AI parsing

    // It's a bulk upload — process it
    setStep(3);
    setProcessing(true);
    const interval = setInterval(() => setMsgIndex(i => (i + 1) % BULK_PROCESSING_MESSAGES.length), 1800);

    try {
      // 1. Collect all unique category names from the file
      const categoryNamesInFile = [...new Set(
        rows.map(r => (r[columnMap.category] || '').trim()).filter(Boolean)
      )];

      // 2. Match each against existing categories (>=80% fuzzy match)
      const categoryMapping: Record<string, Category> = {};
      const unmatchedNames: string[] = [];

      for (const name of categoryNamesInFile) {
        const match = findBestCategoryMatch(name, categories);
        if (match) {
          categoryMapping[name] = match;
        } else {
          unmatchedNames.push(name);
        }
      }

      // 3. For unmatched categories, get AI-generated emojis and create them
      if (unmatchedNames.length > 0) {
        let emojiMap: Record<string, string> = {};
        try {
          const { data, error } = await supabase.functions.invoke('parse-statement', {
            body: { mode: 'suggest-emojis', categoryNames: unmatchedNames },
          });
          if (!error && data?.emojis) {
            emojiMap = data.emojis;
          }
        } catch {
          // AI emoji generation failed — use fallback
        }

        for (const name of unmatchedNames) {
          const emoji = emojiMap[name] || '🏷️';
          const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];

          const { data: newCat, error: catError } = await supabase
            .from('categories')
            .insert({
              tracker_id: trackerId,
              name: name,
              icon: emoji,
              color: color,
              is_system: false,
              created_by: user?.id,
            })
            .select()
            .single();

          if (!catError && newCat) {
            const cat = newCat as Category;
            categoryMapping[name] = cat;
            newCategoriesRef.current.push(cat);
          }
        }

        // Refresh categories cache
        if (unmatchedNames.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['categories', trackerId] });
        }
      }

      // 4. Build draft expenses from rows
      const miscCategory = categories.find(c => c.name === 'Miscellaneous');

      const draftExpenses: DraftExpense[] = rows
        .filter(r => {
          const amt = parseFloat(String(r[columnMap.amount] || '0').replace(/[^0-9.\-]/g, ''));
          return !isNaN(amt) && amt !== 0 && r[columnMap.description]?.trim();
        })
        .map((r, i) => {
          const catName = (r[columnMap.category] || '').trim();
          const matchedCat = categoryMapping[catName];
          const typeVal = parseTypeValue(r[columnMap.type] || '');
          const isDebit = typeVal ?? true;
          const debitUncertain = typeVal === null;
          const amt = Math.round(Math.abs(parseFloat(String(r[columnMap.amount] || '0').replace(/[^0-9.\-]/g, ''))));

          const description = (r[columnMap.description] || 'Unknown').trim();
          const notes = columnMap.notes ? (r[columnMap.notes] || '').trim() : '';
          const merchant = columnMap.merchant ? (r[columnMap.merchant] || '').trim() : '';

          return {
            temp_id: `bulk-${i}`,
            date: parseDateValue(r[columnMap.date] || ''),
            description: description.length > 25 ? description.slice(0, 25).trim() + '...' : description,
            merchant_name: merchant || undefined,
            amount: amt,
            is_debit: isDebit,
            suggested_category_id: matchedCat?.id || miscCategory?.id || '',
            suggested_category_name: matchedCat?.name || 'Miscellaneous',
            confidence: matchedCat ? 1.0 : 0.5,
            notes: (notes || (description.length > 25 ? description : '')) || undefined,
            needs_review: debitUncertain || !matchedCat,
            review_status: 'pending' as const,
          };
        });

      setDrafts(draftExpenses);
      setStep(4);

      if (unmatchedNames.length > 0) {
        toast.success(`${unmatchedNames.length} new categor${unmatchedNames.length === 1 ? 'y' : 'ies'} created`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process bulk file');
      setStep(1);
    } finally {
      clearInterval(interval);
      setProcessing(false);
      setFile(null);
    }

    return true;
  };

  // ──────────────────────────────────────────────────────────────────
  // Bank statement AI processing (existing flow)
  // ──────────────────────────────────────────────────────────────────
  const processFile = async () => {
    if (!file) return;
    setStep(3);
    setProcessing(true);

    const interval = setInterval(() => setMsgIndex(i => (i + 1) % PROCESSING_MESSAGES.length), 1800);

    try {
      let formatHint: string | null = null;
      const ext = file.name.split('.').pop()?.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();

      const textChunks: string[] = [];
      const PAGES_PER_CHUNK = 2;
      const ROWS_PER_CHUNK = 40;

      if (ext === 'csv') {
        const text = new TextDecoder().decode(arrayBuffer);
        formatHint = detectFormatHint(text);
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        const rows = result.data as Record<string, unknown>[];
        for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
          textChunks.push(JSON.stringify(rows.slice(i, i + ROWS_PER_CHUNK)));
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(arrayBuffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csvOutput = XLSX.utils.sheet_to_csv(ws);
        formatHint = detectFormatHint(csvOutput);
        const lines = csvOutput.split('\n').filter(l => l.trim());
        const header = lines[0] || '';
        const dataLines = lines.slice(1);
        for (let i = 0; i < dataLines.length; i += ROWS_PER_CHUNK) {
          textChunks.push([header, ...dataLines.slice(i, i + ROWS_PER_CHUNK)].join('\n'));
        }
      } else if (ext === 'pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer, password: password || undefined }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((item: any) => item.str).join(' '));
        }
        for (let i = 0; i < pages.length; i += PAGES_PER_CHUNK) {
          textChunks.push(pages.slice(i, i + PAGES_PER_CHUNK).join('\n'));
        }
      }

      if (textChunks.length === 0) throw new Error('Could not extract text from file');

      const allTransactions: any[] = [];
      for (const chunk of textChunks) {
        const { data, error } = await supabase.functions.invoke('parse-statement', {
          body: { extractedText: chunk, formatHint },
        });
        if (error) throw error;
        const txns = data?.transactions || [];
        allTransactions.push(...txns);
      }

      const transactions = allTransactions;
      const miscCategory = categories?.find(c => c.name === 'Miscellaneous');

      const draftExpenses: DraftExpense[] = transactions.map((t: any, i: number) => {
        const matchedCat = categories?.find(c => c.name === t.suggested_category || c.name === t.category);

        let isDebit = true;
        let debitUncertain = false;
        if (t.is_debit === true || t.is_debit === 'true') {
          isDebit = true;
        } else if (t.is_debit === false || t.is_debit === 'false') {
          isDebit = false;
        } else if (t.is_debit === undefined || t.is_debit === null) {
          isDebit = true;
          debitUncertain = true;
        }

        const confidence = t.confidence || 0.5;
        const needsReview = confidence < 0.75 || debitUncertain;

        const rawDesc = t.raw_description || t.description || 'Unknown';
        const shortDesc = (t.description || 'Unknown').length > 25
          ? (t.description || 'Unknown').slice(0, 25).trim() + '...'
          : (t.description || 'Unknown');

        return {
          temp_id: `draft-${i}`,
          date: t.date || new Date().toISOString().split('T')[0],
          description: shortDesc,
          merchant_name: t.merchant_name,
          amount: Math.round(Math.abs(Number(t.amount) || 0)),
          is_debit: isDebit,
          suggested_category_id: matchedCat?.id || miscCategory?.id || '',
          suggested_category_name: matchedCat?.name || 'Miscellaneous',
          confidence,
          reference_number: t.reference_number,
          notes: rawDesc !== shortDesc ? rawDesc : null,
          needs_review: needsReview,
          review_status: 'pending' as const,
          detected_currency: t.currency || undefined,
        };
      });

      setDrafts(draftExpenses);
      setStep(4);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process file');
      setStep(1);
    } finally {
      clearInterval(interval);
      setProcessing(false);
      setFile(null);
    }
  };

  const approvedDrafts = drafts.filter(d => d.review_status !== 'discarded');
  const debitCount = approvedDrafts.filter(d => d.is_debit).length;
  const creditCount = approvedDrafts.filter(d => !d.is_debit).length;
  const needsReviewCount = drafts.filter(d => d.needs_review && d.review_status === 'pending').length;

  const handleSaveAll = async () => {
    if (!user || !profile || !trackerId) return;

    // Check if any drafts have a foreign currency that needs conversion
    const needsConversion = approvedDrafts.filter(
      d => d.detected_currency && d.detected_currency !== trackerCurrency
    );

    let conversionResults: Record<string, { converted_amount: number; rate: number; note: string }> = {};

    if (needsConversion.length > 0) {
      try {
        const conversions = needsConversion.map(d => ({
          from: d.detected_currency!,
          to: trackerCurrency,
          amount: d.amount,
          date: d.date,
        }));

        const { data, error } = await supabase.functions.invoke('convert-currency', {
          body: { conversions },
        });
        if (!error && data?.results) {
          needsConversion.forEach((d, i) => {
            const result = data.results[i];
            if (result && !result.error) {
              const sym = getCurrency(d.detected_currency!).symbol;
              conversionResults[d.temp_id] = {
                converted_amount: result.converted_amount,
                rate: result.rate,
                note: `Converted from ${sym}${d.amount.toLocaleString()} ${d.detected_currency} @ ${result.rate}`,
              };
            }
          });
        }
      } catch {
        toast.error('Currency conversion failed — saving in original amounts');
      }
    }

    const expenses = approvedDrafts.map(d => {
      const conv = conversionResults[d.temp_id];
      return {
        tracker_id: trackerId,
        created_by_id: user.id,
        category_id: d.suggested_category_id,
        amount: conv ? conv.converted_amount : d.amount,
        currency: trackerCurrency,
        date: d.date,
        description: d.description,
        merchant_name: d.merchant_name || null,
        is_debit: d.is_debit,
        source: 'statement_upload' as const,
        reference_number: d.reference_number || null,
        notes: d.notes || null,
        ...(conv ? {
          original_amount: d.amount,
          original_currency: d.detected_currency,
          conversion_rate: conv.rate,
          conversion_note: conv.note,
        } : {}),
      };
    });

    await bulkCreate.mutateAsync(expenses);

    // Record category corrections for learning
    const corrections = approvedDrafts.filter(d => d.category_changed);
    if (corrections.length > 0) {
      for (const d of corrections) {
        const normalized = d.description.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const { data: existing } = await supabase
          .from('category_learning')
          .select('id, applied_count')
          .eq('normalized_description', normalized)
          .eq('category_id', d.suggested_category_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('category_learning')
            .update({ applied_count: existing.applied_count + 1, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('category_learning').insert({
            normalized_description: normalized,
            merchant_name: d.merchant_name || null,
            category_id: d.suggested_category_id,
            applied_count: 1,
          });
        }
      }
    }

    navigate(`/tracker/${trackerId}?tab=expenses`);
  };

  const toggleDraft = (tempId: string) => {
    setDrafts(prev => prev.map(d => d.temp_id === tempId ? { ...d, review_status: d.review_status === 'discarded' ? 'approved' : 'discarded' } : d));
  };

  const handleCategoryChange = (tempId: string, categoryId: string) => {
    const cat = allCategories.find(c => c.id === categoryId);
    if (!cat) return;
    setDrafts(prev => prev.map(d => d.temp_id === tempId ? {
      ...d,
      suggested_category_id: categoryId,
      suggested_category_name: cat.name,
      category_changed: true,
    } : d));
  };

  const toggleDebitCredit = (tempId: string) => {
    setDrafts(prev => prev.map(d => d.temp_id === tempId ? {
      ...d,
      is_debit: !d.is_debit,
    } : d));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={() => step > 1 && step < 3 ? setStep(step - 1) : navigate(`/tracker/${trackerId}`)} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base">Upload Statement</h1>
          <span className="ml-auto text-xs text-muted-foreground">Step {step} of 4</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {step === 1 && (
          <div className="space-y-6 text-center">
            <div className="relative">
              <h2 className="text-lg font-semibold">Upload Transactions</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload a bank statement (PDF/CSV/XLSX) for AI parsing, or a structured Excel with Date, Category, Description, Type, Amount columns for direct import.
              </p>
              <NudgeUploadModes />
            </div>
            <label className="block border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:border-primary/50 transition-colors">
              <input type="file" accept=".pdf,.csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />
              <UploadIcon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <>
                  <p className="font-medium text-sm">Tap to choose file</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF · CSV · XLSX · XLS · Max 10 MB</p>
                </>
              )}
            </label>
            <Button onClick={handleContinue} disabled={!file} className="w-full h-11">Continue &rarr;</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Password Protected?</h2>
              <p className="text-sm text-muted-foreground mt-1">Some bank statements are password protected. Enter the password below, or skip if yours isn't.</p>
            </div>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="PDF password" className="h-11" />
            <Button onClick={processFile} className="w-full h-11">Unlock & Continue &rarr;</Button>
            <button onClick={() => { setPassword(''); processFile(); }} className="w-full text-sm text-primary font-medium">Skip — No Password &rarr;</button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <p className="text-lg font-medium text-center animate-pulse">
              {(processing && drafts.length === 0)
                ? (msgIndex < BULK_PROCESSING_MESSAGES.length ? BULK_PROCESSING_MESSAGES[msgIndex] : PROCESSING_MESSAGES[msgIndex % PROCESSING_MESSAGES.length])
                : PROCESSING_MESSAGES[msgIndex]}
            </p>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] w-1/3" />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Review Transactions</h2>
              <p className="text-sm text-muted-foreground">
                {debitCount} debit{debitCount !== 1 ? 's' : ''} · {creditCount} credit{creditCount !== 1 ? 's' : ''}{needsReviewCount > 0 ? ` · ${needsReviewCount} need review` : ''}
              </p>
            </div>

            <div className="space-y-2">
              {drafts.map(draft => (
                <div key={draft.temp_id} className={`rounded-2xl border p-3 shadow-sm ${draft.review_status === 'discarded' ? 'opacity-40 bg-muted' : 'bg-card border-border'}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.review_status !== 'discarded'}
                      onChange={() => toggleDraft(draft.temp_id)}
                      className="h-4 w-4 rounded shrink-0"
                    />
                    <Select
                      value={draft.suggested_category_id}
                      onValueChange={(val) => handleCategoryChange(draft.temp_id, val)}
                      disabled={draft.review_status === 'discarded'}
                    >
                      <SelectTrigger className="h-6 w-auto min-w-0 border-none bg-transparent p-0 text-sm font-medium hover:text-foreground focus:ring-0 focus:ring-offset-0 gap-1 [&>svg]:h-3 [&>svg]:w-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <span>{cat.icon} {cat.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="ml-auto text-right shrink-0">
                      <button
                        onClick={() => toggleDebitCredit(draft.temp_id)}
                        className={`font-mono text-sm font-semibold px-2 py-0.5 rounded-lg border transition-colors ${
                          draft.is_debit
                            ? 'border-transparent hover:border-red-200 hover:bg-red-50'
                            : 'text-emerald-600 border-transparent hover:border-emerald-200 hover:bg-emerald-50'
                        }`}
                        title="Tap to toggle debit/credit"
                      >
                        {draft.is_debit ? '↑' : '↓'} {draft.is_debit ? '' : '+'}{formatAmountShort(draft.amount, draft.detected_currency || trackerCurrency)}
                      </button>
                      <p className="text-xs text-muted-foreground">{draft.date}</p>
                    </div>
                  </div>
                  <div className="mt-2 pl-7 space-y-0.5">
                    <p className="text-sm text-foreground text-left">{draft.description}</p>
                    {draft.notes && (
                      <p className="text-xs text-muted-foreground text-left line-clamp-2">{draft.notes}</p>
                    )}
                    {draft.needs_review && draft.review_status !== 'discarded' && (
                      <p className="text-xs text-warning text-left mt-1">
                        ⚠️ {draft.confidence < 0.75 ? `Low confidence (${(draft.confidence * 100).toFixed(0)}%)` : 'Verify debit/credit direction — tap amount to toggle'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-4">
              <Button onClick={handleSaveAll} className="w-full h-12 shadow-lg" disabled={bulkCreate.isPending || approvedDrafts.length === 0}>
                {bulkCreate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${approvedDrafts.length} Transactions to Tracker`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
