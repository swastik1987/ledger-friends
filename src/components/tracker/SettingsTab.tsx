import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tracker, TrackerMember, Category } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateTracker, useDeleteTracker, useRemoveMember, useUpdateMemberRole, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useTrackers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Pencil, Check, X, Trash2, Users, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';

const PRESET_COLORS = ['#FF6B6B', '#51CF66', '#339AF0', '#FF922B', '#CC5DE8', '#F06595', '#20C997', '#74C0FC', '#FFD43B', '#748FFC', '#A9E34B', '#FFA94D'];
const PRESET_EMOJIS = ['🏷️', '🎯', '🏋️', '🎮', '🐕', '🏡', '☕', '🎵', '📸', '🧹', '🚰', '🎓', '🍕', '🚌', '🏖️', '💳', '🔧', '📺', '🧸', '🎪', '💎', '🧊', '🌿', '🎨', '🍣', '☂️', '🏪', '🎂', '📮', '🔑'];

const STORAGE_KEY = 'expensesync-type-filter';

interface Props {
  trackerId: string;
  tracker: Tracker;
  members: TrackerMember[];
  categories: Category[];
  isAdmin: boolean;
  userId: string;
}

export default function SettingsTab({ trackerId, tracker, members, categories, isAdmin, userId }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const updateTracker = useUpdateTracker();
  const deleteTracker = useDeleteTracker();
  const removeMember = useRemoveMember(trackerId);
  const updateRole = useUpdateMemberRole(trackerId);
  const createCategory = useCreateCategory(trackerId);
  const updateCategory = useUpdateCategory(trackerId);
  const deleteCategory = useDeleteCategory(trackerId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(tracker.name);
  const [inviteEmail, setInviteEmail] = useState('');
  const [deleteCountdown, setDeleteCountdown] = useState(0);
  const [defaultView, setDefaultView] = useState<TransactionFilter>('all');

  // Category sheet state
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null); // null = creating new
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('🏷️');
  const [catColor, setCatColor] = useState('#FF6B6B');
  const [aiEmojis, setAiEmojis] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAllEmojis, setShowAllEmojis] = useState(false);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customCategories = categories.filter(c => !c.is_system && c.tracker_id === trackerId);
  const systemCategories = categories.filter(c => c.is_system);
  const adminCount = members.filter(m => m.role === 'admin').length;

  // Load default view preference
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      setDefaultView(data[trackerId] || 'all');
    } catch { /* ignore */ }
  }, [trackerId]);

  const handleDefaultViewChange = (value: TransactionFilter) => {
    setDefaultView(value);
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      data[trackerId] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  };

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue !== tracker.name) {
      await updateTracker.mutateAsync({ id: trackerId, name: nameValue.trim() });
    }
    setEditingName(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    toast.error('No account found with that email. The user must sign up first.');
    setInviteEmail('');
  };

  // ─── AI Emoji Suggestions ───
  const fetchAiEmojis = useCallback(async (name: string) => {
    if (!name.trim() || name.trim().length < 2) {
      setAiEmojis([]);
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-emojis', {
        body: { categoryName: name.trim() },
      });
      if (error) throw error;
      const emojis = data?.emojis || [];
      setAiEmojis(emojis.slice(0, 3));
    } catch {
      setAiEmojis([]);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleCatNameChange = (value: string) => {
    setCatName(value);
    // Debounce AI call — 800ms after user stops typing
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    aiDebounceRef.current = setTimeout(() => fetchAiEmojis(value), 800);
  };

  // ─── Open sheet for Create ───
  const openCreateSheet = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('🏷️');
    setCatColor('#FF6B6B');
    setAiEmojis([]);
    setShowAllEmojis(false);
    setShowCategorySheet(true);
  };

  // ─── Open sheet for Edit ───
  const openEditSheet = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatIcon(cat.icon);
    setCatColor(cat.color);
    setAiEmojis([]);
    setShowAllEmojis(false);
    setShowCategorySheet(true);
  };

  // ─── Save Category (create or update) ───
  const handleSaveCategory = async () => {
    if (!catName.trim()) return;

    if (editingCategory) {
      if (editingCategory.is_system) {
        // System category: create a tracker-scoped custom copy with the new values
        await createCategory.mutateAsync({ name: catName.trim(), icon: catIcon, color: catColor });
        toast.success('Custom version created for this tracker');
      } else {
        // Custom category: update in place
        await updateCategory.mutateAsync({ id: editingCategory.id, name: catName.trim(), icon: catIcon, color: catColor });
      }
    } else {
      // New category
      await createCategory.mutateAsync({ name: catName.trim(), icon: catIcon, color: catColor });
    }

    setShowCategorySheet(false);
    setCatName('');
    setAiEmojis([]);
  };

  const handleDeleteTracker = async () => {
    await deleteTracker.mutateAsync(trackerId);
    navigate('/');
  };

  const handleLeave = async () => {
    if (isAdmin && adminCount <= 1) {
      toast.error('Transfer admin role to another member before leaving.');
      return;
    }
    const myMembership = members.find(m => m.user_id === userId);
    if (myMembership) {
      await removeMember.mutateAsync(myMembership.id);
      navigate('/');
    }
  };

  const isSaving = createCategory.isPending || updateCategory.isPending;

  return (
    <div className="px-4 py-3 space-y-6">
      {/* Tracker Info */}
      {isAdmin && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm">Tracker Info</h3>
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <Input value={nameValue} onChange={e => setNameValue(e.target.value)} className="h-10 flex-1" onKeyDown={e => e.key === 'Enter' && handleSaveName()} autoFocus />
                <button onClick={handleSaveName} className="p-2 text-accent"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingName(false); setNameValue(tracker.name); }} className="p-2 text-muted-foreground"><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <p className="font-semibold flex-1">{tracker.name}</p>
                <button onClick={() => setEditingName(true)} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>₹ INR</span>
            <span className="text-xs">(Multi-currency coming soon)</span>
          </div>
        </div>
      )}

      {/* My Preferences */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">My Preferences</h3>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Default Transaction View</p>
          <p className="text-xs text-muted-foreground mb-3">Shows which transactions you see first when opening this tracker.</p>
          <div className="space-y-2">
            {([
              { value: 'all' as TransactionFilter, label: 'All Transactions' },
              { value: 'debit' as TransactionFilter, label: 'Debits only (Expenses)' },
              { value: 'credit' as TransactionFilter, label: 'Credits only (Income)' },
            ]).map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="defaultView"
                  checked={defaultView === opt.value}
                  onChange={() => handleDefaultViewChange(opt.value)}
                  className="h-4 w-4 text-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Members</h3>
        <div className="space-y-2">
          {members.map(member => (
            <div key={member.id} className="flex items-center gap-3 p-2 rounded-xl">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                {(member.profile?.full_name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{member.profile?.full_name || 'Unknown'}{member.user_id === userId ? ' (You)' : ''}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${member.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {member.role === 'admin' ? 'Admin' : 'Member'}
              </span>
              {isAdmin && member.user_id !== userId && (
                <div className="flex gap-1">
                  <button
                    onClick={() => updateRole.mutate({ memberId: member.id, role: member.role === 'admin' ? 'member' : 'admin' })}
                    className="text-xs text-primary px-1"
                  >
                    {member.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="text-xs text-destructive px-1">Remove</button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>Remove {member.profile?.full_name} from this tracker?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeMember.mutate(member.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email address" className="h-10 flex-1" />
            <Button size="sm" className="h-10" onClick={handleInvite}>Add</Button>
          </div>
        )}

        {members.length === 1 && (
          <div className="text-center py-4">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">You're the only member</p>
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Categories</h3>

        {/* Custom categories */}
        {customCategories.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Custom</p>
            {customCategories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 py-1.5">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                  {cat.icon}
                </div>
                <span className="flex-1 text-sm truncate">{cat.name}</span>
                <button onClick={() => openEditSheet(cat)} className="p-1 text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{cat.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>Expenses using this category will be moved to Miscellaneous.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteCategory.mutate(cat.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}

        {/* System categories */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">System</p>
          {systemCategories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 py-1.5">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                {cat.icon}
              </div>
              <span className="flex-1 text-sm truncate">{cat.name}</span>
              <button onClick={() => openEditSheet(cat)} className="p-1 text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={openCreateSheet} className="w-full h-10">Add Category</Button>
      </div>

      {/* Danger Zone */}
      {isAdmin ? (
        <div className="rounded-2xl border-2 border-destructive/20 p-4 space-y-3">
          <h3 className="font-semibold text-sm text-destructive">Danger Zone</h3>
          <AlertDialog onOpenChange={(open) => { if (open) setDeleteCountdown(3); }}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full h-11 border-destructive text-destructive hover:bg-destructive/10">Delete Tracker</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{tracker.name}"?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete all transactions and tracker data. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <DeleteCountdownButton onDelete={handleDeleteTracker} />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <div className="rounded-2xl border border-border p-4">
          <Button variant="outline" className="w-full h-11 border-destructive text-destructive hover:bg-destructive/10" onClick={handleLeave}>
            Leave Tracker
          </Button>
        </div>
      )}

      {/* ─── Add / Edit Category Sheet ─── */}
      <Sheet open={showCategorySheet} onOpenChange={setShowCategorySheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingCategory ? (editingCategory.is_system ? 'Customise System Category' : 'Edit Category') : 'Add Category'}
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            {/* Info banner for system categories */}
            {editingCategory?.is_system && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                Editing a system category creates a custom version for this tracker. The original system category stays unchanged.
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={catName}
                onChange={e => handleCatNameChange(e.target.value)}
                placeholder="Category name"
                className="h-11"
                autoFocus
              />
            </div>

            {/* AI Emoji Suggestions */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI Suggested Icons
              </Label>
              {aiLoading ? (
                <div className="flex items-center gap-2 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Generating suggestions...</span>
                </div>
              ) : aiEmojis.length > 0 ? (
                <div className="flex gap-2">
                  {aiEmojis.map((emoji, i) => (
                    <button
                      key={`ai-${i}`}
                      onClick={() => setCatIcon(emoji)}
                      className={`h-14 w-14 rounded-xl text-2xl flex items-center justify-center transition-all ${
                        catIcon === emoji
                          ? 'bg-primary/10 ring-2 ring-primary scale-105'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : catName.trim().length >= 2 ? (
                <p className="text-xs text-muted-foreground py-2">Type a category name to get AI emoji suggestions</p>
              ) : (
                <p className="text-xs text-muted-foreground py-2">Type at least 2 characters for suggestions</p>
              )}
            </div>

            {/* Manual emoji grid (collapsible) */}
            <div className="space-y-1.5">
              <button
                onClick={() => setShowAllEmojis(!showAllEmojis)}
                className="text-xs text-primary font-medium flex items-center gap-1"
              >
                {showAllEmojis ? 'Hide' : 'Show'} all emojis
                <span className="text-[10px]">{showAllEmojis ? '▲' : '▼'}</span>
              </button>
              {showAllEmojis && (
                <div className="grid grid-cols-6 gap-2 pt-1">
                  {PRESET_EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => setCatIcon(e)}
                      className={`h-10 w-full rounded-lg text-lg ${catIcon === e ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected icon preview */}
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: catColor + '20' }}>
                {catIcon}
              </div>
              <div>
                <p className="text-sm font-medium">{catName || 'Category Name'}</p>
                <p className="text-xs text-muted-foreground">Preview</p>
              </div>
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setCatColor(c)} className={`h-8 w-8 rounded-full ${catColor === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            {/* Save button */}
            <Button onClick={handleSaveCategory} className="w-full h-11" disabled={!catName.trim() || isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingCategory ? (
                editingCategory.is_system ? 'Create Custom Version' : 'Save Changes'
              ) : (
                'Add Category'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DeleteCountdownButton({ onDelete }: { onDelete: () => void }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <AlertDialogAction
      onClick={onDelete}
      disabled={count > 0}
      className="bg-destructive text-destructive-foreground"
    >
      {count > 0 ? `Delete Forever (${count})` : 'Delete Forever'}
    </AlertDialogAction>
  );
}
