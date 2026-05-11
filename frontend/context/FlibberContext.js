import { createContext, useContext, useState } from 'react';

const FlibberContext = createContext(null);

// Contract addresses (update after deployment)
export const CONTRACTS = {
  FIBToken:       process.env.NEXT_PUBLIC_FIB_TOKEN       || '',
  LiquidityPool:  process.env.NEXT_PUBLIC_LIQUIDITY_POOL  || '',
  SlottingEngine: process.env.NEXT_PUBLIC_SLOTTING_ENGINE || '',
  FeeEngine:      process.env.NEXT_PUBLIC_FEE_ENGINE      || '',
  FIBStaking:     process.env.NEXT_PUBLIC_FIB_STAKING     || '',
};

export const SUPPORTED_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin',   address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6,  logo: '💵' },
  { symbol: 'FIB',  name: 'FLIBBER',    address: CONTRACTS.FIBToken,                           decimals: 18, logo: '🔷' },
  { symbol: 'WETH', name: 'Wrapped ETH',address: '0x4200000000000000000000000000000000000006', decimals: 18, logo: '⟠' },
];

export function FlibberProvider({ children }) {
  const [recentSlots, setRecentSlots] = useState([]);
  const [stats, setStats] = useState({
    totalVolume: '0',
    totalSlots: '0',
    totalBurned: '0',
    tvl: '0',
  });

  return (
    <FlibberContext.Provider value={{ recentSlots, setRecentSlots, stats, setStats, CONTRACTS, SUPPORTED_TOKENS }}>
      {children}
    </FlibberContext.Provider>
  );
}

export const useFlibber = () => useContext(FlibberContext);
