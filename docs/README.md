# FLIBBER Protocol

## The Cross-Chain Liquidity Slotting Protocol

FLIBBER replaces traditional bridging with a novel **Slotting Mechanism** — instant cross-chain asset matching via a unified liquidity reservoir.

---

## Architecture

```
User
 │
 ▼
SlottingEngine          ← Core protocol primitive
 ├── LiquidityPool      ← Unified asset reservoir
 ├── FeeEngine          ← 40% LPs / 40% Treasury / 20% Burn
 └── LayerZeroRouter    ← Cross-chain messaging

FIBToken                ← ERC-20, 1B hard cap, deflationary
FIBVesting              ← All allocation vesting schedules
FIBStaking              ← Stake FIB → earn protocol fees
FIBPaymaster            ← Pay gas in $FIB on any chain (ERC-4337)
FlibberGovernance       ← On-chain voting (1 staked FIB = 1 vote)
```

---

## Contracts

| Contract | Purpose |
|---|---|
| FIBToken.sol | $FIB ERC-20, hard capped 1B, burn mechanism |
| FIBVesting.sol | All token allocation vesting schedules |
| LiquidityPool.sol | Unified liquidity reservoir |
| FeeEngine.sol | Collects fees, splits 40/40/20 |
| SlottingEngine.sol | Core slotting mechanism + solver network |
| FIBStaking.sol | Stake FIB, earn fees, governance power |
| FlibberGovernance.sol | On-chain proposals + voting |
| FIBPaymaster.sol | ERC-4337 paymaster, $FIB as universal gas |
| LayerZeroRouter.sol | Cross-chain messaging via LayerZero V2 |

---

## Deployment

```bash
cp .env.example .env
# Fill in PRIVATE_KEY and BASESCAN_API_KEY

npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network base-sepolia
```

---

## Testing
```bash
npx hardhat test
```

---

## Token Distribution

| Allocation | % | Tokens | Vesting |
|---|---|---|---|
| Liquidity | 37.31% | 372,900,000 | 80% TGE + 6mo linear |
| Treasury | 22.27% | 222,700,000 | 6mo cliff + 36mo linear |
| Ecosystem | 15.93% | 159,300,000 | 60% TGE + 12mo |
| VC/Private | 10.00% | 100,000,000 | 6mo cliff + 18mo linear |
| Team | 5.35% | 53,500,000 | 12mo cliff + 36mo linear |
| Advisor/KOL | 5.35% | 53,500,000 | 10% TGE + 3mo cliff + 9mo |
| Launchpad | 3.81% | 38,100,000 | 100% TGE |

---

## Fee Distribution

Every protocol transaction:
- **40%** → LP stakers (yield)
- **40%** → Treasury (operations)
- **20%** → Burned forever (deflationary)

---

## Security Notice
This codebase is for testnet. A full audit is required before mainnet launch.

## License
MIT
