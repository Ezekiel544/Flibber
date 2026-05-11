/**
 * FLIBBER — Contract Verification Script
 * Run after deployment to verify all contracts on Basescan
 * Usage: hardhat run scripts/verify.js --network base-sepolia
 */

const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = process.env.HARDHAT_NETWORK || "base-sepolia";
  const deploymentPath = path.join(__dirname, `../deployments/${network}.json`);

  if (!fs.existsSync(deploymentPath)) {
    console.error(`❌ No deployment found for ${network}. Run deploy.js first.`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath));
  const { addresses, config } = deployment;

  console.log(`\n🔍 Verifying contracts on ${network}...\n`);

  const verifications = [
    {
      name: "FIBToken",
      address: addresses.FIBToken,
      constructorArgs: [
        deployment.config?.TREASURY      || process.env.TREASURY_ADDRESS,
        deployment.config?.LIQUIDITY     || process.env.LIQUIDITY_ADDRESS,
        deployment.config?.ECOSYSTEM     || process.env.ECOSYSTEM_ADDRESS,
        deployment.config?.TEAM          || process.env.TEAM_ADDRESS,
        deployment.config?.INVESTORS     || process.env.INVESTORS_ADDRESS,
        deployment.config?.KOL_ADVISORS  || process.env.KOL_ADVISORS_ADDRESS,
        deployment.config?.PUBLIC_SALE   || process.env.PUBLIC_SALE_ADDRESS,
      ],
      contract: "contracts/token/FIBToken.sol:FIBToken",
    },
    {
      name: "FIBVesting",
      address: addresses.FIBVesting,
      constructorArgs: [addresses.FIBToken],
      contract: "contracts/token/FIBVesting.sol:FIBVesting",
    },
    {
      name: "LiquidityPool",
      address: addresses.LiquidityPool,
      constructorArgs: [addresses.FIBToken],
      contract: "contracts/core/LiquidityPool.sol:FlibberLiquidityPool",
    },
    {
      name: "FeeEngine",
      address: addresses.FeeEngine,
      constructorArgs: [addresses.FIBToken, process.env.TREASURY_ADDRESS],
      contract: "contracts/core/FeeEngine.sol:FeeEngine",
    },
    {
      name: "FIBStaking",
      address: addresses.FIBStaking,
      constructorArgs: [addresses.FIBToken],
      contract: "contracts/staking/FIBStaking.sol:FIBStaking",
    },
    {
      name: "GovernanceModule",
      address: addresses.GovernanceModule,
      constructorArgs: [addresses.FIBStaking],
      contract: "contracts/staking/GovernanceModule.sol:FlibberGovernance",
    },
    {
      name: "SlottingEngine",
      address: addresses.SlottingEngine,
      constructorArgs: [addresses.LiquidityPool, addresses.FeeEngine, addresses.FIBToken],
      contract: "contracts/core/SlottingEngine.sol:SlottingEngine",
    },
    {
      name: "FIBPaymaster",
      address: addresses.FIBPaymaster,
      constructorArgs: [addresses.FIBToken, config.entryPoint],
      contract: "contracts/gasabstraction/FIBPaymaster.sol:FIBPaymaster",
    },
    {
      name: "LayerZeroRouter",
      address: addresses.LayerZeroRouter,
      constructorArgs: [config.lzEndpoint, addresses.SlottingEngine],
      contract: "contracts/crosschain/LayerZeroRouter.sol:LayerZeroRouter",
    },
  ];

  for (const v of verifications) {
    console.log(`📄 Verifying ${v.name} at ${v.address}...`);
    try {
      await run("verify:verify", {
        address: v.address,
        constructorArguments: v.constructorArgs,
        contract: v.contract,
      });
      console.log(`   ✅ ${v.name} verified!\n`);
    } catch (e) {
      if (e.message.includes("Already Verified")) {
        console.log(`   ℹ️  ${v.name} already verified\n`);
      } else {
        console.log(`   ⚠️  ${v.name} verification failed: ${e.message}\n`);
      }
    }
  }

  console.log("✅ Verification complete!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
