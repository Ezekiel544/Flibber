import '../styles/globals.css'
import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Navbar from '../components/Navbar'

export const ADMIN_WALLET = "0xa388C71f0D69d33455cf25f6c71F7eA37f98745B"

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [account,    setAccount]    = useState(null)
  const [provider,   setProvider]   = useState(null)
  const [chainId,    setChainId]    = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [modal,      setModal]      = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    autoConnect()
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', accounts => {
        if (!accounts.length) { setAccount(null); setProvider(null) }
        else setAccount(accounts[0])
      })
      window.ethereum.on('chainChanged', () => window.location.reload())
    }
    // Init Web3Modal lazily
    initModal()
  }, [])

  const initModal = async () => {
    try {
      const { createWeb3Modal, defaultConfig } = await import('@web3modal/ethers/react')
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''
      if (!projectId || projectId === 'YOUR_PROJECT_ID') return

      const m = createWeb3Modal({
        ethersConfig: defaultConfig({
          metadata: {
            name: 'FLIBBER',
            description: 'Cross-chain slotting protocol',
            url: window.location.origin,
            icons: ['/flibber.png']
          }
        }),
        chains: [{
          chainId: 84532,
          name: 'Base Sepolia',
          currency: 'ETH',
          explorerUrl: 'https://sepolia.basescan.org',
          rpcUrl: 'https://sepolia.base.org'
        }],
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--w3m-accent': '#00FF87',
          '--w3m-border-radius-master': '4px',
        }
      })
      setModal(m)
    } catch(e) {
      console.log('Web3Modal not available, using direct connect')
    }
  }

  const autoConnect = async () => {
    try {
      if (!window.ethereum) return
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      if (accounts.length > 0) {
        const { ethers } = await import('ethers')
        const prov = new ethers.BrowserProvider(window.ethereum)
        const net  = await prov.getNetwork()
        setAccount(accounts[0]); setProvider(prov); setChainId(Number(net.chainId))
      }
    } catch(e) {}
  }

  const connect = async () => {
    setConnecting(true)
    try {
      if (window.ethereum) {
        // Has browser wallet — connect directly
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        const { ethers } = await import('ethers')
        const prov = new ethers.BrowserProvider(window.ethereum)
        const net  = await prov.getNetwork()
        setAccount(accounts[0]); setProvider(prov); setChainId(Number(net.chainId))
      } else if (modal) {
        // No browser wallet — open Web3Modal
        await modal.open()
      } else {
        // Fallback — open MetaMask install or mobile deep link
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
        if (isMobile) {
          window.location.href = `https://metamask.app.link/dapp/${window.location.host}`
        } else {
          window.open('https://metamask.io/download/', '_blank')
        }
      }
    } catch(e) {
      if (e.code !== 4001) console.error('Connect error:', e)
    }
    setConnecting(false)
  }

  const switchToBaseSepolia = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x14A34' }],
      })
    } catch(e) {
      if (e.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x14A34',
            chainName: 'Base Sepolia Testnet',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia.base.org'],
            blockExplorerUrls: ['https://sepolia.basescan.org'],
          }]
        })
      }
    }
  }

  const disconnect = () => {
    setAccount(null); setProvider(null); setChainId(null)
  }

  const wrongNetwork = account && chainId !== 84532

  return (
    <>
      <Head>
        <title>FLIBBER — Cross-Chain Slotting Protocol</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="The first cross-chain protocol where one token pays all gas and all swaps preserve 100% value." />
        <meta name="theme-color" content="#050505" />
        <link rel="icon" href="/flibber.png" />
      </Head>

      {router.pathname !== '/admin' && (
        <Navbar
          account={account}
          onConnect={connect}
          onDisconnect={disconnect}
          chainId={chainId}
          connecting={connecting}
        />
      )}

      {wrongNetwork && router.pathname !== '/admin' && (
        <div style={{ background: 'rgba(255,68,68,0.08)', borderBottom: '1px solid rgba(255,68,68,0.2)', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '13px', color: 'var(--red)', zIndex: 10, position: 'relative' }}>
          <span>Wrong network — switch to Base Sepolia</span>
          <button onClick={switchToBaseSepolia} style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>Switch</button>
        </div>
      )}

      <div className="page-content">
        <Component {...pageProps} account={account} provider={provider} chainId={chainId} onConnect={connect} />
      </div>
    </>
  )
}