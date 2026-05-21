import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { House, Receipt, User } from '@phosphor-icons/react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTrackerId } = useApp();

  const isOnHomePage = location.pathname === '/';
  const isOnProfile = location.pathname === '/profile';
  const isInsideTracker = location.pathname.startsWith('/tracker/') && !location.pathname.includes('/upload');

  const goHome = () => navigate('/');
  const goTrackers = () => {
    if (activeTrackerId) navigate(`/tracker/${activeTrackerId}`);
    else navigate('/');
  };
  const goProfile = () => navigate('/profile');

  const items: {
    id: string;
    label: string;
    Icon: typeof House;
    active: boolean;
    onClick: () => void;
  }[] = [
    { id: 'home', label: 'Home', Icon: House, active: isOnHomePage, onClick: goHome },
    { id: 'trackers', label: 'Trackers', Icon: Receipt, active: isInsideTracker, onClick: goTrackers },
    { id: 'you', label: 'You', Icon: User, active: isOnProfile, onClick: goProfile },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 glass-nav border-t border-line-soft safe-bottom">
      <div className="max-w-lg mx-auto grid grid-cols-3">
        {items.map(item => {
          const { Icon, active } = item;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors"
            >
              <Icon
                size={22}
                weight={active ? 'fill' : 'regular'}
                color={active ? 'hsl(var(--ember))' : 'hsl(var(--ink-faint))'}
              />
              <span
                className="text-[10px] tracking-wide"
                style={{
                  color: active ? 'hsl(var(--ember))' : 'hsl(var(--ink-faint))',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
