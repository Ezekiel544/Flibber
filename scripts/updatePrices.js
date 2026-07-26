require("dotenv").config()
const { ethers } = require("hardhat")

// Token addresses on Base Sepolia
const TOKENS = {
  SOL:  { address: "0x43713028B1B06b8592731dC94DF454648f0767e3", coingeckoId: "solana",        decimals: 9  },
  TRX:  { address: "0x9b8e77F82D11B043e285E7A1180ffe060d4C2bb6", coingeckoId: "tron",           decimals: 6  },
  AVAX: { address: "0x900dC3601F601557d0f469D9B224C9db894b26f6", coingeckoId: "avalanche-2",    decimals: 18 },
  MATIC:{ address: "0x847497e6791b2faa3d9e6621EEE4f0981b1e2CE5", coingeckoId: "polygon-ecosystem-token", decimals: 18 },
  SUI:  { address: "0x5C9FAC63f380343361c56cdDF5A9A02EdEA5F976", coingeckoId: "sui",             decimals: 9  },
  APT:  { address: "0x11fa98d175EA01C85301De1DfeD21907797ce4C6", coingeckoId: "aptos",           decimals: 8  },
  XRP:  { address: "0x57b1AeECD364C2f9cEC89c04Ee98EBc5FF65e4A1", coingeckoId: "ripple",         decimals: 6  },
  DOGE: { address: "0xceB561655CB382de0201429007137aD26212FA52", coingeckoId: "dogecoin",        decimals: 8  },
  // EVM tokens — WETH and WBTC already use real Chainlink feeds
  // but we track them here for reference
  BNB:  { address: "0x09E2adC9DeD3990870676974d6a06e398295f13e", coingeckoId: "binancecoin",    decimals: 18 },
}

const ORACLE = "0x36e7B3f78401fCF52621d9B0562Ef4211e05bf32"

// Track deployed feed addresses — update these after first run
// These get saved to feeds.json automatically
const FEED_ADDRESSES = {}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const DELAY = 6000

async function fetchLivePrices() {
  const ids = Object.values(TOKENS).map(t => t.coingeckoId).join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`

  console.log("📡 Fetching live prices from CoinGecko (free API)...")
  const res  = await fetch(url)
  const data = await res.json()

  const prices = {}
  for (const [symbol, token] of Object.entries(TOKENS)) {
    const price = data[token.coingeckoId]?.usd
    if (!price) {
      console.warn(`⚠️  No price found for ${symbol} (${token.coingeckoId})`)
      continue
    }
    // Convert to Chainlink format: USD price × 1e8
    // e.g. $75.55 → 7555000000
    prices[symbol] = {
      raw:   Math.round(price * 1e8),
      human: `$${price.toFixed(4)}`,
    }
  }
  return prices
}

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deployer:", deployer.address)

  // Fetch live prices from CoinGecko
  const prices = await fetchLivePrices()

  console.log("\n📊 Live prices fetched:")
  for (const [symbol, p] of Object.entries(prices)) {
    console.log(`  ${symbol}: ${p.human}`)
  }

  const oracle   = await ethers.getContractAt("PriceOracle", ORACLE)
  const MockFeed = await ethers.getContractFactory("MockChainlinkFeed")

  // Load existing feed addresses if we have them
  let existingFeeds = {}
  try {
    const fs = require('fs')
    if (fs.existsSync('./feed-addresses.json')) {
      existingFeeds = JSON.parse(fs.readFileSync('./feed-addresses.json', 'utf8'))
      console.log("\n♻️  Found existing feed addresses — will reuse them")
    }
  } catch(e) {}

  console.log("\n🔄 Updating on-chain prices...")

  for (const [symbol, token] of Object.entries(TOKENS)) {
    const price = prices[symbol]
    if (!price) continue

    await sleep(DELAY)

    if (existingFeeds[symbol]) {
      // Feed already exists — just update the price (cheaper, no redeploy)
      console.log(`\n⚡ Updating existing ${symbol} feed...`)
      const feed = await ethers.getContractAt("MockChainlinkFeed", existingFeeds[symbol])
      await (await feed.setPrice(price.raw)).wait()
      console.log(`✅ ${symbol} price updated → ${price.human}`)
    } else {
      // First time — deploy new feed
      console.log(`\n🚀 Deploying new ${symbol} feed...`)
      const feed = await MockFeed.deploy(price.raw, `${symbol} / USD`)
      await feed.waitForDeployment()
      const feedAddr = await feed.getAddress()
      existingFeeds[symbol] = feedAddr

      await sleep(DELAY)

      // Register in oracle
      await (await oracle.addChainlinkToken(token.address, feedAddr, 8)).wait()
      console.log(`✅ ${symbol} deployed + registered → ${price.human} (${feedAddr})`)
    }
  }

  // Save feed addresses so next run reuses them (no redeploy needed)
  const fs = require('fs')
  fs.writeFileSync('./feed-addresses.json', JSON.stringify(existingFeeds, null, 2))
  console.log("\n💾 Feed addresses saved to feed-addresses.json")

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("✅ All prices updated to live market rates!")
  console.log("Run this script anytime to refresh prices.")
  console.log("Second run onwards is much faster — no redeploy needed.")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

main().catch(e => { console.error(e); process.exit(1) })