export const CONTRACTS = {
  fibToken:       "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  fibVesting:     "0xe367927578Ac6C7da335De45cAd35032150A5010",
  liquidityPool:  "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  feeEngine:      "0x42Cca27B2722954Ae0F25B86fd35263D359DDa91",
slottingEngine: "0xDe6be2E88e5ae83E435abC7583091E4AEBD88E73",
  fibStaking:     "0xD657b704Ba4bAF0296D1B1D55330430B4b06f1f4",
  governance:     "0x6DD341A53345307B45C4c72dacdf4e50d3E7241a",
  paymaster:      "0xB8A582747Ff414173C8b0e7736F034215cfd6BbC",
  lzRouter:       "0x45a2bC1CB77ECe92485dfD0Ad3111f08e1512B68",
  faucet:         "0x0e00b75850894472949FA785FF6233A1993AC23d",
  priceOracle:    "0x36e7B3f78401fCF52621d9B0562Ef4211e05bf32",
  // Stablecoins
  usdc:           "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdt:           "0xde85deDbEcD51b534a4c150481345C2C379ad738",
  dai:            "0xC4D42941b95c19E0a598f92D60A2261E475fd3f4",
  // EVM chain tokens
  weth:           "0x5401F807B778cB4B76dDfa960f8248813aAc6C26",
  wbtc:           "0x9f3509BF453199C1E03DA1b581A2933e219E7074",
  bnb:            "0x09E2adC9DeD3990870676974d6a06e398295f13e",
  // Non-EVM chain mock tokens
  sol:            "0x43713028B1B06b8592731dC94DF454648f0767e3",
  trx:            "0x9b8e77F82D11B043e285E7A1180ffe060d4C2bb6",
  avax:           "0x900dC3601F601557d0f469D9B224C9db894b26f6",
  matic:          "0x847497e6791b2faa3d9e6621EEE4f0981b1e2CE5",
  sui:            "0x5C9FAC63f380343361c56cdDF5A9A02EdEA5F976",
  apt:            "0x11fa98d175EA01C85301De1DfeD21907797ce4C6",
  xrp:            "0x57b1AeECD364C2f9cEC89c04Ee98EBc5FF65e4A1",
  doge:           "0xceB561655CB382de0201429007137aD26212FA52",
}

export const CHAIN_ID = 84532

export const FIB_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function getTotalBurned() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function faucet() external",
]

export const SLOTTING_ABI = [
  // amountOut now calculated on-chain — user passes minAmountOut for slippage protection
  "function requestSlot(address tokenIn, uint256 amountIn, address tokenOut, uint256 minAmountOut, address recipient, uint32 destChainId) returns (uint256)",
  "function quoteSlot(address tokenIn, uint256 amountIn, address tokenOut) view returns (uint256 amountOut, uint256 fibFee)",
  "function cancelSlot(uint256 slotId)",
  "function getSlot(uint256 slotId) view returns (tuple(address user, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address recipient, uint256 feeAmount, uint8 status, uint256 createdAt, uint256 filledAt, address filledBy, uint32 destChainId))",
  "function getUserSlots(address user) view returns (uint256[])",
  "function isSlotFillable(uint256 slotId) view returns (bool)",
  "function slotCounter() view returns (uint256)",
  "function slotExpiry() view returns (uint256)",
  "event SlotRequested(uint256 indexed slotId, address indexed user, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, address recipient, uint256 fibFee, uint32 destChainId)",
  "event SlotFilled(uint256 indexed slotId, address indexed filledBy, uint256 amountOut, uint256 fibFee)",
  "event SlotCancelled(uint256 indexed slotId)",
]

export const POOL_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdraw(address token, uint256 amount)",
  "function claimReward(address token)",
  "function getPoolBalance(address token) view returns (uint256)",
  "function getLPBalance(address lp, address token) view returns (uint256)",
  "function getPendingReward(address lp, address token) view returns (uint256)",
  "function getSupportedAssets() view returns (address[])",
  "function addSupportedAsset(address token)",
  "event Deposited(address indexed lp, address indexed token, uint256 amount)",
  "event Withdrawn(address indexed lp, address indexed token, uint256 amount)",
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

