import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload as UploadIcon, FileText, CircleNotch, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories, useTracker } from '@/hooks/useTrackers';
import { useBulkCreateExpenses } from '@/hooks/useExpenses';
import { supabase } from '@/integrations/supabase/client';
import { DraftExpense, Category } from '@/types';
import { getCurrency, formatAmountShort } from '@/lib/currencies';
import { fetchLearnedMappings, findLearnedCategory, recordCategoryLearning } from '@/lib/categoryLearning';
import { detectTransferByKeyword } from '@/lib/transferDetector';
import { findMerchantCategory } from '@/lib/merchantDictionary';
import {
  normalizeMerchant,
  extractMerchantFromRaw,
  resolveDescription,
  canonicalizeMerchants,
} from '@/lib/merchantExtraction';
import Nudge from '@/components/Nudge';
import CategoryIcon from '@/components/CategoryIcon';
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
  // Strip periods, extra spaces, and lowercase for flexible matching
  const v = (val || '').toLowerCase().replace(/[.\s]/g, '').trim();
  if (['debit', 'dr', 'd', 'db', 'expense', 'withdrawal', 'out', 'purchase', 'payment', 'paid', 'spent'].includes(v)) return true;
  if (['credit', 'cr', 'c', 'cd', 'income', 'deposit', 'in', 'refund', 'receipt', 'received', 'cashback', 'reversal'].includes(v)) return false;
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

// ── Credit / debit category split. Used to (a) tell the AI which categories are valid for
//    credits vs debits, and (b) post-validate the AI's category choice client-side. ──
const SYSTEM_CREDIT_CATEGORY_NAMES = [
  'Salary / Income',
  'Refund',
  'Reimbursement',
  'Cashback / Reward',
  'Interest Earned',
  'Other Income',
];

function splitCategoriesByDirection(cats: Category[]) {
  const credit: string[] = [];
  const debit: string[] = [];
  for (const c of cats) {
    if (SYSTEM_CREDIT_CATEGORY_NAMES.includes(c.name)) credit.push(c.name);
    else debit.push(c.name);
  }
  return { credit, debit };
}

// ── Reference-number normalisation: pull a long alphanumeric token out of the description ──
const REF_TOKEN_RE = /\b([A-Z0-9]{10,})\b/;
function extractReferenceNumber(rawDesc: string): string | null {
  const m = rawDesc.match(REF_TOKEN_RE);
  return m ? m[1] : null;
}

