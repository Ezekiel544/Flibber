require("dotenv").config()
const { ethers } = require("hardhat")

const ORACLE           = "0x36e7B3f78401fCF52621d9B0562Ef4211e05bf32"
const LIQUIDITY_POOL   = "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377"
const SLOTTING_ENGINE  = "0x5557A3104759C5cCf03d857aCb47291BFDe34d47"
const CHAINLINK_ETH_USD = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" // reuse ETH feed as placeholder

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const DELAY = 6000

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deployer:", deployer.address)

  const MockERC20 = await ethers.getContractFactory("MockERC20")
  const oracle    = await ethers.getContractAt("PriceOracle",     ORACLE)
  const pool      = await ethers.getContractAt("LiquidityPool",   LIQUIDITY_POOL)
  const se        = await ethers.getContractAt("SlottingEngine",  SLOTTING_ENGINE)

  // ── Deploy mock non-EVM chain tokens ─────────────────────────────
  // These represent cross-chain assets on testnet
  // On mainnet these would be real bridged/wrapped versions
  const newTokens = [
    { name: "Wrapped SOL",    symbol: "SOL",  decimals: 9,  seedAmount: "1000" },
    { name: "Wrapped TRX",    symbol: "TRX",  decimals: 6,  seedAmount: "100000" },
    { name: "Wrapped AVAX",   symbol: "AVAX", decimals: 18, seedAmount: "500" },
    { name: "Wrapped MATIC",  symbol: "MATIC",decimals: 18, seedAmount: "10000" },
    { name: "Wrapped SUI",    symbol: "SUI",  decimals: 9,  seedAmount: "5000" },
    { name: "Wrapped APT",    symbol: "APT",  decimals: 8,  seedAmount: "1000" },
    { name: "Wrapped XRP",    symbol: "XRP",  decimals: 6,  seedAmount: "10000" },
    { name: "Wrapped DOGE",   symbol: "DOGE", decimals: 8,  seedAmount: "100000" },
  ]

  const deployed = {}

  for (const t of newTokens) {
    console.log(`\nDeploying ${t.symbol}...`); await sleep(DELAY)
    const contract = await MockERC20.deploy(t.name, t.symbol, t.decimals)
    await contract.waitForDeployment()
    const addr = await contract.getAddress()
    deployed[t.symbol] = { address: addr, contract, decimals: t.decimals, seedAmount: t.seedAmount }
    console.log(`✅ ${t.symbol}: ${addr}`)
  }

  // ── Register all as Chainlink tokens in oracle ────────────────────
  // Using ETH/USD feed as placeholder — on mainnet use real feeds
  console.log("\n⚙️  Configuring oracle...")
  for (const [symbol, t] of Object.entries(deployed)) {
    await sleep(DELAY)
    await (await oracle.addChainlinkToken(t.address, CHAINLINK_ETH_USD, 8)).wait()
    console.log(`✅ ${symbol} → oracle (ETH feed placeholder)`)
  }

  // ── Mint and seed pool ────────────────────────────────────────────
  console.log("\n💰 Minting and seeding pool...")
  for (const [symbol, t] of Object.entries(deployed)) {
    const amount = ethers.parseUnits(t.seedAmount, t.decimals)

    await sleep(DELAY)
    await (await pool.addSupportedAsset(t.address)).wait()
    console.log(`✅ ${symbol} added to pool`)

    await sleep(DELAY)
    await (await t.contract.mint(deployer.address, amount)).wait()

    await sleep(DELAY)
    await (await t.contract.approve(LIQUIDITY_POOL, amount)).wait()

    await sleep(DELAY)
    await (await pool.deposit(t.address, amount)).wait()
    console.log(`✅ Seeded ${t.seedAmount} ${symbol}`)

    // Register decimals in SlottingEngine
    await sleep(DELAY)
    await (await se.setTokenDecimals(t.address, t.decimals)).wait()
    console.log(`✅ ${symbol} decimals registered in SlottingEngine`)
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("ADD to contracts.js CONTRACTS object:")
  for (const [symbol, t] of Object.entries(deployed)) {
    console.log(`  ${symbol.toLowerCase()}: "${t.address}",`)
  }
  console.log("\nADD to SUPPORTED_TOKENS array:")
  const icons = { SOL:'🟣', TRX:'🔴', AVAX:'🔺', MATIC:'🟪', SUI:'🔵', APT:'⬛', XRP:'🔷', DOGE:'🐕' }
  for (const [symbol, t] of Object.entries(deployed)) {
    console.log(`  { symbol: "${symbol}", name: "${newTokens.find(x=>x.symbol===symbol).name}", address: CONTRACTS.${symbol.toLowerCase()}, decimals: ${t.decimals}, icon: "${icons[symbol]}" },`)
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

main().catch(e => { console.error(e); process.exit(1) })