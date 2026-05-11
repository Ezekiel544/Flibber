import { useState, useCallback } from 'react';
import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits, formatEther } from 'viem';
import { CONTRACTS, SUPPORTED_TOKENS } from '../context/FlibberContext';
import SlottingEngineABI from '../abis/SlottingEngine.json';
import ERC20ABI from '../abis/ERC20.json';

export function useSlotting() {
  const { address } = useAccount();
  const [slotState, setSlotState] = useState('idle'); // idle | approving | slotting | success | error
  const [lastSlotId, setLastSlotId] = useState(null);
  const [error, setError] = useState(null);

  const { writeContractAsync } = useWriteContract();

  /**
   * Execute a slot request
   * @param tokenIn  Address of input token
   * @param tokenOut Address of output token
   * @param amount   Human-readable amount (e.g. "100")
   * @param destChainId  0 for same chain
   */
  const requestSlot = useCallback(async (tokenIn, tokenOut, amount, destChainId = 0) => {
    if (!address) return;
    setError(null);

    try {
      // Step 1: Approve tokenIn
      setSlotState('approving');
      const tokenInData = SUPPORTED_TOKENS.find(t => t.address === tokenIn);
      const amountParsed = parseUnits(amount, tokenInData?.decimals || 18);

      await writeContractAsync({
        address: tokenIn,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [CONTRACTS.SlottingEngine, amountParsed],
      });

      // Step 2: Approve FIB for fee (estimate: 0.2% of amount)
      const feeEstimate = parseEther((parseFloat(amount) * 0.002).toString());
      await writeContractAsync({
        address: CONTRACTS.FIBToken,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [CONTRACTS.SlottingEngine, feeEstimate * 2n], // 2x buffer
      });

      // Step 3: Request slot
      setSlotState('slotting');
      const tx = await writeContractAsync({
        address: CONTRACTS.SlottingEngine,
        abi: SlottingEngineABI,
        functionName: 'requestSlot',
        args: [tokenIn, tokenOut, amountParsed, destChainId],
      });

      setLastSlotId(tx);
      setSlotState('success');
      return tx;

    } catch (err) {
      console.error('Slot failed:', err);
      setError(err.message || 'Slot request failed');
      setSlotState('error');
    }
  }, [address, writeContractAsync]);

  const resetState = useCallback(() => {
    setSlotState('idle');
    setError(null);
    setLastSlotId(null);
  }, []);

  return { requestSlot, slotState, lastSlotId, error, resetState };
}

export function useFeeEstimate(amount) {
  const { data: feeEstimate } = useReadContract({
    address: CONTRACTS.SlottingEngine,
    abi: SlottingEngineABI,
    functionName: 'estimateFee',
    args: [amount ? parseEther(amount.toString()) : 0n],
    query: { enabled: !!amount && parseFloat(amount) > 0 },
  });

  return feeEstimate ? formatEther(feeEstimate) : '0';
}
