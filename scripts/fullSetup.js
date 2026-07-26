const { ethers } = require("hardhat");
const fs = require("fs");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DELAY = 3000; // 3 seconds between transactions

const EXISTING = {
  fibToken:       "0x83291116aCc7d419fb6EfB7bEdeF4c3899a2bba5",
  liquidityPool:  "0x10C1B04d7C4834A69e5065Bd2ACed470DEA7d377",
  feeEngine:      "0x3d8C62BD92852d61b141552809c61102D5feb1Ab",
  slottingEngine: "0xDe6be2E88e5ae83E435abC7583091E4AEBD88E73", // newly deployed
  priceOracle:    "0x36e7B3f78401fCF52621d9B0562Ef4211e05bf32",
  usdc:           "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdt:           "0xde85deDbEcD51b534a4c150481345C2C379ad738",
  dai:            "0xC4D42941b95c19E0a598f92D60A2261E475fd3f4",
  weth:           "0x5401F807B778cB4B76dDfa960f8248813aAc6C26",
  wbtc:           "0x9f3509BF453199C1E03DA1b581A2933e219E7074",
  bnb:            "0x09E2adC9DeD3990870676974d6a06e398295f13e",
  sol:            "0x43713028B1B06b8592731dC94DF454648f0767e3",
  trx:            "0x9b8e77F82D11B043e285E7A1180ffe060d4C2bb6",
  avax:           "0x900dC3601F601557d0f469D9B224C9db894b26f6",
  matic:          "0x847497e6791b2faa3d9e6621EEE4f0981b1e2CE5",
  sui:            "0x5C9FAC63f380343361c56cdDF5A9A02EdEA5F976",
  apt:            "0x11fa98d175EA01C85301De1DfeD21907797ce4C6",
  xrp:            "0x57b1AeECD364C2f9cEC89c04Ee98EBc5FF65e4A1",
  doge:           "0xceB561655CB382de0201429007137aD26212FA52",
};

