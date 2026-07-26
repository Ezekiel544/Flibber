const { ethers } = require("hardhat");

const CONTRACTS = {
  fibToken:      "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool: "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🌱 Re-seeding pool...");

  const fibToken      = await ethers.getContractAt("FIBToken",      CONTRACTS.fibToken);
  const liquidityPool = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);

  // Check real balances
  const deployerFIB   = await fibToken.balanceOf(deployer.address);
  const poolFIBActual = await fibToken.balanceOf(CONTRACTS.liquidityPool);
  const poolFIBTracked = await liquidityPool.getPoolBalance(CONTRACTS.fibToken);

  console.log("Deployer FIB:     ", ethers.formatUnits(deployerFIB,    18));
  console.log("Pool FIB (actual):", ethers.formatUnits(poolFIBActual,  18));
  console.log("Pool FIB (tracked):", ethers.formatUnits(poolFIBTracked, 18));

  if (poolFIBActual >= ethers.parseUnits("100", 18)) {
    console.log("\n✅ Pool already has FIB. No reseed needed.");
    return;
  }

  const seedAmount = ethers.parseUnits("500000", 18);

  // Step 1: Approve
  console.log("\n🔓 Approving...");
  const approveTx = await fibToken.approve(CONTRACTS.liquidityPool, seedAmount);
  await approveTx.wait();
  console.log("✅ Approved");

  // Step 2: Deposit
  console.log("\n💧 Depositing 500,000 FIB into pool...");
  const depositTx = await liquidityPool.deposit(CONTRACTS.fibToken, seedAmount);
  await depositTx.wait();
  console.log("✅ Deposited");

  // Verify
  const newActual  = await fibToken.balanceOf(CONTRACTS.liquidityPool);
  const newTracked = await liquidityPool.getPoolBalance(CONTRACTS.fibToken);
  console.log("\n📊 After reseed:");
  console.log("Pool FIB (actual): ", ethers.formatUnits(newActual,  18));
  console.log("Pool FIB (tracked):", ethers.formatUnits(newTracked, 18));
  console.log("\n🎉 Done! Try the slot now.");
}

main().catch(console.error);