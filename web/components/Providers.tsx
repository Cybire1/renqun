'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { WalletProvider } from '@/lib/wallet';
import { ConnectDialog } from './ConnectDialog';
import { FundsDialog } from './FundsDialog';

const FundsCtx = createContext<{ openFunds: () => void }>({ openFunds: () => {} });

export function useFunds() {
  return useContext(FundsCtx);
}

export function Providers({ children }: { children: ReactNode }) {
  const [fundsOpen, setFundsOpen] = useState(false);
  const funds = useMemo(() => ({ openFunds: () => setFundsOpen(true) }), []);
  return (
    <WalletProvider>
      <FundsCtx.Provider value={funds}>
        {children}
        <ConnectDialog />
        <FundsDialog open={fundsOpen} onClose={() => setFundsOpen(false)} />
      </FundsCtx.Provider>
    </WalletProvider>
  );
}
