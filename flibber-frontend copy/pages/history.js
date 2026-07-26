import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CONTRACTS, SLOTTING_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

const STATUS_LABELS = ['PENDING', 'FILLED', 'CANCELLED', 'EXPIRED']
const STATUS_COLOR = {
  PENDING:   { color: '#FFAA00', bg: 'rgba(255,170,0,0.1)',    border: 'rgba(255,170,0,0.3)'    },
  FILLED:    { color: '#00FF87', bg: 'rgba(0,255,135,0.08)',   border: 'rgba(0,255,135,0.2)'    },
  CANCELLED: { color: '#FF4444', bg: 'rgba(255,68,68,0.08)',   border: 'rgba(255,68,68,0.2)'    },
  EXPIRED:   { color: '#7A95AE', bg: 'rgba(122,149,174,0.08)', border: 'rgba(122,149,174,0.2)'  },
  UNKNOWN:   { color: '#7A95AE', bg: 'rgba(122,149,174,0.08)', border: 'rgba(122,149,174,0.2)'  },
}

const getSymbol = (addr) => {
  if (!addr) return '?'
  const t = SUPPORTED_TOKENS.find(t => t.address.toLowerCase() === addr.toLowerCase())
  return t ? t.symbol : addr.slice(0, 6) + '...'
}

const getDecimals = (addr) => {
  if (!addr) return 18
  const t = SUPPORTED_TOKENS.find(t => t.address.toLowerCase() === addr.toLowerCase())
  return t ? t.decimals : 18
}

const fmt = (val, decimals, displayDecimals = 4) => {
  try {
    if (val === undefined || val === null) return '?'
    const ethers = require('ethers')
    return parseFloat(ethers.formatUnits(val.toString(), decimals)).toFixed(displayDecimals)
  } catch { return '?' }
}

const fmtTime = (ts) => {
  try {
    const n = Number(ts)
    if (!n || n === 0) return '—'
    return new Date(n * 1000).toLocaleString()
  } catch { return '—' }
}

// Always returns a display string for the FIB fee.
// New slots: use the on-chain stored feeAmount.
// Old slots (feeAmount=0, pre-mandatory-FIB): calculate 0.20% of amountIn as fallback.
const getFibFeeDisplay = (s) => {
  try {
    const ethers = require('ethers')
    const feeRaw = BigInt(s.feeAmount.toString())

    if (feeRaw > 0n) {
      // feeAmount is stored in tokenIn's decimals, not 18
      // e.g. 2000n with 6 decimals = 0.002 USDT worth of fee
      const decimals = getDecimals(s.tokenIn)
      const formatted = parseFloat(ethers.formatUnits(feeRaw, decimals)).toFixed(6)
      return { value: `${formatted} FIB`, isCalculated: false }
    }

    // Fallback for old slots where fee was 0
    const amtIn      = parseFloat(ethers.formatUnits(s.amountIn.toString(), getDecimals(s.tokenIn)))
    const calculated = (amtIn * 0.002).toFixed(6)
    return { value: `${calculated} FIB *`, isCalculated: true }
  } catch {
    return { value: '? FIB', isCalculated: false }
  }
}

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