const TOKENS = [
  { key: "usdc",     dec: 6,  type: "stable",    name: "USDC"  },
  { key: "usdt",     dec: 6,  type: "stable",    name: "USDT"  },
  { key: "dai",      dec: 18, type: "stable",    name: "DAI"   },
  { key: "weth",     dec: 18, type: "chainlink", name: "WETH"  },
  { key: "wbtc",     dec: 8,  type: "chainlink", name: "WBTC"  },
  { key: "bnb",      dec: 18, type: "chainlink", name: "BNB"   },
  { key: "sol",      dec: 9,  type: "chainlink", name: "SOL"   },
  { key: "trx",      dec: 6,  type: "chainlink", name: "TRX"   },
  { key: "avax",     dec: 18, type: "chainlink", name: "AVAX"  },
  { key: "matic",    dec: 18, type: "chainlink", name: "MATIC" },
  { key: "sui",      dec: 9,  type: "chainlink", name: "SUI"   },
  { key: "apt",      dec: 8,  type: "chainlink", name: "APT"   },
  { key: "xrp",      dec: 6,  type: "chainlink", name: "XRP"   },
  { key: "doge",     dec: 8,  type: "chainlink", name: "DOGE"  },
  { key: "fibToken", dec: 18, type: "pool",      name: "FIB"   },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n⚙️  FLIBBER Setup (with delays)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const pool           = await ethers.getContractAt("LiquidityPool",  EXISTING.liquidityPool);
  const feeEngine      = await ethers.getContractAt("FeeEngine",      EXISTING.feeEngine);
  const fibToken       = await ethers.getContractAt("FIBToken",       EXISTING.fibToken);
  const oracle         = await ethers.getContractAt("PriceOracle",    EXISTING.priceOracle);
  const slottingEngine = await ethers.getContractAt("SlottingEngine", EXISTING.slottingEngine);

  const SLOTTING_ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE"));
  const COLLECTOR_ROLE       = ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE"));
  const FEE_BURNER_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("FEE_BURNER_ROLE"));

  // ── Step 1: Roles ───────────────────────────────────────────────
  console.log("\n[1] Granting roles...");

  try {
    await (await pool.grantRole(SLOTTING_ENGINE_ROLE, EXISTING.slottingEngine)).wait();
    console.log("✅ SlottingEngine → LiquidityPool"); await sleep(DELAY);
  } catch(e) { console.log("⚠️  SlottingEngine → Pool:", e.message.slice(0,60)); }

  try {
    await (await pool.grantRole(SLOTTING_ENGINE_ROLE, EXISTING.feeEngine)).wait();
    console.log("✅ FeeEngine → LiquidityPool"); await sleep(DELAY);
  } catch(e) { console.log("⚠️  FeeEngine → Pool:", e.message.slice(0,60)); }

  try {
    await (await feeEngine.grantRole(COLLECTOR_ROLE, EXISTING.slottingEngine)).wait();
    console.log("✅ SlottingEngine → FeeEngine"); await sleep(DELAY);
  } catch(e) { console.log("⚠️  SlottingEngine → FeeEngine:", e.message.slice(0,60)); }

  try {
    await (await fibToken.grantRole(FEE_BURNER_ROLE, EXISTING.feeEngine)).wait();
    console.log("✅ FeeEngine → FIBToken"); await sleep(DELAY);
  } catch(e) { console.log("⚠️  FeeEngine → FIBToken:", e.message.slice(0,60)); }

  // ── Step 2: Token decimals on SlottingEngine ────────────────────
  console.log("\n[2] Registering token decimals...");
  for (const t of TOKENS) {
    const addr = EXISTING[t.key];
    if (!addr) continue;
    try {
      await (await slottingEngine.setTokenDecimals(addr, t.dec)).wait();
      console.log(`✅ ${t.name}: ${t.dec} decimals`);
      await sleep(DELAY);
    } catch(e) { console.log(`⚠️  ${t.name}: ${e.message.slice(0,60)}`); await sleep(DELAY); }
  }

  // ── Step 3: Whitelist tokens in pool ───────────────────────────
  console.log("\n[3] Whitelisting tokens in pool...");
  for (const t of TOKENS) {
    const addr = EXISTING[t.key];
    if (!addr) continue;
    try {
      await (await pool.addSupportedAsset(addr)).wait();
      console.log(`✅ ${t.name} whitelisted`);
      await sleep(DELAY);
    } catch(e) {
      if (e.message.includes("already supported")) {
        console.log(`ℹ️  ${t.name} already whitelisted`);
      } else {
        console.log(`⚠️  ${t.name}: ${e.message.slice(0,60)}`);
      }
      await sleep(DELAY);
    }
  }

  // ── Step 4: Configure oracle ────────────────────────────────────
  console.log("\n[4] Configuring oracle...");

  // Stables
  for (const t of TOKENS.filter(t => t.type === "stable")) {
    try {
      await (await oracle.addStableToken(EXISTING[t.key])).wait();
      console.log(`✅ ${t.name}: stable ($1.00)`);
      await sleep(DELAY);
    } catch(e) { console.log(`⚠️  ${t.name}: ${e.message.slice(0,60)}`); await sleep(DELAY); }
  }

  // FIB pool ratio
  try {
    await (await oracle.addPoolRatioToken(EXISTING.fibToken)).wait();
    console.log("✅ FIB: pool ratio pricing");
    await sleep(DELAY);
  } catch(e) { console.log("⚠️  FIB:", e.message.slice(0,60)); await sleep(DELAY); }

  // Mock Chainlink feeds
  const mockPrices = {
    weth:  { price: 350000000000n,  desc: "ETH/USD"   },
    wbtc:  { price: 6500000000000n, desc: "BTC/USD"   },
    bnb:   { price: 60000000000n,   desc: "BNB/USD"   },
    sol:   { price: 18000000000n,   desc: "SOL/USD"   },
    trx:   { price: 10000000n,      desc: "TRX/USD"   },
    avax:  { price: 4000000000n,    desc: "AVAX/USD"  },
    matic: { price: 100000000n,     desc: "MATIC/USD" },
    sui:   { price: 300000000n,     desc: "SUI/USD"   },
    apt:   { price: 1200000000n,    desc: "APT/USD"   },
    xrp:   { price: 60000000n,      desc: "XRP/USD"   },
    doge:  { price: 15000000n,      desc: "DOGE/USD"  },
  };

  console.log("\n[4b] Deploying mock price feeds...");
  const feedAddresses = {};
  const MockFeed = await ethers.getContractFactory("MockChainlinkFeed");

  for (const [key, cfg] of Object.entries(mockPrices)) {
    try {
      const feed = await MockFeed.deploy(cfg.price, cfg.desc);
      await feed.waitForDeployment();
      const feedAddr = await feed.getAddress();
      feedAddresses[key] = feedAddr;
      await sleep(DELAY);

      await (await oracle.addChainlinkToken(EXISTING[key], feedAddr, 8)).wait();
      console.log(`✅ ${key.toUpperCase()}: $${(Number(cfg.price) / 1e8).toFixed(2)}`);
      await sleep(DELAY);
    } catch(e) { console.log(`⚠️  ${key}: ${e.message.slice(0,80)}`); await sleep(DELAY); }
  }

  // ── Step 5: Seed pool ───────────────────────────────────────────
  console.log("\n[5] Seeding pool with liquidity...");
  const seeds = [
    { key: "fibToken", dec: 18, amount: "500000", name: "FIB"  },
    { key: "usdc",     dec: 6,  amount: "50000",  name: "USDC" },
    { key: "usdt",     dec: 6,  amount: "50000",  name: "USDT" },
    { key: "dai",      dec: 18, amount: "50000",  name: "DAI"  },
    { key: "weth",     dec: 18, amount: "20",     name: "WETH" },
    { key: "wbtc",     dec: 8,  amount: "1",      name: "WBTC" },
    { key: "bnb",      dec: 18, amount: "100",    name: "BNB"  },
    { key: "sol",      dec: 9,  amount: "500",    name: "SOL"  },
    { key: "trx",      dec: 6,  amount: "100000", name: "TRX"  },
    { key: "avax",     dec: 18, amount: "500",    name: "AVAX" },
    { key: "matic",    dec: 18, amount: "50000",  name: "MATIC"},
    { key: "sui",      dec: 9,  amount: "10000",  name: "SUI"  },
    { key: "apt",      dec: 8,  amount: "2000",   name: "APT"  },
    { key: "xrp",      dec: 6,  amount: "50000",  name: "XRP"  },
    { key: "doge",     dec: 8,  amount: "100000", name: "DOGE" },
  ];

  for (const s of seeds) {
    const addr = EXISTING[s.key];
    if (!addr) continue;
    try {
      const token = await ethers.getContractAt("MockERC20", addr);
      const amt   = ethers.parseUnits(s.amount, s.dec);
      await (await token.approve(EXISTING.liquidityPool, amt)).wait();
      await sleep(DELAY);
      await (await pool.deposit(addr, amt)).wait();
      console.log(`✅ ${s.name}: ${s.amount} seeded`);
      await sleep(DELAY);
    } catch(e) { console.log(`⚠️  ${s.name}: ${e.message.slice(0,80)}`); await sleep(DELAY); }
  }

  // ── Done ────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Setup complete!");
  console.log("\n📋 Your contracts.js slottingEngine is already correct:");
  console.log(`   slottingEngine: "${EXISTING.slottingEngine}"`);
  fs.writeFileSync("feed-addresses.json", JSON.stringify(feedAddresses, null, 2));
  console.log("📄 Feed addresses saved to feed-addresses.json");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch(console.error);