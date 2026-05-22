export const CONTRACTS = {
  fibToken:       "0x81B13EBd205165D77e83A3523f2E01565A757402",
  liquidityPool:  "0xC8BC2Edd47dAbBEC9898A1BA56ca89D12cEA89EF",
  feeEngine:      "0x4a8763030c99A88372be93AAbd8d85d463487aa8",
  slottingEngine: "0x83Fa5Fed1F1c369aEDB54bd6E977D738ee7d420A",
  fibStaking:     "0x815cE2C01b3e2f6ac6852d01420a71dC5DC2598b",
  governance:     "0x23BfD9dF015B0f19E697debfe649953e49ca7633",
  usdc:           "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
}
export const CHAIN_ID = 84532

export const FIB_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function getTotalBurned() view returns (uint256)",
]
export const SLOTTING_ABI = [
  "function requestSlot(address,uint256,address,uint256,address,bool,uint32) returns (uint256)",
  "function cancelSlot(uint256)",
  "function getUserSlots(address) view returns (uint256[])",
  "function slotCounter() view returns (uint256)",
  "event SlotFilled(uint256 indexed slotId, address indexed filledBy, uint256 amountOut, uint256 fee)",
]
export const POOL_ABI = [
  "function deposit(address,uint256)",
  "function withdraw(address,uint256)",
  "function claimReward(address)",
  "function getPoolBalance(address) view returns (uint256)",
  "function getLPBalance(address,address) view returns (uint256)",
  "function getPendingReward(address,address) view returns (uint256)",
]
export const STAKING_ABI = [
  "function stake(uint256)",
  "function requestUnstake(uint256)",
  "function unstake()",
  "function claimReward()",
  "function getStakeInfo(address) view returns (tuple(uint256 amount,uint256 rewardDebt,uint256 pendingReward,uint256 unstakeRequestTime,uint256 unstakeAmount))",
  "function pendingReward(address) view returns (uint256)",
  "function votingPower(address) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
]
export const GOVERNANCE_ABI = [
  "function propose(string,address,bytes) returns (uint256)",
  "function castVote(uint256,bool)",
  "function finalizeProposal(uint256)",
  "function proposalCount() view returns (uint256)",
  "function hasVoted(uint256,address) view returns (bool)",
]
export const SUPPORTED_TOKENS = [
  { symbol: "FIB",  name: "FLIBBER Token", address: CONTRACTS.fibToken, decimals: 18 },
  { symbol: "USDC", name: "USD Coin",       address: CONTRACTS.usdc,     decimals: 6  },
]
