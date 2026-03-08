import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Home, ClipboardList, PlusCircle, BarChart2, User, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { format } from 'date-fns';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: ClipboardList, label: 'Transactions', path: '/tracker/:id?tab=expenses', requiresTracker: true },
  { icon: PlusCircle, label: 'Add', isAdd: true, requiresTracker: true },
  { icon: BarChart2, label: 'Dashboard', path: '/tracker/:id?tab=dashboard', requiresTracker: true },
  { icon: User, label: 'Profile', isProfile: true },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTrackerId } = useApp();
  const { profile, signOut } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  const handleNav = (item: typeof navItems[0]) => {
    if (item.isProfile) {
      setShowProfile(true);
      return;
    }
    if (item.isAdd) {
      if (activeTrackerId) {
        // Dispatch a custom event to open the add expense sheet
        window.dispatchEvent(new CustomEvent('open-add-expense'));
      }
      return;
    }
    if (item.requiresTracker && !activeTrackerId) return;
    
    let path = item.path!;
    if (item.requiresTracker && activeTrackerId) {
      path = path.replace(':id', activeTrackerId);
    }
    navigate(path);
  };

  const isActive = (item: typeof navItems[0]) => {
    if (item.path === '/') return location.pathname === '/';
    if (item.requiresTracker && activeTrackerId) {
      const trackerPath = `/tracker/${activeTrackerId}`;
      if (item.label === 'Transactions') return location.pathname === trackerPath && (location.search.includes('tab=expenses') || !location.search.includes('tab='));
      if (item.label === 'Dashboard') return location.pathname === trackerPath && location.search.includes('tab=dashboard');
    }
    return false;
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'User';

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-bottom">
        <div className="max-w-lg mx-auto flex items-center justify-around py-1">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item);
            const disabled = item.requiresTracker && !activeTrackerId;

            if (item.isAdd) {
              return (
                <button
                  key={i}
                  onClick={() => handleNav(item)}
                  disabled={disabled}
                  className={`flex flex-col items-center justify-center py-1 px-3 ${disabled ? 'opacity-30' : ''}`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full ${disabled ? 'bg-muted' : 'bg-primary'} text-primary-foreground -mt-3 shadow-md`}>
                    <PlusCircle className="h-6 w-6" />
                  </div>
                </button>
              );
            }

            return (
              <button
                key={i}
                onClick={() => handleNav(item)}
                disabled={disabled && !item.isProfile}
                className={`flex flex-col items-center justify-center py-2 px-3 min-w-[56px] ${disabled && !item.isProfile ? 'opacity-30' : ''}`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-[10px] mt-0.5 ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={showProfile} onOpenChange={setShowProfile}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Profile</SheetTitle>
          </SheetHeader>
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                {firstName[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{profile?.full_name}</p>
                <p className="text-sm text-muted-foreground">Member since {profile?.created_at ? format(new Date(profile.created_at), 'MMM yyyy') : ''}</p>
              </div>
            </div>
            <Button variant="destructive" className="w-full h-11" onClick={() => { signOut(); setShowProfile(false); navigate('/auth'); }}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
