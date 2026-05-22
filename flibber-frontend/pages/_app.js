import '../styles/globals.css'
import { useState, useEffect } from 'react'
import Head from 'next/head'
import Navbar from '../components/Navbar'

export default function App({ Component, pageProps }) {
  const [account,   setAccount]   = useState(null)
  const [provider,  setProvider]  = useState(null)
  const [chainId,   setChainId]   = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
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
    if (window.ethereum) return window.ethereum
    if (window.web3?.currentProvider) return window.web3.currentProvider
    if (window.ethereum?.providers?.length) {
      return window.ethereum.providers.find(p => p.isMetaMask) || window.ethereum.providers[0]
    }
    return null
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
    try {
      const eth = getEthereum()
      if (!eth) {
        window.open(`https://metamask.app.link/dapp/${window.location.host}`, '_blank')
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
      alert('Error: ' + (e.message || JSON.stringify(e)))
    }
  }

  const connectWalletConnect = async () => {
    setShowModal(false)
    try {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
      const wc = await EthereumProvider.init({
        projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
        chains: [84532],
        showQrModal: true,
        metadata: {
          name: 'FLIBBER',
          description: 'Cross-chain slotting protocol',
          url: window.location.origin,
          icons: []
        }
      })
      await wc.connect()
      const { ethers } = await import('ethers')
      const prov = new ethers.BrowserProvider(wc)
      setAccount(wc.accounts[0])
      setProvider(prov)
      setChainId(84532)
    } catch(e) {
      alert('WalletConnect error: ' + (e.message || JSON.stringify(e)))
    }
  }

  const switchToBaseSepolia = async () => {
    try {
      const eth = getEthereum()
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

  const disconnect = () => { setAccount(null); setProvider(null); setChainId(null) }
  const wrongNetwork = account && chainId !== 84532

  return (
    <>
      <Head>
        <title>FLIBBER — Cross-Chain Slotting Protocol</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Navbar
        account={account}
        onConnect={() => setShowModal(true)}
        onDisconnect={disconnect}
        chainId={chainId}
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
            borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', marginLeft: '8px'
          }}>Switch</button>
        </div>
      )}

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
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '6px' }}>Connect Wallet</h2>
            <p style={{ color: '#7A95AE', fontSize: '13px', marginBottom: '24px' }}>Choose your wallet</p>

            {[
              { emoji: '🦊', title: 'MetaMask',             sub: 'Browser extension',              action: connectMetaMask },
              { emoji: '📱', title: 'WalletConnect',        sub: 'Trust, Rainbow, Coinbase + more', action: connectWalletConnect },
              { emoji: '🔗', title: 'Open in MetaMask App', sub: 'Tap this on your phone',          action: () => { setShowModal(false); window.open(`https://metamask.app.link/dapp/${window.location.host}`, '_blank') }},
            ].map(w => (
              <button key={w.title} onClick={w.action} style={{
                width: '100%', padding: '16px', borderRadius: '14px', marginBottom: '10px',
                background: '#131920', border: '1px solid #1E2A36', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '14px', color: '#E8F0F8', textAlign: 'left'
              }}>
                <span style={{ fontSize: '28px' }}>{w.emoji}</span>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{w.title}</div>
                  <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '2px' }}>{w.sub}</div>
                </div>
              </button>
            ))}

            <button onClick={() => setShowModal(false)} style={{
              width: '100%', padding: '12px', borderRadius: '10px',
              background: 'transparent', border: '1px solid #1E2A36',
              color: '#7A95AE', cursor: 'pointer', marginTop: '4px'
            }}>Cancel</button>
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