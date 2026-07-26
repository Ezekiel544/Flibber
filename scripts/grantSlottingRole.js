const { ethers } = require("hardhat");

const CONTRACTS = {
  liquidityPool:  "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  slottingEngine: "0x37597899FD248E5D2ae95f79AFe7E9F02582DDfE",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Granting SLOTTING_ENGINE_ROLE...");

  const pool = await ethers.getContractAt("LiquidityPool", CONTRACTS.liquidityPool);

  const SLOTTING_ENGINE_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE")
  );

  // Check if role already granted
  const hasRole = await pool.hasRole(SLOTTING_ENGINE_ROLE, CONTRACTS.slottingEngine);
  console.log("Already has role?", hasRole);

  if (!hasRole) {
    const tx = await pool.grantRole(SLOTTING_ENGINE_ROLE, CONTRACTS.slottingEngine);
    await tx.wait();
    console.log("✅ Role granted!");
  } else {
    console.log("✅ Role already exists!");
  }

  // Verify
  const confirmed = await pool.hasRole(SLOTTING_ENGINE_ROLE, CONTRACTS.slottingEngine);
  console.log("Role confirmed:", confirmed);
  console.log("\n🎉 Now try Slot again!");
}

main().catch(console.error);