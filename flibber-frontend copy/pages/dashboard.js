import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { CONTRACTS, FIB_ABI, STAKING_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

// ── Admin wallet — only this wallet can view this page ────────────
const ADMIN_WALLET = "0xa388C71f0D69d33455cf25f6c71F7eA37f98745B"

const FEE_ENGINE_ABI2 = [
  "function totalFeesCollected() view returns (uint256)",
  "function totalFeesBurned() view returns (uint256)",
  "function feeRateBps() view returns (uint256)",
]

export default function DashboardPage({ account, provider }) {
  const router = useRouter()
  const [stats,        setStats]        = useState(null)
  const [myStats,      setMyStats]      = useState(null)
  const [lastUpdated,  setLastUpdated]  = useState(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [authorized,   setAuthorized]   = useState(false)
  const [checking,     setChecking]     = useState(true)
  const intervalRef = useRef(null)

  // ── Admin guard ────────────────────────────────────────────────
  useEffect(() => {
    if (!account) {
      setChecking(false)
      return
    }
    const isAdmin = account.toLowerCase() === ADMIN_WALLET.toLowerCase()
    setAuthorized(isAdmin)
    setChecking(false)
    if (!isAdmin) {
      // Redirect non-admin wallets away after 2 seconds
      setTimeout(() => router.push('/'), 2000)
    }
  }, [account])

  useEffect(() => {
    if (provider && authorized) {
      loadData()
      intervalRef.current = setInterval(() => loadData(), 30000)
    }
    return () => clearInterval(intervalRef.current)
  }, [provider, account, authorized])

  const loadData = async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const { ethers } = await import('ethers')
      const fib     = new ethers.Contract(CONTRACTS.fibToken,   FIB_ABI,         provider)
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI,     provider)
      const fee     = new ethers.Contract(CONTRACTS.feeEngine,  FEE_ENGINE_ABI2, provider)

      const [supply, burned, totalStaked, feesCollected, feesBurned, feeRate] = await Promise.all([
        fib.totalSupply(),
        fib.getTotalBurned(),
        staking.totalStaked(),
        fee.totalFeesCollected(),
        fee.totalFeesBurned(),
        fee.feeRateBps(),
      ])

      const fmtLarge = (wei) => {
        const n = parseFloat(ethers.formatEther(wei))
        if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(4) + 'B'
        if (n >= 1_000_000)     return (n / 1_000_000).toFixed(4) + 'M'
        if (n >= 1_000)         return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
        return n.toFixed(6)
      }
      const fmtFee = (wei) => parseFloat(ethers.formatEther(wei)).toFixed(6)

      setStats({
        supply:        fmtLarge(supply),
        burned:        fmtFee(burned),
        totalStaked:   fmtLarge(totalStaked),
        feesCollected: fmtFee(feesCollected),
        feesBurned:    fmtFee(feesBurned),
        feeRate:       (Number(feeRate) / 100).toFixed(2),
      })

      if (account) {
        const [si, vp, pr] = await Promise.all([
          staking.getStakeInfo(account),
          staking.votingPower(account),
          staking.pendingReward(account),
        ])
        const bals = {}
        for (const t of SUPPORTED_TOKENS) {
          const c = new ethers.Contract(t.address, FIB_ABI, provider)
          bals[t.symbol] = parseFloat(
            ethers.formatUnits(await c.balanceOf(account), t.decimals)
          ).toFixed(4)
        }
        setMyStats({
          staked:        parseFloat(ethers.formatEther(si.amount)).toFixed(4),
          votingPower:   parseFloat(ethers.formatEther(vp)).toFixed(4),
          pendingReward: parseFloat(ethers.formatEther(pr)).toFixed(6),
          balances:      bals,
        })
      }
      setLastUpdated(new Date())
    } catch(e) { console.error(e) }
    if (manual) setRefreshing(false)
  }

  const fmtTime = (date) => {
    if (!date) return '—'
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const cardStyle = {
    padding: '20px', borderRadius: '16px',
    background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36',
  }

  // ── Not connected ──────────────────────────────────────────────
  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)' }}>
        <div style={{ fontSize: '14px', color: '#7A95AE' }}>Checking access...</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🔒</div>
        <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Connect your wallet</h2>
        <p style={{ color: '#7A95AE', fontSize: '14px' }}>You need to connect to access this page.</p>
      </div>
    )
  }

  // ── Not admin ──────────────────────────────────────────────────
  if (!authorized) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>⛔</div>
        <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Access Denied</h2>
        <p style={{ color: '#7A95AE', fontSize: '14px' }}>This page is for the FLIBBER admin only.</p>
        <p style={{ color: '#4A6070', fontSize: '12px' }}>Redirecting you home...</p>
      </div>
    )
  }

  // ── Admin view ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800' }}>Admin Dashboard</h1>
            <span style={{ padding: '4px 10px', background: 'rgba(0,255,135,0.1)', border: '1px solid rgba(0,255,135,0.3)', borderRadius: '8px', fontSize: '11px', color: '#00FF87', fontWeight: '700' }}>ADMIN</span>
          </div>
          <p style={{ color: '#7A95AE' }}>Protocol stats and contract management</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <button onClick={() => loadData(true)} disabled={refreshing} style={{
            padding: '8px 16px', background: 'rgba(0,255,135,0.08)',
            border: '1px solid rgba(0,255,135,0.2)', borderRadius: '10px',
            color: '#00FF87', fontSize: '13px', fontWeight: '700',
            cursor: refreshing ? 'not-allowed' : 'pointer'
          }}>
            {refreshing ? '⟳ Refreshing...' : '⟳ Refresh Now'}
          </button>
          <span style={{ fontSize: '11px', color: '#4A6070' }}>
            Auto-refreshes every 30s · Last: {fmtTime(lastUpdated)}
          </span>
        </div>
      </div>

      {/* Protocol stats */}
      <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Protocol</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        {stats ? [
          { label: 'Circulating Supply', value: stats.supply,        unit: 'FIB',  color: '#00FF87' },
          { label: 'Total Burned',        value: stats.burned,        unit: 'FIB',  color: '#FF4444' },
          { label: 'Total Staked',        value: stats.totalStaked,   unit: 'FIB',  color: '#0EA5E9' },
          { label: 'Fees Collected',      value: stats.feesCollected, unit: 'FIB',  color: '#00FF87' },
          { label: 'Fees Burned',         value: stats.feesBurned,    unit: 'FIB',  color: '#FF4444' },
          { label: 'Fee Rate',            value: stats.feeRate + '%', unit: '',     color: '#E8F0F8' },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: s.color, fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.value}
            </div>
            {s.unit && <div style={{ fontSize: '11px', color: '#3D5468', marginTop: '4px' }}>{s.unit}</div>}
          </div>
        )) : Array(6).fill(0).map((_, i) => (
          <div key={i} style={{ ...cardStyle, height: '90px' }}>
            <div style={{ height: '12px', borderRadius: '6px', background: '#1E2A36', width: '60%', marginBottom: '12px' }} />
            <div style={{ height: '20px', borderRadius: '6px', background: '#1E2A36', width: '80%' }} />
          </div>
        ))}
      </div>

      {/* My positions */}
      <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>My Positions</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        {myStats ? [
          { label: 'FIB Balance',     value: myStats.balances?.FIB  || '0', unit: 'FIB',  color: '#00FF87' },
          { label: 'USDC Balance',    value: myStats.balances?.USDC || '0', unit: 'USDC', color: '#2775CA' },
          { label: 'USDT Balance',    value: myStats.balances?.USDT || '0', unit: 'USDT', color: '#26A17B' },
          { label: 'Staked FIB',      value: myStats.staked,                unit: 'FIB',  color: '#0EA5E9' },
          { label: 'Voting Power',    value: myStats.votingPower,           unit: 'FIB',  color: '#A855F7' },
          { label: 'Pending Rewards', value: myStats.pendingReward,         unit: 'FIB',  color: '#00FF87' },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: s.color, fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.value}
            </div>
            <div style={{ fontSize: '11px', color: '#3D5468', marginTop: '4px' }}>{s.unit}</div>
          </div>
        )) : Array(6).fill(0).map((_, i) => (
          <div key={i} style={{ ...cardStyle, height: '90px' }}>
            <div style={{ height: '12px', borderRadius: '6px', background: '#1E2A36', width: '60%', marginBottom: '12px' }} />
            <div style={{ height: '20px', borderRadius: '6px', background: '#1E2A36', width: '80%' }} />
          </div>
        ))}
      </div>

      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00FF87', display: 'inline-block', boxShadow: '0 0 6px #00FF87', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: '12px', color: '#4A6070' }}>Live · updates every 30 seconds</span>
      </div>

      {/* Contract addresses — admin only section */}
      <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Contract Addresses</h2>
      <div style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', borderRadius: '16px', padding: '20px' }}>
        {Object.entries(CONTRACTS).map(([name, addr]) => (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1E2A36', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'capitalize', minWidth: '120px' }}>{name}</span>
            <a href={`https://sepolia.basescan.org/address/${addr}`} target="_blank" rel="noreferrer"
              style={{ fontSize: '13px', fontFamily: 'Space Mono, monospace', color: '#0EA5E9', textDecoration: 'none' }}>
              {addr.slice(0,10)}...{addr.slice(-6)} ↗
            </a>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}