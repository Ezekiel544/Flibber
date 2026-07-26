import { useState, useEffect } from 'react'
import { CONTRACTS, SLOTTING_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

const parseSlot = (id, raw) => ({
  id,
  user:        raw[0],
  tokenIn:     raw[1],
  amountIn:    raw[2],
  tokenOut:    raw[3],
  amountOut:   raw[4],
  recipient:   raw[5],
  feeAmount:   raw[6],
  status:      Number(raw[7]),
  createdAt:   raw[8],
  filledAt:    raw[9],
  filledBy:    raw[10],
  destChainId: raw[11],
})

export default function HistoryPage({ account, provider, onConnect }) {
  const [walletAddr, setWalletAddr] = useState(null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedSlot, setExpandedSlot] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [slotCount, setSlotCount] = useState(0)
  const [activeTab, setActiveTab] = useState('history')
  const [hoverIdx, setHoverIdx] = useState(null)
  const [volumeRange, setVolumeRange] = useState('7D')
  const [settlementRange, setSettlementRange] = useState('7D')

  useEffect(() => {
    if (provider && account) init()
  }, [provider, account])

  const init = async () => {
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const addr = await signer.getAddress()
      setWalletAddr(addr)
      await loadSlots(addr)
    } catch (e) { console.error('Init error:', e) }
  }

  const loadSlots = async (addr) => {
    setLoading(true)
    try {
      const { ethers } = await import('ethers')
      const slottingEngine = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, provider)
      const totalSlots = await slottingEngine.slotCounter()
      setSlotCount(Number(totalSlots))
      const userSlotIds = await slottingEngine.getUserSlots(addr)
      const slotDetails = []
      for (const slotId of [...userSlotIds].reverse()) {
        try {
          const raw = await slottingEngine.getSlot(Number(slotId))
          slotDetails.push(parseSlot(Number(slotId), raw))
        } catch (e) { console.error(`Error fetching slot ${slotId}:`, e) }
      }
      setSlots(slotDetails)
    } catch (e) { console.error('Load slots error:', e) }
    setLoading(false)
  }

  const getTokenInfo = (address) => {
    if (!address) return null
    const normalizedAddr = address.toLowerCase()
    return SUPPORTED_TOKENS.find(token => token.address?.toLowerCase() === normalizedAddr)
  }

  const formatAmount = (amount, tokenAddress) => {
    if (!amount) return '0.0000'
    try {
      const token = getTokenInfo(tokenAddress)
      const decimals = token?.decimals || 18
      const bigAmount = typeof amount === 'bigint' ? amount : BigInt(amount.toString())
      const divisor = BigInt(10 ** decimals)
      const wholePart = bigAmount / divisor
      const fracPart = bigAmount % divisor
      const fracStr = fracPart.toString().padStart(decimals, '0').substring(0, 4)
      return `${wholePart}.${fracStr}`
    } catch (e) { return '0.0000' }
  }

  const getTokenSymbol = (address) => {
    const token = getTokenInfo(address)
    return token?.symbol || (address ? `${address.substring(0, 6)}...` : 'Unknown')
  }

  const getTokenLogo = (address) => {
    const token = getTokenInfo(address)
    return token?.logoUrl || null
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    try {
      const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp
      if (!ts) return 'N/A'
      return new Date(ts * 1000).toLocaleString()
    } catch (e) { return 'N/A' }
  }

  const formatFeeAmount = (feeAmount, decimals = 18) => {
    if (!feeAmount) return '0.000000'
    try {
      const bigFee = typeof feeAmount === 'bigint' ? feeAmount : BigInt(feeAmount.toString())
      const divisor = BigInt(10 ** decimals)
      const wholePart = bigFee / divisor
      const fracPart = bigFee % divisor
      const fracStr = fracPart.toString().padStart(decimals, '0').substring(0, 6)
      return `${wholePart}.${fracStr}`
    } catch (e) { return '0.000000' }
  }

  const getStatusInfo = (status) => {
    const s = Number(status)
    const map = {
      0: { label: 'PENDING',   color: '#EAB308' },
      1: { label: 'FILLED',    color: '#00FF87' },
      2: { label: 'CANCELLED', color: '#FF4444' },
      3: { label: 'EXPIRED',   color: '#4B5563' },
    }
    return map[s] || map[0]
  }

  const handleCancelSlot = async (slotId) => {
    setCancelling(slotId)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const slottingEngine = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, signer)
      const tx = await slottingEngine.cancelSlot(slotId)
      await tx.wait()
      await loadSlots(walletAddr)
    } catch (e) { console.error('Cancel error:', e) }
    setCancelling(null)
  }

  // Analytics
  const filled    = slots.filter(s => Number(s.status) === 1)
  const pending   = slots.filter(s => Number(s.status) === 0)
  // Success rate = filled / RESOLVED slots only (filled + cancelled + expired).
  // Pending slots haven't resolved yet, so excluding them keeps the rate from
  // being artificially dragged toward 0 while slots are still in flight.
  const resolved     = slots.filter(s => Number(s.status) !== 0)
  const successRate  = resolved.length > 0 ? ((filled.length / resolved.length) * 100).toFixed(1) : null
  const now          = Date.now() / 1000
  const pairs = {}
  filled.forEach(s => {
    const key = `${getTokenSymbol(s.tokenIn)} → ${getTokenSymbol(s.tokenOut)}`
    pairs[key] = (pairs[key] || 0) + 1
  })
  const topPairs = Object.entries(pairs).sort((a,b) => b[1]-a[1]).slice(0,5)
  const topAsset = topPairs.length > 0 ? topPairs[0][0].split(' → ')[0] : '—'

  const formatCurrency = (val) => {
    if (!val) return '$0.00'
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
    if (val >= 1e3) return `$${(val / 1e3).toFixed(2)}K`
    return `$${val.toFixed(2)}`
  }

  // Turns a range key ('7D' | '30D' | 'All') into a bucket count + bucket width (seconds).
  // 7D/30D use daily buckets. 'All' scales the bucket size up (day -> week -> ~month)
  // based on how far back the earliest slot goes, so the chart never renders
  // an unreadable number of bars/points.
  const getRangeConfig = (range) => {
    if (range === '7D')  return { count: 7,  seconds: 86400 }
    if (range === '30D') return { count: 30, seconds: 86400 }
    if (slots.length === 0) return { count: 7, seconds: 86400 }
    const timestamps = slots.map(s => Number(s.createdAt || 0)).filter(Boolean)
    const earliest = timestamps.length ? Math.min(...timestamps) : now
    const span = Math.max(now - earliest, 86400)
    if (span <= 30 * 86400)       return { count: Math.ceil(span / 86400) + 1,        seconds: 86400 }
    if (span <= 26 * 7 * 86400)   return { count: Math.ceil(span / (7 * 86400)) + 1,  seconds: 7 * 86400 }
    return { count: Math.min(24, Math.ceil(span / (30 * 86400)) + 1),                 seconds: 30 * 86400 }
  }

  const buildBuckets = (range) => {
    const { count, seconds } = getRangeConfig(range)
    const volume      = Array(count).fill(0)
    const settleSum    = Array(count).fill(0)
    const settleCount  = Array(count).fill(0)

    slots.forEach(s => {
      const created = Number(s.createdAt || 0)
      if (!created) return
      const ago = now - created
      if (ago < 0 || ago >= count * seconds) return
      const idx = count - 1 - Math.min(count - 1, Math.floor(ago / seconds))
      volume[idx] += parseFloat(formatAmount(s.amountIn, s.tokenIn)) || 0
      if (Number(s.status) === 1) {
        const dur = Number(s.filledAt || 0) - created
        if (dur > 0) { settleSum[idx] += dur; settleCount[idx] += 1 }
      }
    })

    const labels = Array.from({ length: count }, (_, i) => {
      const bucketTs = now - (count - 1 - i) * seconds
      const d = new Date(bucketTs * 1000)
      if (seconds === 86400 && count <= 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
      if (seconds === 30 * 86400) return d.toLocaleDateString('en-US', { month: 'short' })
      return `${d.getMonth() + 1}/${d.getDate()}`
    })

    return { count, volume, settleSum, settleCount, labels }
  }

  const volumeBuckets     = buildBuckets(volumeRange)
  const totalVolume       = volumeBuckets.volume.reduce((a, b) => a + b, 0)
  const maxVolume         = Math.max(...volumeBuckets.volume, 1)

  const settlementBuckets = buildBuckets(settlementRange)
  const avgSettlementByBucket = settlementBuckets.settleSum.map((sum, i) =>
    settlementBuckets.settleCount[i] > 0 ? sum / settlementBuckets.settleCount[i] : 0)
  const settlementTotalSum   = settlementBuckets.settleSum.reduce((a, b) => a + b, 0)
  const settlementTotalCount = settlementBuckets.settleCount.reduce((a, b) => a + b, 0)
  const avgSettlementTotal   = settlementTotalCount > 0 ? settlementTotalSum / settlementTotalCount : 0
  const maxSettlement        = Math.max(...avgSettlementByBucket, 1)

  const CHART_W = 600, CHART_H = 160, CHART_PAD = 20
  const volumePoints = volumeBuckets.volume.map((v, i) => ({
    x: (i + 0.5) * (CHART_W / volumeBuckets.count),
    y: CHART_H - CHART_PAD - (v / maxVolume) * (CHART_H - CHART_PAD * 2),
  }))

  const buildSmoothLine = (pts) => {
    if (pts.length === 0) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1]
      const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2
      d += ` Q ${p0.x} ${p0.y}, ${midX} ${midY}`
    }
    const last = pts[pts.length - 1]
    d += ` T ${last.x} ${last.y}`
    return d
  }
  const volumeLinePath = buildSmoothLine(volumePoints)
  const volumeAreaPath = `${volumeLinePath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`

  const RangeDropdown = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px',
        color: 'var(--silver)', fontSize: '11px', fontWeight: '700', padding: '5px 8px',
        cursor: 'pointer', outline: 'none',
      }}>
      <option value="7D">7D</option>
      <option value="30D">30D</option>
      <option value="All">All</option>
    </select>
  )

  const TokenLogo = ({ address, size = 18 }) => {
    const sym  = getTokenSymbol(address)
    const logo = getTokenLogo(address)
    if (logo) return <img src={logo} alt={sym} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
    return <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, fontWeight: '700', color: 'var(--silver)' }}>{sym[0]}</div>
  }

  const S = {
    page: { minHeight: 'calc(100vh - 64px)', padding: '32px 16px 40px', maxWidth: '720px', margin: '0 auto', position: 'relative', zIndex: 1 },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' },
    row:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  }

  return (
    <div style={S.page}>

      <div style={{ ...S.row, marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--white)', marginBottom: '4px' }}>Slot History</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
            {walletAddr ? `${slots.length} slots · Protocol total: ${slotCount}` : 'Connect wallet to view your slots'}
          </p>
        </div>
        {walletAddr && (
          <button onClick={() => loadSlots(walletAddr)} style={{ padding: '8px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--silver)', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>↻ Refresh</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', background: 'var(--card)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        {['history', 'analytics'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '10px', borderRadius: '9px', fontSize: '13px', fontWeight: '700', border: 'none', cursor: 'pointer', textTransform: 'capitalize', background: activeTab === tab ? 'var(--bg2)' : 'transparent', color: activeTab === tab ? 'var(--white)' : 'var(--muted)' }}>{tab}</button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total Slots',  value: slots.length,      color: 'var(--plat)'  },
              { label: 'Filled',       value: filled.length,     color: 'var(--green)' },
              { label: 'Success Rate', value: successRate !== null ? `${successRate}%` : '—', color: 'var(--green)' },
              { label: 'Pending',      value: pending.length,    color: '#EAB308'      },
            ].map(s => (
              <div key={s.label} style={{ ...S.card, marginBottom: 0, padding: '16px 20px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: s.color, fontFamily: 'IBM Plex Mono, monospace' }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={{ ...S.row, marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--silver)' }}>Weekly Volume</div>
                <RangeDropdown value={volumeRange} onChange={(v) => { setVolumeRange(v); setHoverIdx(null) }} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--white)' }}>{formatCurrency(totalVolume)}</div>
            </div>
            <div style={{ position: 'relative' }} onMouseLeave={() => setHoverIdx(null)}>
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', height: '140px', display: 'block', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--silver)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--silver)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={volumeAreaPath} fill="url(#volGrad)" stroke="none" />
                <path d={volumeLinePath} fill="none" stroke="var(--white)" strokeWidth="2" />
                {hoverIdx !== null && (
                  <>
                    <line x1={volumePoints[hoverIdx].x} y1="0" x2={volumePoints[hoverIdx].x} y2={CHART_H} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />
                    <circle cx={volumePoints[hoverIdx].x} cy={volumePoints[hoverIdx].y} r="4" fill="var(--white)" stroke="var(--bg)" strokeWidth="2" />
                  </>
                )}
                {volumePoints.map((p, i) => (
                  <rect key={i} x={i * (CHART_W / volumeBuckets.count)} y="0" width={CHART_W / volumeBuckets.count} height={CHART_H}
                    fill="transparent" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverIdx(i)} />
                ))}
              </svg>
              {hoverIdx !== null && volumePoints[hoverIdx] && (
                <div style={{
                  position: 'absolute',
                  left: `${(volumePoints[hoverIdx].x / CHART_W) * 100}%`,
                  top: `${Math.max(0, (volumePoints[hoverIdx].y / CHART_H) * 140 - 38)}px`,
                  transform: 'translateX(-50%)',
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '6px 10px', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace',
                  color: 'var(--white)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
                }}>
                  {volumeBuckets.labels[hoverIdx]} · {formatCurrency(volumeBuckets.volume[hoverIdx])}
                </div>
              )}
              <div style={{ display: 'flex', marginTop: '8px' }}>
                {volumeBuckets.labels.map((l, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: 'var(--muted)' }}>
                    {volumeBuckets.count > 12 && i % Math.ceil(volumeBuckets.count / 8) !== 0 ? '' : l}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={S.card}>
            <div style={{ ...S.row, marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--silver)' }}>Settlement Time (s)</div>
                <RangeDropdown value={settlementRange} onChange={setSettlementRange} />
              </div>
              <div style={{ fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--muted)' }}>avg {avgSettlementTotal.toFixed(1)}s</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: settlementBuckets.count > 14 ? '2px' : '8px', height: '120px' }}>
              {avgSettlementByBucket.map((val, i) => (
                <div key={i} title={`${settlementBuckets.labels[i]}: ${val.toFixed(1)}s`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', borderRadius: '6px 6px 0 0', height: `${Math.max(4, (val / maxSettlement) * 90)}px`, background: 'var(--silver)', opacity: val > 0 ? 0.85 : 0.25 }} />
                  {settlementBuckets.count <= 14 && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{settlementBuckets.labels[i]}</div>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ ...S.card, marginBottom: 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top Asset</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--white)' }}>{topAsset}</div>
            </div>
            <div style={{ ...S.card, marginBottom: 0 }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top Chain</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--white)' }}>Base</div>
            </div>
          </div>
          {topPairs.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--silver)', marginBottom: '16px' }}>Top Slot Pairs</div>
              {topPairs.map(([pair, count], i) => (
                <div key={pair} style={{ ...S.row, padding: '10px 0', borderBottom: i < topPairs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace' }}>#{i+1}</span>
                    <span style={{ fontSize: '13px', color: 'var(--plat)', fontWeight: '600' }}>{pair}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--green)' }}>{count} slot{count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <>
          {!walletAddr ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px' }}>◈</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--white)', marginBottom: '8px' }}>Connect your wallet</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' }}>View your complete slot history and analytics</div>
              <button onClick={onConnect} style={{ padding: '12px 28px', background: 'var(--plat)', border: 'none', borderRadius: '12px', color: 'var(--bg)', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Connect Wallet</button>
            </div>
          ) : loading ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '48px' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', width: '24px', height: '24px' }} />
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading your slots…</div>
            </div>
          ) : slots.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '48px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px' }}>◑</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--white)', marginBottom: '8px' }}>No slots yet</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Your slot history will appear here</div>
            </div>
          ) : slots.map(slot => {
            const statusInfo = getStatusInfo(slot.status)
            const isExpanded = expandedSlot === slot.id
            const symIn      = getTokenSymbol(slot.tokenIn)
            const symOut     = getTokenSymbol(slot.tokenOut)
            const amtIn      = formatAmount(slot.amountIn,  slot.tokenIn)
            const amtOut     = formatAmount(slot.amountOut, slot.tokenOut)
            const fee        = formatFeeAmount(slot.feeAmount)

            return (
              <div key={slot.id} style={{ ...S.card, padding: 0, marginBottom: '8px', overflow: 'hidden', cursor: 'pointer', borderColor: isExpanded ? 'rgba(255,255,255,0.1)' : 'var(--border)' }}
                onClick={() => setExpandedSlot(isExpanded ? null : slot.id)}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', minWidth: '28px' }}>#{slot.id}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                    <TokenLogo address={slot.tokenIn} size={18} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--plat)', fontFamily: 'IBM Plex Mono, monospace' }}>{amtIn} {symIn}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 2px' }}>→</span>
                    <TokenLogo address={slot.tokenOut} size={18} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace' }}>{amtOut} {symOut}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatDate(slot.createdAt)}</span>
                  <div style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', background: `${statusInfo.color}15`, color: statusInfo.color, border: `1px solid ${statusInfo.color}30`, flexShrink: 0 }}>
                    {statusInfo.label}
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '12px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
                      {[
                        ['Slot ID',    `#${slot.id}`],
                        ['Status',     statusInfo.label],
                        ['Slot In',    `${amtIn} ${symIn}`],
                        ['Slot Out',   `${amtOut} ${symOut}`],
                        ['Recipient',  slot.recipient ? `${slot.recipient.slice(0,8)}...${slot.recipient.slice(-4)}` : '—'],
                        ['Created',    formatDate(slot.createdAt)],
                        ['Filled At',  Number(slot.filledAt) > 0 ? formatDate(slot.filledAt) : '—'],
                        ['FIB Fee Paid', `${fee} FIB`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                          <div style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: k === 'FIB Fee Paid' ? 'var(--green)' : 'var(--plat)', wordBreak: 'break-all' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {Number(slot.status) === 0 && (
                        <button onClick={() => handleCancelSlot(slot.id)} disabled={cancelling === slot.id}
                          style={{ padding: '9px 16px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '10px', color: '#FF4444', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                          {cancelling === slot.id ? 'Cancelling…' : 'Cancel Slot'}
                        </button>
                      )}
                      <a href={`https://sepolia.basescan.org/address/${CONTRACTS.slottingEngine}`} target="_blank" rel="noreferrer"
                        style={{ padding: '9px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--silver)', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>
                        View Contract ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}