export const FAUCET_ABI = [
  "function claim() external",
  "function getClaimStatus(address wallet) view returns (bool canClaim, uint256 secondsLeft, uint256 nextClaimAt)",
  "function faucetBalance() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function totalClaimants() view returns (uint256)",
  "function dripAmount() view returns (uint256)",
  "function cooldown() view returns (uint256)",
  "function lastClaimed(address) view returns (uint256)",
  "event FIBClaimed(address indexed wallet, uint256 amount, uint256 nextClaimAt)",
]

export const ORACLE_ABI = [
  "function getUSDPrice(address token) view returns (uint256)",
  "function getAmountOut(address tokenIn, uint256 amountIn, uint8 tokenInDec, address tokenOut, uint8 tokenOutDec) view returns (uint256)",
]

export const SUPPORTED_TOKENS = [
  // Protocol token
{ symbol: "FIB",  name: "FLIBBER Token",  address: CONTRACTS.fibToken, decimals: 18, icon: "🟢", logoUrl: "/flibber.png", category: "Protocol" },
  // Stablecoins
  { symbol: "USDC", name: "USD Coin",        address: CONTRACTS.usdc,     decimals: 6,  icon: "🔵", logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",         category: "Stablecoin" },
  { symbol: "USDT", name: "Tether USD",      address: CONTRACTS.usdt,     decimals: 6,  icon: "🟩", logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png",        category: "Stablecoin" },
  { symbol: "DAI",  name: "Dai Stablecoin",  address: CONTRACTS.dai,      decimals: 18, icon: "🟡", logoUrl: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",    category: "Stablecoin" },
  // EVM chains
  { symbol: "WETH", name: "Wrapped Ether",   address: CONTRACTS.weth,     decimals: 18, icon: "⟠",  logoUrl: "https://assets.coingecko.com/coins/images/2518/small/weth.png",         category: "EVM"        },
  { symbol: "WBTC", name: "Wrapped Bitcoin", address: CONTRACTS.wbtc,     decimals: 8,  icon: "🟠", logoUrl: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", category: "EVM" },
  { symbol: "BNB",  name: "BNB",             address: CONTRACTS.bnb,      decimals: 18, icon: "🟤", logoUrl: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",  category: "EVM"        },
  // Non-EVM chains
  { symbol: "SOL",  name: "Solana",          address: CONTRACTS.sol,      decimals: 9,  icon: "🟣", logoUrl: "https://assets.coingecko.com/coins/images/4128/small/solana.png",       category: "Non-EVM"    },
  { symbol: "TRX",  name: "TRON",            address: CONTRACTS.trx,      decimals: 6,  icon: "🔴", logoUrl: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png",    category: "Non-EVM"    },
  { symbol: "AVAX", name: "Avalanche",       address: CONTRACTS.avax,     decimals: 18, icon: "🔺", logoUrl: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png", category: "Non-EVM" },
  { symbol: "MATIC",name: "Polygon",         address: CONTRACTS.matic,    decimals: 18, icon: "🟪", logoUrl: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",      category: "Non-EVM"    },
  { symbol: "SUI",  name: "Sui",             address: CONTRACTS.sui,      decimals: 9,  icon: "🔵", logoUrl: "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg",  category: "Non-EVM"    },
  { symbol: "APT",  name: "Aptos",           address: CONTRACTS.apt,      decimals: 8,  icon: "⬛", logoUrl: "https://assets.coingecko.com/coins/images/26455/small/aptos_round.png", category: "Non-EVM"    },
  { symbol: "XRP",  name: "XRP",             address: CONTRACTS.xrp,      decimals: 6,  icon: "🔷", logoUrl: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png", category: "Non-EVM" },
  { symbol: "DOGE", name: "Dogecoin",        address: CONTRACTS.doge,     decimals: 8,  icon: "🐕", logoUrl: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",        category: "Non-EVM"    },
]