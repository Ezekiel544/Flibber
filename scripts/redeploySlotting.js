const { ethers } = require("hardhat");
const fs = require("fs");

const CONTRACTS = {
  fibToken:      "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool: "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  feeEngine:     "0x3d8C62BD92852d61b141552809c61102D5feb1Ab",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🚀 Redeploying SlottingEngine...");
  console.log("Deployer:", deployer.address);

  // Deploy new SlottingEngine
  const SlottingEngine = await ethers.getContractFactory("SlottingEngine");
  const slottingEngine = await SlottingEngine.deploy(
    CONTRACTS.liquidityPool,
    CONTRACTS.feeEngine,
    CONTRACTS.fibToken
  );
  await slottingEngine.waitForDeployment();
  const newAddress = await slottingEngine.getAddress();
  console.log("✅ New SlottingEngine:", newAddress);

  // Grant roles on LiquidityPool
  const liquidityPool = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);
  const feeEngine     = await ethers.getContractAt("FeeEngine",     CONTRACTS.feeEngine);

  const SLOTTING_ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE"));
  const COLLECTOR_ROLE       = ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE"));

  console.log("\n🔑 Granting roles...");

  const tx1 = await liquidityPool.grantRole(SLOTTING_ENGINE_ROLE, newAddress);
  await tx1.wait();
  console.log("✅ SLOTTING_ENGINE_ROLE on LiquidityPool");

  const tx2 = await feeEngine.grantRole(COLLECTOR_ROLE, newAddress);
  await tx2.wait();
  console.log("✅ COLLECTOR_ROLE on FeeEngine");

  const tx3 = await liquidityPool.grantRole(SLOTTING_ENGINE_ROLE, CONTRACTS.feeEngine);
  await tx3.wait();
  console.log("✅ SLOTTING_ENGINE_ROLE for FeeEngine on LiquidityPool");

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("UPDATE your contracts.js with this address:");
  console.log(`slottingEngine: "${newAddress}"`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch(console.error);