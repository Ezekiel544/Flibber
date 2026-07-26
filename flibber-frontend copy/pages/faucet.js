import { useState, useEffect } from 'react'
import { CONTRACTS, FAUCET_ABI, FIB_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

const TEST_TOKENS = [
  { symbol: 'WETH',  name: 'Wrapped Ether',   address: CONTRACTS.weth,  decimals: 18, amount: '1,000', color: '#627EEA' },
  { symbol: 'WBTC',  name: 'Wrapped Bitcoin', address: CONTRACTS.wbtc,  decimals: 8,  amount: '1,000', color: '#F7931A' },
  { symbol: 'BNB',   name: 'BNB',             address: CONTRACTS.bnb,   decimals: 18, amount: '1,000', color: '#F3BA2F' },
  { symbol: 'DAI',   name: 'Dai Stablecoin',  address: CONTRACTS.dai,   decimals: 18, amount: '1,000', color: '#F5AC37' },
  { symbol: 'SOL',   name: 'Wrapped SOL',     address: CONTRACTS.sol,   decimals: 9,  amount: '1,000', color: '#9945FF' },
  { symbol: 'TRX',   name: 'Wrapped TRX',     address: CONTRACTS.trx,   decimals: 6,  amount: '1,000', color: '#FF0013' },
  { symbol: 'AVAX',  name: 'Wrapped AVAX',    address: CONTRACTS.avax,  decimals: 18, amount: '1,000', color: '#E84142' },
  { symbol: 'MATIC', name: 'Wrapped MATIC',   address: CONTRACTS.matic, decimals: 18, amount: '1,000', color: '#8247E5' },
  { symbol: 'SUI',   name: 'Wrapped SUI',     address: CONTRACTS.sui,   decimals: 9,  amount: '1,000', color: '#4DA2FF' },
  { symbol: 'APT',   name: 'Wrapped APT',     address: CONTRACTS.apt,   decimals: 8,  amount: '1,000', color: '#A8C7FA' },
  { symbol: 'XRP',   name: 'Wrapped XRP',     address: CONTRACTS.xrp,   decimals: 6,  amount: '1,000', color: '#00AAE4' },
  { symbol: 'DOGE',  name: 'Wrapped DOGE',    address: CONTRACTS.doge,  decimals: 8,  amount: '1,000', color: '#C2A633' },
]

const MOCK_FAUCET_ABI = [
  "function faucet() external",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]

// Get logo from SUPPORTED_TOKENS by symbol
const getLogo = (symbol) => {
  const t = SUPPORTED_TOKENS.find(t => t.symbol === symbol)
  return t?.logoUrl || null
}

// Token logo component — uses real logo if available, falls back to colored circle
const TokenLogo = ({ symbol, color, size = 32 }) => {
  const logo = getLogo(symbol)
  const [imgError, setImgError] = useState(false)

  if (logo && !imgError) {
    return (
      <img
        src={logo}
        alt={symbol}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  // Fallback — colored circle with first letter
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color + '22', border: `2px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: '800', color: color,
    }}>
      {symbol[0]}
    </div>
  )
}

export default function FaucetPage({ account, provider }) {
  const [walletAddr,   setWalletAddr]   = useState(null)
  const [fibBalance,   setFibBalance]   = useState('0')
  const [faucetBal,    setFaucetBal]    = useState('0')
  const [canClaim,     setCanClaim]     = useState(false)
  const [secondsLeft,  setSecondsLeft]  = useState(0)
  const [totalClaimed, setTotalClaimed] = useState('0')
  const [totalUsers,   setTotalUsers]   = useState(0)
  const [loading,      setLoading]      = useState(false)
  const [txHash,       setTxHash]       = useState(null)
  const [error,        setError]        = useState(null)
  const [countdown,    setCountdown]    = useState('')
  const [tokenBals,    setTokenBals]    = useState({})
  const [claiming,     setClaiming]     = useState({})
  const [tokenTx,      setTokenTx]      = useState({})

  useEffect(() => {
    if (provider && account) init()
  }, [provider, account])

  useEffect(() => {
    if (secondsLeft <= 0) { setCountdown(''); return }
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        const next = prev - 1
        if (next <= 0) { clearInterval(interval); setCanClaim(true); return 0 }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [secondsLeft])

  useEffect(() => {
    if (secondsLeft <= 0) { setCountdown(''); return }
    const h = Math.floor(secondsLeft / 3600)
    const m = Math.floor((secondsLeft % 3600) / 60)
    const s = secondsLeft % 60
    setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
  }, [secondsLeft])

  const init = async () => {
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const addr   = await signer.getAddress()
      setWalletAddr(addr)
      await loadData(addr)
    } catch(e) { console.error(e) }
  }

  const loadData = async (addr) => {
    try {
      const { ethers } = await import('ethers')
      const faucet   = new ethers.Contract(CONTRACTS.faucet,   FAUCET_ABI, provider)
      const fibToken = new ethers.Contract(CONTRACTS.fibToken, FIB_ABI,    provider)

      const [status, fBal, fibBal, claimed, claimants] = await Promise.all([
        faucet.getClaimStatus(addr),
        faucet.faucetBalance(),
        fibToken.balanceOf(addr),
        faucet.totalClaimed(),
        faucet.totalClaimants(),
      ])

      setCanClaim(status.canClaim)
      setSecondsLeft(Number(status.secondsLeft))
      setFaucetBal(parseFloat(ethers.formatEther(fBal)).toLocaleString())
      setFibBalance(parseFloat(ethers.formatEther(fibBal)).toFixed(2))
      setTotalClaimed(parseFloat(ethers.formatEther(claimed)).toLocaleString())
      setTotalUsers(Number(claimants))

      const bals = {}
      for (const t of TEST_TOKENS) {
        const c = new ethers.Contract(t.address, MOCK_FAUCET_ABI, provider)
        const b = await c.balanceOf(addr)
        bals[t.symbol] = parseFloat(ethers.formatUnits(b, t.decimals)).toFixed(4)
      }
      setTokenBals(bals)
    } catch(e) { console.error(e) }
  }

  const handleClaimFIB = async () => {
    if (!walletAddr || !canClaim) return
    setLoading(true); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const faucet = new ethers.Contract(CONTRACTS.faucet, FAUCET_ABI, signer)
      const tx     = await faucet.claim()
      const receipt = await tx.wait()
      setTxHash(receipt.hash)
      setCanClaim(false)
      setSecondsLeft(86400)
      await loadData(walletAddr)
    } catch(e) {
      if (e?.message?.includes('cooldown')) {
        setError('You already claimed today. Come back in 24 hours.')
      } else {
        setError(e?.reason || e?.message || 'Claim failed')
      }
    }
    setLoading(false)
  }

  const handleClaimToken = async (token) => {
    if (!walletAddr) return
    setClaiming(prev => ({ ...prev, [token.symbol]: true }))
    setTokenTx(prev => ({ ...prev, [token.symbol]: null }))
    try {
      const { ethers } = await import('ethers')
      const signer   = await provider.getSigner()
      const contract = new ethers.Contract(token.address, MOCK_FAUCET_ABI, signer)
      const tx       = await contract.faucet()
      const receipt  = await tx.wait()
      setTokenTx(prev => ({ ...prev, [token.symbol]: receipt.hash }))
      await loadData(walletAddr)
    } catch(e) { console.error(`${token.symbol} claim error:`, e) }
    setClaiming(prev => ({ ...prev, [token.symbol]: false }))
  }

  const cardStyle = {
    background: 'rgba(13,17,23,0.9)',
    border: '1px solid #1E2A36',
    borderRadius: '16px',
    padding: '20px 24px',
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚰</div>
        <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>FLIBBER Testnet Faucet</h1>
        <p style={{ color: '#7A95AE', fontSize: '14px', maxWidth: '480px', lineHeight: '1.6' }}>
          Get testnet tokens to try the protocol. FIB is required for slot fees.
          All other tokens are free to claim with no cooldown.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Faucet Reserve',  value: `${faucetBal} FIB`         },
          { label: 'Total Claimed',   value: `${totalClaimed} FIB`       },
          { label: 'Total Claimants', value: totalUsers.toLocaleString() },
          { label: 'FIB Drip',        value: '50 FIB / 24h'             },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, textAlign: 'center', minWidth: '130px' }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#00FF87' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* FIB Claim Card */}
        <div style={{ ...cardStyle, backdropFilter: 'blur(20px)', boxShadow: '0 0 60px rgba(0,255,135,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,255,135,0.15)', border: '2px solid rgba(0,255,135,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '800', color: '#00FF87' }}>F</div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800' }}>FIB — FLIBBER Token</div>
                <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '3px' }}>Required for all slot fees · 50 FIB per day</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: '#7A95AE' }}>Your balance</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#00FF87', fontFamily: 'Space Mono, monospace' }}>{fibBalance} FIB</div>
            </div>
          </div>

          {walletAddr && !canClaim && secondsLeft > 0 && (
            <div style={{ textAlign: 'center', padding: '12px', background: '#131920', borderRadius: '10px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#7A95AE', marginBottom: '4px' }}>Next claim in</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#E8F0F8', fontFamily: 'Space Mono, monospace', letterSpacing: '2px' }}>
                {countdown || '00:00:00'}
              </div>
            </div>
          )}

          <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.1)', borderRadius: '10px', marginBottom: '16px', fontSize: '12px', color: '#7A95AE', lineHeight: '1.6' }}>
            <span style={{ color: '#00FF87', fontWeight: '700' }}>Why FIB?</span> Every slot charges a <strong style={{ color: '#E8F0F8' }}>0.20% fee in $FIB</strong> — keeping your principal 100% intact.
          </div>

          {error && (
            <div style={{ padding: '10px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '8px', marginBottom: '12px', fontSize: '13px', color: '#FF4444' }}>{error}</div>
          )}
          {txHash && (
            <div style={{ padding: '10px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '8px', marginBottom: '12px', fontSize: '13px', color: '#00FF87' }}>
              ✅ 50 FIB sent!{' '}
              <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#00FF87', textDecoration: 'underline' }}>View ↗</a>
            </div>
          )}

          <button
            onClick={walletAddr ? handleClaimFIB : () => {}}
            disabled={loading || (walletAddr && !canClaim)}
            style={{
              width: '100%', padding: '14px', borderRadius: '12px',
              fontSize: '15px', fontWeight: '800', border: 'none',
              cursor: (!walletAddr || loading || !canClaim) ? 'not-allowed' : 'pointer',
              background: !walletAddr ? '#1E2A36' : canClaim ? 'linear-gradient(135deg, #00FF87, #00CC6A)' : '#1E2A36',
              color: (walletAddr && canClaim) ? '#080B0F' : '#7A95AE',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}>
            {loading
              ? <><span className="spinner" style={{ borderTopColor: '#080B0F' }} /> Claiming...</>
              : !walletAddr ? 'Connect Wallet to Claim'
              : canClaim   ? '🚰 CLAIM 50 FIB'
              : `Come back in ${countdown}`
            }
          </button>
          <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px', color: '#4A6070' }}>
            🔒 1 claim per wallet per 24h · Enforced on-chain
          </div>
        </div>

        {/* Test Token Cards */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Test Tokens — 1,000 each · No cooldown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {TEST_TOKENS.map(token => (
              <div key={token.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#131920', borderRadius: '12px', gap: '12px', flexWrap: 'wrap' }}>

                {/* Token info with real logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <TokenLogo symbol={token.symbol} color={token.color} size={32} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: token.color }}>{token.symbol}</div>
                    <div style={{ fontSize: '11px', color: '#7A95AE' }}>{token.name}</div>
                  </div>
                </div>

                {/* Balance + claim */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#7A95AE' }}>Balance</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>
                      {tokenBals[token.symbol] || '0.0000'}
                    </div>
                  </div>

                  {tokenTx[token.symbol] ? (
                    <a href={`https://sepolia.basescan.org/tx/${tokenTx[token.symbol]}`}
                      target="_blank" rel="noreferrer"
                      style={{ padding: '8px 14px', background: 'rgba(0,255,135,0.1)', border: '1px solid rgba(0,255,135,0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#00FF87', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      ✅ View ↗
                    </a>
                  ) : (
                    <button
                      onClick={() => handleClaimToken(token)}
                      disabled={!walletAddr || claiming[token.symbol]}
                      style={{
                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                        border: `1px solid ${token.color}33`, whiteSpace: 'nowrap',
                        cursor: (!walletAddr || claiming[token.symbol]) ? 'not-allowed' : 'pointer',
                        background: `${token.color}15`,
                        color: !walletAddr ? '#7A95AE' : token.color,
                        transition: 'all 0.2s'
                      }}>
                      {claiming[token.symbol] ? 'Claiming...' : `Get ${token.amount} ${token.symbol}`}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notice */}
        <div style={{ padding: '14px 18px', background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)', borderRadius: '12px', fontSize: '12px', color: '#7A95AE', lineHeight: '1.7', textAlign: 'center' }}>
          ⚠️ These are <strong style={{ color: '#E8F0F8' }}>testnet tokens only</strong> — they have no real value.
          WETH, WBTC, BNB and DAI here are mock versions for testing the FLIBBER protocol on Base Sepolia.
          On mainnet, real wrapped assets will be used.
        </div>
      </div>
    </div>
  )
}