const { ethers } = require("hardhat");

const CONTRACTS = {
  fibToken:       "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool:  "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  feeEngine:      "0x3d8C62BD92852d61b141552809c61102D5feb1Ab",
  slottingEngine: "0x37597899FD248E5D2ae95f79AFe7E9F02582DDfE",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🔑 Granting all roles...");
  console.log("Deployer:", deployer.address);

  const liquidityPool = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);
  const feeEngine     = await ethers.getContractAt("FeeEngine",     CONTRACTS.feeEngine);

  const SLOTTING_ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE"));
  const COLLECTOR_ROLE       = ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE"));

  // ── 1. SlottingEngine → LiquidityPool (fulfillSlot + reimburseSlot) ───
  console.log("\n📋 Step 1: SlottingEngine → LiquidityPool...");
  try {
    const tx = await liquidityPool.grantRole(SLOTTING_ENGINE_ROLE, CONTRACTS.slottingEngine);
    await tx.wait();
    console.log("✅ Done");
  } catch (e) {
    console.log("⚠️ ", e.message.slice(0, 100));
  }

  // ── 2. FeeEngine → LiquidityPool (distributeFee) ──────────────────────
  // FeeEngine calls liquidityPool.distributeFee() which requires SLOTTING_ENGINE_ROLE
  console.log("\n📋 Step 2: FeeEngine → LiquidityPool (distributeFee)...");
  try {
    const tx = await liquidityPool.grantRole(SLOTTING_ENGINE_ROLE, CONTRACTS.feeEngine);
    await tx.wait();
    console.log("✅ Done");
  } catch (e) {
    console.log("⚠️ ", e.message.slice(0, 100));
  }

  // ── 3. SlottingEngine → FeeEngine (collectAndDistribute) ──────────────
  console.log("\n📋 Step 3: SlottingEngine → FeeEngine...");
  try {
    const tx = await feeEngine.grantRole(COLLECTOR_ROLE, CONTRACTS.slottingEngine);
    await tx.wait();
    console.log("✅ Done");
  } catch (e) {
    console.log("⚠️ ", e.message.slice(0, 100));
  }

  // ── Verify all three ───────────────────────────────────────────────────
  console.log("\n🔍 Verifying all roles...");
  const r1 = await liquidityPool.hasRole(SLOTTING_ENGINE_ROLE, CONTRACTS.slottingEngine);
  const r2 = await liquidityPool.hasRole(SLOTTING_ENGINE_ROLE, CONTRACTS.feeEngine);
  const r3 = await feeEngine.hasRole(COLLECTOR_ROLE, CONTRACTS.slottingEngine);

  console.log("SlottingEngine → LiquidityPool:", r1 ? "✅" : "❌");
  console.log("FeeEngine      → LiquidityPool:", r2 ? "✅" : "❌");
  console.log("SlottingEngine → FeeEngine     :", r3 ? "✅" : "❌");

  if (r1 && r2 && r3) {
    console.log("\n🎉 All roles granted! Go try the slot on your frontend now.");
  } else {
    console.log("\n❌ Something still missing — share the output and we'll fix it.");
  }
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});