const { ethers } = require("hardhat");

const CONTRACTS = {
  fibToken:  "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  feeEngine: "0x3d8C62BD92852d61b141552809c61102D5feb1Ab",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🔧 Fixing FeeEngine burn setup...");

  const fibToken  = await ethers.getContractAt("FIBToken",  CONTRACTS.fibToken);
  const FEE_BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FEE_BURNER_ROLE"));

  // Step 1: Grant FEE_BURNER_ROLE to FeeEngine
  console.log("\n📋 Step 1: Granting FEE_BURNER_ROLE to FeeEngine...");
  try {
    const tx = await fibToken.grantRole(FEE_BURNER_ROLE, CONTRACTS.feeEngine);
    await tx.wait();
    console.log("✅ Done");
  } catch (e) {
    console.log("⚠️ ", e.message.slice(0, 100));
  }

  // Step 2: Send FIB to FeeEngine so it can burn
  console.log("\n💧 Step 2: Sending 10,000 FIB to FeeEngine for burns...");
  try {
    const tx = await fibToken.transfer(
      CONTRACTS.feeEngine,
      ethers.parseUnits("10000", 18)
    );
    await tx.wait();
    console.log("✅ Done");
  } catch (e) {
    console.log("⚠️ ", e.message.slice(0, 100));
  }

  // Verify
  const hasBurnerRole = await fibToken.hasRole(FEE_BURNER_ROLE, CONTRACTS.feeEngine);
  const feeEngineFIB  = await fibToken.balanceOf(CONTRACTS.feeEngine);

  console.log("\n📊 Verification:");
  console.log("FeeEngine has FEE_BURNER_ROLE:", hasBurnerRole ? "✅" : "❌");
  console.log("FeeEngine FIB balance:         ", ethers.formatUnits(feeEngineFIB, 18));

  if (hasBurnerRole && feeEngineFIB > 0n) {
    console.log("\n🎉 Fixed! Try the slot now.");
  }
}

main().catch(console.error);