require("dotenv").config();
const { ethers } = require("hardhat");

const FIB_TOKEN   = "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5";
const FUND_AMOUNT = ethers.parseEther("10000"); // seed with 10,000 FIB

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying FIBFaucet...");
  console.log("Deployer:", deployer.address);

  // Deploy faucet
  const Faucet = await ethers.getContractFactory("FIBFaucet");
  const faucet = await Faucet.deploy(FIB_TOKEN);
  await faucet.waitForDeployment();
  const faucetAddr = await faucet.getAddress();
  console.log("✅ FIBFaucet deployed:", faucetAddr);

  // Fund it with 10,000 FIB from deployer wallet
  console.log("💰 Funding faucet with 10,000 FIB...");
  const fib = await ethers.getContractAt("FIBToken", FIB_TOKEN);
  const tx  = await fib.transfer(faucetAddr, FUND_AMOUNT);
  await tx.wait();
  console.log("✅ Faucet funded");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("UPDATE contracts.js:");
  console.log(`faucet: "${faucetAddr}"`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(e => { console.error(e); process.exit(1); });