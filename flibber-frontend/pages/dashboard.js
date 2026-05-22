import { useState, useEffect } from 'react'
import { CONTRACTS, FIB_ABI, STAKING_ABI, POOL_ABI, FEE_ENGINE_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

const FEE_ENGINE_ABI2 = [
  "function totalFeesCollected() view returns (uint256)",
  "function totalFeesBurned() view returns (uint256)",
  "function feeRateBps() view returns (uint256)",
]

export default function DashboardPage({ account, provider }) {
  const [stats,   setStats]   = useState(null)
  const [myStats, setMyStats] = useState(null)

  useEffect(() => { if (provider) loadData() }, [provider, account])

  const loadData = async () => {
    try {
      const { ethers } = await import('ethers')
      const fib     = new ethers.Contract(CONTRACTS.fibToken,   FIB_ABI,        provider)
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI,    provider)
      const fee     = new ethers.Contract(CONTRACTS.feeEngine,  FEE_ENGINE_ABI2, provider)

      const [supply, burned, totalStaked, feesCollected, feesBurned, feeRate] = await Promise.all([
        fib.totalSupply(), fib.getTotalBurned(),
        staking.totalStaked(),
        fee.totalFeesCollected(), fee.totalFeesBurned(),
        fee.feeRateBps(),
      ])

      setStats({
        supply:        parseFloat(ethers.formatEther(supply)).toLocaleString(),
        burned:        parseFloat(ethers.formatEther(burned)).toLocaleString(),
        totalStaked:   parseFloat(ethers.formatEther(totalStaked)).toLocaleString(),
        feesCollected: parseFloat(ethers.formatEther(feesCollected)).toFixed(4),
        feesBurned:    parseFloat(ethers.formatEther(feesBurned)).toFixed(4),
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
          bals[t.symbol] = parseFloat(ethers.formatUnits(await c.balanceOf(account), t.decimals)).toFixed(4)
        }
        setMyStats({
          staked:      parseFloat(ethers.formatEther(si.amount)).toFixed(2),
          votingPower: parseFloat(ethers.formatEther(vp)).toFixed(2),
          pendingReward: parseFloat(ethers.formatEther(pr)).toFixed(6),
          balances:    bals,
        })
      }
    } catch(e) { console.error(e) }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 1 }}>
      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>Dashboard</h1>
      <p style={{ color: '#7A95AE', marginBottom: '32px' }}>Protocol stats and your positions</p>

      {/* Protocol stats */}
      <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Protocol</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}>
        {stats && [
          { label: 'Circulating Supply', value: stats.supply, unit: 'FIB', color: '#00FF87' },
          { label: 'Total Burned',        value: stats.burned,        unit: 'FIB', color: '#FF4444' },
          { label: 'Total Staked',        value: stats.totalStaked,   unit: 'FIB', color: '#0EA5E9' },
          { label: 'Fees Collected',      value: stats.feesCollected, unit: 'FIB', color: '#00FF87' },
          { label: 'Fees Burned',         value: stats.feesBurned,    unit: 'FIB', color: '#FF4444' },
          { label: 'Fee Rate',            value: stats.feeRate + '%', unit: '',    color: '#E8F0F8' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '16px', background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36' }}>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: s.color, fontFamily: 'Space Mono, monospace', wordBreak: 'break-all' }}>
              {s.value}
            </div>
            {s.unit && <div style={{ fontSize: '11px', color: '#3D5468', marginTop: '4px' }}>{s.unit}</div>}
          </div>
        ))}
        {!stats && Array(6).fill(0).map((_, i) => (
          <div key={i} style={{ padding: '20px', borderRadius: '16px', background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', height: '90px' }}>
            <div style={{ height: '12px', borderRadius: '6px', background: '#1E2A36', width: '60%', marginBottom: '12px' }} />
            <div style={{ height: '20px', borderRadius: '6px', background: '#1E2A36', width: '80%' }} />
          </div>
        ))}
      </div>

      {/* My positions */}
      {account && (
        <>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>My Positions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '40px' }}>
            {myStats && [
              { label: 'FIB Balance',     value: myStats.balances?.FIB || '0',  unit: 'FIB',  color: '#00FF87' },
              { label: 'USDC Balance',    value: myStats.balances?.USDC || '0', unit: 'USDC', color: '#2775CA' },
              { label: 'Staked FIB',      value: myStats.staked,                unit: 'FIB',  color: '#0EA5E9' },
              { label: 'Voting Power',    value: myStats.votingPower,           unit: 'FIB',  color: '#A855F7' },
              { label: 'Pending Rewards', value: myStats.pendingReward,         unit: 'FIB',  color: '#00FF87' },
            ].map(s => (
              <div key={s.label} style={{ padding: '20px', borderRadius: '16px', background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36' }}>
                <div style={{ fontSize: '12px', color: '#7A95AE', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: s.color, fontFamily: 'Space Mono, monospace' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: '#3D5468', marginTop: '4px' }}>{s.unit}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Contract addresses */}
      <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#7A95AE', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Contract Addresses</h2>
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
    </div>
  )
}
