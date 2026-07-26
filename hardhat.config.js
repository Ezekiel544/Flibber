require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    // ── Base ─────────────────────────────────────────────────────
    "base-sepolia": {
      url: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      timeout: 120000
    },
    "base": {
      url: "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453
    },
    // ── BSC ──────────────────────────────────────────────────────
    "bsc-testnet": {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 97,
      timeout: 120000
    },
    "bsc": {
      url: "https://bsc-dataseed.binance.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56
    },
    // ── Polygon ───────────────────────────────────────────────────
    "polygon-amoy": {
      url: `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
      timeout: 120000
    },
    "polygon": {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137
    },
    // ── Arbitrum ──────────────────────────────────────────────────
    "arbitrum-sepolia": {
      url: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614,
      timeout: 120000
    },
    "arbitrum": {
      url: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42161
    },
    // ── Avalanche ─────────────────────────────────────────────────
    "avalanche-fuji": {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 43113,
      timeout: 120000
    },
    "avalanche": {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 43114
    },
    // ── Optimism ──────────────────────────────────────────────────
    "optimism-sepolia": {
      url: `https://opt-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155420,
      timeout: 120000
    },
    "optimism": {
      url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 10
    },
    // ── Fantom ────────────────────────────────────────────────────
    "fantom-testnet": {
      url: "https://rpc.testnet.fantom.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 4002,
      timeout: 120000
    },
    "fantom": {
      url: "https://rpc.ankr.com/fantom",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 250
    },
    // ── Tron (EVM compatible) ─────────────────────────────────────
    "tron-shasta": {
      url: "https://api.shasta.trongrid.io/jsonrpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 2494104990,
      timeout: 120000
    },
    "tron": {
      url: "https://api.trongrid.io/jsonrpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 728126428
    },
    // ── zkSync Era ────────────────────────────────────────────────
    "zksync-sepolia": {
      url: "https://sepolia.era.zksync.dev",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 300,
      timeout: 120000
    },
    "zksync": {
      url: "https://mainnet.era.zksync.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 324
    },
    // ── Linea ─────────────────────────────────────────────────────
    "linea-sepolia": {
      url: `https://linea-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 59141,
      timeout: 120000
    },
    "linea": {
      url: `https://linea-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 59144
    },
    // ── Scroll ────────────────────────────────────────────────────
    "scroll-sepolia": {
      url: "https://sepolia-rpc.scroll.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 534351,
      timeout: 120000
    },
    "scroll": {
      url: "https://rpc.scroll.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 534352
    },
    // ── Mantle ────────────────────────────────────────────────────
    "mantle-sepolia": {
      url: "https://rpc.sepolia.mantle.xyz",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5003,
      timeout: 120000
    },
    "mantle": {
      url: "https://rpc.mantle.xyz",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5000
    },
    // ── Celo ──────────────────────────────────────────────────────
    "celo-alfajores": {
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 44787,
      timeout: 120000
    },
    "celo": {
      url: "https://forno.celo.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42220
    },
  },
  etherscan: {
    apiKey: {
      "base-sepolia":     process.env.BASESCAN_API_KEY    || "",
      "base":             process.env.BASESCAN_API_KEY    || "",
      "bsc-testnet":      process.env.BSCSCAN_API_KEY     || "",
      "bsc":              process.env.BSCSCAN_API_KEY     || "",
      "polygon-amoy":     process.env.POLYGONSCAN_API_KEY || "",
      "polygon":          process.env.POLYGONSCAN_API_KEY || "",
      "arbitrum-sepolia": process.env.ARBISCAN_API_KEY    || "",
      "arbitrum":         process.env.ARBISCAN_API_KEY    || "",
      "avalanche-fuji":   process.env.SNOWTRACE_API_KEY   || "",
      "avalanche":        process.env.SNOWTRACE_API_KEY   || "",
      "optimism-sepolia": process.env.OPTIMISM_API_KEY    || "",
      "optimism":         process.env.OPTIMISM_API_KEY    || "",
      "fantom-testnet":   process.env.FTMSCAN_API_KEY     || "",
      "fantom":           process.env.FTMSCAN_API_KEY     || "",
      "linea-sepolia":    process.env.LINEASCAN_API_KEY   || "",
      "linea":            process.env.LINEASCAN_API_KEY   || "",
      "scroll-sepolia":   process.env.SCROLLSCAN_API_KEY  || "",
      "scroll":           process.env.SCROLLSCAN_API_KEY  || "",
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: { apiURL: "https://api-sepolia.basescan.org/api", browserURL: "https://sepolia.basescan.org" }
      },
      {
        network: "base",
        chainId: 8453,
        urls: { apiURL: "https://api.basescan.org/api", browserURL: "https://basescan.org" }
      },
      {
        network: "polygon-amoy",
        chainId: 80002,
        urls: { apiURL: "https://api-amoy.polygonscan.com/api", browserURL: "https://amoy.polygonscan.com" }
      },
      {
        network: "arbitrum-sepolia",
        chainId: 421614,
        urls: { apiURL: "https://api-sepolia.arbiscan.io/api", browserURL: "https://sepolia.arbiscan.io" }
      },
      {
        network: "avalanche-fuji",
        chainId: 43113,
        urls: { apiURL: "https://api-testnet.snowtrace.io/api", browserURL: "https://testnet.snowtrace.io" }
      },
      {
        network: "optimism-sepolia",
        chainId: 11155420,
        urls: { apiURL: "https://api-sepolia-optimism.etherscan.io/api", browserURL: "https://sepolia-optimism.etherscan.io" }
      },
      {
        network: "fantom-testnet",
        chainId: 4002,
        urls: { apiURL: "https://api-testnet.ftmscan.com/api", browserURL: "https://testnet.ftmscan.com" }
      },
      {
        network: "linea-sepolia",
        chainId: 59141,
        urls: { apiURL: "https://api-sepolia.lineascan.build/api", browserURL: "https://sepolia.lineascan.build" }
      },
      {
        network: "scroll-sepolia",
        chainId: 534351,
        urls: { apiURL: "https://api-sepolia.scrollscan.com/api", browserURL: "https://sepolia.scrollscan.com" }
      },
    ]
  }
};