import { useState, useEffect } from 'react'
import { CONTRACTS, FAUCET_ABI, FIB_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

const MOCK_ABI = [
  "function faucet() external",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]

const TEST_TOKENS = [
  { symbol: 'USDT',  name: 'Tether USD',      address: () => CONTRACTS.usdt,  decimals: 6,  color: '#26A17B' },
  { symbol: 'DAI',   name: 'Dai Stablecoin',  address: () => CONTRACTS.dai,   decimals: 18, color: '#F5AC37' },
  { symbol: 'WETH',  name: 'Wrapped Ether',   address: () => CONTRACTS.weth,  decimals: 18, color: '#627EEA' },
  { symbol: 'WBTC',  name: 'Wrapped Bitcoin', address: () => CONTRACTS.wbtc,  decimals: 8,  color: '#F7931A' },
  { symbol: 'BNB',   name: 'BNB',             address: () => CONTRACTS.bnb,   decimals: 18, color: '#F3BA2F' },
  { symbol: 'SOL',   name: 'Wrapped SOL',     address: () => CONTRACTS.sol,   decimals: 9,  color: '#9945FF' },
  { symbol: 'TRX',   name: 'Wrapped TRX',     address: () => CONTRACTS.trx,   decimals: 6,  color: '#FF0013' },
  { symbol: 'AVAX',  name: 'Wrapped AVAX',    address: () => CONTRACTS.avax,  decimals: 18, color: '#E84142' },
  { symbol: 'MATIC', name: 'Wrapped MATIC',   address: () => CONTRACTS.matic, decimals: 18, color: '#8247E5' },
  { symbol: 'SUI',   name: 'Wrapped SUI',     address: () => CONTRACTS.sui,   decimals: 9,  color: '#4DA2FF' },
  { symbol: 'APT',   name: 'Wrapped APT',     address: () => CONTRACTS.apt,   decimals: 8,  color: '#A8C7FA' },
  { symbol: 'XRP',   name: 'Wrapped XRP',     address: () => CONTRACTS.xrp,   decimals: 6,  color: '#00AAE4' },
  { symbol: 'DOGE',  name: 'Wrapped DOGE',    address: () => CONTRACTS.doge,  decimals: 8,  color: '#C2A633' },
]

export default function FaucetPage({ account, provider, onConnect }) {
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
  const [imgErr,       setImgErr]       = useState({})

  useEffect(() => { if (provider && account) init() }, [provider, account])

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
      loadData(addr)
    } catch(e) { console.error(e) }
  }

  const loadData = async (addr) => {
    try {
      const { ethers } = await import('ethers')
      const faucet   = new ethers.Contract(CONTRACTS.faucet,   FAUCET_ABI, provider)
      const fibToken = new ethers.Contract(CONTRACTS.fibToken,  FIB_ABI,    provider)

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
        const addr2 = t.address()
        if (!addr2) continue
        const c = new ethers.Contract(addr2, MOCK_ABI, provider)
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
      const rc     = await tx.wait()
      setTxHash(rc.hash)
      setCanClaim(false)
      setSecondsLeft(86400)
      loadData(walletAddr)
    } catch(e) {
      setError(e?.message?.includes('cooldown') ? 'You already claimed today. Come back in 24 hours.' : e?.reason || e?.message || 'Claim failed')
    }
    setLoading(false)
  }

  const handleClaimToken = async (token) => {
    const addr = token.address()
    if (!addr || !walletAddr) return
    setClaiming(p => ({...p, [token.symbol]: true}))
    setTokenTx(p => ({...p, [token.symbol]: null}))
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const c      = new ethers.Contract(addr, MOCK_ABI, signer)
      const tx     = await c.faucet()
      const rc     = await tx.wait()
      setTokenTx(p => ({...p, [token.symbol]: rc.hash}))
      loadData(walletAddr)
    } catch(e) { console.error(e) }
    setClaiming(p => ({...p, [token.symbol]: false}))
  }

  const getLogo = (symbol) => {
    const t = SUPPORTED_TOKENS.find(t => t.symbol === symbol)
    return t?.logoUrl || null
  }

  const Logo = ({ symbol, color, size = 28 }) => {
    const logo = getLogo(symbol)
    if (logo && !imgErr[symbol]) {
      return <img src={logo} alt={symbol} onError={() => setImgErr(p => ({...p, [symbol]: true}))} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    }
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: `${color}15`, border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: '800', color }}>
        {symbol[0]}
      </div>
    )
  }

  const S = {
    page: { minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px 40px', position: 'relative', zIndex: 1 },
    card: { width: '100%', maxWidth: '520px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '12px' },
    row:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  }

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px', width: '100%', maxWidth: '520px' }}>
        <div style={{ fontSize: '32px', marginBottom: '10px' }}>🚰</div>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--white)', marginBottom: '6px' }}>Testnet Faucet</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
          Get testnet tokens to try FLIBBER. FIB is required for all slot fees.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', width: '100%', maxWidth: '520px', marginBottom: '16px' }}>
        {[
          { label: 'Faucet Reserve',  value: `${faucetBal} FIB`         },
          { label: 'Total Claimed',   value: `${totalClaimed} FIB`       },
          { label: 'Claimants',       value: totalUsers.toLocaleString() },
          { label: 'FIB per claim',   value: '50 FIB / 24h'             },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* FIB claim card */}
      <div style={S.card}>
        <div style={{ ...S.row, marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,255,135,0.1)', border: '1.5px solid rgba(0,255,135,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/flibber.png" alt="FIB" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--white)' }}>FIB — FLIBBER Token</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Required for all slot fees · 50 FIB per day</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '3px' }}>Your balance</div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace' }}>{fibBalance} FIB</div>
          </div>
        </div>

        {/* Countdown */}
        {walletAddr && !canClaim && secondsLeft > 0 && (
          <div style={{ textAlign: 'center', padding: '14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Next claim in</div>
            <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--plat)', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '3px' }}>
              {countdown || '00:00:00'}
            </div>
          </div>
        )}

        {/* Why FIB */}
        <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.1)', borderRadius: '10px', marginBottom: '14px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
          <span style={{ color: 'var(--green)', fontWeight: '700' }}>Why FIB?</span> Every slot charges a <strong style={{ color: 'var(--plat)' }}>0.20% fee in $FIB</strong> — keeping your principal 100% intact. No FIB = no slotting.
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>
        )}
        {txHash && (
          <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: 'var(--green)' }}>
            ✅ 50 FIB sent!{' '}
            <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View ↗</a>
          </div>
        )}

        {!walletAddr ? (
          <button onClick={onConnect} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'var(--plat)', border: 'none', color: 'var(--bg)', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>
            Connect Wallet
          </button>
        ) : (
          <button onClick={handleClaimFIB} disabled={loading || !canClaim} style={{
            width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: '800',
            border: 'none', transition: 'all 0.2s',
            cursor: (loading || !canClaim) ? 'not-allowed' : 'pointer',
            background: canClaim ? 'var(--plat)' : 'rgba(255,255,255,0.04)',
            color: canClaim ? 'var(--bg)' : 'var(--muted)',
          }}>
            {loading ? 'Claiming…' : canClaim ? '🚰 Claim 50 FIB' : `Come back in ${countdown}`}
          </button>
        )}

        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
          🔒 1 claim per wallet per 24h · Enforced on-chain
        </div>
      </div>

      {/* Test tokens */}
      <div style={S.card}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', marginBottom: '16px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Test Tokens — 1,000 each · No cooldown
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {TEST_TOKENS.map(token => (
            <div key={token.symbol} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <Logo symbol={token.symbol} color={token.color} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: token.color }}>{token.symbol}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{token.name}</div>
              </div>
              <div style={{ textAlign: 'right', marginRight: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Balance</div>
                <div style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)', fontWeight: '500' }}>
                  {tokenBals[token.symbol] || '0.0000'}
                </div>
              </div>
              {tokenTx[token.symbol] ? (
                <a href={`https://sepolia.basescan.org/tx/${tokenTx[token.symbol]}`} target="_blank" rel="noreferrer"
                  style={{ padding: '7px 12px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '8px', fontSize: '11px', fontWeight: '700', color: 'var(--green)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  ✅ View ↗
                </a>
              ) : (
                <button onClick={() => handleClaimToken(token)} disabled={!walletAddr || claiming[token.symbol]} style={{
                  padding: '7px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                  border: `1px solid ${token.color}30`, whiteSpace: 'nowrap',
                  cursor: (!walletAddr || claiming[token.symbol]) ? 'not-allowed' : 'pointer',
                  background: `${token.color}10`,
                  color: !walletAddr ? 'var(--muted)' : token.color,
                  transition: 'all 0.2s',
                }}>
                  {claiming[token.symbol] ? '…' : 'Get 1,000'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div style={{ width: '100%', maxWidth: '520px', padding: '14px 16px', background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.12)', borderRadius: '12px', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7', textAlign: 'center' }}>
        ⚠️ These are <strong style={{ color: 'var(--plat)' }}>testnet tokens only</strong> with no real value. On mainnet, real assets will be used instead of these mock tokens.
      </div>
    </div>
  )
}