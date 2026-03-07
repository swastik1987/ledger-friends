import { createContext, useContext, useState, ReactNode } from 'react';

interface AppContextType {
  activeTrackerId: string | null;
  setActiveTrackerId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType>({
  activeTrackerId: null,
  setActiveTrackerId: () => {},
});

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeTrackerId, setActiveTrackerId] = useState<string | null>(null);

  return (
    <AppContext.Provider value={{ activeTrackerId, setActiveTrackerId }}>
      {children}
    </AppContext.Provider>
  );
}
