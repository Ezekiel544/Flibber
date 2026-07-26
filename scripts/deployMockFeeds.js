require("dotenv").config()
const { ethers } = require("hardhat")

const ORACLE = "0x36e7B3f78401fCF52621d9B0562Ef4211e05bf32"

// Realistic testnet prices (USD, 8 decimals)
// e.g. $150.00 = 15000000000
const TOKEN_PRICES = [
  { symbol: "SOL",  address: "0x43713028B1B06b8592731dC94DF454648f0767e3", decimals: 9,  price: 15000000000,  usd: "$150.00"  },
  { symbol: "TRX",  address: "0x9b8e77F82D11B043e285E7A1180ffe060d4C2bb6", decimals: 6,  price: 12000000,    usd: "$0.12"    },
  { symbol: "AVAX", address: "0x900dC3601F601557d0f469D9B224C9db894b26f6", decimals: 18, price: 3500000000,  usd: "$35.00"   },
  { symbol: "MATIC",address: "0x847497e6791b2faa3d9e6621EEE4f0981b1e2CE5", decimals: 18, price: 80000000,    usd: "$0.80"    },
  { symbol: "SUI",  address: "0x5C9FAC63f380343361c56cdDF5A9A02EdEA5F976", decimals: 9,  price: 150000000,   usd: "$1.50"    },
  { symbol: "APT",  address: "0x11fa98d175EA01C85301De1DfeD21907797ce4C6", decimals: 8,  price: 800000000,   usd: "$8.00"    },
  { symbol: "XRP",  address: "0x57b1AeECD364C2f9cEC89c04Ee98EBc5FF65e4A1", decimals: 6,  price: 55000000,    usd: "$0.55"    },
  { symbol: "DOGE", address: "0xceB561655CB382de0201429007137aD26212FA52", decimals: 8,  price: 15000000,    usd: "$0.15"    },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const DELAY = 6000

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deployer:", deployer.address)

  const oracle   = await ethers.getContractAt("PriceOracle", ORACLE)
  const MockFeed = await ethers.getContractFactory("MockChainlinkFeed")

  console.log("\n🔮 Deploying mock price feeds with realistic prices...")

  for (const t of TOKEN_PRICES) {
    await sleep(DELAY)

    // Deploy mock feed with realistic price
    const feed = await MockFeed.deploy(t.price, `${t.symbol} / USD`)
    await feed.waitForDeployment()
    const feedAddr = await feed.getAddress()
    console.log(`✅ ${t.symbol} feed deployed: ${feedAddr} (${t.usd})`)

    await sleep(DELAY)

    // Update oracle to use mock feed instead of ETH placeholder
    await (await oracle.addChainlinkToken(t.address, feedAddr, 8)).wait()
    console.log(`✅ ${t.symbol} oracle updated → ${t.usd}`)
  }

  console.log("\n✅ All mock price feeds deployed and oracle updated!")
  console.log("Prices set:")
  TOKEN_PRICES.forEach(t => console.log(`  ${t.symbol}: ${t.usd}`))
}

main().catch(e => { console.error(e); process.exit(1) })