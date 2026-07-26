const { ethers } = require("hardhat");

// ── Your deployed contract addresses ──────────────────────────────────────
const CONTRACTS = {
  fibToken:       "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool:  "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  slottingEngine: "0x37597899FD248E5D2ae95f79AFe7E9F02582DDfE",
  usdc:           "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

// ── REPLACE with your full Account 2 address ──────────────────────────────
const TESTER_WALLET = "PASTE_ACCOUNT_2_FULL_ADDRESS_HERE";

// ── Amounts ───────────────────────────────────────────────────────────────
const POOL_SEED_FIB = ethers.parseUnits("500000", 18); // 500,000 FIB into pool
const TESTER_FIB    = ethers.parseUnits("10000",  18); // 10,000  FIB to tester

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🚀 FLIBBER Testnet Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Deployer:", deployer.address);
  console.log("Tester  :", TESTER_WALLET);

  // ── Get contract instances ───────────────────────────────────────────────
  const fibToken      = await ethers.getContractAt("FIBToken",      CONTRACTS.fibToken);
  const liquidityPool = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);

  // ── Check deployer FIB balance ───────────────────────────────────────────
  const deployerFIB = await fibToken.balanceOf(deployer.address);
  console.log("\n📊 Deployer FIB balance:", ethers.formatUnits(deployerFIB, 18));

  // ── STEP 1: Add FIB as supported asset in pool ───────────────────────────
  console.log("\n🔧 Step 1: Adding FIB as supported asset...");
  try {
    const tx1 = await liquidityPool.addSupportedAsset(CONTRACTS.fibToken);
    await tx1.wait();
    console.log("✅ FIB added to pool whitelist");
  } catch (e) {
    if (e.message.includes("already supported")) {
      console.log("ℹ️  FIB already whitelisted — skipping");
    } else {
      console.log("❌ Failed:", e.message.slice(0, 120));
    }
  }

  // ── STEP 2: Add USDC as supported asset in pool ──────────────────────────
  console.log("\n🔧 Step 2: Adding USDC as supported asset...");
  try {
    const tx2 = await liquidityPool.addSupportedAsset(CONTRACTS.usdc);
    await tx2.wait();
    console.log("✅ USDC added to pool whitelist");
  } catch (e) {
    if (e.message.includes("already supported")) {
      console.log("ℹ️  USDC already whitelisted — skipping");
    } else {
      console.log("❌ Failed:", e.message.slice(0, 120));
    }
  }

  // ── STEP 3: Send FIB to tester wallet ───────────────────────────────────
  console.log("\n📤 Step 3: Sending 10,000 FIB to tester wallet...");
  try {
    const tx3 = await fibToken.transfer(TESTER_WALLET, TESTER_FIB);
    await tx3.wait();
    console.log("✅ 10,000 FIB sent to", TESTER_WALLET);
  } catch (e) {
    console.log("❌ Transfer failed:", e.message.slice(0, 120));
  }

  // ── STEP 4: Approve pool to spend deployer FIB ───────────────────────────
  console.log("\n🔓 Step 4: Approving pool to spend 500,000 FIB...");
  try {
    const tx4 = await fibToken.approve(CONTRACTS.liquidityPool, POOL_SEED_FIB);
    await tx4.wait();
    console.log("✅ Approval granted");
  } catch (e) {
    console.log("❌ Approval failed:", e.message.slice(0, 120));
  }

  // ── STEP 5: Deposit FIB into pool ────────────────────────────────────────
  console.log("\n💧 Step 5: Seeding pool with 500,000 FIB...");
  try {
    const tx5 = await liquidityPool.deposit(CONTRACTS.fibToken, POOL_SEED_FIB);
    await tx5.wait();
    console.log("✅ Pool seeded with 500,000 FIB");
  } catch (e) {
    console.log("❌ Deposit failed:", e.message.slice(0, 120));
  }

  // ── Final balances ────────────────────────────────────────────────────────
  console.log("\n📊 Final balances:");
  const testerFIB = await fibToken.balanceOf(TESTER_WALLET);
  const poolFIB   = await liquidityPool.getPoolBalance(CONTRACTS.fibToken);
  const poolUSDC  = await liquidityPool.getPoolBalance(CONTRACTS.usdc);

  console.log("Tester FIB  :", ethers.formatUnits(testerFIB, 18));
  console.log("Pool FIB    :", ethers.formatUnits(poolFIB,   18));
  console.log("Pool USDC   :", ethers.formatUnits(poolUSDC,  6));

  console.log("\n✅ Setup complete! Next steps:");
  console.log("   1. Go to faucet.circle.com → get USDC for tester wallet");
  console.log("   2. Switch MetaMask to Account 2");
  console.log("   3. Slot USDC → receive FIB");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});