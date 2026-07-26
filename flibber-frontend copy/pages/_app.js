import '../styles/globals.css'
import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Navbar from '../components/Navbar'

// ── Admin wallet — change this to your team's wallet ──────────────
export const ADMIN_WALLET = "0xa388C71f0D69d33455cf25f6c71F7eA37f98745B"

export default function App({ Component, pageProps }) {
  const [account,   setAccount]   = useState(null)
  const [provider,  setProvider]  = useState(null)
  const [chainId,   setChainId]   = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [isMobile,  setIsMobile]  = useState(false)
  const [connecting, setConnecting] = useState(false)
  const wcProviderRef = useRef(null)

  useEffect(() => {
    // Detect mobile
    const mobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    setIsMobile(mobile)

    if (typeof window === 'undefined') return
    autoConnect()

    const eth = getEthereum()
    if (eth) {
      eth.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) { setAccount(null); setProvider(null) }
        else setAccount(accounts[0])
      })
      eth.on('chainChanged', () => window.location.reload())
    }
  }, [])

  const getEthereum = () => {
    if (typeof window === 'undefined') return null
    if (window.ethereum?.providers?.length) {
      return window.ethereum.providers.find(p => p.isMetaMask) || window.ethereum.providers[0]
    }
    if (window.ethereum) return window.ethereum
    if (window.web3?.currentProvider) return window.web3.currentProvider
    return null
  }

  const hasMetaMask = () => {
    if (typeof window === 'undefined') return false
    return !!(window.ethereum || window.web3?.currentProvider)
  }

  const autoConnect = async () => {
    try {
      const eth = getEthereum()
      if (!eth) return
      const accounts = await eth.request({ method: 'eth_accounts' })
      if (accounts.length > 0) {
        const { ethers } = await import('ethers')
        const prov = new ethers.BrowserProvider(eth)
        const net  = await prov.getNetwork()
        setAccount(accounts[0])
        setProvider(prov)
        setChainId(Number(net.chainId))
      }
    } catch(e) {}
  }

  const connectMetaMask = async () => {
    setShowModal(false)
    setConnecting(true)
    try {
      const eth = getEthereum()
      if (!eth) {
        // On mobile — open in MetaMask app
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}`
        return
      }
      const accounts = await eth.request({ method: 'eth_requestAccounts' })
      const { ethers } = await import('ethers')
      const prov = new ethers.BrowserProvider(eth)
      const net  = await prov.getNetwork()
      setAccount(accounts[0])
      setProvider(prov)
      setChainId(Number(net.chainId))
    } catch(e) {
      if (e.code !== 4001) alert('MetaMask error: ' + (e.message || 'Unknown error'))
    }
    setConnecting(false)
  }

  const connectWalletConnect = async () => {
    setShowModal(false)
    setConnecting(true)
    try {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')

      const wc = await EthereumProvider.init({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
        chains: [84532],
        showQrModal: true,
        metadata: {
          name: 'FLIBBER',
          description: 'Cross-chain slotting protocol',
          url: typeof window !== 'undefined' ? window.location.origin : '',
          icons: ['https://flibber.xyz/logo.png']
        },
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-background-color': '#0D1117',
            '--wcm-accent-color': '#00FF87',
          }
        }
      })

      // Handle WalletConnect events
      wc.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) { setAccount(null); setProvider(null) }
        else setAccount(accounts[0])
      })
      wc.on('chainChanged', () => window.location.reload())
      wc.on('disconnect', () => { setAccount(null); setProvider(null) })

      await wc.connect()
      wcProviderRef.current = wc

      const { ethers } = await import('ethers')
      const prov = new ethers.BrowserProvider(wc)
      const accounts = wc.accounts

      setAccount(accounts[0])
      setProvider(prov)
      setChainId(84532)
    } catch(e) {
      if (!e.message?.includes('User rejected') && !e.message?.includes('Modal closed')) {
        alert('WalletConnect error: ' + (e.message || 'Unknown error'))
      }
    }
    setConnecting(false)
  }

  const connectCoinbase = async () => {
    setShowModal(false)
    setConnecting(true)
    try {
      const { CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
      const sdk = new CoinbaseWalletSDK({
        appName: 'FLIBBER',
        appLogoUrl: 'https://flibber.xyz/logo.png',
        darkMode: true,
      })
      const eth = sdk.makeWeb3Provider('https://sepolia.base.org', 84532)
      const accounts = await eth.request({ method: 'eth_requestAccounts' })
      const { ethers } = await import('ethers')
      const prov = new ethers.BrowserProvider(eth)
      setAccount(accounts[0])
      setProvider(prov)
      setChainId(84532)
    } catch(e) {
      if (e.code !== 4001) alert('Coinbase error: ' + (e.message || 'Unknown error'))
    }
    setConnecting(false)
  }

  const switchToBaseSepolia = async () => {
    try {
      const eth = getEthereum()
      if (!eth) return
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x14A34' }],
      })
    } catch(e) {
      if (e.code === 4902) {
        const eth = getEthereum()
        await eth.request({
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
    if (wcProviderRef.current) {
      try { wcProviderRef.current.disconnect() } catch(e) {}
      wcProviderRef.current = null
    }
    setAccount(null)
    setProvider(null)
    setChainId(null)
  }

  const wrongNetwork = account && chainId !== 84532

  // Wallet options — smart detection
  const walletOptions = isMobile ? [
    {
      emoji: '🦊',
      title: 'MetaMask',
      sub: 'Open in MetaMask app',
      action: connectMetaMask,
      show: true,
    },
    {
      emoji: '📱',
      title: 'WalletConnect',
      sub: 'Trust, Rainbow, Coinbase + more',
      action: connectWalletConnect,
      show: true,
    },
    {
      emoji: '🔵',
      title: 'Coinbase Wallet',
      sub: 'Open in Coinbase Wallet app',
      action: connectCoinbase,
      show: true,
    },
  ] : [
    {
      emoji: '🦊',
      title: 'MetaMask',
      sub: hasMetaMask() ? 'Browser extension detected' : 'Install MetaMask first',
      action: connectMetaMask,
      show: true,
      disabled: !hasMetaMask(),
    },
    {
      emoji: '📱',
      title: 'WalletConnect',
      sub: 'Scan QR with any mobile wallet',
      action: connectWalletConnect,
      show: true,
    },
    {
      emoji: '🔵',
      title: 'Coinbase Wallet',
      sub: 'Browser extension or mobile app',
      action: connectCoinbase,
      show: true,
    },
    {
      emoji: '🔗',
      title: 'Use on Mobile',
      sub: 'Open FLIBBER in your wallet browser',
      action: () => {
        setShowModal(false)
        window.open(`https://metamask.app.link/dapp/${window.location.host}`, '_blank')
      },
      show: true,
    },
  ]

  return (
    <>
      <Head>
        <title>FLIBBER — Cross-Chain Slotting Protocol</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="The first cross-chain protocol where one token pays all gas and all swaps preserve 100% value." />
        <meta name="theme-color" content="#080B0F" />
      </Head>

      <Navbar
        account={account}
        onConnect={() => setShowModal(true)}
        onDisconnect={disconnect}
        chainId={chainId}
        connecting={connecting}
      />

      {wrongNetwork && (
        <div style={{
          background: 'rgba(255,68,68,0.1)', borderBottom: '1px solid rgba(255,68,68,0.3)',
          padding: '12px', textAlign: 'center', fontSize: '14px', color: '#FF4444',
          position: 'relative', zIndex: 10
        }}>
          Wrong network — switch to Base Sepolia{' '}
          <button onClick={switchToBaseSepolia} style={{
            background: '#FF4444', color: '#fff', border: 'none',
            borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', marginLeft: '8px',
            fontWeight: '700'
          }}>Switch Network</button>
        </div>
      )}

      {/* Connect Wallet Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(8px)', padding: '20px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0D1117', border: '1px solid #1E2A36',
            borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '360px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Connect Wallet</h2>
              <button onClick={() => setShowModal(false)} style={{
                background: 'none', border: 'none', color: '#7A95AE',
                fontSize: '20px', cursor: 'pointer', lineHeight: 1
              }}>✕</button>
            </div>
            <p style={{ color: '#7A95AE', fontSize: '13px', marginBottom: '24px' }}>
              {isMobile ? 'Choose your mobile wallet' : 'Choose how to connect'}
            </p>

            {walletOptions.filter(w => w.show).map(w => (
              <button
                key={w.title}
                onClick={w.disabled ? undefined : w.action}
                style={{
                  width: '100%', padding: '16px', borderRadius: '14px', marginBottom: '10px',
                  background: w.disabled ? '#0D1117' : '#131920',
                  border: `1px solid ${w.disabled ? '#1E2A36' : '#2A3A4A'}`,
                  cursor: w.disabled ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '14px',
                  color: w.disabled ? '#4A6070' : '#E8F0F8', textAlign: 'left',
                  opacity: w.disabled ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}>
                <span style={{ fontSize: '28px' }}>{w.emoji}</span>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{w.title}</div>
                  <div style={{ fontSize: '12px', color: w.disabled ? '#4A6070' : '#7A95AE', marginTop: '2px' }}>{w.sub}</div>
                </div>
              </button>
            ))}

            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.1)', borderRadius: '10px' }}>
              <p style={{ fontSize: '11px', color: '#7A95AE', textAlign: 'center', lineHeight: '1.5' }}>
                By connecting, you agree to FLIBBER's terms. Make sure you're on <span style={{ color: '#00FF87' }}>Base Sepolia</span> testnet.
              </p>
            </div>
          </div>
        </div>
      )}

      <Component
        {...pageProps}
        account={account}
        provider={provider}
        chainId={chainId}
        onConnect={() => setShowModal(true)}
      />
    </>
  )
}