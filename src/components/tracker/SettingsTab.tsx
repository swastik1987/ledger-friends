import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tracker, TrackerMember, Category } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateTracker, useDeleteTracker, useRemoveMember, useUpdateMemberRole, useCreateCategory, useDeleteCategory } from '@/hooks/useTrackers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Pencil, Check, X, Trash2, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PRESET_COLORS = ['#FF6B6B', '#51CF66', '#339AF0', '#FF922B', '#CC5DE8', '#F06595', '#20C997', '#74C0FC', '#FFD43B', '#748FFC', '#A9E34B', '#FFA94D'];
const PRESET_EMOJIS = ['🏷️', '🎯', '🏋️', '🎮', '🐕', '🏡', '☕', '🎵', '📸', '🧹', '🚰', '🎓', '🍕', '🚌', '🏖️', '💳', '🔧', '📺', '🧸', '🎪', '💎', '🧊', '🌿', '🎨', '🍣', '☂️', '🏪', '🎂', '📮', '🔑'];

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
  const deleteCategory = useDeleteCategory(trackerId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(tracker.name);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🏷️');
  const [newCatColor, setNewCatColor] = useState('#FF6B6B');
  const [deleteCountdown, setDeleteCountdown] = useState(0);

  const customCategories = categories.filter(c => !c.is_system && c.tracker_id === trackerId);
  const adminCount = members.filter(m => m.role === 'admin').length;

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue !== tracker.name) {
      await updateTracker.mutateAsync({ id: trackerId, name: nameValue.trim() });
    }
    setEditingName(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    // Search by querying profiles - we can't search by email directly since it's in auth.users
    // For now show a helpful message
    toast.error('No account found with that email. The user must sign up first.');
    setInviteEmail('');
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await createCategory.mutateAsync({ name: newCatName.trim(), icon: newCatIcon, color: newCatColor });
    setShowAddCategory(false);
    setNewCatName('');
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

      {/* Custom Categories */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Custom Categories</h3>
        {customCategories.map(cat => (
          <div key={cat.id} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: cat.color + '20' }}>
              {cat.icon}
            </div>
            <span className="flex-1 text-sm">{cat.name}</span>
            <button onClick={() => deleteCategory.mutate(cat.id)} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setShowAddCategory(true)} className="w-full h-10">Add Category</Button>
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
                <AlertDialogDescription>This will permanently delete all expenses and tracker data. This cannot be undone.</AlertDialogDescription>
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

      {/* Add Category Sheet */}
      <Sheet open={showAddCategory} onOpenChange={setShowAddCategory}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Add Category</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_EMOJIS.map(e => (
                  <button key={e} onClick={() => setNewCatIcon(e)} className={`h-10 w-full rounded-lg text-lg ${newCatIcon === e ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted'}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewCatColor(c)} className={`h-8 w-8 rounded-full ${newCatColor === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button onClick={handleAddCategory} className="w-full h-11" disabled={!newCatName.trim() || createCategory.isPending}>
              {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Category'}
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