export default function HistoryPage({ account, provider }) {
  const [walletAddr, setWalletAddr] = useState(null)
  const [slots,      setSlots]      = useState([])
  const [loading,    setLoading]    = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [cancelMsg,  setCancelMsg]  = useState(null)

  useEffect(() => {
    if (provider && account) init()
  }, [provider, account])

  const init = async () => {
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const addr   = await signer.getAddress()
      setWalletAddr(addr)
      loadSlots(addr)
    } catch(e) { console.error(e) }
  }

  const loadSlots = async (addr) => {
    setLoading(true)
    try {
      const { ethers } = await import('ethers')
      const sc = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, provider)

      const ids = await sc.getUserSlots(addr)
      if (!ids || ids.length === 0) { setSlots([]); setLoading(false); return }

      const fetched = await Promise.all(
        [...ids].map(async (id) => {
          const raw = await sc.getSlot(id)
          return parseSlot(Number(id), raw)
        })
      )

      setSlots(fetched.reverse())
    } catch(e) {
      console.error('loadSlots error:', e)
    }
    setLoading(false)
  }

  const handleCancel = async (e, slotId) => {
    e.stopPropagation()
    if (!walletAddr) return
    setCancelling(slotId); setCancelMsg(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const sc = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, signer)
      const tx = await sc.cancelSlot(slotId)
      await tx.wait()
      setCancelMsg({ type: 'success', text: `Slot #${slotId} cancelled. Your tokens have been refunded.` })
      loadSlots(walletAddr)
      setSelected(null)
    } catch(e) {
      const msg = e?.reason || e?.message || 'Cancel failed'
      setCancelMsg({ type: 'error', text: msg })
    }
    setCancelling(null)
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', padding: '40px 20px', maxWidth: '760px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '6px' }}>Slot History</h1>
        <p style={{ color: '#7A95AE', fontSize: '14px' }}>
          All slots you have submitted on FLIBBER. Click any row to view details or cancel a pending slot.
        </p>
      </div>

      {/* Cancel feedback */}
      {cancelMsg && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', marginBottom: '20px',
          fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color:      cancelMsg.type === 'success' ? '#00FF87' : '#FF4444',
          background: cancelMsg.type === 'success' ? 'rgba(0,255,135,0.08)' : 'rgba(255,68,68,0.08)',
          border:    `1px solid ${cancelMsg.type === 'success' ? 'rgba(0,255,135,0.2)' : 'rgba(255,68,68,0.2)'}`,
        }}>
          <span>{cancelMsg.text}</span>
          <button onClick={() => setCancelMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Not connected */}
      {!walletAddr && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7A95AE' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔌</div>
          <div style={{ fontSize: '15px' }}>Connect your wallet to see your slot history</div>
        </div>
      )}

      {/* Loading */}
      {walletAddr && loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7A95AE' }}>
          <div style={{ fontSize: '14px' }}>Loading your slots...</div>
        </div>
      )}

      {/* Empty */}
      {walletAddr && !loading && slots.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7A95AE' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
          <div style={{ fontSize: '15px', marginBottom: '16px' }}>No slots yet</div>
          <Link href="/" style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00FF87, #00CC6A)', borderRadius: '10px', color: '#080B0F', fontWeight: '700', fontSize: '13px', textDecoration: 'none' }}>
            Make your first slot →
          </Link>
        </div>
      )}

      {/* Slot list */}
      {!loading && slots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {slots.map(s => {
            const statusLabel = STATUS_LABELS[s.status] || 'UNKNOWN'
            const sc          = STATUS_COLOR[statusLabel] || STATUS_COLOR.UNKNOWN
            const isPending   = s.status === 0
            const isExpanded  = selected === s.id
            const fibFee      = getFibFeeDisplay(s)

            return (
              <div key={s.id}
                onClick={() => setSelected(isExpanded ? null : s.id)}
                style={{
                  background: 'rgba(13,17,23,0.9)',
                  border: `1px solid ${isExpanded ? '#00FF87' : '#1E2A36'}`,
                  borderRadius: '14px', padding: '16px 20px',
                  cursor: 'pointer', transition: 'border-color 0.2s',
                }}>

                {/* Row summary */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: '#4A6070', fontFamily: 'Space Mono, monospace' }}>#{s.id}</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#E8F0F8' }}>
                      {fmt(s.amountIn, getDecimals(s.tokenIn))} {getSymbol(s.tokenIn)}
                      <span style={{ color: '#7A95AE', fontWeight: '400', margin: '0 8px' }}>→</span>
                      {fmt(s.amountOut, getDecimals(s.tokenOut))} {getSymbol(s.tokenOut)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#7A95AE' }}>{fmtTime(s.createdAt)}</span>
                    <span style={{
                      padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                      color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`
                    }}>
                      {statusLabel}
                    </span>
                    {/* Chevron — flips when expanded */}
                    <span style={{
                      fontSize: '11px', color: '#7A95AE',
                      display: 'inline-block', transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}>▼</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #1E2A36' }}>

                    {/* Close hint */}
                    <div style={{ textAlign: 'right', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: '#4A6070' }}>Click row to collapse ▲</span>
                    </div>

                    {/* Detail grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                      {[
                        { label: 'Slot ID',   value: `#${s.id}` },
                        { label: 'Status',    value: statusLabel },
                        { label: 'Slot In',   value: `${fmt(s.amountIn,  getDecimals(s.tokenIn))}  ${getSymbol(s.tokenIn)}`  },
                        { label: 'Slot Out',  value: `${fmt(s.amountOut, getDecimals(s.tokenOut))} ${getSymbol(s.tokenOut)}` },
                        { label: 'Recipient', value: s.recipient ? `${s.recipient.slice(0,6)}...${s.recipient.slice(-4)}` : '—' },
                        { label: 'Created',   value: fmtTime(s.createdAt) },
                        { label: 'Filled At', value: fmtTime(s.filledAt)  },
                      ].map(r => (
                        <div key={r.label} style={{ background: '#131920', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '11px', color: '#7A95AE', marginBottom: '3px' }}>{r.label}</div>
                          <div style={{ fontSize: '13px', color: '#E8F0F8', fontFamily: 'Space Mono, monospace', wordBreak: 'break-all' }}>{r.value}</div>
                        </div>
                      ))}

                      {/* FIB Fee — full width, always visible, color-coded */}
                      <div style={{ gridColumn: '1 / -1', background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '11px', color: '#7A95AE', marginBottom: '3px' }}>FIB Fee Paid</div>
                        <div style={{ fontSize: '15px', fontWeight: '800', color: '#00FF87', fontFamily: 'Space Mono, monospace' }}>
                          {fibFee.value}
                        </div>
                        {fibFee.isCalculated && (
                          <div style={{ fontSize: '11px', color: '#4A6070', marginTop: '4px' }}>
                            * Estimated from slot amount — this slot predates mandatory FIB fees.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '16px' }}>
                      <a href={`https://sepolia.basescan.org/address/${CONTRACTS.slottingEngine}`}
                        target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ padding: '8px 14px', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#0EA5E9', textDecoration: 'none' }}>
                        View Contract ↗
                      </a>

                      {isPending && (
                        <button
                          onClick={(e) => handleCancel(e, s.id)}
                          disabled={cancelling === s.id}
                          style={{ padding: '8px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#FF4444', cursor: cancelling === s.id ? 'not-allowed' : 'pointer' }}>
                          {cancelling === s.id ? 'Cancelling...' : '✕ Cancel Slot'}
                        </button>
                      )}

                      {/* Collapse button */}
                      <button
                        onClick={e => { e.stopPropagation(); setSelected(null) }}
                        style={{ marginLeft: 'auto', padding: '8px 14px', background: 'none', border: '1px solid #1E2A36', borderRadius: '8px', fontSize: '12px', color: '#7A95AE', cursor: 'pointer' }}>
                        ▲ Collapse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Refresh */}
      {walletAddr && !loading && (
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button onClick={() => loadSlots(walletAddr)}
            style={{ padding: '8px 20px', background: 'none', border: '1px solid #1E2A36', borderRadius: '8px', color: '#7A95AE', fontSize: '13px', cursor: 'pointer' }}>
            ↻ Refresh
          </button>
        </div>
      )}
    </div>
  )
}