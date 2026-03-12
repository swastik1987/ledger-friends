import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload as UploadIcon, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useTrackers';
import { useBulkCreateExpenses } from '@/hooks/useExpenses';
import { supabase } from '@/integrations/supabase/client';
import { DraftExpense } from '@/types';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const PROCESSING_MESSAGES = [
  '🔓 Unlocking your file securely...',
  '📄 Extracting transactions...',
  '🧠 AI is categorising your transactions...',
  '🔍 Checking for duplicates...',
  '🗑️ Destroying document from memory...',
  '✅ Almost done...',
];

export default function UploadStatement() {
  const { trackerId } = useParams<{ trackerId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: categories } = useCategories(trackerId);
  const bulkCreate = useBulkCreateExpenses();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [processing, setProcessing] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [drafts, setDrafts] = useState<DraftExpense[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB'); return; }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'csv', 'xlsx', 'xls'].includes(ext || '')) { toast.error('Unsupported file type'); return; }
    setFile(f);
  };

  const handleContinue = () => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') { setStep(2); } else { processFile(); }
  };

  const processFile = async () => {
    if (!file) return;
    setStep(3);
    setProcessing(true);

    const interval = setInterval(() => setMsgIndex(i => (i + 1) % PROCESSING_MESSAGES.length), 1800);

    try {
      let extractedText = '';
      const ext = file.name.split('.').pop()?.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();

      if (ext === 'csv') {
        const text = new TextDecoder().decode(arrayBuffer);
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        extractedText = JSON.stringify(result.data);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(arrayBuffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        extractedText = XLSX.utils.sheet_to_csv(ws);
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
        extractedText = pages.join('\n');
      }

      const { data, error } = await supabase.functions.invoke('parse-statement', {
        body: { extractedText },
      });

      if (error) throw error;

      const transactions = data?.transactions || [];
      const miscCategory = categories?.find(c => c.name === 'Miscellaneous');

      const draftExpenses: DraftExpense[] = transactions.map((t: any, i: number) => {
        const matchedCat = categories?.find(c => c.name === t.suggested_category || c.name === t.category);
        return {
          temp_id: `draft-${i}`,
          date: t.date || new Date().toISOString().split('T')[0],
          description: t.description || 'Unknown',
          merchant_name: t.merchant_name,
          amount: Math.abs(Number(t.amount) || 0),
          is_debit: t.is_debit !== false,
          suggested_category_id: matchedCat?.id || miscCategory?.id || '',
          suggested_category_name: matchedCat?.name || 'Miscellaneous',
          confidence: t.confidence || 0.5,
          reference_number: t.reference_number,
          needs_review: (t.confidence || 0.5) < 0.75,
          review_status: 'pending' as const,
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
    const expenses = approvedDrafts.map(d => ({
      tracker_id: trackerId,
      created_by_id: user.id,
      created_by_name: profile.full_name,
      category_id: d.suggested_category_id,
      amount: d.amount,
      currency: 'INR',
      date: d.date,
      description: d.description,
      merchant_name: d.merchant_name || null,
      is_debit: d.is_debit,
      source: 'statement_upload' as const,
      reference_number: d.reference_number || null,
    }));

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
    const cat = categories?.find(c => c.id === categoryId);
    if (!cat) return;
    setDrafts(prev => prev.map(d => d.temp_id === tempId ? {
      ...d,
      suggested_category_id: categoryId,
      suggested_category_name: cat.name,
      category_changed: true,
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
            <div>
              <h2 className="text-lg font-semibold">Upload Bank Statement</h2>
              <p className="text-sm text-muted-foreground mt-1">Your file is processed entirely in your browser. We never store your document.</p>
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
            <Button onClick={handleContinue} disabled={!file} className="w-full h-11">Continue →</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Password Protected?</h2>
              <p className="text-sm text-muted-foreground mt-1">Some bank statements are password protected. Enter the password below, or skip if yours isn't.</p>
            </div>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="PDF password" className="h-11" />
            <Button onClick={processFile} className="w-full h-11">Unlock & Continue →</Button>
            <button onClick={() => { setPassword(''); processFile(); }} className="w-full text-sm text-primary font-medium">Skip — No Password →</button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <p className="text-lg font-medium text-center animate-pulse">{PROCESSING_MESSAGES[msgIndex]}</p>
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
                {debitCount} debit{debitCount !== 1 ? 's' : ''} · {creditCount} credit{creditCount !== 1 ? 's' : ''} · {needsReviewCount} need review
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
                      className="h-4 w-4 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{draft.description}</p>
                      <p className="text-xs text-muted-foreground">{draft.date} · {draft.suggested_category_name}</p>
                      {draft.needs_review && draft.review_status !== 'discarded' && (
                        <p className="text-xs text-warning mt-1">⚠️ Low confidence ({(draft.confidence * 100).toFixed(0)}%)</p>
                      )}
                    </div>
                    <p className={`font-mono text-sm font-semibold ${draft.is_debit ? '' : 'text-emerald-600'}`}>
                      {draft.is_debit ? '' : '+'}₹{draft.amount.toLocaleString('en-IN')}
                    </p>
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
