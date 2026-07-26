const { ethers } = require("hardhat");

const CONTRACTS = {
  fibToken:       "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool:  "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  feeEngine:      "0x3d8C62BD92852d61b141552809c61102D5feb1Ab",
  slottingEngine: "0x37597899FD248E5D2ae95f79AFe7E9F02582DDfE",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const pool       = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);
  const feeEngine  = await ethers.getContractAt("FeeEngine",     CONTRACTS.feeEngine);

  const SLOTTING_ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE"));
  const COLLECTOR_ROLE       = ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE"));

  // ── Fix 1: Give SlottingEngine COLLECTOR_ROLE on FeeEngine ──
  console.log("\n Checking COLLECTOR_ROLE on FeeEngine...");
  const hasCollector = await feeEngine.hasRole(COLLECTOR_ROLE, CONTRACTS.slottingEngine);
  console.log("SlottingEngine has COLLECTOR_ROLE?", hasCollector);
  if (!hasCollector) {
    const tx = await feeEngine.grantRole(COLLECTOR_ROLE, CONTRACTS.slottingEngine);
    await tx.wait();
    console.log("✅ COLLECTOR_ROLE granted to SlottingEngine!");
  } else {
    console.log("✅ Already has it!");
  }

  // ── Fix 2: Give FeeEngine SLOTTING_ENGINE_ROLE on LiquidityPool ──
  console.log("\n Checking SLOTTING_ENGINE_ROLE on LiquidityPool for FeeEngine...");
  const hasFeeEngineRole = await pool.hasRole(SLOTTING_ENGINE_ROLE, CONTRACTS.feeEngine);
  console.log("FeeEngine has SLOTTING_ENGINE_ROLE?", hasFeeEngineRole);
  if (!hasFeeEngineRole) {
    const tx = await pool.grantRole(SLOTTING_ENGINE_ROLE, CONTRACTS.feeEngine);
    await tx.wait();
    console.log("✅ SLOTTING_ENGINE_ROLE granted to FeeEngine!");
  } else {
    console.log("✅ Already has it!");
  }

  // ── Check actual balances ──
  console.log("\n📊 Checking actual balances...");
  const fibToken = await ethers.getContractAt("FIBToken", CONTRACTS.fibToken);
  const usdcContract = await ethers.getContractAt("FIBToken", "0x036CbD53842c5426634e7929541eC2318f3dCF7e");

  const poolFIB  = await fibToken.balanceOf(CONTRACTS.liquidityPool);
  const poolUSDC = await usdcContract.balanceOf(CONTRACTS.liquidityPool);
  const trackedFIB  = await pool.getPoolBalance(CONTRACTS.fibToken);
  const trackedUSDC = await pool.getPoolBalance("0x036CbD53842c5426634e7929541eC2318f3dCF7e");

  console.log("Pool actual FIB:   ", ethers.formatUnits(poolFIB, 18));
  console.log("Pool tracked FIB:  ", ethers.formatUnits(trackedFIB, 18));
  console.log("Pool actual USDC:  ", ethers.formatUnits(poolUSDC, 6));
  console.log("Pool tracked USDC: ", ethers.formatUnits(trackedUSDC, 6));

  console.log("\n🎉 All roles fixed! Now fix Bug 3 in SlottingEngine.sol");
}

main().catch(console.error);