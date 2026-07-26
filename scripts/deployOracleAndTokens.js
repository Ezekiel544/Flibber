require("dotenv").config()
const { ethers } = require("hardhat")

const LIQUIDITY_POOL = "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377"
const USDC_ADDRESS   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const FIB_TOKEN      = "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5"
const USDT_ADDRESS   = "0xde85deDbEcD51b534a4c150481345C2C379ad738"

const CHAINLINK_ETH_USD  = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1"
const CHAINLINK_BTC_USD  = "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298"
const CHAINLINK_FEED_DEC = 8

// ── Already deployed — reuse these ───────────────────────────────────
const WETH_ALREADY = "0x5401F807B778cB4B76dDfa960f8248813aAc6C26"
const WBTC_ALREADY = "0x9f3509BF453199C1E03DA1b581A2933e219E7074"

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const DELAY = 8000 // 8 seconds — more breathing room

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deployer:", deployer.address)

  const MockERC20 = await ethers.getContractFactory("MockERC20")

  // ── Reuse already deployed tokens ────────────────────────────────
  console.log("♻️  Reusing WETH:", WETH_ALREADY)
  const weth = await ethers.getContractAt("MockERC20", WETH_ALREADY)
  console.log("♻️  Reusing WBTC:", WBTC_ALREADY)
  const wbtc = await ethers.getContractAt("MockERC20", WBTC_ALREADY)

  // ── Deploy BNB ────────────────────────────────────────────────────
  console.log("\nDeploying BNB..."); await sleep(DELAY)
  const bnb = await MockERC20.deploy("BNB", "BNB", 18)
  await bnb.waitForDeployment()
  console.log("✅ BNB:", await bnb.getAddress())

  // ── Deploy DAI ────────────────────────────────────────────────────
  console.log("Deploying DAI..."); await sleep(DELAY)
  const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18)
  await dai.waitForDeployment()
  console.log("✅ DAI:", await dai.getAddress())

  const wethAddr = WETH_ALREADY
  const wbtcAddr = WBTC_ALREADY
  const bnbAddr  = await bnb.getAddress()
  const daiAddr  = await dai.getAddress()

  // ── Deploy PriceOracle ────────────────────────────────────────────
  console.log("\n🔮 Deploying PriceOracle..."); await sleep(DELAY)
  const Oracle = await ethers.getContractFactory("PriceOracle")
  const oracle = await Oracle.deploy(LIQUIDITY_POOL, USDC_ADDRESS)
  await oracle.waitForDeployment()
  const oracleAddr = await oracle.getAddress()
  console.log("✅ PriceOracle:", oracleAddr)

  // ── Configure oracle ──────────────────────────────────────────────
  console.log("\n⚙️  Configuring oracle tokens...")
  const configs = [
    () => oracle.addStableToken(USDC_ADDRESS),
    () => oracle.addStableToken(USDT_ADDRESS),
    () => oracle.addStableToken(daiAddr),
    () => oracle.addPoolRatioToken(FIB_TOKEN),
    () => oracle.addChainlinkToken(wethAddr, CHAINLINK_ETH_USD, CHAINLINK_FEED_DEC),
    () => oracle.addChainlinkToken(wbtcAddr, CHAINLINK_BTC_USD, CHAINLINK_FEED_DEC),
    () => oracle.addChainlinkToken(bnbAddr,  CHAINLINK_ETH_USD, CHAINLINK_FEED_DEC),
  ]
  const configLabels = ["USDC stable","USDT stable","DAI stable","FIB pool-ratio","WETH chainlink","WBTC chainlink","BNB chainlink"]
  for (let i = 0; i < configs.length; i++) {
    await sleep(DELAY)
    await (await configs[i]()).wait()
    console.log(`✅ ${configLabels[i]}`)
  }

  // ── Mint test tokens ──────────────────────────────────────────────
  console.log("\n💰 Minting test tokens...")
  const mints = [
    [weth, deployer.address, ethers.parseEther("100"),    "100 WETH"],
    [wbtc, deployer.address, ethers.parseUnits("5", 8),  "5 WBTC"],
    [bnb,  deployer.address, ethers.parseEther("500"),   "500 BNB"],
    [dai,  deployer.address, ethers.parseEther("50000"), "50,000 DAI"],
  ]
  for (const [contract, to, amount, label] of mints) {
    await sleep(DELAY)
    await (await contract.mint(to, amount)).wait()
    console.log(`✅ Minted ${label}`)
  }

  // ── Add tokens to pool ────────────────────────────────────────────
  console.log("\n🏊 Adding tokens to pool...")
  const pool = await ethers.getContractAt("LiquidityPool", LIQUIDITY_POOL)
  for (const [addr, label] of [[wethAddr,"WETH"],[wbtcAddr,"WBTC"],[bnbAddr,"BNB"],[daiAddr,"DAI"]]) {
    await sleep(DELAY)
    await (await pool.addSupportedAsset(addr)).wait()
    console.log(`✅ ${label} added to pool`)
  }

  // ── Seed pool ─────────────────────────────────────────────────────
  console.log("\n🌊 Seeding pool...")
  const seeds = [
    [weth, wethAddr, ethers.parseEther("10"),        "10 WETH"],
    [wbtc, wbtcAddr, ethers.parseUnits("1", 8),     "1 WBTC"],
    [bnb,  bnbAddr,  ethers.parseEther("50"),        "50 BNB"],
    [dai,  daiAddr,  ethers.parseEther("10000"),     "10,000 DAI"],
  ]
  for (const [contract, addr, amount, label] of seeds) {
    await sleep(DELAY)
    await (await contract.approve(LIQUIDITY_POOL, amount)).wait()
    await sleep(DELAY)
    await (await pool.deposit(addr, amount)).wait()
    console.log(`✅ Seeded ${label}`)
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("UPDATE contracts.js:")
  console.log(`priceOracle: "${oracleAddr}",`)
  console.log(`weth:        "${wethAddr}",`)
  console.log(`wbtc:        "${wbtcAddr}",`)
  console.log(`bnb:         "${bnbAddr}",`)
  console.log(`dai:         "${daiAddr}",`)
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

main().catch(e => { console.error(e); process.exit(1) })