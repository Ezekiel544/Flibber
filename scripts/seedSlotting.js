const { ethers } = require("hardhat");

const CONTRACTS = {
  fibToken:       "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  slottingEngine: "0x37597899FD248E5D2ae95f79AFe7E9F02582DDfE",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🌱 Seeding SlottingEngine with FIB...");

  const fibToken = await ethers.getContractAt("FIBToken", CONTRACTS.fibToken);

  // Check balances before
  const deployerFIB = await fibToken.balanceOf(deployer.address);
  const slotFIB     = await fibToken.balanceOf(CONTRACTS.slottingEngine);

  console.log("Deployer FIB:        ", ethers.formatUnits(deployerFIB, 18));
  console.log("SlottingEngine FIB:  ", ethers.formatUnits(slotFIB,     18));

  const seedAmount = ethers.parseUnits("10000", 18); // 10,000 FIB

  // Transfer FIB directly to SlottingEngine
  console.log("\n💸 Sending 10,000 FIB to SlottingEngine...");
  const tx = await fibToken.transfer(CONTRACTS.slottingEngine, seedAmount);
  await tx.wait();
  console.log("✅ Done!");

  // Verify
  const newBal = await fibToken.balanceOf(CONTRACTS.slottingEngine);
  console.log("SlottingEngine FIB now:", ethers.formatUnits(newBal, 18));
  console.log("\n🎉 Try Slot now!");
}

main().catch(console.error);