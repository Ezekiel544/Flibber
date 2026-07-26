const { ethers } = require("hardhat");
const { sleep } = require("timers/promises");

const DELAY = 3000;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const EXISTING = {
  liquidityPool: "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  usdc:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdt:  "0xde85deDbEcD51b534a4c150481345C2C379ad738",
  dai:   "0xC4D42941b95c19E0a598f92D60A2261E475fd3f4",
  sol:   "0x43713028B1B06b8592731dC94DF454648f0767e3",
  trx:   "0x9b8e77F82D11B043e285E7A1180ffe060d4C2bb6",
  avax:  "0x900dC3601F601557d0f469D9B224C9db894b26f6",
  matic: "0x847497e6791b2faa3d9e6621EEE4f0981b1e2CE5",
  sui:   "0x5C9FAC63f380343361c56cdDF5A9A02EdEA5F976",
  apt:   "0x11fa98d175EA01C85301De1DfeD21907797ce4C6",
  xrp:   "0x57b1AeECD364C2f9cEC89c04Ee98EBc5FF65e4A1",
  doge:  "0xceB561655CB382de0201429007137aD26212FA52",
};

const seeds = [
  { key: "usdc",  dec: 6,  amount: "100000", name: "USDC"  },
  { key: "usdt",  dec: 6,  amount: "100000", name: "USDT"  },
  { key: "dai",   dec: 18, amount: "100000", name: "DAI"   },
  { key: "sol",   dec: 9,  amount: "1000",   name: "SOL"   },
  { key: "trx",   dec: 6,  amount: "200000", name: "TRX"   },
  { key: "avax",  dec: 18, amount: "1000",   name: "AVAX"  },
  { key: "matic", dec: 18, amount: "100000", name: "MATIC" },
  { key: "sui",   dec: 9,  amount: "20000",  name: "SUI"   },
  { key: "apt",   dec: 8,  amount: "5000",   name: "APT"   },
  { key: "xrp",   dec: 6,  amount: "100000", name: "XRP"   },
  { key: "doge",  dec: 8,  amount: "200000", name: "DOGE"  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n🪙 Mint + Seed Pool");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Deployer:", deployer.address);

  const pool = await ethers.getContractAt("LiquidityPool", EXISTING.liquidityPool);

  for (const s of seeds) {
    const addr = EXISTING[s.key];
    console.log(`\n→ ${s.name}...`);
    try {
      const token = await ethers.getContractAt("MockERC20", addr);
      const amt   = ethers.parseUnits(s.amount, s.dec);

      // Mint to deployer first
      console.log(`  Minting ${s.amount} ${s.name}...`);
      await (await token.mint(deployer.address, amt)).wait();
      await wait(DELAY);

      // Approve pool
      await (await token.approve(EXISTING.liquidityPool, amt)).wait();
      await wait(DELAY);

      // Deposit into pool
      await (await pool.deposit(addr, amt)).wait();
      console.log(`  ✅ ${s.name}: ${s.amount} seeded`);
      await wait(DELAY);

    } catch(e) {
      console.log(`  ❌ ${s.name}: ${e.message.slice(0, 100)}`);
      await wait(DELAY);
    }
  }

  // Verify pool balances
  console.log("\n📊 Pool balances after seeding:");
  for (const s of seeds) {
    try {
      const bal = await pool.getPoolBalance(EXISTING[s.key]);
      console.log(`  ${s.name}: ${ethers.formatUnits(bal, s.dec)}`);
    } catch(e) {}
  }

  console.log("\n✅ Done! Your pool is now fully seeded.");
  console.log("Go try a slot on your frontend — it should fill instantly.\n");
}

main().catch(console.error);