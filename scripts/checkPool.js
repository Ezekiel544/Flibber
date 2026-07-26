const { ethers } = require("hardhat");

const CONTRACTS = {
  fibToken:      "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool: "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  usdc:          "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

async function main() {
  const liquidityPool = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);
  const fibToken      = await ethers.getContractAt("FIBToken",      CONTRACTS.fibToken);
  const usdc          = await ethers.getContractAt("FIBToken",      CONTRACTS.usdc);

  const poolFIBTracked  = await liquidityPool.getPoolBalance(CONTRACTS.fibToken);
  const poolUSDCTracked = await liquidityPool.getPoolBalance(CONTRACTS.usdc);
  const poolFIBActual   = await fibToken.balanceOf(CONTRACTS.liquidityPool);
  const poolUSDCActual  = await usdc.balanceOf(CONTRACTS.liquidityPool);

  console.log("\n📊 Pool Status:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("FIB  tracked by contract:", ethers.formatUnits(poolFIBTracked,  18));
  console.log("FIB  actual  in wallet:  ", ethers.formatUnits(poolFIBActual,   18));
  console.log("USDC tracked by contract:", ethers.formatUnits(poolUSDCTracked, 6));
  console.log("USDC actual  in wallet:  ", ethers.formatUnits(poolUSDCActual,  6));
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error);