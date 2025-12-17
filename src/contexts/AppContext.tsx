import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Company, Office, User } from '@/types';
import { mockCompany, mockOffices, mockUsers } from '@/data/mockData';

interface AppContextType {
  currentUser: User | null;
  currentCompany: Company | null;
  currentOffice: Office | null;
  offices: Office[];
  setCurrentOffice: (office: Office | null) => void;
  isCompanyLevel: boolean;
  setIsCompanyLevel: (value: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser] = useState<User | null>(mockUsers[5]); // Maria Santos (admin)
  const [currentCompany] = useState<Company | null>(mockCompany);
  const [currentOffice, setCurrentOffice] = useState<Office | null>(mockOffices[0]);
  const [isCompanyLevel, setIsCompanyLevel] = useState(false);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        currentCompany,
        currentOffice,
        offices: mockOffices,
        setCurrentOffice,
        isCompanyLevel,
        setIsCompanyLevel,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