// ── Balance reconciliation: if balance and is_debit don't agree across consecutive rows,
//    flag the row for review. Returns the set of temp_ids that failed reconciliation. ──
function findBalanceMismatches<T extends { amount: number; is_debit: boolean; balance?: number | null }>(
  rows: T[],
): Set<number> {
  const flags = new Set<number>();
  // Compare each row against the next row with a balance.
  let prevBalance: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const bal = typeof r.balance === 'number' && !isNaN(r.balance) ? r.balance : null;
    if (bal === null) { continue; }
    if (prevBalance !== null) {
      const delta = bal - prevBalance;
      // Expected delta: +amount for credit, -amount for debit
      const expected = r.is_debit ? -r.amount : r.amount;
      // Allow ±2 unit tolerance for rounding (some banks store paise rounded to whole rupees)
      if (Math.abs(delta - expected) > 2) {
        flags.add(i);
      }
    }
    prevBalance = bal;
  }
  return flags;
}

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
  // Detect signed amounts: handles -500, +500, - 500, + 500, "-500", +₹500, -$12.50 etc.
  const signedAmountPattern = /[,\s"]([-+])\s*[₹$€£¥]?\s*\d/;
  const hasNegativeAmounts = dataRows.some(row => /[,\s"]-\s*[₹$€£¥]?\s*\d/.test(row));
  const hasPositiveSignAmounts = dataRows.some(row => /[,\s"]\+\s*[₹$€£¥]?\s*\d/.test(row));
  if (hasNegativeAmounts || hasPositiveSignAmounts) {
    hints.push('This statement uses signed amounts. Negative (-) values = debit (money out). Positive (+) values or amounts prefixed with "+" = credit (money in). The sign may appear before or after the currency symbol, with or without spaces.');
  }
  // Detect Dr/Cr markers within data rows (not just headers)
  const hasDrCrInData = dataRows.some(row => /\b(DR|Dr|CR|Cr)\b/.test(row));
  if (hasDrCrInData && !hints.some(h => h.includes('Dr/Cr'))) {
    hints.push('Data rows contain "Dr"/"CR" markers. "Dr" or "DR" = debit (money out). "Cr" or "CR" = credit (money in).');
  }
  if (/balance|closing|running/.test(headerLine)) {
    hints.push('A running/closing balance column is present. Use it to verify: if balance decreased from previous row, the transaction is debit; if balance increased, it is credit.');
  }

  return hints.length > 0 ? hints.join(' ') : null;
}

/**
 * Detect format hints from raw PDF text by scanning for common column headers
 * and debit/credit indicator patterns. PDF text extraction is messier than CSV,
 * so we look for patterns across the joined text.
 */
function detectPdfFormatHint(pdfText: string): string | null {
  const text = pdfText.toLowerCase();
  const hints: string[] = [];

  // ── Credit card statement detection (must be first — changes interpretation of everything else) ──
  const isCreditCard = /credit card|card statement|card number|card no|billing period|statement date.*billing/i.test(pdfText);

  if (isCreditCard) {
    hints.push('IMPORTANT: This is a CREDIT CARD statement. On credit card statements, the default interpretation is REVERSED from bank statements:');
    hints.push('- Regular transaction amounts (purchases, fees, charges) WITHOUT a "+" prefix = DEBIT (is_debit=true, money spent/charged to card)');
    hints.push('- Amounts with a "+" prefix or labeled as "Payment", "Refund", "Reversal", "Cashback", "AUTOPAY" = CREDIT (is_debit=false, money paid back or refunded to card)');
  }

  // ── HDFC-style "C amount" format (C is currency marker, NOT credit indicator) ──
  // Pattern: "C 3,130.00" for purchases, "+ C 299.00" for refunds/payments
  if (/[C₹]\s*[\d,]+\.\d{2}/.test(pdfText) && /\+\s*C\s*[\d,]+\.\d{2}/.test(pdfText)) {
    hints.push('This statement uses "C" as a currency prefix (like ₹), NOT as a credit indicator. "C 3,130.00" = a charge amount. "+ C 299.00" means credit/refund. The "+" sign before "C" indicates credit (money in), absence of "+" means debit (money out/purchase).');
  }

  // ── Separate debit/credit columns ──
  if ((text.includes('withdrawal') && text.includes('deposit')) ||
      (text.includes('withdrawal amount') && text.includes('deposit amount'))) {
    hints.push('This statement has separate "Withdrawal" and "Deposit" columns. Withdrawal = debit (money out), Deposit = credit (money in).');
  }
  if ((/debit[_ ]?(amount|amt)?/.test(text) && /credit[_ ]?(amount|amt)?/.test(text)) ||
      (/dr[_ ]?(amount|amt)/.test(text) && /cr[_ ]?(amount|amt)/.test(text))) {
    hints.push('This PDF has separate Debit and Credit amount columns. Amount in Debit/Dr column = money out, Credit/Cr column = money in.');
  }

  // ── Dr/Cr markers in transaction rows (skip if credit card — different meaning) ──
  if (!isCreditCard && /\b(dr|dr\.|debit)\b/.test(text) && /\b(cr|cr\.|credit)\b/.test(text)) {
    hints.push('This PDF contains "Dr"/"Cr" markers next to transactions. "Dr" = debit (money out), "Cr" = credit (money in).');
  }

  // ── Signed amounts ──
  // Be careful: on credit card statements, the REWARDS column may have +/- for reward points, not amounts
  if (/[+-]\s*[₹$€£¥C]?\s*\d{1,3}[,.]?\d{2,}/.test(pdfText)) {
    if (isCreditCard) {
      hints.push('Amounts prefixed with "+" (e.g., "+ C 60,555.00") are credits (payments/refunds to the card, is_debit=false). Amounts without "+" are purchases/charges (is_debit=true). IMPORTANT: The REWARDS column also has +/- numbers — these are reward POINTS, not transaction amounts. Ignore the rewards column for debit/credit detection.');
    } else {
      hints.push('This PDF contains signed amounts. "+" prefix = credit (money in), "-" prefix or no sign = debit (money out).');
    }
  }

  // ── Balance column ──
  if (/\b(closing balance|running balance|available balance)\b/.test(text) && !isCreditCard) {
    hints.push('A balance column is present. Use balance changes to verify: decrease = debit, increase = credit.');
  }

  // ── EMI indicators ──
  if (/\bemi\b/i.test(pdfText)) {
    hints.push('Some transactions are marked "EMI" — these are installment purchases and should be categorized as debit (is_debit=true) unless they have a "+" prefix indicating a refund.');
  }

  return hints.length > 0 ? hints.join(' ') : null;
}

// Custom error classes for specific failure scenarios
class PasswordRequiredError extends Error {
  constructor(msg = 'This PDF is password protected. Please go back and enter the correct password.') { super(msg); this.name = 'PasswordRequiredError'; }
}
class WrongPasswordError extends Error {
  constructor(msg = 'Incorrect password. Please go back and try again with the correct password.') { super(msg); this.name = 'WrongPasswordError'; }
}
class FileUnreadableError extends Error {
  constructor(msg = "This file couldn't be read. It may be corrupted or an unsupported format.") { super(msg); this.name = 'FileUnreadableError'; }
}
class EmptyFileError extends Error {
  constructor(msg = 'This file appears to be empty or has no data rows to process.') { super(msg); this.name = 'EmptyFileError'; }
}
class NoTransactionsError extends Error {
  constructor(msg = "No transactions found. This file doesn't appear to be a bank statement.") { super(msg); this.name = 'NoTransactionsError'; }
}
class ParseServiceError extends Error {
  constructor(msg = 'Statement parsing failed. Please check your connection and try again.') { super(msg); this.name = 'ParseServiceError'; }
}

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

  // Step machine:
  // 1 = file select, 2 = password (PDF only, if locked), 3 = page select (PDF only),
  // 4 = processing, 5 = review
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [pwdRequired, setPwdRequired] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [drafts, setDrafts] = useState<DraftExpense[]>([]);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pdfThumbnails, setPdfThumbnails] = useState<{ pageNum: number; dataUrl: string }[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [loadingPdf, setLoadingPdf] = useState(false);
  const pdfDocRef = useRef<any>(null);
  // Track newly created categories during bulk import so the review screen can use them
  const newCategoriesRef = useRef<Category[]>([]);
  // AbortController to cancel in-flight API calls when user cancels or navigates away
  const abortRef = useRef<AbortController | null>(null);

  // Combined categories: existing + newly created
  const allCategories = [...(categories || []), ...newCategoriesRef.current];

  // Cancel processing and abort in-flight API calls
  const cancelProcessing = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setProcessing(false);
    setProgress(0);
    setProgressMessage('');
    setStep(1);
    setFile(null);
    setPdfThumbnails([]);
    setSelectedPages(new Set());
    setPwdRequired(false);
    setPassword('');
    pdfDocRef.current = null;
  }, []);

  // Dynamic step display: skip password step if not needed, skip page-select for non-PDFs
  const isPdf = file?.name.toLowerCase().endsWith('.pdf') ?? false;
  const stepSequence: number[] = (() => {
    if (!isPdf) return [1, 4, 5];
    return pwdRequired ? [1, 2, 3, 4, 5] : [1, 3, 4, 5];
  })();
  const displayStep = Math.max(1, stepSequence.indexOf(step) + 1);
  const totalSteps = stepSequence.length;

  // Smart back navigation with guards for each step
  const handleBack = useCallback(() => {
    if (step === 1) {
      navigate(`/tracker/${trackerId}`);
    } else if (step === 2 || step === 3) {
      // Password or page-select — go back to file picker
      setStep(1);
      setPdfThumbnails([]);
      setSelectedPages(new Set());
      setPwdRequired(false);
      setPassword('');
      pdfDocRef.current = null;
      setFile(null);
    } else if (step === 4) {
      // During processing — cancel and go back to Step 1
      cancelProcessing();
    } else if (step === 5) {
      // Review step — confirm if there are drafts
      if (drafts.length > 0) {
        setShowLeaveConfirm(true);
      } else {
        navigate(`/tracker/${trackerId}`);
      }
    }
  }, [step, drafts.length, trackerId, navigate, cancelProcessing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB'); return; }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'csv', 'xlsx', 'xls'].includes(ext || '')) { toast.error('Unsupported file type'); return; }
    setFile(f);
  };

  // Load PDF document into memory. Returns whether a password is required.
  const loadPdfDocument = async (pwd?: string): Promise<{ ok: boolean; needsPassword: boolean }> => {
    if (!file) return { ok: false, needsPassword: false };
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    try {
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer, password: pwd || undefined }).promise;
      pdfDocRef.current = doc;
      return { ok: true, needsPassword: false };
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('password')) return { ok: false, needsPassword: true };
      throw err;
    }
  };

  // Render thumbnails for all pages of the loaded PDF. Select all by default.
  const renderPdfThumbnails = async () => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const thumbs: { pageNum: number; dataUrl: string }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 0.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      thumbs.push({ pageNum: i, dataUrl: canvas.toDataURL('image/jpeg', 0.7) });
    }
    setPdfThumbnails(thumbs);
    setSelectedPages(new Set(thumbs.map(t => t.pageNum)));
  };

  const handleContinue = async () => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();

    // For CSV/XLSX, check if it's a structured bulk upload
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      const isBulk = await detectAndProcessBulk();
      if (isBulk) return; // Handled as bulk import
    }

    if (ext === 'pdf') {
      setLoadingPdf(true);
      try {
        const result = await loadPdfDocument();
        if (result.needsPassword) {
          setPwdRequired(true);
          setStep(2);
        } else if (result.ok) {
          await renderPdfThumbnails();
          setStep(3);
        }
      } catch {
        toast.error("This PDF couldn't be opened. It may be corrupted.");
      } finally {
        setLoadingPdf(false);
      }
    } else {
      processFile();
    }
  };

  const handlePasswordSubmit = async () => {
    setLoadingPdf(true);
    try {
      const result = await loadPdfDocument(password);
      if (result.ok) {
        await renderPdfThumbnails();
        setStep(3);
      } else if (result.needsPassword) {
        toast.error('Incorrect password. Please try again.');
      }
    } catch {
      toast.error("This PDF couldn't be opened.");
    } finally {
      setLoadingPdf(false);
    }
  };

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const selectAllPages = () => setSelectedPages(new Set(pdfThumbnails.map(t => t.pageNum)));
  const deselectAllPages = () => setSelectedPages(new Set());

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
    setStep(4);
    setProcessing(true);
    setProgress(0);
    setProgressMessage('📊 Reading your spreadsheet...');

    try {
      setProgress(20);
      setProgressMessage('🔍 Matching categories...');

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
      setProgress(50);

      // 3. For unmatched categories, get AI-generated emojis and create them
      if (unmatchedNames.length > 0) {
        setProgressMessage('🧠 Creating new categories...');
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

      setProgress(80);
      setProgressMessage('✅ Preparing review...');

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

          const rawDescription = (r[columnMap.description] || 'Unknown').trim();
          const notes = columnMap.notes ? (r[columnMap.notes] || '').trim() : '';
          const csvMerchant = columnMap.merchant ? (r[columnMap.merchant] || '').trim() : '';

          // Apply the same merchant resolution as the AI path.
          // If the CSV had a merchant column, normalise it. Otherwise extract.
          let merchantName = normalizeMerchant(csvMerchant);
          if (!merchantName) merchantName = extractMerchantFromRaw(rawDescription);

          const description = resolveDescription({
            aiDescription: rawDescription,
            merchantName,
            isDebit,
            categoryName: matchedCat?.name,
          });

          const suspectedTransfer =
            !!detectTransferByKeyword(rawDescription) ||
            (!!merchantName && !!detectTransferByKeyword(merchantName));

          return {
            temp_id: `bulk-${i}`,
            date: parseDateValue(r[columnMap.date] || ''),
            description,
            raw_description: rawDescription,
            merchant_name: merchantName || undefined,
            amount: amt,
            is_debit: isDebit,
            suggested_category_id: matchedCat?.id || miscCategory?.id || '',
            suggested_category_name: matchedCat?.name || 'Miscellaneous',
            confidence: matchedCat ? 1.0 : 0.5,
            notes: notes || undefined,
            needs_review: debitUncertain || !matchedCat,
            review_status: 'pending' as const,
            suspected_transfer: suspectedTransfer,
          };
        });

      setProgress(100);
      setDrafts(draftExpenses);

      if (draftExpenses.length === 0) {
        throw new EmptyFileError('No valid transaction rows found in this file.');
      }

      setStep(5);

      if (unmatchedNames.length > 0) {
        toast.success(`${unmatchedNames.length} new categor${unmatchedNames.length === 1 ? 'y' : 'ies'} created`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process bulk file');
      setStep(1);
    } finally {
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
    // Create new AbortController for this processing run
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setStep(4);
    setProcessing(true);
    setProgress(0);
    setProgressMessage('🔓 Reading your file...');

    try {
      let formatHint: string | null = null;
      let headerSnippet: string | null = null; // First-chunk header lines, injected into chunks 2+
      const ext = file.name.split('.').pop()?.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();

      const textChunks: string[] = [];
      const PAGES_PER_CHUNK = 2;
      const ROWS_PER_CHUNK = 40;

      // ── Stage 1: Extract text (0% → 12%) ──
      if (ext === 'csv') {
        const text = new TextDecoder().decode(arrayBuffer);
        if (!text.trim()) throw new EmptyFileError();
        formatHint = detectFormatHint(text);
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        const rows = result.data as Record<string, unknown>[];
        if (rows.length === 0) throw new EmptyFileError();
        // Header snippet for CSV = the CSV header row (Papa stores it in meta.fields)
        headerSnippet = result.meta?.fields ? result.meta.fields.join(',') : null;
        for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
          textChunks.push(JSON.stringify(rows.slice(i, i + ROWS_PER_CHUNK)));
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        let wb: any;
        try {
          wb = XLSX.read(arrayBuffer);
        } catch {
          throw new FileUnreadableError();
        }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csvOutput = XLSX.utils.sheet_to_csv(ws);
        if (!csvOutput.trim() || csvOutput.split('\n').filter((l: string) => l.trim()).length < 2) throw new EmptyFileError();
        formatHint = detectFormatHint(csvOutput);
        const lines = csvOutput.split('\n').filter((l: string) => l.trim());
        const header = lines[0] || '';
        headerSnippet = header;
        const dataLines = lines.slice(1);
        for (let i = 0; i < dataLines.length; i += ROWS_PER_CHUNK) {
          textChunks.push([header, ...dataLines.slice(i, i + ROWS_PER_CHUNK)].join('\n'));
        }
      } else if (ext === 'pdf') {
        // PDF doc was already loaded for the page-preview step. Reuse it.
        const doc = pdfDocRef.current;
        if (!doc) throw new FileUnreadableError();

        // Extract text for every page so the format-hint detector sees full context,
        // but only feed selected pages to the AI to save tokens.
        const allPages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          allPages.push(content.items.map((item: any) => item.str).join(' '));
        }

        const allText = allPages.join(' ').trim();
        if (!allText) throw new EmptyFileError('This PDF has no extractable text. It may be a scanned image. Try a CSV or Excel file instead.');

        formatHint = detectPdfFormatHint(allText);

        // Header snippet for PDFs = first ~800 chars of the first page — always, even
        // if user deselected it, so the AI still has bank/column context.
        headerSnippet = allPages[0] ? allPages[0].slice(0, 800) : null;

        const pickedPages = allPages.filter((_, idx) => selectedPages.has(idx + 1));
        if (pickedPages.length === 0) throw new EmptyFileError('No pages selected for analysis.');

        for (let i = 0; i < pickedPages.length; i += PAGES_PER_CHUNK) {
          textChunks.push(pickedPages.slice(i, i + PAGES_PER_CHUNK).join('\n'));
        }
      }

      if (textChunks.length === 0) throw new EmptyFileError();
      setProgress(12);

      // ── Stage 2a: Metadata extraction (cheap first pass — 12% → 18%) ──
      setProgressMessage('🔍 Identifying statement format...');
      let statementMetadata: any = null;
      try {
        const metaSample = (headerSnippet || '') + '\n\n' + (textChunks[0] || '').slice(0, 4000);
        const { data: metaData } = await supabase.functions.invoke('parse-statement', {
          body: { mode: 'metadata', extractedText: metaSample },
        });
        if (metaData?.metadata) {
          statementMetadata = metaData.metadata;
        }
      } catch {
        // Metadata pass is best-effort — fall through and let per-chunk extraction handle it
      }
      if (signal.aborted) return;
      setProgress(18);

      // ── Stage 2b: AI transaction parsing (18% → 80%) ──
      setProgressMessage('🧠 AI is categorising your transactions...');
      const allTransactions: any[] = [];
      const parseWarnings: string[] = [];
      const chunkProgressRange = 62; // 18% → 80%

      // Fetch learned mappings to pass as context hints to Gemini
      const learnedForAI = await fetchLearnedMappings(2);
      const learnedMappingsForPrompt = learnedForAI.map(m => ({
        description: m.normalized_description,
        category: categories?.find(c => c.id === m.category_id)?.name || 'Unknown',
        count: m.applied_count,
      })).filter(m => m.category !== 'Unknown');

      // Build allowed-category lists from the tracker's full category set (system + custom).
      // Custom categories live with the debits by default unless their name matches a known
      // credit category. The AI will be told to pick from these lists exactly.
      const { debit: allowedDebitCategories, credit: allowedCreditCategories } =
        splitCategoriesByDirection(categories || []);

      for (let ci = 0; ci < textChunks.length; ci++) {
        if (signal.aborted) return;

        // Header injection: prepend the first chunk's headers to every subsequent chunk
        // so the AI always has bank/column context, not just the raw row text.
        const chunk = ci === 0 || !headerSnippet
          ? textChunks[ci]
          : `[STATEMENT HEADER FOR CONTEXT — repeated from page 1]\n${headerSnippet}\n[END HEADER]\n\n${textChunks[ci]}`;

        let data: any;
        let error: any;
        try {
          const result = await supabase.functions.invoke('parse-statement', {
            body: {
              extractedText: chunk,
              formatHint,
              learnedMappings: learnedMappingsForPrompt.length > 0 ? learnedMappingsForPrompt : undefined,
              allowedDebitCategories,
              allowedCreditCategories,
              statementMetadata,
            },
          });
          data = result.data;
          error = result.error;
        } catch {
          if (signal.aborted) return;
          throw new ParseServiceError();
        }
        if (signal.aborted) return;
        if (error) throw new ParseServiceError();
        const txns = data?.transactions || [];
        allTransactions.push(...txns);
        if (Array.isArray(data?.warnings)) parseWarnings.push(...data.warnings);
        setProgress(18 + Math.round(((ci + 1) / textChunks.length) * chunkProgressRange));
      }

      if (allTransactions.length === 0) throw new NoTransactionsError();

      // Surface server-side partial-parse warnings (chunks that failed inside the edge function)
      if (parseWarnings.length > 0) {
        toast.warning(`Some sections couldn't be parsed (${parseWarnings.length}). Review carefully — a few transactions may be missing.`);
        console.warn('parse-statement warnings:', parseWarnings);
      }

      // ── Stage 3: Build drafts with learned category pre-check (80% → 95%) ──
      setProgress(80);
      setProgressMessage('🧠 Applying learned preferences...');

      const transactions = allTransactions;
      const miscCategory = categories?.find(c => c.name === 'Miscellaneous');

      // Fetch learned category mappings to override/boost AI suggestions
      const learnedMappings = await fetchLearnedMappings(1);

      setProgress(85);
      setProgressMessage('🔍 Checking for duplicates...');

      // First pass: build drafts with simplified is_debit parsing (schema guarantees boolean),
      // raw_amount_text sign override, unconditional credit keyword override, merchant dictionary
      // lookup, learned-mapping override, Miscellaneous flagging, and reference normalisation.
      const draftExpenses: DraftExpense[] = transactions.map((t: any, i: number) => {
        const aiMatchedCat = categories?.find(c => c.name === t.suggested_category || c.name === t.category);

        // ── is_debit parsing (schema enforces boolean, but keep a string fallback) ──
        let isDebit: boolean;
        let debitUncertain = false;
        if (typeof t.is_debit === 'boolean') {
          isDebit = t.is_debit;
        } else if (typeof t.is_debit === 'string') {
          const v = t.is_debit.toLowerCase().replace(/[.\s]/g, '').trim();
          if (['true', 'yes', 'debit', 'dr', 'd'].includes(v)) isDebit = true;
          else if (['false', 'no', 'credit', 'cr', 'c'].includes(v)) isDebit = false;
          else { isDebit = true; debitUncertain = true; }
        } else {
          isDebit = true;
          debitUncertain = true;
        }

        // ── raw_amount_text sign / Dr-Cr cross-validation ──
        // The AI now returns the original amount cell text (raw_amount_text), so sign-based
        // hints have real signal instead of trying to read the stripped numeric amount.
        const rawAmountText = String(t.raw_amount_text || '').trim();
        if (rawAmountText) {
          if (/^\s*\+/.test(rawAmountText) || /\b(cr|cr\.)\s*$/i.test(rawAmountText)) {
            isDebit = false; debitUncertain = false;
          } else if (/^\s*-/.test(rawAmountText) || /\b(dr|dr\.)\s*$/i.test(rawAmountText)) {
            isDebit = true; debitUncertain = false;
          }
        }

        // HDFC-style "+ C amount" in raw description
        const rawDesc = String(t.raw_description || '').trim();
        if (/\+\s+C\s*[\d,]+\.\d{2}/.test(rawDesc)) {
          isDebit = false; debitUncertain = false;
        }

        // ── Unconditional strong-credit keyword override ──
        // These keywords are deterministic credit signals on bank/CC statements. Apply
        // regardless of AI confidence — false-positive rate is near zero.
        const descLower = (t.description || '').toLowerCase();
        const rawLower = rawDesc.toLowerCase();
        const STRONG_CREDIT_RE = /\b(refund|reversal|cashback|payment\s*(received|credited|thank)|salary|reimbursement|interest\s*(credit|earned|paid))\b/i;
        if (STRONG_CREDIT_RE.test(descLower) || STRONG_CREDIT_RE.test(rawLower)) {
          isDebit = false; debitUncertain = false;
        }
        // AUTOPAY on credit-card statements is a card-bill payment received — credit on the CC side.
        if (statementMetadata?.statement_type === 'credit_card' && /\bautopay\b/i.test(descLower)) {
          isDebit = false; debitUncertain = false;
        }

        // ── Category resolution: learned > merchant dictionary > AI suggestion ──
        const learned = findLearnedCategory(t.description || '', t.merchant_name, learnedMappings);
        const merchantHit = !learned ? findMerchantCategory(t.description || '', t.merchant_name) : null;

        let finalCategoryId: string;
        let finalCategoryName: string;
        let finalConfidence: number;

        if (learned) {
          const learnedCat = categories?.find(c => c.id === learned.categoryId);
          finalCategoryId = learned.categoryId;
          finalCategoryName = learnedCat?.name || aiMatchedCat?.name || 'Miscellaneous';
          finalConfidence = learned.confidence;
        } else if (merchantHit) {
          const dictCat = categories?.find(c => c.name === merchantHit.category);
          if (dictCat) {
            finalCategoryId = dictCat.id;
            finalCategoryName = dictCat.name;
            finalConfidence = merchantHit.confidence ?? 0.9;
          } else {
            finalCategoryId = aiMatchedCat?.id || miscCategory?.id || '';
            finalCategoryName = aiMatchedCat?.name || 'Miscellaneous';
            finalConfidence = t.confidence || 0.5;
          }
        } else {
          finalCategoryId = aiMatchedCat?.id || miscCategory?.id || '';
          finalCategoryName = aiMatchedCat?.name || 'Miscellaneous';
          finalConfidence = t.confidence || 0.5;
        }

        // ── Category↔direction safety: never let a credit transaction land in a debit
        //    category (or vice versa). If they conflict, drop confidence and force review. ──
        const catName = finalCategoryName;
        const catIsCredit = SYSTEM_CREDIT_CATEGORY_NAMES.includes(catName);
        if (isDebit && catIsCredit) {
          // Credit-only category on a debit — fall back to Miscellaneous
          finalCategoryId = miscCategory?.id || finalCategoryId;
          finalCategoryName = 'Miscellaneous';
          finalConfidence = Math.min(finalConfidence, 0.4);
        } else if (!isDebit && !catIsCredit) {
          // Debit category on a credit transaction — fall back to Other Income
          const otherIncome = categories?.find(c => c.name === 'Other Income');
          if (otherIncome) {
            finalCategoryId = otherIncome.id;
            finalCategoryName = 'Other Income';
            finalConfidence = Math.min(finalConfidence, 0.4);
          }
        }

        // ── Always flag Miscellaneous for review (Fix #10) ──
        const isMiscellaneous = finalCategoryName === 'Miscellaneous';
        const needsReview = finalConfidence < 0.75 || debitUncertain || isMiscellaneous;

        const rawDescription = (t.raw_description || t.description || '').trim() || 'Unknown';

        // ── Merchant resolution ──
        // 1. Normalize whatever AI returned. Strips channel prefixes, corporate
        //    suffixes, UPI handles, trailing reference IDs.
        // 2. If AI gave nothing (or normalization wiped it), backfill from raw_description.
        let merchantName = normalizeMerchant(t.merchant_name);
        if (!merchantName) {
          merchantName = extractMerchantFromRaw(rawDescription);
        }

        // ── Description resolution ──
        // Cleans the AI's description, strips redundant channel prefixes when a
        // merchant has been identified, falls back to a generic phrase
        // (e.g. "UPI payment") when description ends up empty or equals merchant.
        const description = resolveDescription({
          aiDescription: t.description,
          rawDescription,
          merchantName,
          paymentMethod: t.payment_mode,
          isDebit,
          categoryName: finalCategoryName,
          isTransfer: t.is_likely_transfer === true,
        });

        // Transfer suspicion: keyword match on description/raw_description, or AI flag.
        const transferKeyword = detectTransferByKeyword(rawDescription) || detectTransferByKeyword(description);
        const aiTransferFlag = t.is_likely_transfer === true;
        const suspectedTransfer = !!(transferKeyword || aiTransferFlag);

        // Reference number normalisation: prefer AI-extracted, else scrape from raw description.
        const refNumber = (typeof t.reference_number === 'string' && t.reference_number.trim())
          ? t.reference_number.trim()
          : extractReferenceNumber(rawDescription);

        return {
          temp_id: `draft-${i}`,
          date: t.date || new Date().toISOString().split('T')[0],
          description,
          raw_description: rawDescription,
          merchant_name: merchantName || undefined,
          amount: Math.round(Math.abs(Number(t.amount) || 0)),
          is_debit: isDebit,
          suggested_category_id: finalCategoryId,
          suggested_category_name: finalCategoryName,
          confidence: finalConfidence,
          reference_number: refNumber || undefined,
          // Notes left empty here — raw_description is preserved on its own column.
          // Existing notes from the AI (rare) would land here if we ever pipe them through.
          notes: undefined,
          needs_review: needsReview,
          review_status: 'pending' as const,
          detected_currency: t.currency || undefined,
          suspected_transfer: suspectedTransfer,
          payment_method: t.payment_mode || undefined,
          bank_name: t.bank_name || undefined,
          // Keep the parsed balance from the AI on the draft for post-process reconciliation.
          // It's stripped before insert (not in the expenses schema).
          balance: typeof t.balance === 'number' ? t.balance : undefined,
        } as DraftExpense & { balance?: number };
      });

      // ── Balance reconciliation (Fix #7) ──
      // For consecutive transactions with visible balance, verify prev ± amount = curr.
      // Rows that fail reconciliation get flagged for review. We only reconcile within a
      // chunk-ordered run (AI returns transactions in document order).
      const balanceMismatches = findBalanceMismatches(draftExpenses as any);
      if (balanceMismatches.size > 0) {
        for (const idx of balanceMismatches) {
          draftExpenses[idx].needs_review = true;
          draftExpenses[idx].confidence = Math.min(draftExpenses[idx].confidence, 0.4);
        }
      }

      // Strip the temporary `balance` field — it's not part of DraftExpense or the DB schema.
      for (const d of draftExpenses) delete (d as any).balance;

      // ── Intra-batch merchant canonicalisation ──
      // Cluster similar merchant_names within this upload (same lowercase prefix)
      // and pick the cleanest most-common surface form, so 5 Swiggy rows always
      // render with the identical merchant_name string.
      const canonicalized = canonicalizeMerchants(draftExpenses);
      // Re-resolve description in case canonicalisation made it equal merchant_name
      // (rare, but possible when AI returned the same string for both).
      for (let i = 0; i < canonicalized.length; i++) {
        if (
          canonicalized[i].merchant_name &&
          canonicalized[i].description &&
          canonicalized[i].description.toLowerCase() === canonicalized[i].merchant_name!.toLowerCase()
        ) {
          canonicalized[i] = {
            ...canonicalized[i],
            description: resolveDescription({
              aiDescription: '',
              merchantName: canonicalized[i].merchant_name,
              paymentMethod: canonicalized[i].payment_method,
              isDebit: canonicalized[i].is_debit,
              categoryName: canonicalized[i].suggested_category_name,
              isTransfer: canonicalized[i].suspected_transfer,
            }),
          };
        }
      }
      draftExpenses.splice(0, draftExpenses.length, ...canonicalized);

      // ── Stage 4: Done (95% → 100%) ──
      setProgress(95);
      setProgressMessage('✅ Almost done...');

      setDrafts(draftExpenses);
      setProgress(100);
      setStep(5);
    } catch (err: any) {
      if (err instanceof PasswordRequiredError || err instanceof WrongPasswordError) {
        toast.error(err.message);
        setStep(2); // Go back to password step — keep file so user can retry
      } else {
        toast.error(err?.message || 'Failed to process file');
        setStep(1);
        setFile(null); // Only clear file when going back to file selection
      }
    } finally {
      setProcessing(false);
      abortRef.current = null;
    }
  };

  const approvedDrafts = drafts.filter(d => d.review_status !== 'discarded');
  const debitCount = approvedDrafts.filter(d => d.is_debit).length;
  const creditCount = approvedDrafts.filter(d => !d.is_debit).length;
  const needsReviewCount = drafts.filter(d => d.needs_review && d.review_status === 'pending').length;
  const totalOut = approvedDrafts.filter(d => d.is_debit).reduce((s, d) => s + d.amount, 0);
  const totalIn = approvedDrafts.filter(d => !d.is_debit).reduce((s, d) => s + d.amount, 0);
  const netAmount = totalIn - totalOut;

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
        created_by_name: profile.full_name,
        category_id: d.suggested_category_id,
        amount: conv ? conv.converted_amount : d.amount,
        currency: trackerCurrency,
        date: d.date,
        description: d.description,
        raw_description: d.raw_description || null,
        merchant_name: d.merchant_name || null,
        is_debit: d.is_debit,
        source: 'statement_upload' as const,
        is_transfer: false,
        suspected_transfer: d.suspected_transfer || false,
        payment_method: d.payment_method || null,
        bank_name: d.bank_name || null,
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

    // Record category corrections for learning (using shared utility)
    const corrections = approvedDrafts.filter(d => d.category_changed);
    if (corrections.length > 0) {
      for (const d of corrections) {
        await recordCategoryLearning(d.description, d.suggested_category_id, d.merchant_name);
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
          {step === 4 ? (
            /* During processing: show Cancel button instead of back arrow */
            <button onClick={cancelProcessing} className="p-1 text-destructive hover:text-destructive/80 flex items-center gap-1 text-sm font-medium">
              <X className="h-4 w-4" /> Cancel
            </button>
          ) : (
            <button onClick={handleBack} className="p-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="font-semibold text-base">Upload Statement</h1>
          <span className="ml-auto text-xs text-muted-foreground">Step {displayStep} of {totalSteps}</span>
        </div>
      </div>

      {/* Leave confirmation dialog for Step 4 */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard reviewed transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {approvedDrafts.length} transaction{approvedDrafts.length !== 1 ? 's' : ''} ready to save. Going back will discard all your review changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reviewing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowLeaveConfirm(false); setDrafts([]); navigate(`/tracker/${trackerId}`); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard & Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <Button onClick={handleContinue} disabled={!file || loadingPdf} className="w-full h-11">
              {loadingPdf ? <CircleNotch className="h-4 w-4 animate-spin" /> : <>Continue &rarr;</>}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Password Protected PDF</h2>
              <p className="text-sm text-muted-foreground mt-1">This PDF is password protected. Enter the password below to continue.</p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && password && !loadingPdf) handlePasswordSubmit(); }}
              placeholder="PDF password"
              className="h-11"
              autoFocus
            />
            <Button onClick={handlePasswordSubmit} disabled={!password || loadingPdf} className="w-full h-11">
              {loadingPdf ? <CircleNotch className="h-4 w-4 animate-spin" /> : <>Unlock &rarr;</>}
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Select pages to analyse</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Deselect pages that contain ads, terms, or other non-transaction content. Skipping them improves AI accuracy and reduces processing time.
              </p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedPages.size} of {pdfThumbnails.length} page{pdfThumbnails.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-3">
                <button onClick={selectAllPages} className="text-primary font-medium">Select all</button>
                <button onClick={deselectAllPages} className="text-muted-foreground font-medium">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {pdfThumbnails.map(t => {
                const isSelected = selectedPages.has(t.pageNum);
                return (
                  <button
                    key={t.pageNum}
                    type="button"
                    onClick={() => togglePageSelection(t.pageNum)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all bg-card ${
                      isSelected ? 'border-primary shadow-sm' : 'border-border opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={t.dataUrl} alt={`Page ${t.pageNum}`} className="w-full h-auto block" />
                    <div className="absolute top-2 right-2">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-background/80 border border-border text-muted-foreground'
                      }`}>
                        {isSelected ? '✓' : ''}
                      </div>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent text-white text-xs font-medium py-1 text-center">
                      Page {t.pageNum}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="sticky bottom-4">
              <Button
                onClick={processFile}
                disabled={selectedPages.size === 0}
                className="w-full h-12 shadow-lg"
              >
                Analyse {selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} &rarr;
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <p className="text-lg font-medium text-center transition-opacity duration-300">
              {progressMessage}
            </p>
            <div className="w-full space-y-2">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">{progress}%</p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Review Transactions</h2>
              <p className="text-sm text-muted-foreground">
                {debitCount} debit{debitCount !== 1 ? 's' : ''} · {creditCount} credit{creditCount !== 1 ? 's' : ''}{needsReviewCount > 0 ? ` · ${needsReviewCount} need review` : ''}
              </p>
            </div>

            <div className="rounded-2xl bg-card border border-border p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Out</p>
                <p className="font-mono text-sm font-semibold mt-0.5">{formatAmountShort(totalOut, trackerCurrency)}</p>
              </div>
              <div className="border-x border-border">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total In</p>
                <p className="font-mono text-sm font-semibold text-emerald-600 mt-0.5">+{formatAmountShort(totalIn, trackerCurrency)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Net</p>
                <p className={`font-mono text-sm font-semibold mt-0.5 ${netAmount >= 0 ? 'text-emerald-600' : ''}`}>
                  {netAmount >= 0 ? '+' : '−'}{formatAmountShort(Math.abs(netAmount), trackerCurrency)}
                </p>
              </div>
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
                            <span className="flex items-center gap-1.5"><CategoryIcon icon={cat.icon} color={cat.color} size={13} /> {cat.name}</span>
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
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-foreground text-left">{draft.description}</p>
                      {draft.suspected_transfer && (
                        <span
                          className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium dark:bg-amber-900/20 dark:text-amber-400"
                          title="Possible internal transfer — confirm after saving"
                        >
                          ↔ Possible transfer
                        </span>
                      )}
                    </div>
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
                {bulkCreate.isPending ? <CircleNotch className="h-4 w-4 animate-spin" /> : `Save ${approvedDrafts.length} Transactions to Tracker`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
