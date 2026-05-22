const { ethers } = require("hardhat");

/**
 * FLIBBER Protocol — Full Deployment Script
 * Deploys all contracts in correct dependency order
 * Target: Base Sepolia (testnet) or Base Mainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("═══════════════════════════════════════════");
  console.log("  FLIBBER Protocol — Deployment");
  console.log("═══════════════════════════════════════════");
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  const deployed = {};

  // ── 1. FIB Token ────────────────────────────────────────────────────────
  console.log("1️⃣  Deploying FIBToken...");
  const FIBToken = await ethers.getContractFactory("FIBToken");
  const fibToken = await FIBToken.deploy(deployer.address); // treasury = deployer initially
  await fibToken.waitForDeployment();
  deployed.fibToken = await fibToken.getAddress();
  console.log("   ✅ FIBToken:", deployed.fibToken);

  // ── 2. FIB Vesting ──────────────────────────────────────────────────────
  console.log("2️⃣  Deploying FIBVesting...");
  const FIBVesting = await ethers.getContractFactory("FIBVesting");
  const fibVesting = await FIBVesting.deploy(deployed.fibToken);
  await fibVesting.waitForDeployment();
  deployed.fibVesting = await fibVesting.getAddress();
  console.log("   ✅ FIBVesting:", deployed.fibVesting);

  // ── 3. Liquidity Pool ───────────────────────────────────────────────────
  console.log("3️⃣  Deploying LiquidityPool...");
  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  const liquidityPool = await LiquidityPool.deploy();
  await liquidityPool.waitForDeployment();
  deployed.liquidityPool = await liquidityPool.getAddress();
  console.log("   ✅ LiquidityPool:", deployed.liquidityPool);

  // ── 4. Fee Engine ───────────────────────────────────────────────────────
  console.log("4️⃣  Deploying FeeEngine...");
  const FeeEngine = await ethers.getContractFactory("FeeEngine");
  const feeEngine = await FeeEngine.deploy(
    deployed.fibToken,
    deployed.liquidityPool,
    deployer.address // treasury wallet
  );
  await feeEngine.waitForDeployment();
  deployed.feeEngine = await feeEngine.getAddress();
  console.log("   ✅ FeeEngine:", deployed.feeEngine);

  // ── 5. Slotting Engine ──────────────────────────────────────────────────
  console.log("5️⃣  Deploying SlottingEngine...");
  const SlottingEngine = await ethers.getContractFactory("SlottingEngine");
  const slottingEngine = await SlottingEngine.deploy(
    deployed.liquidityPool,
    deployed.feeEngine,
    deployed.fibToken
  );
  await slottingEngine.waitForDeployment();
  deployed.slottingEngine = await slottingEngine.getAddress();
  console.log("   ✅ SlottingEngine:", deployed.slottingEngine);

  // ── 6. FIB Staking ──────────────────────────────────────────────────────
  console.log("6️⃣  Deploying FIBStaking...");
  const FIBStaking = await ethers.getContractFactory("FIBStaking");
  const fibStaking = await FIBStaking.deploy(deployed.fibToken);
  await fibStaking.waitForDeployment();
  deployed.fibStaking = await fibStaking.getAddress();
  console.log("   ✅ FIBStaking:", deployed.fibStaking);

  // ── 7. Governance ───────────────────────────────────────────────────────
  console.log("7️⃣  Deploying FlibberGovernance...");
  const FlibberGovernance = await ethers.getContractFactory("contracts/governance/FlibberGovernance.sol:FlibberGovernance");
  const governance = await FlibberGovernance.deploy(deployed.fibStaking);
  await governance.waitForDeployment();
  deployed.governance = await governance.getAddress();
  console.log("   ✅ FlibberGovernance:", deployed.governance);

  // ── 8. Paymaster ────────────────────────────────────────────────────────
  console.log("8️⃣  Deploying FIBPaymaster...");
  // ERC-4337 EntryPoint on Base Sepolia
  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const FIB_PER_ETH = ethers.parseEther("5000"); // 1 ETH = 5000 FIB (testnet rate)

  const FIBPaymaster = await ethers.getContractFactory("FIBPaymaster");
  const paymaster = await FIBPaymaster.deploy(
    deployed.fibToken,
    ENTRY_POINT,
    FIB_PER_ETH
  );
  await paymaster.waitForDeployment();
  deployed.paymaster = await paymaster.getAddress();
  console.log("   ✅ FIBPaymaster:", deployed.paymaster);

  // ── 9. LayerZero Router ─────────────────────────────────────────────────
  console.log("9️⃣  Deploying LayerZeroRouter...");
  // LayerZero V2 endpoint on Base Sepolia
  const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const LayerZeroRouter = await ethers.getContractFactory("LayerZeroRouter");
  const lzRouter = await LayerZeroRouter.deploy(LZ_ENDPOINT);
  await lzRouter.waitForDeployment();
  deployed.lzRouter = await lzRouter.getAddress();
  console.log("   ✅ LayerZeroRouter:", deployed.lzRouter);

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE SETUP — Wire contracts together
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("🔐 Setting up roles...");

  const SLOTTING_ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE"));
  const COLLECTOR_ROLE       = ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE"));
  const FEE_BURNER_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("FEE_BURNER_ROLE"));
  const SOLVER_ROLE          = ethers.keccak256(ethers.toUtf8Bytes("SOLVER_ROLE"));

  // LiquidityPool: grant SlottingEngine permission to fulfill/reimburse slots
  await (await liquidityPool.grantRole(SLOTTING_ENGINE_ROLE, deployed.slottingEngine)).wait();
  console.log("   ✅ SlottingEngine → LiquidityPool (SLOTTING_ENGINE_ROLE)");

  // FeeEngine: grant SlottingEngine permission to collect fees
  await (await feeEngine.grantRole(COLLECTOR_ROLE, deployed.slottingEngine)).wait();
  console.log("   ✅ SlottingEngine → FeeEngine (COLLECTOR_ROLE)");

  // FIBToken: grant FeeEngine permission to burn fees
  await (await fibToken.grantRole(FEE_BURNER_ROLE, deployed.feeEngine)).wait();
  console.log("   ✅ FeeEngine → FIBToken (FEE_BURNER_ROLE)");

  // SlottingEngine: grant deployer as initial solver for testnet
  await (await slottingEngine.grantRole(SOLVER_ROLE, deployer.address)).wait();
  console.log("   ✅ Deployer → SlottingEngine (SOLVER_ROLE) [testnet only]");

  // ─────────────────────────────────────────────────────────────────────────
  // ADD SUPPORTED ASSETS (testnet tokens)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("🪙 Adding supported assets...");

  // Base Sepolia USDC (testnet)
  const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  await (await liquidityPool.addSupportedAsset(USDC_BASE_SEPOLIA)).wait();
  console.log("   ✅ USDC added to pool");

  // FIB itself
  await (await liquidityPool.addSupportedAsset(deployed.fibToken)).wait();
  console.log("   ✅ FIB added to pool");

  // ─────────────────────────────────────────────────────────────────────────
  // PRINT DEPLOYMENT SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log("  ✅ DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log("");
  console.log("Contract Addresses:");
  console.log("───────────────────────────────────────────");
  Object.entries(deployed).forEach(([name, addr]) => {
    console.log(`  ${name.padEnd(18)}: ${addr}`);
  });
  console.log("");
  console.log("Next Steps:");
  console.log("  1. Fund LiquidityPool with test tokens");
  console.log("  2. Fund Paymaster with testnet ETH");
  console.log("  3. Start testnet solver backend");
  console.log("  4. Configure LayerZero trusted remotes");
  console.log("  5. Launch frontend and share testnet link");
  console.log("");

  // Save addresses to file for frontend
  const fs = require("fs");
  const addresses = {
    network:        (await ethers.provider.getNetwork()).name,
    chainId:        Number((await ethers.provider.getNetwork()).chainId),
    deployedAt:     new Date().toISOString(),
    contracts:      deployed
  };
  fs.writeFileSync(
    "./deployedAddresses.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("📄 Addresses saved to deployedAddresses.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
