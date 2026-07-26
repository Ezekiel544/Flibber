require("dotenv").config()
const { ethers } = require("hardhat")

const POOL         = "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377"
const FEE_ENGINE   = "0x3d8C62BD92852d61b141552809c61102D5feb1Ab"
const FIB_TOKEN    = "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5"
const ORACLE       = "0x36e7B3f78401fCF52621d9B0562Ef4211e05bf32"
const USDC         = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const USDT         = "0xde85deDbEcD51b534a4c150481345C2C379ad738"
const WETH         = "0x5401F807B778cB4B76dDfa960f8248813aAc6C26"
const WBTC         = "0x9f3509BF453199C1E03DA1b581A2933e219E7074"
const BNB          = "0x09E2adC9DeD3990870676974d6a06e398295f13e"
const DAI          = "0xC4D42941b95c19E0a598f92D60A2261E475fd3f4"

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const DELAY = 5000

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deployer:", deployer.address)

  // Deploy new SlottingEngine with oracle
  console.log("\n🚀 Deploying SlottingEngine with oracle...")
  const SE = await ethers.getContractFactory("SlottingEngine")
  const se = await SE.deploy(POOL, FEE_ENGINE, FIB_TOKEN, ORACLE)
  await se.waitForDeployment()
  const seAddr = await se.getAddress()
  console.log("✅ SlottingEngine:", seAddr)

  // Grant roles
  console.log("\n🔑 Granting roles...")
  await sleep(DELAY)
  const pool = await ethers.getContractAt("LiquidityPool", POOL)
  await (await pool.grantRole(ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE")), seAddr)).wait()
  console.log("✅ SLOTTING_ENGINE_ROLE on pool")

  await sleep(DELAY)
  const fee = await ethers.getContractAt("FeeEngine", FEE_ENGINE)
  await (await fee.grantRole(ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE")), seAddr)).wait()
  console.log("✅ COLLECTOR_ROLE on FeeEngine")

  // Register token decimals
  console.log("\n📝 Registering token decimals...")
  const tokens = [
    [FIB_TOKEN, 18, "FIB"],
    [USDC,       6, "USDC"],
    [USDT,       6, "USDT"],
    [DAI,       18, "DAI"],
    [WETH,      18, "WETH"],
    [WBTC,       8, "WBTC"],
    [BNB,       18, "BNB"],
  ]
  for (const [addr, dec, symbol] of tokens) {
    await sleep(DELAY)
    await (await se.setTokenDecimals(addr, dec)).wait()
    console.log(`✅ ${symbol} → ${dec} decimals`)
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("UPDATE contracts.js:")
  console.log(`slottingEngine: "${seAddr}",`)
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

main().catch(e => { console.error(e); process.exit(1) })