import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { Home, ClipboardList, PlusCircle, BarChart2, User } from 'lucide-react';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: ClipboardList, label: 'Transactions', path: '/tracker/:id?tab=expenses', requiresTracker: true },
  { icon: PlusCircle, label: 'Add Txn', isAdd: true },
  { icon: BarChart2, label: 'Dashboard', path: '/tracker/:id?tab=dashboard', requiresTracker: true },
  { icon: User, label: 'Profile', isProfile: true },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTrackerId } = useApp();

  const isOnHomePage = location.pathname === '/';
  const isInsideTracker = location.pathname.startsWith('/tracker/') && !location.pathname.includes('/upload');

  const handleNav = (item: typeof navItems[0]) => {
    if (item.isProfile) {
      navigate('/profile');
      return;
    }
    if (item.isAdd) {
      if (isOnHomePage) {
        // On homepage: open create tracker sheet
        window.dispatchEvent(new CustomEvent('open-create-tracker'));
      } else if (isInsideTracker && activeTrackerId) {
        // Inside tracker: open add expense sheet
        window.dispatchEvent(new CustomEvent('open-add-expense'));
      }
      return;
    }
    // Transactions / Dashboard require being inside a tracker
    if (item.requiresTracker && (!activeTrackerId || isOnHomePage)) return;

    let path = item.path!;
    if (item.requiresTracker && activeTrackerId) {
      path = path.replace(':id', activeTrackerId);
    }
    navigate(path);
  };

  const isActive = (item: typeof navItems[0]) => {
    if (item.isProfile) return location.pathname === '/profile';
    if (item.path === '/') return location.pathname === '/';
    if (item.requiresTracker && activeTrackerId) {
      const trackerPath = `/tracker/${activeTrackerId}`;
      if (item.label === 'Transactions') return location.pathname === trackerPath && (location.search.includes('tab=expenses') || !location.search.includes('tab='));
      if (item.label === 'Dashboard') return location.pathname === trackerPath && location.search.includes('tab=dashboard');
    }
    return false;
  };

  // Contextual label and state for the + button
  const addLabel = isOnHomePage ? 'New Tracker' : 'Add Txn';
  const addDisabled = !isOnHomePage && !isInsideTracker;

  // Transactions & Dashboard disabled on homepage
  const isTrackerTabDisabled = (item: typeof navItems[0]) => {
    return item.requiresTracker && (isOnHomePage || !activeTrackerId);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-bottom">
        <div className="max-w-lg mx-auto flex items-center justify-around py-1">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item);

            if (item.isAdd) {
              return (
                <button
                  key={i}
                  onClick={() => handleNav(item)}
                  disabled={addDisabled}
                  className={`flex flex-col items-center justify-center py-1 px-3 ${addDisabled ? 'opacity-30' : ''}`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full ${addDisabled ? 'bg-muted' : 'bg-primary'} text-primary-foreground -mt-3 shadow-md`}>
                    <PlusCircle className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] mt-0.5 text-muted-foreground">{addLabel}</span>
                </button>
              );
            }

            const disabled = isTrackerTabDisabled(item);

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
    </>
  );
}
