import { useState, useCallback } from 'react';
import { useWriteContract, useReadContract, useAccount } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS } from '../context/FlibberContext';
import FIBStakingABI from '../abis/FIBStaking.json';
import ERC20ABI from '../abis/ERC20.json';

export function useStaking() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const { writeContractAsync } = useWriteContract();

  const { data: stakeInfo } = useReadContract({
    address: CONTRACTS.FIBStaking,
    abi: FIBStakingABI,
    functionName: 'getStakeInfo',
    args: [address],
    query: { enabled: !!address },
  });

  const { data: pendingReward } = useReadContract({
    address: CONTRACTS.FIBStaking,
    abi: FIBStakingABI,
    functionName: 'pendingReward',
    args: [address],
    query: { enabled: !!address },
  });

  const stakeFIB = useCallback(async (amount) => {
    setLoading(true);
    try {
      const amountParsed = parseEther(amount);
      // Approve first
      await writeContractAsync({
        address: CONTRACTS.FIBToken,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [CONTRACTS.FIBStaking, amountParsed],
      });
      // Stake
      await writeContractAsync({
        address: CONTRACTS.FIBStaking,
        abi: FIBStakingABI,
        functionName: 'stake',
        args: [amountParsed],
      });
    } finally {
      setLoading(false);
    }
  }, [writeContractAsync]);

  const unstakeFIB = useCallback(async (amount) => {
    setLoading(true);
    try {
      await writeContractAsync({
        address: CONTRACTS.FIBStaking,
        abi: FIBStakingABI,
        functionName: 'unstake',
        args: [parseEther(amount)],
      });
    } finally {
      setLoading(false);
    }
  }, [writeContractAsync]);

  const claimRewards = useCallback(async () => {
    setLoading(true);
    try {
      await writeContractAsync({
        address: CONTRACTS.FIBStaking,
        abi: FIBStakingABI,
        functionName: 'claimRewards',
        args: [],
      });
    } finally {
      setLoading(false);
    }
  }, [writeContractAsync]);

  return {
    stakedAmount: stakeInfo ? formatEther(stakeInfo[0]) : '0',
    stakedAt: stakeInfo ? Number(stakeInfo[1]) : 0,
    unlockAt: stakeInfo ? Number(stakeInfo[2]) : 0,
    pendingReward: pendingReward ? formatEther(pendingReward) : '0',
    stakeFIB,
    unstakeFIB,
    claimRewards,
    loading,
  };
}
